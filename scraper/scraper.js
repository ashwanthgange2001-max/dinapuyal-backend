/**
 * NEWS SCRAPER - Production Ready
 * Downloads images locally, extracts full content, stores in database
 * 
 * Features:
 * - Downloads images to local uploads folder (no hotlinking!)
 * - Extracts full article content
 * - Handles lazy-loaded images (data-src, data-original)
 * - Tamil-friendly slug generation
 * - Auto-rewrite option for SEO
 */

import axios from 'axios';
import cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import { v4 as uuid } from 'uuid';
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import translate from 'google-translate-api-x';
import db from '../config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =========================================
// CONFIGURATION
// =========================================
// Production: Set PUBLIC_UPLOAD_DIR in .env to point to public_html/uploads
// Development: Uses ../uploads (relative to scraper folder)
const UPLOAD_DIR = process.env.PUBLIC_UPLOAD_DIR || path.join(__dirname, '../uploads');
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// =========================================
// SITE-SPECIFIC SELECTORS FOR FULL CONTENT
// =========================================
const SITE_SELECTORS = {
    'tamil.oneindia.com': {
        content: '.ad-in-news p, .article-content p, .articlesContent p, .article-desc p',
        title: 'h1.heading, h1.article-title, .main-heading h1',
        removeElements: '.ad-slot, .social-share, .related-news, script, style, .ads'
    },
    'www.thehindu.com': {
        content: '.articlebodycontent p, .article-body p, .article-text p, [itemprop="articleBody"] p',
        title: 'h1.title, h1.storyline-title, .articletitle h1',
        removeElements: '.also-read, .article-ad, .social-share, script, style'
    },
    'default': {
        content: 'article p, .article-content p, .story-content p, .entry-content p, .post-content p, main p',
        title: 'h1',
        removeElements: 'script, style, nav, .sidebar, .ad, .advertisement'
    }
};

// =========================================
// FETCH FULL ARTICLE CONTENT (Public API)
// For on-demand article fetching from any news URL
// =========================================
export async function fetchArticleContent(articleUrl) {
    try {
        console.log(`📖 Fetching full article: ${articleUrl}`);

        // Validate URL
        if (!articleUrl || !articleUrl.startsWith('http')) {
            return { success: false, error: 'Invalid URL' };
        }

        const urlObj = new URL(articleUrl);
        const hostname = urlObj.hostname;

        // Get site-specific selectors or use defaults
        const selectors = SITE_SELECTORS[hostname] || SITE_SELECTORS['default'];

        // Fetch the article page
        const { data } = await axios.get(articleUrl, {
            timeout: 15000,
            headers: {
                'User-Agent': USER_AGENT,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'ta,en;q=0.8'
            }
        });

        const $ = cheerio.load(data);

        // Remove unwanted elements
        $(selectors.removeElements).remove();

        // Extract title
        const title = $(selectors.title).first().text().trim();

        // Extract content paragraphs
        const paragraphs = [];
        $(selectors.content).each((i, el) => {
            const text = $(el).text().trim();
            // Filter out short paragraphs and ads
            if (text.length > 40 &&
                !text.toLowerCase().includes('advertisement') &&
                !text.toLowerCase().includes('also read') &&
                !text.includes('படிக்க:') &&
                !text.startsWith('Share')) {
                paragraphs.push(text);
            }
        });

        // If not enough paragraphs, try broader selectors
        if (paragraphs.length < 5) {
            $('p').each((i, el) => {
                const text = $(el).text().trim();
                if (text.length > 50 && !paragraphs.includes(text)) {
                    paragraphs.push(text);
                }
            });
        }

        // Join paragraphs with double newlines
        const fullContent = paragraphs.join('\n\n');

        console.log(`✅ Extracted ${paragraphs.length} paragraphs (${fullContent.length} chars)`);

        return {
            success: true,
            title: title || '',
            content: fullContent,
            paragraphCount: paragraphs.length,
            characterCount: fullContent.length,
            source: hostname
        };

    } catch (error) {
        console.error(`❌ Failed to fetch article: ${error.message}`);
        return {
            success: false,
            error: error.message
        };
    }
}



// =========================================
// DOWNLOAD IMAGE LOCALLY (with compression)
// =========================================
async function downloadImage(imageUrl, baseUrl = '') {
    try {
        // Handle relative URLs
        if (imageUrl.startsWith('/')) {
            imageUrl = baseUrl + imageUrl;
        }

        if (!imageUrl.startsWith('http')) {
            console.log('Invalid image URL:', imageUrl);
            return null;
        }

        const fileName = `${uuid()}.jpg`; // Always save as jpg after compression
        const tempPath = path.join(UPLOAD_DIR, `temp_${uuid()}`);
        const finalPath = path.join(UPLOAD_DIR, fileName);

        const response = await axios({
            url: imageUrl,
            method: 'GET',
            responseType: 'arraybuffer',
            timeout: 15000,
            headers: {
                'User-Agent': USER_AGENT,
                'Referer': baseUrl || imageUrl
            }
        });

        // Compress image with Sharp
        await sharp(response.data)
            .resize(1200, null, { // Max width 1200px, maintain aspect ratio
                withoutEnlargement: true,
                fit: 'inside'
            })
            .jpeg({ quality: 75 }) // Convert to JPEG at 75% quality
            .toFile(finalPath);

        const stats = fs.statSync(finalPath);
        const sizeKB = Math.round(stats.size / 1024);
        console.log(`✅ Image compressed: ${fileName} (${sizeKB}KB)`);

        return `/uploads/${fileName}`;

    } catch (error) {
        console.error(`❌ Image download/compress failed: ${imageUrl}`, error.message);
        return null;
    }
}

// =========================================
// EXTRACT IMAGE FROM ELEMENT (handles lazy loading)
// =========================================
function extractImageUrl($, imgElement) {
    const img = $(imgElement);

    // Check all possible image sources
    const sources = [
        img.attr('src'),
        img.attr('data-src'),
        img.attr('data-original'),
        img.attr('data-lazy-src'),
        img.attr('data-srcset')?.split(',')[0]?.trim()?.split(' ')[0]
    ];

    // Return first valid URL
    for (const src of sources) {
        if (src && src.length > 5 && !src.includes('data:image') && !src.includes('placeholder')) {
            return src;
        }
    }

    return null;
}

// =========================================
// SLUGIFY (Tamil-friendly)
// =========================================
function slugify(text) {
    return text
        .toLowerCase()
        .replace(/[^\u0B80-\u0BFFa-z0-9\s-]/g, '') // Keep Tamil + English + numbers
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/(^-|-$)/g, '')
        .substring(0, 200);
}

// =========================================
// TAMIL CONTENT REWRITER (Basic - replace with AI for production)
// =========================================
function rewriteContent(originalText) {
    if (!originalText) return '';

    // Basic Tamil sentence restructuring for uniqueness
    return originalText
        .replace(/என்று கூறினார்/g, 'என தெரிவித்தார்')
        .replace(/என்று தெரிவித்தார்/g, 'என்று கூறப்பட்டது')
        .replace(/நடைபெற்றது/g, 'நடந்தது')
        .replace(/அறிவிக்கப்பட்டது/g, 'தெரிவிக்கப்பட்டுள்ளது')
        .replace(/நடைபெறும்/g, 'நடக்கும்')
        .replace(/என்பது குறிப்பிடத்தக்கது/g, 'என்பது முக்கியம்');
}

// =========================================
// TAMIL LANGUAGE DETECTION
// Checks if content is Tamil
// =========================================
function isTamilContent(text) {
    if (!text || text.length < 10) return false;

    // Tamil Unicode range: U+0B80 to U+0BFF
    const tamilRegex = /[\u0B80-\u0BFF]/g;
    const tamilMatches = text.match(tamilRegex) || [];

    // Calculate percentage of Tamil characters
    // Remove spaces and special characters for accurate calculation
    const cleanText = text.replace(/[\s\d\.,!?'"()\-:;]/g, '');
    if (cleanText.length === 0) return false;

    const tamilPercentage = (tamilMatches.length / cleanText.length) * 100;

    // Article must have at least 30% Tamil characters to be considered Tamil
    return tamilPercentage >= 30;
}

// =========================================
// ENGLISH TO TAMIL TRANSLATION
// Translates English content to Tamil
// =========================================
async function translateToTamil(text) {
    if (!text || text.length < 5) return text;

    try {
        console.log(`🔄 Translating to Tamil: "${text.substring(0, 50)}..."`);

        // Split long text into chunks (Google Translate has character limits)
        const maxChunkSize = 4500;
        const chunks = [];

        if (text.length > maxChunkSize) {
            // Split by paragraphs
            const paragraphs = text.split('\n\n');
            let currentChunk = '';

            for (const para of paragraphs) {
                if ((currentChunk + '\n\n' + para).length > maxChunkSize) {
                    if (currentChunk) chunks.push(currentChunk);
                    currentChunk = para;
                } else {
                    currentChunk = currentChunk ? currentChunk + '\n\n' + para : para;
                }
            }
            if (currentChunk) chunks.push(currentChunk);
        } else {
            chunks.push(text);
        }

        // Translate each chunk
        const translatedChunks = [];
        for (const chunk of chunks) {
            const result = await translate(chunk, { from: 'en', to: 'ta' });
            translatedChunks.push(result.text);

            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        const translatedText = translatedChunks.join('\n\n');
        console.log(`✅ Translation complete: "${translatedText.substring(0, 50)}..."`);

        return translatedText;

    } catch (error) {
        console.error(`❌ Translation failed: ${error.message}`);
        // Return original text if translation fails
        return text;
    }
}

// =========================================
// SCRAPE SINGLE ARTICLE PAGE
// =========================================
async function scrapeArticle(articleUrl, selectors, baseUrl) {
    try {
        const { data } = await axios.get(articleUrl, {
            timeout: 20000,
            headers: { 'User-Agent': USER_AGENT }
        });

        const $ = cheerio.load(data);

        // Extract title
        const title = $(selectors.title || 'h1').first().text().trim();
        if (!title || title.length < 10) {
            console.log('❌ No valid title found');
            return null;
        }

        // Extract content paragraphs
        const contentSelector = selectors.content || '.article-content p, .story-content p, article p';
        const paragraphs = [];
        $(contentSelector).each((i, el) => {
            const text = $(el).text().trim();
            if (text.length > 30) {
                paragraphs.push(text);
            }
        });

        if (paragraphs.length === 0) {
            console.log('❌ No content found');
            return null;
        }

        const content = paragraphs.join('\n\n');
        const rewrittenContent = rewriteContent(content);

        // Extract and download image
        const imageSelector = selectors.image || '.article-content img, .story-image img, article img';
        const imgElement = $(imageSelector).first();
        let imageUrl = extractImageUrl($, imgElement);
        let localImage = null;

        if (imageUrl) {
            localImage = await downloadImage(imageUrl, baseUrl);
        }

        // Generate excerpt
        const excerpt = rewrittenContent.replace(/<[^>]*>/g, '').substring(0, 300) + '...';

        return {
            title,
            content: rewrittenContent,
            excerpt,
            image: localImage,
            source_url: articleUrl
        };

    } catch (error) {
        console.error(`❌ Scrape failed for ${articleUrl}:`, error.message);
        return null;
    }
}

// =========================================
// SCRAPE NEWS FROM SOURCE
// =========================================
export async function scrapeNews(source) {
    console.log(`\n📰 Scraping: ${source.name}`);

    try {
        const baseUrl = new URL(source.url).origin;

        // Fetch source homepage/RSS
        const { data } = await axios.get(source.url, {
            timeout: 20000,
            headers: { 'User-Agent': USER_AGENT }
        });

        const $ = cheerio.load(data);

        // Find article links (customize per source)
        const articleLinks = [];
        $('a[href*="/news/"], a[href*="/article/"], a[href*="/story/"]').each((i, el) => {
            let href = $(el).attr('href');
            if (href) {
                if (href.startsWith('/')) {
                    href = baseUrl + href;
                }
                if (href.startsWith('http') && !articleLinks.includes(href)) {
                    articleLinks.push(href);
                }
            }
        });

        console.log(`Found ${articleLinks.length} article links`);

        let savedCount = 0;
        const maxArticles = parseInt(process.env.MAX_ARTICLES_PER_SCRAPE) || 20;

        for (const articleUrl of articleLinks.slice(0, maxArticles)) {
            // Check if article already exists
            const [existing] = await db.query(
                'SELECT id FROM news WHERE source_url = ?',
                [articleUrl]
            );

            if (existing.length > 0) {
                console.log('⏭️  Already exists:', articleUrl.substring(0, 60));
                continue;
            }

            // Scrape article
            const article = await scrapeArticle(articleUrl, {
                title: source.selector_title,
                content: source.selector_content,
                image: source.selector_image
            }, baseUrl);

            if (!article) continue;

            // 🌐 TRANSLATE TO TAMIL: If content is not Tamil, translate it
            const textToCheck = article.title + ' ' + article.content;
            if (!isTamilContent(textToCheck)) {
                console.log(`🔄 Translating English article: ${article.title.substring(0, 50)}...`);

                // Translate title and content to Tamil
                article.title = await translateToTamil(article.title);
                article.content = await translateToTamil(article.content);
                article.excerpt = await translateToTamil(article.excerpt.replace('...', '')) + '...';

                console.log(`✅ Translated: ${article.title.substring(0, 50)}...`);
            }

            // Generate unique slug from Tamil title
            const slug = slugify(article.title) + '-' + Date.now();


            // Save to database
            try {
                await db.query(`
          INSERT INTO news 
          (title, slug, content, excerpt, image, category_id, source_name, source_url, published_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `, [
                    article.title,
                    slug,
                    article.content,
                    article.excerpt,
                    article.image,
                    source.category_id,
                    source.name,
                    articleUrl
                ]);

                savedCount++;
                console.log(`✅ Saved: ${article.title.substring(0, 50)}...`);

            } catch (dbError) {
                console.error('❌ DB save error:', dbError.message);
            }
        }

        console.log(`\n✅ ${source.name}: Saved ${savedCount} new articles`);
        return savedCount;

    } catch (error) {
        console.error(`❌ Source scrape failed: ${source.name}`, error.message);
        throw error;
    }
}

// =========================================
// MANUAL RUN SCRIPT
// =========================================
export async function runAllScrapers() {
    console.log('🚀 Starting all scrapers...\n');

    const [sources] = await db.query(
        'SELECT * FROM scraper_sources WHERE is_active = TRUE'
    );

    for (const source of sources) {
        try {
            await scrapeNews(source);
            await db.query(
                'UPDATE scraper_sources SET last_scraped_at = NOW() WHERE id = ?',
                [source.id]
            );
        } catch (error) {
            console.error(`Failed: ${source.name}`);
        }
    }

    console.log('\n✅ All scrapers completed!');
}
