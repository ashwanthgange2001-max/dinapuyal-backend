/**
 * Sitemap Routes
 * Dynamic sitemap generation for SEO and Google News
 */

import express from 'express';
import db from '../config/db.js';

const router = express.Router();

// =========================================
// NEWS SITEMAP (Google News format)
// =========================================
router.get('/news.xml', async (req, res) => {
    try {
        const [articles] = await db.query(`
            SELECT slug, title, published_at, source_name
            FROM news
            WHERE is_published = TRUE
              AND published_at >= DATE_SUB(NOW(), INTERVAL 2 DAY)
            ORDER BY published_at DESC
            LIMIT 1000
        `);

        const baseUrl = process.env.FRONTEND_URL || 'https://dinapuyal.com';

        let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
`;

        articles.forEach(article => {
            const pubDate = new Date(article.published_at).toISOString();
            xml += `  <url>
    <loc>${baseUrl}/news/${article.slug}</loc>
    <news:news>
      <news:publication>
        <news:name>தினபுயல்</news:name>
        <news:language>ta</news:language>
      </news:publication>
      <news:publication_date>${pubDate}</news:publication_date>
      <news:title><![CDATA[${article.title}]]></news:title>
    </news:news>
  </url>
`;
        });

        xml += '</urlset>';

        res.set('Content-Type', 'application/xml');
        res.set('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
        res.send(xml);

    } catch (error) {
        console.error('News sitemap error:', error);
        res.status(500).send('<?xml version="1.0"?><error>Failed to generate sitemap</error>');
    }
});

// =========================================
// GENERAL SITEMAP (All pages)
// =========================================
router.get('/sitemap.xml', async (req, res) => {
    try {
        const baseUrl = process.env.FRONTEND_URL || 'https://dinapuyal.com';
        const today = new Date().toISOString().split('T')[0];

        // Get all categories
        const [categories] = await db.query(
            'SELECT slug FROM categories WHERE is_active = TRUE'
        );

        // Get recent articles
        const [articles] = await db.query(`
            SELECT slug, updated_at
            FROM news
            WHERE is_published = TRUE
            ORDER BY published_at DESC
            LIMIT 500
        `);

        let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>hourly</changefreq>
    <priority>1.0</priority>
  </url>
`;

        // Add static pages
        const staticPages = ['about', 'contact', 'privacy', 'terms', 'editorial'];
        staticPages.forEach(page => {
            xml += `  <url>
    <loc>${baseUrl}/${page}.html</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
`;
        });

        // Add categories
        categories.forEach(cat => {
            xml += `  <url>
    <loc>${baseUrl}/category/${cat.slug}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>hourly</changefreq>
    <priority>0.8</priority>
  </url>
`;
        });

        // Add articles
        articles.forEach(article => {
            const lastmod = new Date(article.updated_at).toISOString().split('T')[0];
            xml += `  <url>
    <loc>${baseUrl}/news/${article.slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.7</priority>
  </url>
`;
        });

        xml += '</urlset>';

        res.set('Content-Type', 'application/xml');
        res.set('Cache-Control', 'public, max-age=3600');
        res.send(xml);

    } catch (error) {
        console.error('Sitemap error:', error);
        res.status(500).send('<?xml version="1.0"?><error>Failed to generate sitemap</error>');
    }
});

export default router;
