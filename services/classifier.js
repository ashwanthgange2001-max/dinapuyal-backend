/**
 * AI Classification Service
 * Auto-categorizes Tamil news articles
 */

import db from '../config/db.js';
import crypto from 'crypto';

// Category keywords for rule-based fallback
const CATEGORY_KEYWORDS = {
    'அரசியல்': ['தேர்தல்', 'அமைச்சர்', 'எம்.பி', 'எம்.எல்.ஏ', 'ஆளுநர்', 'முதலமைச்சர்', 'கட்சி', 'வாக்கு', 'சட்டமன்றம்', 'பா.ஜ.க', 'திமுக', 'அதிமுக', 'காங்கிரஸ்'],
    'தமிழ்நாடு': ['சென்னை', 'கோயம்புத்தூர்', 'மதுரை', 'திருச்சி', 'சேலம்', 'தமிழக', 'தமிழ்நாடு'],
    'இந்தியா': ['மோடி', 'டெல்லி', 'மும்பை', 'கொல்கத்தா', 'பெங்களூரு', 'மத்திய அரசு', 'பிரதமர்', 'ராஜ்யசபா', 'லோக்சபா'],
    'சினிமா': ['நடிகர்', 'நடிகை', 'படம்', 'இயக்குனர்', 'விஜய்', 'அஜித்', 'ரஜினி', 'கமல்', 'தனுஷ்', 'சூர்யா', 'சிம்பு', 'ஓடிடி', 'தியேட்டர்'],
    'விளையாட்டு': ['கிரிக்கெட்', 'ஐபிஎல்', 'உலகக் கோப்பை', 'ஹாக்கி', 'கால்பந்து', 'டென்னிஸ்', 'ஒலிம்பிக்', 'சாம்பியன்', 'போட்டி', 'வெற்றி'],
    'குற்றம்': ['போலீஸ்', 'கைது', 'கொலை', 'திருட்டு', 'மோசடி', 'நீதிமன்றம்', 'வழக்கு', 'சிறை', 'குற்றம்'],
    'தொழில்நுட்பம்': ['ஐபோன்', 'ஆண்ட்ராய்டு', 'செயலி', 'கூகுள்', 'ஆப்பிள்', 'சாம்சங்', 'ஏஐ', 'செயற்கை நுண்ணறிவு', 'ரோபோ'],
    'வேலைவாய்ப்பு': ['வேலை', 'நியமனம்', 'தேர்வு', 'பணி', 'சம்பளம்', 'ஆட்சேர்ப்பு', 'நேர்காணல்'],
    'வணிகம்': ['பங்கு', 'சென்செக்ஸ்', 'நிஃப்டி', 'ரூபாய்', 'டாலர்', 'தங்கம்', 'வங்கி', 'வட்டி', 'பணவீக்கம்'],
    'ஆரோக்கியம்': ['மருந்து', 'மருத்துவமனை', 'டாக்டர்', 'நோய்', 'கொரோனா', 'சிகிச்சை', 'தடுப்பூசி', 'அறுவை சிகிச்சை'],
    'ஆன்மிகம்': ['கோயில்', 'பூஜை', 'திருவிழா', 'கடவுள்', 'சாமியார்', 'ஆசிரமம்', 'தீர்த்தம்', 'யாத்திரை']
};

// =========================================
// CLASSIFY CONTENT (Rule-based)
// =========================================
export function classifyContent(content, title = '') {
    const text = (title + ' ' + content).toLowerCase();
    const scores = {};

    // Calculate keyword matches for each category
    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
        scores[category] = 0;
        for (const keyword of keywords) {
            if (text.includes(keyword.toLowerCase())) {
                scores[category]++;
            }
        }
    }

    // Find category with highest score
    let maxScore = 0;
    let bestCategory = 'தமிழ்நாடு'; // Default

    for (const [category, score] of Object.entries(scores)) {
        if (score > maxScore) {
            maxScore = score;
            bestCategory = category;
        }
    }

    const confidence = maxScore > 0 ? Math.min(maxScore / 5, 1) : 0.3;

    return {
        category: bestCategory,
        confidence,
        scores
    };
}

// =========================================
// CLASSIFY WITH CACHE
// =========================================
export async function classifyWithCache(content, title = '') {
    const text = (title + ' ' + content).substring(0, 500);
    const hash = crypto.createHash('sha256').update(text).digest('hex');

    // Check cache
    const [cached] = await db.query(
        'SELECT category, confidence FROM classification_cache WHERE content_hash = ?',
        [hash]
    );

    if (cached.length > 0) {
        return {
            category: cached[0].category,
            confidence: parseFloat(cached[0].confidence),
            cached: true
        };
    }

    // Classify
    const result = classifyContent(content, title);

    // Cache result
    await db.query(
        'INSERT INTO classification_cache (content_hash, category, confidence) VALUES (?, ?, ?)',
        [hash, result.category, result.confidence]
    );

    return { ...result, cached: false };
}

// =========================================
// AI CLASSIFICATION (Template for GPT/Claude)
// =========================================
export async function aiClassify(content, title = '') {
    // This is a template for AI API integration
    // Replace with actual API call to Claude/GPT

    const prompt = `இந்த செய்தியை படித்து, சரியான பிரிவை மட்டும் தேர்ந்தெடுக்கவும்:

விருப்பங்கள்:
- அரசியல்
- தமிழ்நாடு
- இந்தியா
- சினிமா
- விளையாட்டு
- குற்றம்
- தொழில்நுட்பம்
- வேலைவாய்ப்பு
- வணிகம்
- ஆரோக்கியம்
- ஆன்மிகம்

செய்தி தலைப்பு: ${title}
செய்தி உள்ளடக்கம்: ${content.substring(0, 500)}

பதில் ஒரே வார்த்தை மட்டுமே.`;

    // For now, use rule-based classification
    // Uncomment below for actual AI integration:
    /*
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 50,
        messages: [{ role: 'user', content: prompt }]
      })
    });
  
    const data = await response.json();
    return data.content[0].text.trim();
    */

    return classifyContent(content, title).category;
}

// =========================================
// AUTO-CLASSIFY NEWS ARTICLE
// =========================================
export async function autoClassifyNews(newsId) {
    try {
        const [[news]] = await db.query(
            'SELECT title, content FROM news WHERE id = ?',
            [newsId]
        );

        if (!news) return null;

        const result = await classifyWithCache(news.content, news.title);

        // Get category ID
        const [[category]] = await db.query(
            'SELECT id FROM categories WHERE name_ta = ?',
            [result.category]
        );

        if (category) {
            await db.query(
                'UPDATE news SET category_id = ? WHERE id = ?',
                [category.id, newsId]
            );
        }

        return result;

    } catch (error) {
        console.error('Auto-classify error:', error);
        return null;
    }
}
