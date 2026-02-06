/**
 * RSS Feed Scraper for Dinapuyal News
 * Fetches news from RSS feeds and stores in MySQL database
 * 
 * Usage: node scraper/rss-scraper.js
 * 
 * Features:
 * - Fetches from OneIndia Tamil RSS feeds
 * - Downloads and compresses images locally
 * - Extracts og:image from article pages if RSS doesn't have images
 * - Stores in MySQL with proper category mapping
 */

import axios from 'axios';
import { parseStringPromise } from 'xml2js';
import cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import { v4 as uuid } from 'uuid';
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import db from '../config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =========================================
// CONFIGURATION
// =========================================
const UPLOAD_DIR = process.env.PUBLIC_UPLOAD_DIR || path.join(__dirname, '../uploads');
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const MAX_NEWS_AGE_DAYS = 3; // Only fetch news from last 3 days
const MAX_ARTICLES_PER_CATEGORY = 10;

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// =========================================
// RSS FEED SOURCES - OneIndia Tamil (Verified Working)
// =========================================
const RSS_FEEDS = {
    tamilnadu: {
        url: 'https://tamil.oneindia.com/rss/tamil-news-fb.xml',
        categorySlug: 'tamilnadu'
    },
    india: {
        url: 'https://tamil.oneindia.com/rss/tamil-india-fb.xml',
        categorySlug: 'india'
    },
    world: {
        url: 'https://tamil.oneindia.com/rss/tamil-international-fb.xml',
        categorySlug: 'world'
    },
    cinema: {
        url: 'https://tamil.oneindia.com/rss/tamil-entertainment-fb.xml',
        categorySlug: 'cinema'
    },
    sports: {
        url: 'https://tamil.oneindia.com/rss/tamil-sports-fb.xml',
        categorySlug: 'sports'
    },
    business: {
        url: 'https://tamil.oneindia.com/rss/tamil-business-fb.xml',
        categorySlug: 'business'
    },
    technology: {
        url: 'https://tamil.oneindia.com/rss/tamil-technology-fb.xml',
        categorySlug: 'technology'
    },
    health: {
        url: 'https://tamil.oneindia.com/rss/tamil-health-fb.xml',
        categorySlug: 'health'
    },
    spirituality: {
        url: 'https://tamil.oneindia.com/rss/tamil-devotional-fb.xml',
        categorySlug: 'spirituality'
    }
};

// =========================================
// DOWNLOAD IMAGE LOCALLY
// =========================================
async function downloadImage(imageUrl) {
    if (!imageUrl || !imageUrl.startsWith('http')) {
        return null;
    }

    try {
        const fileName = `${uuid()}.jpg`;
        const finalPath = path.join(UPLOAD_DIR, fileName);

        const response = await axios({
            url: imageUrl,
            method: 'GET',
            responseType: 'arraybuffer',
            timeout: 15000,
            headers: {
                'User-Agent': USER_AGENT,
                'Referer': imageUrl
            }
        });

        // Compress image with Sharp
        await sharp(response.data)
            .resize(1200, null, {
                withoutEnlargement: true,
                fit: 'inside'
            })
            .jpeg({ quality: 75 })
            .toFile(finalPath);

        const stats = fs.statSync(finalPath);
        const sizeKB = Math.round(stats.size / 1024);
        console.log(`   ✅ Image: ${fileName} (${sizeKB}KB)`);

        return `/uploads/${fileName}`;

    } catch (error) {
        console.log(`   ⚠️ Image download failed: ${error.message}`);
        return null;
    }
}

// =========================================
// FETCH OG:IMAGE FROM ARTICLE PAGE
// =========================================
async function fetchOgImage(articleUrl) {
    try {
        const { data } = await axios.get(articleUrl, {
            timeout: 10000,
            headers: { 'User-Agent': USER_AGENT }
        });

        const $ = cheerio.load(data);

        // Try og:image first
        let imageUrl = $('meta[property="og:image"]').attr('content');

        // Try twitter:image
        if (!imageUrl) {
            imageUrl = $('meta[name="twitter:image"]').attr('content');
        }

        // Try first article image
        if (!imageUrl) {
            imageUrl = $('.article-content img, .story-image img, article img').first().attr('src');
        }

        return imageUrl || null;

    } catch (error) {
        return null;
    }
}

// =========================================
// SLUGIFY (Tamil-friendly)
// =========================================
function slugify(text) {
    return text
        .toLowerCase()
        .replace(/[^\u0B80-\u0BFFa-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/(^-|-$)/g, '')
        .substring(0, 200);
}

// =========================================
// FETCH AND PARSE RSS FEED
// =========================================
async function fetchRSSFeed(feedUrl) {
    try {
        const { data } = await axios.get(feedUrl, {
            timeout: 15000,
            headers: {
                'User-Agent': USER_AGENT,
                'Accept': 'application/rss+xml, application/xml, text/xml'
            }
        });

        const result = await parseStringPromise(data);
        const items = result?.rss?.channel?.[0]?.item || [];

        return items.map(item => ({
            title: item.title?.[0] || '',
            link: item.link?.[0] || '',
            description: item.description?.[0] || '',
            pubDate: item.pubDate?.[0] || '',
            thumbnail: item['media:thumbnail']?.[0]?.$.url ||
                item['media:content']?.[0]?.$.url ||
                item.enclosure?.[0]?.$.url || ''
        }));

    } catch (error) {
        console.error(`❌ RSS fetch failed: ${error.message}`);
        return [];
    }
}

// =========================================
// EXTRACT IMAGE FROM DESCRIPTION HTML
// =========================================
function extractImageFromDescription(description) {
    if (!description) return null;

    const imgMatch = description.match(/<img[^>]+src=["']([^"']+)["']/i);
    return imgMatch ? imgMatch[1] : null;
}

// =========================================
// SCRAPE RSS FEED AND SAVE TO DATABASE
// =========================================
async function scrapeRSSFeed(feedKey, feedConfig) {
    console.log(`\n📰 Scraping: ${feedKey.toUpperCase()}`);

    try {
        // Get category ID from database
        const [categories] = await db.query(
            'SELECT id FROM categories WHERE slug = ?',
            [feedConfig.categorySlug]
        );

        if (categories.length === 0) {
            console.log(`   ⚠️ Category not found: ${feedConfig.categorySlug}`);
            return 0;
        }

        const categoryId = categories[0].id;

        // Fetch RSS feed
        const items = await fetchRSSFeed(feedConfig.url);
        console.log(`   Found ${items.length} items in feed`);

        let savedCount = 0;

        for (const item of items.slice(0, MAX_ARTICLES_PER_CATEGORY)) {
            // Skip if too old
            const pubDate = new Date(item.pubDate);
            const daysDiff = (Date.now() - pubDate.getTime()) / (1000 * 60 * 60 * 24);
            if (daysDiff > MAX_NEWS_AGE_DAYS) {
                continue;
            }

            // Check if article already exists
            const [existing] = await db.query(
                'SELECT id FROM news WHERE source_url = ? OR title = ?',
                [item.link, item.title]
            );

            if (existing.length > 0) {
                console.log(`   ⏭️  Already exists: ${item.title.substring(0, 40)}...`);
                continue;
            }

            // Get image
            let imageUrl = item.thumbnail || extractImageFromDescription(item.description);

            // If no image in RSS, try to fetch og:image from article
            if (!imageUrl && item.link) {
                console.log(`   🔍 Fetching og:image from article...`);
                imageUrl = await fetchOgImage(item.link);
            }

            // Download image locally
            let localImage = null;
            if (imageUrl) {
                localImage = await downloadImage(imageUrl);
            }

            // Clean description
            const cleanDesc = item.description
                .replace(/<[^>]*>/g, '')
                .substring(0, 500);

            // Generate slug
            const slug = slugify(item.title) + '-' + Date.now();

            // Save to database
            try {
                await db.query(`
                    INSERT INTO news 
                    (title, slug, content, excerpt, image, category_id, source_name, source_url, published_at, is_published)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)
                `, [
                    item.title,
                    slug,
                    item.description, // Full content from RSS
                    cleanDesc,
                    localImage,
                    categoryId,
                    'தினப்புயல்', // Always show as Dinapuyal
                    item.link,
                    pubDate
                ]);

                savedCount++;
                console.log(`   ✅ Saved: ${item.title.substring(0, 50)}...`);

            } catch (dbError) {
                console.error(`   ❌ DB error: ${dbError.message}`);
            }
        }

        console.log(`   📊 Saved ${savedCount} new articles for ${feedKey}`);
        return savedCount;

    } catch (error) {
        console.error(`❌ Scrape failed for ${feedKey}: ${error.message}`);
        return 0;
    }
}

// =========================================
// RUN ALL RSS SCRAPERS
// =========================================
export async function runRSSScrapers() {
    console.log(`
╔══════════════════════════════════════════╗
║     📰 DINAPUYAL RSS SCRAPER             ║
║     செய்தி சேகரிப்பான்                    ║
╚══════════════════════════════════════════╝
`);

    let totalSaved = 0;

    for (const [feedKey, feedConfig] of Object.entries(RSS_FEEDS)) {
        try {
            const saved = await scrapeRSSFeed(feedKey, feedConfig);
            totalSaved += saved;
        } catch (error) {
            console.error(`Failed: ${feedKey}`);
        }
    }

    console.log(`\n🎉 Total: ${totalSaved} new articles saved!`);
    return totalSaved;
}

// =========================================
// AUTO-SCHEDULING (Every 1 minute)
// =========================================
const SCRAPE_INTERVAL_MS = 60 * 1000; // 1 minute
let isCurrentlyScraping = false;

async function scheduledScrape() {
    if (isCurrentlyScraping) {
        console.log('⏳ Previous scrape still running, skipping...');
        return;
    }

    isCurrentlyScraping = true;
    const startTime = Date.now();

    try {
        await runRSSScrapers();
        const duration = Math.round((Date.now() - startTime) / 1000);
        console.log(`⏱️ Scrape completed in ${duration}s`);
    } catch (error) {
        console.error('❌ Scheduled scrape error:', error.message);
    } finally {
        isCurrentlyScraping = false;
    }
}

export function startAutoScraper() {
    console.log(`
╔══════════════════════════════════════════╗
║     🔄 AUTO-SCRAPER STARTED              ║
║     Every 1 minute                       ║
╚══════════════════════════════════════════╝
`);

    // Run immediately on start
    scheduledScrape();

    // Then run every 1 minute
    setInterval(scheduledScrape, SCRAPE_INTERVAL_MS);

    console.log('📡 Auto-scraper is running. Press Ctrl+C to stop.');
}

// =========================================
// RUN IF CALLED DIRECTLY
// =========================================
const isMainModule = process.argv[1] && process.argv[1].includes('rss-scraper');

if (isMainModule) {
    const args = process.argv.slice(2);

    if (args.includes('--auto') || args.includes('-a')) {
        // Auto-scheduling mode: run every 1 minute
        startAutoScraper();
    } else {
        // One-time run mode
        runRSSScrapers()
            .then(() => {
                console.log('\n✅ RSS scraping complete!');
                process.exit(0);
            })
            .catch(err => {
                console.error('❌ Scraper error:', err);
                process.exit(1);
            });
    }
}
