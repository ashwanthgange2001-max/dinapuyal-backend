/**
 * DINAPUYAL NEWS - Express Backend Server
 * Production-ready Tamil News API with WebSocket Support
 * Version: 2.0.0
 */

import express from 'express';
import cors from 'cors';
import compression from 'compression';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { Server as SocketIO } from 'socket.io';

// Routes
import authRoutes from './routes/auth.js';
import newsRoutes from './routes/news.js';
import categoryRoutes from './routes/categories.js';
import adminRoutes from './routes/admin.js';
import scraperRoutes from './routes/scraper.js';
import electionRoutes, { setSocketIO } from './routes/election.js';
import notificationRoutes from './routes/notifications.js';
import auditRoutes from './routes/audit.js';
import sitemapRoutes from './routes/sitemap.js';

// RSS Auto-Scraper (fetches news every 1 minute)
import { startAutoScraper } from './scraper/rss-scraper.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Create HTTP server for WebSocket
const httpServer = createServer(app);

// =========================================
// SOCKET.IO SETUP (Real-time updates)
// =========================================
const io = new SocketIO(httpServer, {
    cors: {
        origin: [
            process.env.FRONTEND_URL || 'http://localhost:3000',
            process.env.ADMIN_URL || 'http://localhost:3002',
            'http://localhost:8889',
            'http://localhost:8888'
        ],
        methods: ['GET', 'POST'],
        credentials: true
    }
});

// Pass io to election routes
setSocketIO(io);

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log(`🔌 Client connected: ${socket.id}`);

    // Join rooms for specific updates
    socket.on('join-election', () => {
        socket.join('election');
        console.log(`📊 ${socket.id} joined election room`);
    });

    socket.on('join-breaking', () => {
        socket.join('breaking');
        console.log(`🔴 ${socket.id} joined breaking news room`);
    });

    socket.on('disconnect', () => {
        console.log(`❌ Client disconnected: ${socket.id}`);
    });
});

// Make io accessible in routes
app.set('io', io);

// =========================================
// MIDDLEWARE
// =========================================
app.use(cors({
    origin: [
        process.env.FRONTEND_URL || 'http://localhost:3000',
        process.env.ADMIN_URL || 'http://localhost:3002',
        'http://localhost:8889',
        'http://localhost:8888'
    ],
    credentials: true
}));

// Enable gzip/brotli compression for all responses
app.use(compression());

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve uploaded images with 30-day cache
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
    maxAge: '30d',
    immutable: true
}));

// Request logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} | ${req.method} ${req.path}`);
    next();
});

// =========================================
// API ROUTES
// =========================================
app.use('/api/auth', authRoutes);
app.use('/api/news', newsRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/scraper', scraperRoutes);
app.use('/api/election', electionRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/sitemap', sitemapRoutes);

// =========================================
// HEALTH CHECK
// =========================================
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'Dinapuyal News API',
        version: '2.0.0',
        features: [
            'News CRUD',
            'Election Live Results',
            'Push Notifications',
            'WebSocket Real-time',
            'Version History',
            'Audit Logging',
            'AI Classification'
        ],
        timestamp: new Date().toISOString()
    });
});

// =========================================
// SSE ENDPOINT FOR ELECTION (Alternative to WebSocket)
// =========================================
app.get('/api/election/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Send heartbeat every 30 seconds
    const heartbeat = setInterval(() => {
        res.write('event: heartbeat\ndata: {}\n\n');
    }, 30000);

    // Listen for election updates
    const onUpdate = (data) => {
        res.write(`event: election-update\ndata: ${JSON.stringify(data)}\n\n`);
    };

    io.on('election-update', onUpdate);

    req.on('close', () => {
        clearInterval(heartbeat);
        console.log('SSE connection closed');
    });
});

// =========================================
// ERROR HANDLING
// =========================================
app.use((err, req, res, next) => {
    console.error('Error:', err.message);
    res.status(err.status || 500).json({
        error: true,
        message: process.env.NODE_ENV === 'production'
            ? 'Internal server error'
            : err.message
    });
});

// 404 Handler
app.use((req, res) => {
    res.status(404).json({
        error: true,
        message: 'Route not found'
    });
});

// =========================================
// START SERVER
// =========================================
httpServer.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════╗
║     🗞️  DINAPUYAL NEWS API SERVER v2.0               ║
║     தினபுயல் செய்தி API சர்வர்                        ║
╠══════════════════════════════════════════════════════╣
║  Status:      Running                                ║
║  Port:        ${PORT}                                    ║
║  Mode:        ${process.env.NODE_ENV || 'development'}                        ║
║  WebSocket:   Enabled                                ║
╠══════════════════════════════════════════════════════╣
║  Features:                                           ║
║  ✅ News API          ✅ Election Live               ║
║  ✅ Push Notifications ✅ WebSocket                   ║
║  ✅ Version History    ✅ Audit Logs                  ║
║  ✅ AI Classification  ✅ Auto-Scraper (1 min)        ║
╚══════════════════════════════════════════════════════╝
  `);

    // Start auto-scraper to fetch news every 1 minute
    if (process.env.ENABLE_AUTO_SCRAPER !== 'false') {
        startAutoScraper();
    }
});

export default app;
export { io };
