/**
 * Election Routes - Real-time Election Results
 * Includes WebSocket support for live updates
 */

import express from 'express';
import jwt from 'jsonwebtoken';
import db from '../config/db.js';

const router = express.Router();

// Store socket.io instance (set from server.js)
let io = null;
export function setSocketIO(socketIO) {
    io = socketIO;
}

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
// PUBLIC: Get All Election Results
// =========================================
router.get('/results', async (req, res) => {
    try {
        const { election } = req.query;

        let query = `
      SELECT id, election_name, constituency, candidate, party, party_symbol,
             votes, vote_percentage, status, margin, updated_at
      FROM election_results
    `;

        if (election) {
            query += ' WHERE election_name = ?';
        }
        query += ' ORDER BY constituency, votes DESC';

        const [results] = await db.query(query, election ? [election] : []);

        // Group by constituency
        const grouped = {};
        results.forEach(r => {
            if (!grouped[r.constituency]) {
                grouped[r.constituency] = [];
            }
            grouped[r.constituency].push(r);
        });

        res.json({
            success: true,
            data: grouped,
            raw: results,
            lastUpdated: new Date().toISOString()
        });

    } catch (error) {
        console.error('Get election results error:', error);
        res.status(500).json({ error: true, message: 'Server error' });
    }
});

// =========================================
// PUBLIC: Get Party-wise Summary
// =========================================
router.get('/summary/party', async (req, res) => {
    try {
        const [summary] = await db.query(`
      SELECT 
        party,
        SUM(votes) as total_votes,
        COUNT(CASE WHEN status = 'won' THEN 1 END) as seats_won,
        COUNT(CASE WHEN status = 'leading' THEN 1 END) as seats_leading,
        COUNT(CASE WHEN status = 'lost' THEN 1 END) as seats_lost
      FROM election_results
      GROUP BY party
      ORDER BY seats_won DESC, seats_leading DESC
    `);

        res.json({ success: true, data: summary });

    } catch (error) {
        console.error('Get party summary error:', error);
        res.status(500).json({ error: true, message: 'Server error' });
    }
});

// =========================================
// PUBLIC: Get Vote Trend for a Result
// =========================================
router.get('/trend/:resultId', async (req, res) => {
    try {
        const [trend] = await db.query(`
      SELECT votes, recorded_at
      FROM election_vote_history
      WHERE result_id = ?
      ORDER BY recorded_at ASC
    `, [req.params.resultId]);

        res.json({ success: true, data: trend });

    } catch (error) {
        console.error('Get trend error:', error);
        res.status(500).json({ error: true, message: 'Server error' });
    }
});

// =========================================
// PUBLIC: Get Swing Comparison
// =========================================
router.get('/analytics/swing', async (req, res) => {
    try {
        const [swingData] = await db.query(`
      SELECT 
        c.constituency,
        c.party,
        c.vote_percentage AS current_pct,
        p.vote_percentage AS previous_pct,
        (c.vote_percentage - COALESCE(p.vote_percentage, 0)) AS swing
      FROM election_results c
      LEFT JOIN election_results_previous p 
        ON c.constituency = p.constituency AND c.party = p.party
      ORDER BY ABS(c.vote_percentage - COALESCE(p.vote_percentage, 0)) DESC
    `);

        res.json({ success: true, data: swingData });

    } catch (error) {
        console.error('Get swing error:', error);
        res.status(500).json({ error: true, message: 'Server error' });
    }
});

// =========================================
// PUBLIC: Get Victory Margins
// =========================================
router.get('/analytics/margins', async (req, res) => {
    try {
        const [margins] = await db.query(`
      SELECT 
        constituency,
        MAX(votes) - (
          SELECT MAX(votes) 
          FROM election_results e2 
          WHERE e2.constituency = e1.constituency 
            AND e2.votes < (SELECT MAX(votes) FROM election_results WHERE constituency = e1.constituency)
        ) AS victory_margin,
        (SELECT candidate FROM election_results WHERE constituency = e1.constituency ORDER BY votes DESC LIMIT 1) as winner,
        (SELECT party FROM election_results WHERE constituency = e1.constituency ORDER BY votes DESC LIMIT 1) as winner_party
      FROM election_results e1
      GROUP BY constituency
      ORDER BY victory_margin ASC
    `);

        res.json({ success: true, data: margins });

    } catch (error) {
        console.error('Get margins error:', error);
        res.status(500).json({ error: true, message: 'Server error' });
    }
});

// =========================================
// ADMIN: Update Election Result (with WebSocket)
// =========================================
router.post('/update', authMiddleware, async (req, res) => {
    if (!['admin', 'editor'].includes(req.user.role)) {
        return res.status(403).json({ error: true, message: 'Forbidden' });
    }

    try {
        const { id, votes, status, vote_percentage } = req.body;

        // Get old values for history
        const [[oldResult]] = await db.query(
            'SELECT votes FROM election_results WHERE id = ?',
            [id]
        );

        // Update result
        await db.query(`
      UPDATE election_results 
      SET votes = ?, status = ?, vote_percentage = COALESCE(?, vote_percentage)
      WHERE id = ?
    `, [votes, status, vote_percentage, id]);

        // Save to history for trend chart
        await db.query(`
      INSERT INTO election_vote_history (result_id, votes)
      VALUES (?, ?)
    `, [id, votes]);

        // Calculate and update margins
        await updateMargins();

        // Emit WebSocket event for real-time update
        if (io) {
            io.emit('election-update', { resultId: id, votes, status });
        }

        // Audit log
        await db.query(`
      INSERT INTO audit_logs (user_id, action, entity, entity_id, old_value, new_value)
      VALUES (?, 'UPDATE', 'election_results', ?, ?, ?)
    `, [req.user.id, id, JSON.stringify({ votes: oldResult?.votes }), JSON.stringify({ votes, status })]);

        res.json({ success: true, message: 'Result updated' });

    } catch (error) {
        console.error('Update election error:', error);
        res.status(500).json({ error: true, message: 'Server error' });
    }
});

// =========================================
// ADMIN: Add New Candidate/Result
// =========================================
router.post('/add', authMiddleware, async (req, res) => {
    if (!['admin', 'editor'].includes(req.user.role)) {
        return res.status(403).json({ error: true, message: 'Forbidden' });
    }

    try {
        const { election_name, constituency, candidate, party, party_symbol } = req.body;

        const [result] = await db.query(`
      INSERT INTO election_results 
      (election_name, constituency, candidate, party, party_symbol, votes, status)
      VALUES (?, ?, ?, ?, ?, 0, 'counting')
    `, [election_name, constituency, candidate, party, party_symbol]);

        if (io) {
            io.emit('election-update', { type: 'new', resultId: result.insertId });
        }

        res.status(201).json({ success: true, resultId: result.insertId });

    } catch (error) {
        console.error('Add election result error:', error);
        res.status(500).json({ error: true, message: 'Server error' });
    }
});

// Helper: Update margins for all constituencies
async function updateMargins() {
    const [constituencies] = await db.query(
        'SELECT DISTINCT constituency FROM election_results'
    );

    for (const c of constituencies) {
        const [results] = await db.query(`
      SELECT id, votes FROM election_results 
      WHERE constituency = ? 
      ORDER BY votes DESC
    `, [c.constituency]);

        if (results.length >= 2) {
            const margin = results[0].votes - results[1].votes;
            await db.query(
                'UPDATE election_results SET margin = ? WHERE id = ?',
                [margin, results[0].id]
            );
        }
    }
}

export default router;
