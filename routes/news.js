import express from 'express';
import db from '../config/db.js';

const router = express.Router();

// =========================================
// IN-MEMORY CACHE (5 minute TTL)
// =========================================
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCached(key) {
    const item = cache.get(key);
    if (!item) return null;
    if (Date.now() > item.expires) {
        cache.delete(key);
        return null;
    }
    return item.data;
}

function setCache(key, data) {
    cache.set(key, {
        data,
        expires: Date.now() + CACHE_TTL
    });
}

// Clear cache on news updates (called from admin routes)
export function clearNewsCache() {
    cache.clear();
    console.log('📦 News cache cleared');
}

// =========================================
// GET ALL NEWS (Paginated)
// =========================================
router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        const category = req.query.category;

        let query = `
      SELECT n.id, n.title, n.slug, n.excerpt, n.image, n.is_breaking, n.is_featured,
             n.views, n.published_at, n.source_name,
             c.name_ta as category_name, c.slug as category_slug, c.color as category_color,
             u.name as author_name
      FROM news n
      LEFT JOIN categories c ON n.category_id = c.id
      LEFT JOIN users u ON n.author_id = u.id
      WHERE n.is_published = TRUE
    `;

        const params = [];

        if (category) {
            query += ' AND c.slug = ?';
            params.push(category);
        }

        query += ' ORDER BY n.published_at DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);

        const [articles] = await db.query(query, params);

        // Get total count
        let countQuery = 'SELECT COUNT(*) as total FROM news n WHERE n.is_published = TRUE';
        if (category) {
            countQuery = `
        SELECT COUNT(*) as total FROM news n 
        LEFT JOIN categories c ON n.category_id = c.id 
        WHERE n.is_published = TRUE AND c.slug = ?
      `;
        }
        const [countResult] = await db.query(countQuery, category ? [category] : []);
        const total = countResult[0].total;

        res.json({
            success: true,
            data: articles,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('Get news error:', error);
        res.status(500).json({ error: true, message: 'Server error' });
    }
});

// =========================================
// GET ALL CATEGORIES NEWS (Pre-organized for instant loading)
// Returns news for all categories in one request
// =========================================
router.get('/all-categories', async (req, res) => {
    try {
        const cacheKey = 'all-categories';

        // Check cache first
        const cached = getCached(cacheKey);
        if (cached) {
            return res.json(cached);
        }

        // Get all categories
        const [categories] = await db.query(
            'SELECT id, name_ta, name_en, slug, icon, color FROM categories WHERE is_active = TRUE ORDER BY display_order'
        );

        const result = {
            breaking: [],
            featured: [],
            categories: {}
        };

        // Get breaking news
        const [breaking] = await db.query(`
            SELECT n.id, n.title, n.slug, n.excerpt, n.image, n.published_at,
                   c.name_ta as category_name, c.slug as category_slug
            FROM news n
            LEFT JOIN categories c ON n.category_id = c.id
            WHERE n.is_breaking = TRUE AND n.is_published = TRUE
            ORDER BY n.published_at DESC
            LIMIT 10
        `);
        result.breaking = breaking;

        // Get featured news
        const [featured] = await db.query(`
            SELECT n.id, n.title, n.slug, n.excerpt, n.image, n.published_at,
                   c.name_ta as category_name, c.slug as category_slug
            FROM news n
            LEFT JOIN categories c ON n.category_id = c.id
            WHERE n.is_featured = TRUE AND n.is_published = TRUE
            ORDER BY n.published_at DESC
            LIMIT 5
        `);
        result.featured = featured;

        // Get news for each category
        for (const cat of categories) {
            const [news] = await db.query(`
                SELECT n.id, n.title, n.slug, n.excerpt, n.image, n.published_at
                FROM news n
                WHERE n.category_id = ? AND n.is_published = TRUE
                ORDER BY n.published_at DESC
                LIMIT 10
            `, [cat.id]);

            result.categories[cat.slug] = {
                info: {
                    id: cat.id,
                    name_ta: cat.name_ta,
                    name_en: cat.name_en,
                    icon: cat.icon,
                    color: cat.color
                },
                news: news
            };
        }

        const response = { success: true, data: result };

        // Cache for 5 minutes
        setCache(cacheKey, response);

        res.json(response);

    } catch (error) {
        console.error('Get all categories error:', error);
        res.status(500).json({ error: true, message: 'Server error' });
    }
});

// =========================================
// GET BREAKING NEWS
// =========================================
router.get('/breaking', async (req, res) => {
    try {
        const [articles] = await db.query(`
      SELECT n.id, n.title, n.slug, n.excerpt, n.image, n.published_at,
             c.name_ta as category_name, c.color as category_color
      FROM news n
      LEFT JOIN categories c ON n.category_id = c.id
      WHERE n.is_breaking = TRUE AND n.is_published = TRUE
      ORDER BY n.published_at DESC
      LIMIT 10
    `);

        res.json({ success: true, data: articles });

    } catch (error) {
        console.error('Get breaking news error:', error);
        res.status(500).json({ error: true, message: 'Server error' });
    }
});

// =========================================
// GET FEATURED NEWS
// =========================================
router.get('/featured', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 5;

        const [articles] = await db.query(`
      SELECT n.id, n.title, n.slug, n.excerpt, n.image, n.published_at, n.source_name,
             c.name_ta as category_name, c.slug as category_slug, c.color as category_color
      FROM news n
      LEFT JOIN categories c ON n.category_id = c.id
      WHERE n.is_featured = TRUE AND n.is_published = TRUE
      ORDER BY n.published_at DESC
      LIMIT ?
    `, [limit]);

        res.json({ success: true, data: articles });

    } catch (error) {
        console.error('Get featured error:', error);
        res.status(500).json({ error: true, message: 'Server error' });
    }
});

// =========================================
// GET TRENDING NEWS (by views)
// =========================================
router.get('/trending', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;

        const [articles] = await db.query(`
      SELECT n.id, n.title, n.slug, n.views, n.published_at,
             c.name_ta as category_name
      FROM news n
      LEFT JOIN categories c ON n.category_id = c.id
      WHERE n.is_published = TRUE 
        AND n.published_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      ORDER BY n.views DESC
      LIMIT ?
    `, [limit]);

        res.json({ success: true, data: articles });

    } catch (error) {
        console.error('Get trending error:', error);
        res.status(500).json({ error: true, message: 'Server error' });
    }
});

// =========================================
// GET SINGLE NEWS BY SLUG (Full content - no external redirect!)
// =========================================
router.get('/:slug', async (req, res) => {
    try {
        const { slug } = req.params;
        const cacheKey = `article:${slug}`;

        // Check cache first
        const cached = getCached(cacheKey);
        if (cached) {
            // Update view count async (don't wait)
            db.query('UPDATE news SET views = views + 1 WHERE slug = ?', [slug]);
            return res.json(cached);
        }

        const [articles] = await db.query(`
      SELECT n.*, 
             c.name_ta as category_name, c.slug as category_slug, c.color as category_color,
             u.name as author_name
      FROM news n
      LEFT JOIN categories c ON n.category_id = c.id
      LEFT JOIN users u ON n.author_id = u.id
      WHERE n.slug = ? AND n.is_published = TRUE
    `, [slug]);

        if (articles.length === 0) {
            return res.status(404).json({
                error: true,
                message: 'Article not found'
            });
        }

        // Increment view count
        await db.query('UPDATE news SET views = views + 1 WHERE slug = ?', [slug]);

        // Get related articles
        const article = articles[0];
        const [related] = await db.query(`
      SELECT id, title, slug, image, published_at
      FROM news
      WHERE category_id = ? AND id != ? AND is_published = TRUE
      ORDER BY published_at DESC
      LIMIT 4
    `, [article.category_id, article.id]);

        const response = {
            success: true,
            data: {
                ...article,
                related
            }
        };

        // Cache the response
        setCache(cacheKey, response);

        res.json(response);

    } catch (error) {
        console.error('Get article error:', error);
        res.status(500).json({ error: true, message: 'Server error' });
    }
});

// =========================================
// SEARCH NEWS
// =========================================
router.get('/search/:query', async (req, res) => {
    try {
        const { query } = req.params;
        const limit = parseInt(req.query.limit) || 20;

        const [articles] = await db.query(`
      SELECT n.id, n.title, n.slug, n.excerpt, n.image, n.published_at,
             c.name_ta as category_name
      FROM news n
      LEFT JOIN categories c ON n.category_id = c.id
      WHERE n.is_published = TRUE 
        AND MATCH(n.title, n.content, n.excerpt) AGAINST(? IN NATURAL LANGUAGE MODE)
      ORDER BY n.published_at DESC
      LIMIT ?
    `, [query, limit]);

        res.json({ success: true, data: articles });

    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: true, message: 'Server error' });
    }
});

export default router;
