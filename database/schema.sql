-- DINAPUYAL NEWS - MySQL Database Schema
-- Run this to create all required tables

-- Create Database
CREATE DATABASE IF NOT EXISTS dinapuyal_news CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE dinapuyal_news;

-- =========================================
-- 1. USERS TABLE (Admin, Editor, Reporter)
-- =========================================
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role ENUM('admin', 'editor', 'reporter', 'viewer') DEFAULT 'reporter',
  avatar VARCHAR(255),
  is_active BOOLEAN DEFAULT TRUE,
  last_login DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- =========================================
-- 2. CATEGORIES TABLE
-- =========================================
CREATE TABLE IF NOT EXISTS categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name_ta VARCHAR(100) NOT NULL,          -- Tamil name: தமிழ்நாடு
  name_en VARCHAR(100) NOT NULL,          -- English name: tamilnadu
  slug VARCHAR(100) UNIQUE NOT NULL,      -- URL slug: tamilnadu
  icon VARCHAR(50),                        -- Font Awesome icon: fa-landmark
  color VARCHAR(20),                       -- Hex color: #2196f3
  display_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default categories
INSERT INTO categories (name_ta, name_en, slug, icon, color, display_order) VALUES
('தமிழ்நாடு', 'Tamil Nadu', 'tamilnadu', 'fa-landmark', '#2196f3', 1),
('இந்தியா', 'India', 'india', 'fa-flag', '#ff9800', 2),
('உலகம்', 'World', 'world', 'fa-globe-americas', '#4caf50', 3),
('அரசியல்', 'Politics', 'politics', 'fa-landmark-dome', '#9c27b0', 4),
('சினிமா', 'Cinema', 'cinema', 'fa-film', '#e91e63', 5),
('விளையாட்டு', 'Sports', 'sports', 'fa-futbol', '#00bcd4', 6),
('வணிகம்', 'Business', 'business', 'fa-chart-line', '#795548', 7),
('தொழில்நுட்பம்', 'Technology', 'technology', 'fa-microchip', '#607d8b', 8),
('ஆரோக்கியம்', 'Health', 'health', 'fa-heartbeat', '#f44336', 9),
('கல்வி', 'Education', 'education', 'fa-graduation-cap', '#3f51b5', 10),
('ஆன்மிகம்', 'Spirituality', 'spirituality', 'fa-om', '#ff5722', 11);

-- =========================================
-- 3. NEWS ARTICLES TABLE
-- =========================================
CREATE TABLE IF NOT EXISTS news (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(500) NOT NULL,            -- செய்தி தலைப்பு
  slug VARCHAR(500) UNIQUE NOT NULL,      -- SEO-friendly URL slug
  content LONGTEXT NOT NULL,              -- Full article content (stored locally)
  excerpt VARCHAR(500),                   -- Short description
  image VARCHAR(255),                     -- Local image path: /uploads/abc123.jpg
  image_alt VARCHAR(255),                 -- Image alt text
  category_id INT,
  author_id INT,
  source_name VARCHAR(100),               -- Original source: BBC Tamil
  source_url VARCHAR(500),                -- Original article URL
  is_breaking BOOLEAN DEFAULT FALSE,      -- Breaking news flag
  is_featured BOOLEAN DEFAULT FALSE,      -- Featured on homepage
  is_published BOOLEAN DEFAULT TRUE,
  views INT DEFAULT 0,
  published_at DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL,
  
  INDEX idx_published_at (published_at DESC),
  INDEX idx_category (category_id),
  INDEX idx_breaking (is_breaking),
  INDEX idx_featured (is_featured),
  FULLTEXT INDEX idx_search (title, content, excerpt)
);

-- =========================================
-- 4. TAGS TABLE
-- =========================================
CREATE TABLE IF NOT EXISTS tags (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name_ta VARCHAR(100) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =========================================
-- 5. NEWS-TAGS RELATIONSHIP
-- =========================================
CREATE TABLE IF NOT EXISTS news_tags (
  news_id INT NOT NULL,
  tag_id INT NOT NULL,
  PRIMARY KEY (news_id, tag_id),
  FOREIGN KEY (news_id) REFERENCES news(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

-- =========================================
-- 6. SCRAPER SOURCES TABLE
-- =========================================
CREATE TABLE IF NOT EXISTS scraper_sources (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  url VARCHAR(500) NOT NULL,
  category_id INT,
  selector_title VARCHAR(255),            -- CSS selector for title
  selector_content VARCHAR(255),          -- CSS selector for content
  selector_image VARCHAR(255),            -- CSS selector for image
  is_active BOOLEAN DEFAULT TRUE,
  last_scraped_at DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

-- Insert default scraper sources
INSERT INTO scraper_sources (name, url, category_id, selector_title, selector_content, selector_image) VALUES
('BBC Tamil', 'https://www.bbc.com/tamil', 1, 'h1', '.article-content p', '.article-content img'),
('Vikatan', 'https://www.vikatan.com', 1, 'h1.title', '.article-body p', '.article-image img'),
('Dinamalar', 'https://www.dinamalar.com', 1, 'h1', '.story-content p', '.story-image img');

-- =========================================
-- 7. RASI PALAN TABLE
-- =========================================
CREATE TABLE IF NOT EXISTS rasi_palan (
  id INT AUTO_INCREMENT PRIMARY KEY,
  rasi_name VARCHAR(50) NOT NULL,         -- மேஷம், ரிஷபம், etc.
  rasi_en VARCHAR(50) NOT NULL,           -- Aries, Taurus, etc.
  prediction TEXT NOT NULL,
  prediction_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE KEY unique_rasi_date (rasi_name, prediction_date)
);

-- =========================================
-- 8. SITE SETTINGS TABLE
-- =========================================
CREATE TABLE IF NOT EXISTS settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  setting_key VARCHAR(100) UNIQUE NOT NULL,
  setting_value TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Insert default settings
INSERT INTO settings (setting_key, setting_value) VALUES
('site_name', 'தினபுயல்'),
('site_tagline', 'உண்மையின் குரல், தினமும் உங்கள் காதில்'),
('contact_email', 'dinapuyalmedia@gmail.com'),
('social_facebook', 'https://facebook.com/dinapuyal'),
('social_instagram', 'https://instagram.com/dinapuyal'),
('social_youtube', 'https://youtube.com/@dinapuyal'),
('social_twitter', 'https://twitter.com/dinapuyal'),
('adsense_publisher_id', 'ca-pub-XXXXXXXX'),
('ga_tracking_id', 'G-XXXXXXX');

-- =========================================
-- 9. ANALYTICS TABLE
-- =========================================
CREATE TABLE IF NOT EXISTS analytics (
  id INT AUTO_INCREMENT PRIMARY KEY,
  news_id INT,
  page_views INT DEFAULT 0,
  unique_visitors INT DEFAULT 0,
  date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (news_id) REFERENCES news(id) ON DELETE CASCADE,
  UNIQUE KEY unique_news_date (news_id, date)
);

-- =========================================
-- CREATE DEFAULT ADMIN USER
-- Password: admin123 (change immediately!)
-- =========================================
INSERT INTO users (name, email, password, role) VALUES
('Admin', 'admin@dinapuyal.com', '$2b$10$YourHashedPasswordHere', 'admin');

-- Note: Generate password hash using bcrypt before inserting
-- Example: bcrypt.hash('admin123', 10)
