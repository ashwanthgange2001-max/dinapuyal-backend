-- DINAPUYAL NEWS - Election & Advanced Features Schema
-- Run after main schema.sql

USE dinapuyal_news;

-- =========================================
-- 1. ELECTION RESULTS (Real-time)
-- =========================================
CREATE TABLE IF NOT EXISTS election_results (
  id INT AUTO_INCREMENT PRIMARY KEY,
  election_name VARCHAR(100) NOT NULL,       -- "2026 தமிழ்நாடு சட்டமன்றத் தேர்தல்"
  constituency VARCHAR(100) NOT NULL,        -- "திருவரங்கம்"
  constituency_en VARCHAR(100),              -- "Thiruvarangam"
  candidate VARCHAR(100) NOT NULL,           -- "முத்துக்குமார்"
  party VARCHAR(50) NOT NULL,                -- "திமுக"
  party_symbol VARCHAR(50),                  -- "Rising Sun"
  votes INT DEFAULT 0,
  vote_percentage DECIMAL(5,2) DEFAULT 0,
  status ENUM('counting','leading','won','lost') DEFAULT 'counting',
  margin INT DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_constituency (constituency),
  INDEX idx_party (party),
  INDEX idx_status (status)
);

-- =========================================
-- 2. ELECTION VOTE HISTORY (for trend charts)
-- =========================================
CREATE TABLE IF NOT EXISTS election_vote_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  result_id INT NOT NULL,
  votes INT NOT NULL,
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (result_id) REFERENCES election_results(id) ON DELETE CASCADE,
  INDEX idx_result_time (result_id, recorded_at)
);

-- =========================================
-- 3. PREVIOUS ELECTION DATA (for swing comparison)
-- =========================================
CREATE TABLE IF NOT EXISTS election_results_previous (
  id INT AUTO_INCREMENT PRIMARY KEY,
  election_name VARCHAR(100),
  constituency VARCHAR(100),
  party VARCHAR(50),
  candidate VARCHAR(100),
  votes INT,
  vote_percentage DECIMAL(5,2),
  status ENUM('won','lost'),
  
  INDEX idx_constituency_party (constituency, party)
);

-- =========================================
-- 4. PUSH NOTIFICATION SUBSCRIBERS
-- =========================================
CREATE TABLE IF NOT EXISTS push_subscribers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  token TEXT NOT NULL,
  platform ENUM('web','android','ios') DEFAULT 'web',
  topics JSON,                                -- ["breaking", "election", "sports"]
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_sent_at DATETIME
);

-- =========================================
-- 5. NOTIFICATION LOG
-- =========================================
CREATE TABLE IF NOT EXISTS notification_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255),
  body TEXT,
  type ENUM('breaking','election','general') DEFAULT 'general',
  sent_count INT DEFAULT 0,
  sent_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (sent_by) REFERENCES users(id) ON DELETE SET NULL
);

-- =========================================
-- 6. NEWS VERSION HISTORY
-- =========================================
CREATE TABLE IF NOT EXISTS news_versions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  news_id INT NOT NULL,
  title TEXT,
  content LONGTEXT,
  excerpt TEXT,
  edited_by INT,
  edit_reason VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (news_id) REFERENCES news(id) ON DELETE CASCADE,
  FOREIGN KEY (edited_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_news_versions (news_id, created_at DESC)
);

-- =========================================
-- 7. AUDIT LOG (All actions)
-- =========================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT,
  user_email VARCHAR(150),
  action VARCHAR(100) NOT NULL,              -- CREATE, UPDATE, DELETE, LOGIN, etc.
  entity VARCHAR(100),                       -- news, user, election, etc.
  entity_id INT,
  old_value JSON,
  new_value JSON,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_audit_user (user_id),
  INDEX idx_audit_entity (entity, entity_id),
  INDEX idx_audit_time (created_at DESC)
);

-- =========================================
-- 8. AI CLASSIFICATION CACHE
-- =========================================
CREATE TABLE IF NOT EXISTS classification_cache (
  id INT AUTO_INCREMENT PRIMARY KEY,
  content_hash VARCHAR(64) UNIQUE,           -- SHA256 of content
  category VARCHAR(50),
  confidence DECIMAL(3,2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =========================================
-- SAMPLE DATA: Insert election constituencies
-- =========================================
INSERT INTO election_results (election_name, constituency, candidate, party, votes, status) VALUES
('2026 TN Assembly', 'சென்னை மத்திய', 'ஆ. ராஜா', 'திமுக', 45230, 'leading'),
('2026 TN Assembly', 'சென்னை மத்திய', 'ஜெ. ஜெயலலிதா', 'அதிமுக', 42100, 'counting'),
('2026 TN Assembly', 'கோயம்புத்தூர் தெற்கு', 'மு. செல்வம்', 'திமுக', 38500, 'leading'),
('2026 TN Assembly', 'கோயம்புத்தூர் தெற்கு', 'க. அன்பழகன்', 'அதிமுக', 36200, 'counting'),
('2026 TN Assembly', 'மதுரை வடக்கு', 'சு. தங்கவேலு', 'அதிமுக', 41000, 'leading'),
('2026 TN Assembly', 'மதுரை வடக்கு', 'ப. முருகேசன்', 'திமுக', 39800, 'counting');

-- Sample previous election data for swing comparison
INSERT INTO election_results_previous (election_name, constituency, party, candidate, votes, vote_percentage, status) VALUES
('2021 TN Assembly', 'சென்னை மத்திய', 'திமுக', 'ஆ. ராஜா', 41000, 48.5, 'won'),
('2021 TN Assembly', 'சென்னை மத்திய', 'அதிமுக', 'ஜெ. ஜெயலலிதா', 38000, 45.0, 'lost'),
('2021 TN Assembly', 'கோயம்புத்தூர் தெற்கு', 'திமுக', 'மு. செல்வம்', 35000, 46.0, 'won'),
('2021 TN Assembly', 'கோயம்புத்தூர் தெற்கு', 'அதிமுக', 'க. அன்பழகன்', 34000, 44.5, 'lost');
