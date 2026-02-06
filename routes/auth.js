/**
 * Authentication Routes
 * Login, Register, Token Verification
 */

import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import db from '../config/db.js';

const router = express.Router();

// =========================================
// LOGIN
// =========================================
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                error: true,
                message: 'Email and password required'
            });
        }

        const [users] = await db.query(
            'SELECT * FROM users WHERE email = ? AND is_active = TRUE',
            [email]
        );

        if (users.length === 0) {
            return res.status(401).json({
                error: true,
                message: 'Invalid credentials'
            });
        }

        const user = users[0];
        const validPassword = await bcrypt.compare(password, user.password);

        if (!validPassword) {
            return res.status(401).json({
                error: true,
                message: 'Invalid credentials'
            });
        }

        // Update last login
        await db.query(
            'UPDATE users SET last_login = NOW() WHERE id = ?',
            [user.id]
        );

        // Generate JWT token
        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            process.env.JWT_SECRET || 'secret',
            { expiresIn: '24h' }
        );

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                avatar: user.avatar
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: true, message: 'Server error' });
    }
});

// =========================================
// REGISTER (Admin only creates users)
// =========================================
router.post('/register', async (req, res) => {
    try {
        const { name, email, password, role = 'reporter' } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({
                error: true,
                message: 'All fields required'
            });
        }

        // Check if user exists
        const [existing] = await db.query(
            'SELECT id FROM users WHERE email = ?',
            [email]
        );

        if (existing.length > 0) {
            return res.status(400).json({
                error: true,
                message: 'Email already registered'
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user
        const [result] = await db.query(
            'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
            [name, email, hashedPassword, role]
        );

        res.status(201).json({
            success: true,
            message: 'User created successfully',
            userId: result.insertId
        });

    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: true, message: 'Server error' });
    }
});

// =========================================
// VERIFY TOKEN
// =========================================
router.get('/verify', async (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');

        if (!token) {
            return res.status(401).json({ error: true, message: 'No token provided' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');

        const [users] = await db.query(
            'SELECT id, name, email, role, avatar FROM users WHERE id = ?',
            [decoded.id]
        );

        if (users.length === 0) {
            return res.status(401).json({ error: true, message: 'User not found' });
        }

        res.json({ success: true, user: users[0] });

    } catch (error) {
        res.status(401).json({ error: true, message: 'Invalid token' });
    }
});

export default router;
