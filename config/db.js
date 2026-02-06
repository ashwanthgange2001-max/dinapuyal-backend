/**
 * MySQL Database Connection Pool
 * Uses mysql2 with promise support
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'dinapuyal_news',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: 'utf8mb4'
});

// Test connection
pool.getConnection()
    .then(connection => {
        console.log('✅ MySQL Database connected');
        connection.release();
    })
    .catch(err => {
        console.error('❌ MySQL connection error:', err.message);
    });

export default pool;
