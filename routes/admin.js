/**
 * Admin Routes
 * Protected routes for CMS operations
 */

import express from 'express';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import { v4 as uuid } from 'uuid';
import db from '../config/db.js';

const router = express.Router();

// =========================================
// AUTH MIDDLEWARE
// =========================================
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

// Role check middleware
const authorize = (roles = []) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: true, message: 'Forbidden' });
        }
        next();
    };
};

// Apply auth to all admin routes
router.use(authMiddleware);

// =========================================
// FILE UPLOAD CONFIG
// =========================================
const storage = multer.diskStorage({
    destination: './uploads/',
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `${uuid()}${ext}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => {
        const allowed = /jpeg|jpg|png|webp|gif/;
        const ext = allowed.test(path.extname(file.originalname).toLowerCase());
        const mime = allowed.test(file.mimetype);
        if (ext && mime) {
            cb(null, true);
        } else {
            cb(new Error('Only images allowed'));
        }
    }
});

// =========================================
// SLUG GENERATOR (Tamil-friendly)
// =========================================
function slugify(text) {
    return text
        .toLowerCase()
        .replace(/[^\u0B80-\u0BFFa-z0-9\s-]/g, '') // Keep Tamil, English, numbers
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/(^-|-$)/g, '')
        .substring(0, 200);
}

// =========================================
// UPLOAD IMAGE
// =========================================
router.post('/upload', upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: true, message: 'No file uploaded' });
    }

    res.json({
        success: true,
        path: `/uploads/${req.file.filename}`,
        filename: req.file.filename
    });
});

// =========================================
// CREATE NEWS ARTICLE
// =========================================
router.post('/news', authorize(['admin', 'editor', 'reporter']), async (req, res) => {
    try {
        const {
            title,
            content,
            excerpt,
            image,
            category_id,
            is_breaking = false,
            is_featured = false,
            source_name = '',
            source_url = ''
        } = req.body;

        if (!title || !content) {
            return res.status(400).json({
                error: true,
                message: 'Title and content required'
            });
        }

        const slug = slugify(title) + '-' + Date.now();
        const articleExcerpt = excerpt || content.replace(/<[^>]*>/g, '').substring(0, 300) + '...';

        const [result] = await db.query(`
      INSERT INTO news 
      (title, slug, content, excerpt, image, category_id, author_id, 
       is_breaking, is_featured, source_name, source_url, published_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `, [
            title, slug, content, articleExcerpt, image, category_id,
            req.user.id, is_breaking ? 1 : 0, is_featured ? 1 : 0,
            source_name, source_url
        ]);

        res.status(201).json({
            success: true,
            message: 'Article created successfully',
            articleId: result.insertId,
            slug
        });

    } catch (error) {
        console.error('Create article error:', error);
        res.status(500).json({ error: true, message: 'Server error' });
    }
});

// =========================================
// UPDATE NEWS ARTICLE
// =========================================
router.put('/news/:id', authorize(['admin', 'editor']), async (req, res) => {
    try {
        const { id } = req.params;
        const {
            title,
            content,
            excerpt,
            image,
            category_id,
            is_breaking,
            is_featured,
            is_published
        } = req.body;

        await db.query(`
      UPDATE news SET
        title = COALESCE(?, title),
        content = COALESCE(?, content),
        excerpt = COALESCE(?, excerpt),
        image = COALESCE(?, image),
        category_id = COALESCE(?, category_id),
        is_breaking = COALESCE(?, is_breaking),
        is_featured = COALESCE(?, is_featured),
        is_published = COALESCE(?, is_published)
      WHERE id = ?
    `, [title, content, excerpt, image, category_id,
            is_breaking, is_featured, is_published, id]);

        res.json({ success: true, message: 'Article updated' });

    } catch (error) {
        console.error('Update article error:', error);
        res.status(500).json({ error: true, message: 'Server error' });
    }
});

// =========================================
// DELETE NEWS ARTICLE
// =========================================
router.delete('/news/:id', authorize(['admin']), async (req, res) => {
    try {
        await db.query('DELETE FROM news WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'Article deleted' });
    } catch (error) {
        console.error('Delete article error:', error);
        res.status(500).json({ error: true, message: 'Server error' });
    }
});

// =========================================
// GET ADMIN DASHBOARD STATS
// =========================================
router.get('/stats', async (req, res) => {
    try {
        const [[totalArticles]] = await db.query('SELECT COUNT(*) as count FROM news');
        const [[todayArticles]] = await db.query(
            'SELECT COUNT(*) as count FROM news WHERE DATE(published_at) = CURDATE()'
        );
        const [[breakingCount]] = await db.query(
            'SELECT COUNT(*) as count FROM news WHERE is_breaking = TRUE'
        );
        const [[totalViews]] = await db.query('SELECT SUM(views) as count FROM news');

        const [topArticles] = await db.query(`
      SELECT id, title, slug, views 
      FROM news 
      ORDER BY views DESC 
      LIMIT 10
    `);

        const [categoryStats] = await db.query(`
      SELECT c.name_ta, COUNT(n.id) as count
      FROM categories c
      LEFT JOIN news n ON c.id = n.category_id
      GROUP BY c.id
      ORDER BY count DESC
    `);

        res.json({
            success: true,
            stats: {
                totalArticles: totalArticles.count,
                todayArticles: todayArticles.count,
                breakingNews: breakingCount.count,
                totalViews: totalViews.count || 0,
                topArticles,
                categoryStats
            }
        });

    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ error: true, message: 'Server error' });
    }
});

// =========================================
// GET ALL NEWS FOR ADMIN
// =========================================
router.get('/news', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;

        const [articles] = await db.query(`
      SELECT n.*, c.name_ta as category_name, u.name as author_name
      FROM news n
      LEFT JOIN categories c ON n.category_id = c.id
      LEFT JOIN users u ON n.author_id = u.id
      ORDER BY n.created_at DESC
      LIMIT ? OFFSET ?
    `, [limit, offset]);

        const [[{ total }]] = await db.query('SELECT COUNT(*) as total FROM news');

        res.json({
            success: true,
            data: articles,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) }
        });

    } catch (error) {
        console.error('Get admin news error:', error);
        res.status(500).json({ error: true, message: 'Server error' });
    }
});

export default router;
