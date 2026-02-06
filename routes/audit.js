/**
 * Audit & Version History Routes
 * Version control and activity logging
 */

import express from 'express';
import jwt from 'jsonwebtoken';
import db from '../config/db.js';

const router = express.Router();

// Auth middleware
const authMiddleware = (req, res, next) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ error: true, message: 'Unauthorized' });
        req.user = jwt.verify(token, process.env.JWT_SECRET || 'secret');
        next();
    } catch (error) {
        res.status(401).json({ error: true, message: 'Invalid token' });
    }
};

router.use(authMiddleware);

// =========================================
// GET AUDIT LOGS
// =========================================
router.get('/logs', async (req, res) => {
    if (!['admin'].includes(req.user.role)) {
        return res.status(403).json({ error: true, message: 'Admin only' });
    }

    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const offset = (page - 1) * limit;
        const { entity, action, userId } = req.query;

        let query = `
      SELECT al.*, u.name as user_name
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE 1=1
    `;
        const params = [];

        if (entity) {
            query += ' AND al.entity = ?';
            params.push(entity);
        }
        if (action) {
            query += ' AND al.action = ?';
            params.push(action);
        }
        if (userId) {
            query += ' AND al.user_id = ?';
            params.push(userId);
        }

        query += ' ORDER BY al.created_at DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);

        const [logs] = await db.query(query, params);

        const [[{ total }]] = await db.query('SELECT COUNT(*) as total FROM audit_logs');

        res.json({
            success: true,
            data: logs,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) }
        });

    } catch (error) {
        console.error('Get audit logs error:', error);
        res.status(500).json({ error: true, message: 'Server error' });
    }
});

// =========================================
// GET NEWS VERSION HISTORY
// =========================================
router.get('/news/:newsId/versions', async (req, res) => {
    try {
        const [versions] = await db.query(`
      SELECT nv.*, u.name as editor_name
      FROM news_versions nv
      LEFT JOIN users u ON nv.edited_by = u.id
      WHERE nv.news_id = ?
      ORDER BY nv.created_at DESC
    `, [req.params.newsId]);

        res.json({ success: true, data: versions });

    } catch (error) {
        console.error('Get versions error:', error);
        res.status(500).json({ error: true, message: 'Server error' });
    }
});

// =========================================
// GET SPECIFIC VERSION
// =========================================
router.get('/version/:versionId', async (req, res) => {
    try {
        const [[version]] = await db.query(`
      SELECT nv.*, u.name as editor_name
      FROM news_versions nv
      LEFT JOIN users u ON nv.edited_by = u.id
      WHERE nv.id = ?
    `, [req.params.versionId]);

        if (!version) {
            return res.status(404).json({ error: true, message: 'Version not found' });
        }

        res.json({ success: true, data: version });

    } catch (error) {
        console.error('Get version error:', error);
        res.status(500).json({ error: true, message: 'Server error' });
    }
});

// =========================================
// RESTORE VERSION
// =========================================
router.post('/news/:newsId/restore/:versionId', async (req, res) => {
    if (!['admin', 'editor'].includes(req.user.role)) {
        return res.status(403).json({ error: true, message: 'Forbidden' });
    }

    try {
        const { newsId, versionId } = req.params;
        const { reason } = req.body;

        // Get current version for backup
        const [[current]] = await db.query(
            'SELECT title, content, excerpt FROM news WHERE id = ?',
            [newsId]
        );

        if (!current) {
            return res.status(404).json({ error: true, message: 'News not found' });
        }

        // Save current as new version before restoring
        await db.query(`
      INSERT INTO news_versions (news_id, title, content, excerpt, edited_by, edit_reason)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [newsId, current.title, current.content, current.excerpt, req.user.id,
            `Auto-backup before restore to version #${versionId}`]);

        // Get the version to restore
        const [[oldVersion]] = await db.query(
            'SELECT title, content, excerpt FROM news_versions WHERE id = ?',
            [versionId]
        );

        if (!oldVersion) {
            return res.status(404).json({ error: true, message: 'Version not found' });
        }

        // Restore
        await db.query(`
      UPDATE news SET title = ?, content = ?, excerpt = ? WHERE id = ?
    `, [oldVersion.title, oldVersion.content, oldVersion.excerpt, newsId]);

        // Audit log
        await db.query(`
      INSERT INTO audit_logs (user_id, action, entity, entity_id, new_value, ip_address)
      VALUES (?, 'RESTORE_VERSION', 'news', ?, ?, ?)
    `, [req.user.id, newsId, JSON.stringify({ versionId, reason }), req.ip]);

        res.json({ success: true, message: 'Version restored successfully' });

    } catch (error) {
        console.error('Restore version error:', error);
        res.status(500).json({ error: true, message: 'Server error' });
    }
});

// =========================================
// COMPARE VERSIONS
// =========================================
router.get('/compare/:versionId1/:versionId2', async (req, res) => {
    try {
        const { versionId1, versionId2 } = req.params;

        const [[v1]] = await db.query(
            'SELECT * FROM news_versions WHERE id = ?',
            [versionId1]
        );
        const [[v2]] = await db.query(
            'SELECT * FROM news_versions WHERE id = ?',
            [versionId2]
        );

        if (!v1 || !v2) {
            return res.status(404).json({ error: true, message: 'Version not found' });
        }

        res.json({
            success: true,
            data: {
                version1: v1,
                version2: v2
            }
        });

    } catch (error) {
        console.error('Compare versions error:', error);
        res.status(500).json({ error: true, message: 'Server error' });
    }
});

// =========================================
// HELPER: Log Audit Event
// =========================================
export async function logAudit(userId, action, entity, entityId, oldValue, newValue, req) {
    try {
        await db.query(`
      INSERT INTO audit_logs 
      (user_id, action, entity, entity_id, old_value, new_value, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
            userId,
            action,
            entity,
            entityId,
            oldValue ? JSON.stringify(oldValue) : null,
            newValue ? JSON.stringify(newValue) : null,
            req?.ip || null,
            req?.headers?.['user-agent'] || null
        ]);
    } catch (error) {
        console.error('Audit log error:', error);
    }
}

// =========================================
// HELPER: Save News Version Before Edit
// =========================================
export async function saveNewsVersion(newsId, userId, reason = 'Manual edit') {
    try {
        const [[current]] = await db.query(
            'SELECT title, content, excerpt FROM news WHERE id = ?',
            [newsId]
        );

        if (current) {
            await db.query(`
        INSERT INTO news_versions (news_id, title, content, excerpt, edited_by, edit_reason)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [newsId, current.title, current.content, current.excerpt, userId, reason]);
        }
    } catch (error) {
        console.error('Save version error:', error);
    }
}

export default router;
