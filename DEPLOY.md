# Dinapuyal News Backend

Tamil News Portal API with auto-scraping and MySQL storage.

## Deploy to Render.com

1. Create account at [render.com](https://render.com)
2. New → Web Service → Connect GitHub/GitLab
3. Or use "Deploy from Git" with this repo

## Environment Variables (Set in Render Dashboard)

```
PORT=3001
NODE_ENV=production
DB_HOST=<your-hostinger-mysql-host>
DB_USER=u860157108_Je0i9
DB_PASSWORD=macAIR2025
DB_NAME=u860157108_C3rBU
JWT_SECRET=your_secret_key
ENABLE_AUTO_SCRAPER=true
```

## Hostinger MySQL Remote Access

1. Login to Hostinger hPanel
2. Go to Databases → MySQL
3. Click on "Remote MySQL"
4. Add Render's IP (or use `%` for any IP during testing)

## Build Command
```
npm install
```

## Start Command
```
npm start
```
