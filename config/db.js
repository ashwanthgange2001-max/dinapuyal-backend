/**
 * MySQL Database Connection Pool
 * Uses mysql2 with promise support
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

// Log connection details for debugging (hide password)
console.log('🔧 MySQL Config:', {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    database: process.env.DB_NAME || 'dinapuyal_news',
    port: process.env.DB_PORT || 3306
});

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'dinapuyal_news',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: 'utf8mb4',
    connectTimeout: 30000, // 30 seconds timeout
    // SSL configuration for remote MySQL (Hostinger requires this)
    ssl: {
        rejectUnauthorized: false
    }
});

// Test connection
pool.getConnection()
    .then(connection => {
        console.log('✅ MySQL Database connected successfully!');
        connection.release();
    })
    .catch(err => {
        console.error('❌ MySQL connection error:', {
            message: err.message,
            code: err.code,
            errno: err.errno,
            sqlState: err.sqlState,
            sqlMessage: err.sqlMessage
        });
    });

export default pool;
