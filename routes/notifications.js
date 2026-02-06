/**
 * Push Notification Routes
 * Firebase Cloud Messaging integration
 */

import express from 'express';
import jwt from 'jsonwebtoken';
import db from '../config/db.js';
// import admin from 'firebase-admin'; // Uncomment when Firebase is setup

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

// =========================================
// PUBLIC: Subscribe to Push Notifications
// =========================================
router.post('/subscribe', async (req, res) => {
    try {
        const { token, platform = 'web', topics = ['breaking'] } = req.body;

        if (!token) {
            return res.status(400).json({ error: true, message: 'Token required' });
        }

        // Check if already subscribed
        const [existing] = await db.query(
            'SELECT id FROM push_subscribers WHERE token = ?',
            [token]
        );

        if (existing.length > 0) {
            // Update existing
            await db.query(
                'UPDATE push_subscribers SET topics = ?, is_active = TRUE WHERE token = ?',
                [JSON.stringify(topics), token]
            );
        } else {
            // New subscription
            await db.query(
                'INSERT INTO push_subscribers (token, platform, topics) VALUES (?, ?, ?)',
                [token, platform, JSON.stringify(topics)]
            );
        }

        res.json({ success: true, message: 'Subscribed successfully' });

    } catch (error) {
        console.error('Subscribe error:', error);
        res.status(500).json({ error: true, message: 'Server error' });
    }
});

// =========================================
// PUBLIC: Unsubscribe
// =========================================
router.post('/unsubscribe', async (req, res) => {
    try {
        const { token } = req.body;

        await db.query(
            'UPDATE push_subscribers SET is_active = FALSE WHERE token = ?',
            [token]
        );

        res.json({ success: true, message: 'Unsubscribed' });

    } catch (error) {
        console.error('Unsubscribe error:', error);
        res.status(500).json({ error: true, message: 'Server error' });
    }
});

// =========================================
// ADMIN: Send Breaking News Push
// =========================================
router.post('/send/breaking', authMiddleware, async (req, res) => {
    if (!['admin', 'editor'].includes(req.user.role)) {
        return res.status(403).json({ error: true, message: 'Forbidden' });
    }

    try {
        const { title, body, url, newsId } = req.body;

        if (!title) {
            return res.status(400).json({ error: true, message: 'Title required' });
        }

        // Get all active subscribers with 'breaking' topic
        const [subscribers] = await db.query(`
      SELECT token FROM push_subscribers 
      WHERE is_active = TRUE 
        AND JSON_CONTAINS(topics, '"breaking"')
    `);

        if (subscribers.length === 0) {
            return res.json({ success: true, message: 'No subscribers', sent: 0 });
        }

        const tokens = subscribers.map(s => s.token);

        // Firebase send (uncomment when setup)
        /*
        const message = {
          notification: {
            title: `🔴 ${title}`,
            body: body || title
          },
          data: {
            url: url || `/news/${newsId}`,
            type: 'breaking'
          },
          tokens
        };
    
        const response = await admin.messaging().sendMulticast(message);
        const successCount = response.successCount;
        */

        // Mock response for development
        const successCount = tokens.length;

        // Log notification
        await db.query(`
      INSERT INTO notification_log (title, body, type, sent_count, sent_by)
      VALUES (?, ?, 'breaking', ?, ?)
    `, [title, body, successCount, req.user.id]);

        // Update last_sent_at for subscribers
        await db.query(`
      UPDATE push_subscribers 
      SET last_sent_at = NOW() 
      WHERE is_active = TRUE AND JSON_CONTAINS(topics, '"breaking"')
    `);

        res.json({
            success: true,
            message: `Notification sent to ${successCount} subscribers`,
            sent: successCount
        });

    } catch (error) {
        console.error('Send push error:', error);
        res.status(500).json({ error: true, message: 'Server error' });
    }
});

// =========================================
// ADMIN: Send Election Update Push
// =========================================
router.post('/send/election', authMiddleware, async (req, res) => {
    if (!['admin', 'editor'].includes(req.user.role)) {
        return res.status(403).json({ error: true, message: 'Forbidden' });
    }

    try {
        const { title, body } = req.body;

        const [subscribers] = await db.query(`
      SELECT token FROM push_subscribers 
      WHERE is_active = TRUE 
        AND JSON_CONTAINS(topics, '"election"')
    `);

        const tokens = subscribers.map(s => s.token);

        // Mock send
        const successCount = tokens.length;

        await db.query(`
      INSERT INTO notification_log (title, body, type, sent_count, sent_by)
      VALUES (?, ?, 'election', ?, ?)
    `, [title, body, successCount, req.user.id]);

        res.json({ success: true, sent: successCount });

    } catch (error) {
        console.error('Send election push error:', error);
        res.status(500).json({ error: true, message: 'Server error' });
    }
});

// =========================================
// ADMIN: Get Notification Stats
// =========================================
router.get('/stats', authMiddleware, async (req, res) => {
    try {
        const [[subscriberCount]] = await db.query(
            'SELECT COUNT(*) as count FROM push_subscribers WHERE is_active = TRUE'
        );

        const [recentLogs] = await db.query(`
      SELECT nl.*, u.name as sent_by_name
      FROM notification_log nl
      LEFT JOIN users u ON nl.sent_by = u.id
      ORDER BY nl.created_at DESC
      LIMIT 20
    `);

        const [topicStats] = await db.query(`
      SELECT 
        JSON_UNQUOTE(JSON_EXTRACT(topics, '$[0]')) as topic,
        COUNT(*) as count
      FROM push_subscribers
      WHERE is_active = TRUE
      GROUP BY topic
    `);

        res.json({
            success: true,
            data: {
                totalSubscribers: subscriberCount.count,
                recentNotifications: recentLogs,
                topicStats
            }
        });

    } catch (error) {
        console.error('Get notification stats error:', error);
        res.status(500).json({ error: true, message: 'Server error' });
    }
});

export default router;
