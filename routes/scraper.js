/**
 * Scraper Routes
 * Trigger and manage news scraping
 */

import express from 'express';
import jwt from 'jsonwebtoken';
import { scrapeNews, fetchArticleContent } from '../scraper/scraper.js';
import db from '../config/db.js';

const router = express.Router();

// Simple in-memory cache for fetched articles (5 minute expiry)
const articleCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// =========================================
// FETCH FULL ARTICLE CONTENT (Public API)
// No auth required - for news reading
// =========================================
router.get('/fetch-article', async (req, res) => {
    try {
        const { url } = req.query;

        if (!url) {
            return res.status(400).json({
                success: false,
                error: 'URL parameter is required'
            });
        }

        // Check cache first
        const cached = articleCache.get(url);
        if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
            console.log(`📦 Cache hit for: ${url.substring(0, 50)}...`);
            return res.json(cached.data);
        }

        // Fetch fresh content
        const result = await fetchArticleContent(url);

        // Cache the result
        if (result.success) {
            articleCache.set(url, {
                data: result,
                timestamp: Date.now()
            });
        }

        res.json(result);

    } catch (error) {
        console.error('Fetch article error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch article'
        });
    }
});

// Auth middleware
const authMiddleware = (req, res, next) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ error: true, message: 'Unauthorized' });
        }
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
        req.user = decoded;
        next();
    } catch (error) {
        res.status(401).json({ error: true, message: 'Invalid token' });
    }
};

// =========================================
// TRIGGER SCRAPE (Admin only)
// =========================================
router.post('/run', authMiddleware, async (req, res) => {
    if (!['admin', 'editor'].includes(req.user.role)) {
        return res.status(403).json({ error: true, message: 'Forbidden' });
    }

    try {
        const { source_id } = req.body;

        // Get source config
        let sources;
        if (source_id) {
            [sources] = await db.query(
                'SELECT * FROM scraper_sources WHERE id = ? AND is_active = TRUE',
                [source_id]
            );
        } else {
            [sources] = await db.query(
                'SELECT * FROM scraper_sources WHERE is_active = TRUE'
            );
        }

        if (sources.length === 0) {
            return res.status(404).json({
                error: true,
                message: 'No active sources found'
            });
        }

        // Start scraping in background
        const results = [];
        for (const source of sources) {
            try {
                const count = await scrapeNews(source);
                results.push({ source: source.name, articles: count });

                // Update last scraped time
                await db.query(
                    'UPDATE scraper_sources SET last_scraped_at = NOW() WHERE id = ?',
                    [source.id]
                );
            } catch (err) {
                results.push({ source: source.name, error: err.message });
            }
        }

        res.json({
            success: true,
            message: 'Scraping completed',
            results
        });

    } catch (error) {
        console.error('Scraper error:', error);
        res.status(500).json({ error: true, message: 'Scraper failed' });
    }
});

// =========================================
// GET SCRAPER SOURCES
// =========================================
router.get('/sources', authMiddleware, async (req, res) => {
    try {
        const [sources] = await db.query(`
      SELECT s.*, c.name_ta as category_name
      FROM scraper_sources s
      LEFT JOIN categories c ON s.category_id = c.id
      ORDER BY s.name ASC
    `);

        res.json({ success: true, data: sources });

    } catch (error) {
        console.error('Get sources error:', error);
        res.status(500).json({ error: true, message: 'Server error' });
    }
});

// =========================================
// ADD SCRAPER SOURCE
// =========================================
router.post('/sources', authMiddleware, async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: true, message: 'Forbidden' });
    }

    try {
        const { name, url, category_id, selector_title, selector_content, selector_image } = req.body;

        const [result] = await db.query(`
      INSERT INTO scraper_sources 
      (name, url, category_id, selector_title, selector_content, selector_image)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [name, url, category_id, selector_title, selector_content, selector_image]);

        res.status(201).json({
            success: true,
            message: 'Source added',
            sourceId: result.insertId
        });

    } catch (error) {
        console.error('Add source error:', error);
        res.status(500).json({ error: true, message: 'Server error' });
    }
});

export default router;
