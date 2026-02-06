# 📰 Dinapuyal News Backend v2.0

Production-ready Tamil News Portal API with real-time election results, push notifications, and AI classification.

## 🚀 Features

### Core News
- ✅ **Full content storage** - Articles stored locally
- ✅ **Local image hosting** - No hotlinking issues
- ✅ **News scraper** - Auto-fetch and rewrite articles
- ✅ **Admin CMS** - Create, edit, publish articles
- ✅ **SEO-friendly URLs** - Tamil slugs supported

### Real-time (NEW)
- ✅ **Election Live Results** - WebSocket real-time updates
- ✅ **Push Notifications** - Firebase FCM integration
- ✅ **Breaking News Alerts** - One-click breaking push

### Analytics (NEW)
- ✅ **Party-wise Vote Share** - Pie charts ready
- ✅ **Swing Comparison** - vs Previous election
- ✅ **Victory Margins** - Close contests
- ✅ **Vote Trends** - Line charts over time

### Enterprise (NEW)
- ✅ **Version History** - Restore previous edits
- ✅ **Audit Logging** - Track all actions
- ✅ **AI Classification** - Auto-categorize news
- ✅ **User Roles** - Admin, Editor, Reporter, Viewer

---

## 📦 Installation

```bash
cd backend
npm install
```

### Setup Environment
```bash
cp .env.example .env
# Edit with your MySQL credentials
```

### Create Database
```bash
# Main schema
mysql -u root -p < database/schema.sql

# Advanced features (election, notifications, audit)
mysql -u root -p < database/schema-advanced.sql
```

### Start Server
```bash
# Development (with nodemon)
npm run dev

# Production
npm start
```

---

## 🔌 API Endpoints

### News
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/news` | All news (paginated) |
| GET | `/api/news/:slug` | Single article (full) |
| GET | `/api/news/breaking` | Breaking news |
| GET | `/api/news/featured` | Featured articles |
| GET | `/api/news/trending` | Top viewed |

### Election (Real-time)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/election/results` | All results |
| GET | `/api/election/summary/party` | Party-wise summary |
| GET | `/api/election/trend/:id` | Vote trend |
| GET | `/api/election/analytics/swing` | Swing comparison |
| GET | `/api/election/analytics/margins` | Victory margins |
| POST | `/api/election/update` | Update result (admin) |
| GET | `/api/election/stream` | SSE stream |

### Push Notifications
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/notifications/subscribe` | Subscribe device |
| POST | `/api/notifications/send/breaking` | Send breaking (admin) |
| POST | `/api/notifications/send/election` | Send election (admin) |
| GET | `/api/notifications/stats` | Notification stats |

### Audit & Versions
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/audit/logs` | All audit logs |
| GET | `/api/audit/news/:id/versions` | Article versions |
| POST | `/api/audit/news/:id/restore/:vid` | Restore version |

---

## 📡 WebSocket Events

### Connect
```javascript
import io from 'socket.io-client';
const socket = io('http://localhost:3001');

// Join election room
socket.emit('join-election');

// Listen for updates
socket.on('election-update', (data) => {
  console.log('Election updated:', data);
  // Refresh UI
});
```

### Events
- `election-update` - Election result changed
- `breaking-news` - New breaking news

---

## 📂 Project Structure

```
backend/
├── config/
│   └── db.js                    # MySQL connection
├── database/
│   ├── schema.sql               # Core schema
│   └── schema-advanced.sql      # Election, audit, notifications
├── routes/
│   ├── auth.js                  # Authentication
│   ├── news.js                  # News API
│   ├── admin.js                 # Admin CMS
│   ├── election.js              # Election results
│   ├── notifications.js         # Push notifications
│   ├── audit.js                 # Version history
│   └── scraper.js               # Scraper management
├── scraper/
│   ├── scraper.js               # News scraper
│   └── run-scraper.js           # CLI runner
├── services/
│   └── classifier.js            # AI classification
├── uploads/                     # Local images
├── server.js                    # Express + Socket.IO
└── package.json
```

---

## � Election Results Setup

### Add Constituencies
```sql
INSERT INTO election_results 
(election_name, constituency, candidate, party, votes, status)
VALUES 
('2026 TN Assembly', 'சென்னை மத்திய', 'ஆ. ராஜா', 'திமுக', 0, 'counting');
```

### Update Votes (triggers WebSocket)
```javascript
POST /api/election/update
{
  "id": 1,
  "votes": 45230,
  "status": "leading"
}
```

---

## � Push Notifications Setup

### 1. Get Firebase Credentials
- Create project at [Firebase Console](https://console.firebase.google.com)
- Download `serviceAccountKey.json`
- Place in `backend/config/`

### 2. Initialize Firebase
```javascript
// In server.js (uncomment)
import admin from 'firebase-admin';
import serviceAccount from './config/serviceAccountKey.json';

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
```

### 3. Send Breaking Alert
```javascript
POST /api/notifications/send/breaking
{
  "title": "முக்கிய செய்தி",
  "body": "தமிழக அரசு புதிய அறிவிப்பு",
  "url": "/news/article-slug"
}
```

---

## 🤖 AI Classification

### Auto-classify Article
```javascript
import { autoClassifyNews } from './services/classifier.js';

// After saving article
await autoClassifyNews(articleId);
// Automatically sets category_id based on content
```

### Categories Detected
- அரசியல் (Politics)
- தமிழ்நாடு
- இந்தியா
- சினிமா
- விளையாட்டு
- குற்றம் (Crime)
- தொழில்நுட்பம் (Technology)
- வேலைவாய்ப்பு (Jobs)
- வணிகம் (Business)
- ஆரோக்கியம் (Health)
- ஆன்மிகம் (Spirituality)

---

## 📊 Analytics Dashboard Data

### Party Vote Share
```javascript
GET /api/election/summary/party
// Returns: [{ party: 'திமுக', total_votes: 450000, seats_won: 5 }]
```

### Swing Data
```javascript
GET /api/election/analytics/swing
// Returns: [{ constituency: 'சென்னை', party: 'திமுக', swing: +6.5 }]
```

### Victory Margins
```javascript
GET /api/election/analytics/margins
// Returns: [{ constituency: 'சென்னை', victory_margin: 3130, winner: 'ஆ. ராஜா' }]
```

---

## 🔒 Security

1. **Change JWT_SECRET** in `.env`
2. **Hash all passwords** with bcrypt
3. **Use HTTPS** in production
4. **Rate limit** API endpoints
5. **Validate all input**

---

## 📝 License

MIT © Dinapuyal Media
