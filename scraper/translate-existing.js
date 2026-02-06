/**
 * TRANSLATE EXISTING ENGLISH ARTICLES TO TAMIL
 * Run this script to convert all existing English articles to Tamil
 * 
 * Usage: node scraper/translate-existing.js
 */

import translate from 'google-translate-api-x';
import db from '../config/db.js';

// =========================================
// TAMIL LANGUAGE DETECTION
// =========================================
function isTamilContent(text) {
    if (!text || text.length < 10) return false;

    const tamilRegex = /[\u0B80-\u0BFF]/g;
    const tamilMatches = text.match(tamilRegex) || [];
    const cleanText = text.replace(/[\s\d\.,!?'"()\-:;]/g, '');

    if (cleanText.length === 0) return false;

    const tamilPercentage = (tamilMatches.length / cleanText.length) * 100;
    return tamilPercentage >= 30;
}

// =========================================
// TRANSLATE TO TAMIL
// =========================================
async function translateToTamil(text) {
    if (!text || text.length < 5) return text;

    try {
        const maxChunkSize = 4500;
        const chunks = [];

        if (text.length > maxChunkSize) {
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

        const translatedChunks = [];
        for (const chunk of chunks) {
            const result = await translate(chunk, { from: 'en', to: 'ta' });
            translatedChunks.push(result.text);
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        return translatedChunks.join('\n\n');

    } catch (error) {
        console.error(`❌ Translation failed: ${error.message}`);
        return text;
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
// MAIN TRANSLATION FUNCTION
// =========================================
async function translateExistingArticles() {
    console.log(`
╔══════════════════════════════════════════════════════╗
║   🔄 TRANSLATING ENGLISH ARTICLES TO TAMIL           ║
║   ஆங்கில செய்திகளை தமிழில் மொழிபெயர்க்கிறது         ║
╚══════════════════════════════════════════════════════╝
    `);

    try {
        // Get all articles
        const [articles] = await db.query(`
            SELECT id, title, content, excerpt, slug 
            FROM news 
            WHERE is_published = TRUE
            ORDER BY published_at DESC
        `);

        console.log(`📰 Found ${articles.length} total articles\n`);

        let translatedCount = 0;
        let skippedCount = 0;

        for (const article of articles) {
            const textToCheck = article.title + ' ' + article.content;

            if (isTamilContent(textToCheck)) {
                console.log(`✅ Already Tamil: ${article.title.substring(0, 50)}...`);
                skippedCount++;
                continue;
            }

            console.log(`\n🔄 Translating: ${article.title.substring(0, 60)}...`);

            try {
                // Translate title
                const translatedTitle = await translateToTamil(article.title);

                // Translate content
                const translatedContent = await translateToTamil(article.content);

                // Translate excerpt
                const translatedExcerpt = await translateToTamil(article.excerpt.replace('...', '')) + '...';

                // Generate new Tamil slug
                const newSlug = slugify(translatedTitle) + '-' + Date.now();

                // Update the article in database
                await db.query(`
                    UPDATE news 
                    SET title = ?, content = ?, excerpt = ?, slug = ?
                    WHERE id = ?
                `, [translatedTitle, translatedContent, translatedExcerpt, newSlug, article.id]);

                console.log(`   ✅ Translated to: ${translatedTitle.substring(0, 50)}...`);
                translatedCount++;

                // Delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 1000));

            } catch (err) {
                console.error(`   ❌ Failed to translate article ${article.id}: ${err.message}`);
            }
        }

        console.log(`
╔══════════════════════════════════════════════════════╗
║   ✅ TRANSLATION COMPLETE                             ║
║   Translated: ${translatedCount} articles                           
║   Already Tamil: ${skippedCount} articles                         
╚══════════════════════════════════════════════════════╝
        `);

    } catch (error) {
        console.error('❌ Fatal error:', error.message);
    } finally {
        process.exit(0);
    }
}

// Run the translation
translateExistingArticles();
