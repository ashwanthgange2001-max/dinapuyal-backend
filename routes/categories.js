/**
 * Categories Routes
 */

import express from 'express';
import db from '../config/db.js';

const router = express.Router();

// Get all categories
router.get('/', async (req, res) => {
    try {
        const [categories] = await db.query(`
      SELECT id, name_ta, name_en, slug, icon, color, display_order
      FROM categories
      WHERE is_active = TRUE
      ORDER BY display_order ASC
    `);

        res.json({ success: true, data: categories });

    } catch (error) {
        console.error('Get categories error:', error);
        res.status(500).json({ error: true, message: 'Server error' });
    }
});

// Get single category with news
router.get('/:slug', async (req, res) => {
    try {
        const { slug } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;

        const [categories] = await db.query(
            'SELECT * FROM categories WHERE slug = ?',
            [slug]
        );

        if (categories.length === 0) {
            return res.status(404).json({
                error: true,
                message: 'Category not found'
            });
        }

        const category = categories[0];

        const [articles] = await db.query(`
      SELECT n.id, n.title, n.slug, n.excerpt, n.image, n.published_at, n.source_name
      FROM news n
      WHERE n.category_id = ? AND n.is_published = TRUE
      ORDER BY n.published_at DESC
      LIMIT ? OFFSET ?
    `, [category.id, limit, offset]);

        res.json({
            success: true,
            category,
            data: articles
        });

    } catch (error) {
        console.error('Get category error:', error);
        res.status(500).json({ error: true, message: 'Server error' });
    }
});

export default router;
