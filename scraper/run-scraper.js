/**
 * Run Scraper Script
 * Execute: node scraper/run-scraper.js
 */

import dotenv from 'dotenv';
dotenv.config();

import { runAllScrapers } from './scraper.js';

console.log(`
╔══════════════════════════════════════════╗
║     📰 DINAPUYAL NEWS SCRAPER            ║
║     செய்தி சேகரிப்பான்                    ║
╚══════════════════════════════════════════╝
`);

runAllScrapers()
    .then(() => {
        console.log('\n🎉 Scraping complete!');
        process.exit(0);
    })
    .catch(err => {
        console.error('❌ Scraper error:', err);
        process.exit(1);
    });
