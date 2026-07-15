const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'techhub.db');
let db = null;

async function getDB() {
  if (db) return db;
  const SQL = await initSqlJs();
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }
  db.run('PRAGMA foreign_keys = ON');
  return db;
}

function saveDB() {
  if (!db) return;
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}

function query(sql, params = []) {
  const stmt = db.prepare(sql);
  const isSelect = sql.trim().toUpperCase().startsWith('SELECT')
    || sql.trim().toUpperCase().startsWith('WITH')
    || sql.includes('RETURNING');
  if (isSelect) {
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
  }
  stmt.run(params);
  stmt.free();
  saveDB();
  return { changes: db.getRowsModified() };
}

function get(sql, params = []) {
  const rows = query(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

function all(sql, params = []) {
  return query(sql, params);
}

function run(sql, params = []) {
  return query(sql, params);
}

function exec(sql) {
  db.exec(sql);
  saveDB();
}

async function initDB() {
  await getDB();

  exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      subject TEXT DEFAULT '',
      message TEXT NOT NULL,
      is_read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      long_description TEXT DEFAULT '',
      price REAL NOT NULL DEFAULT 0,
      category TEXT DEFAULT 'general',
      is_active INTEGER DEFAULT 1,
      has_options INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS service_options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      service_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      price REAL NOT NULL,
      is_active INTEGER DEFAULT 1,
      FOREIGN KEY (service_id) REFERENCES services(id)
    );

    CREATE TABLE IF NOT EXISTS reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL,
      expires_at DATETIME NOT NULL,
      used INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      service TEXT NOT NULL,
      service_option TEXT DEFAULT '',
      price REAL NOT NULL,
      phone TEXT DEFAULT '',
      payment_network TEXT DEFAULT '',
      confirmation_code TEXT DEFAULT '',
      is_confirmed INTEGER DEFAULT 0,
      transaction_id TEXT DEFAULT '',
      payment_verified INTEGER DEFAULT 0,
      payment_proof_date DATETIME,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  try { exec('ALTER TABLE services ADD COLUMN has_options INTEGER DEFAULT 0'); } catch(e) {}
  try { exec('ALTER TABLE services ADD COLUMN long_description TEXT DEFAULT ""'); } catch(e) {}
  try { exec('ALTER TABLE orders ADD COLUMN service_option TEXT DEFAULT ""'); } catch(e) {}
  try { exec('ALTER TABLE orders ADD COLUMN confirmation_code TEXT DEFAULT ""'); } catch(e) {}
  try { exec('ALTER TABLE orders ADD COLUMN is_confirmed INTEGER DEFAULT 0'); } catch(e) {}
  try { exec('ALTER TABLE orders ADD COLUMN payment_network TEXT DEFAULT ""'); } catch(e) {}
  try { exec('ALTER TABLE orders ADD COLUMN phone TEXT DEFAULT ""'); } catch(e) {}
  try { exec('ALTER TABLE orders ADD COLUMN transaction_id TEXT DEFAULT ""'); } catch(e) {}
  try { exec('ALTER TABLE orders ADD COLUMN payment_verified INTEGER DEFAULT 0'); } catch(e) {}
  try { exec('ALTER TABLE orders ADD COLUMN payment_proof_date DATETIME'); } catch(e) {}

  const adminExists = get('SELECT id FROM users WHERE role = ?', ['admin']);
  if (!adminExists) {
    const hash = bcrypt.hashSync('admin123', 10);
    run('INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)',
      ['admin', 'admin@techhub.com', hash, 'admin']);
  }

  const count = get('SELECT COUNT(*) as c FROM services');
  if (count.c === 0) {
    const svc = [
      ['Network Setup & Security', 'Structured cabling, router/switch configuration, firewall setup, VPN, and WiFi deployment for homes & businesses.',
       'We design and implement secure, high-performance network infrastructure tailored to your needs. Services include: structured cabling (CAT6/ fiber optic), router and switch configuration, firewall and VPN setup, WiFi deployment (Ubiquiti, MikroTik, Cisco), network security audits, and bandwidth management. Whether you need a small office network or an enterprise-grade setup, we ensure reliability, speed, and security.', 500000, 'networking'],

      ['Computer Maintenance', 'Hardware repair, software installation, virus removal, system optimization, and upgrades.',
       'Keep your computers running at peak performance. We offer: hardware diagnostics and repair (laptop/desktop), software installation and configuration, virus and malware removal, system cleanup and optimization, hardware upgrades (SSD, RAM, etc.), data migration, and preventive maintenance. Service available on-site or at our workshop.', 150000, 'maintenance'],

      ['CCTV Camera Installation', 'Professional security camera installation with remote viewing, motion detection, and recording.',
       'Protect your property with our professional CCTV solutions. We supply and install: Dome cameras (indoor), Bullet cameras (outdoor), PTZ cameras (pan-tilt-zoom), IP/WiFi cameras, 4MP and 8K cameras, night vision and solar-powered cameras. Every installation includes DVR/NVR setup, remote viewing on your phone, and cabling. Choose your preferred camera type when ordering.', 350000, 'security'],

      ['Graphics Design', 'Professional logo design, branding, flyers, banners, business cards, social media graphics, and UI/UX design.',
       'Stand out with stunning visuals. Our graphic design services include: logo and brand identity design, business cards, letterheads, flyers and posters, banners and roll-ups, social media graphics, product packaging, and UI/UX design for websites and apps. We deliver print-ready and web-optimized designs.', 200000, 'design'],

      ['Social Media Management', 'Content creation, posting, scheduling, account growth, and engagement management for all platforms.',
       'Grow your online presence with professional social media management. We handle: content creation (photos, videos, copywriting), posting and scheduling, account growth strategies, audience engagement, analytics and reporting, and ad management. Platforms: Instagram, Facebook, Twitter, LinkedIn, TikTok, YouTube.', 300000, 'marketing'],

      ['Social Media Boosting', 'Increase your followers, likes, comments, and views on all major social media platforms at affordable prices.',
       'Get real engagement on your social media accounts. We offer targeted boosting services for Instagram, Facebook, Twitter, LinkedIn, YouTube, and TikTok. Choose your platform, type (followers, likes, comments, views), and quantity. All packages are delivered safely with no password required. See pricing options below.', 10000, 'marketing'],

      ['Cloud Solutions', 'Cloud migration, hosting, virtual machines, storage, and management on AWS, Azure, and Google Cloud.',
       'Move your business to the cloud with confidence. We offer: cloud migration planning and execution, cloud hosting setup (AWS, Azure, GCP), virtual machine configuration, cloud storage and backup solutions, serverless architecture, and ongoing cloud management. Reduce costs and improve scalability.', 800000, 'cloud'],

      ['Software Development', 'Custom web, mobile, and desktop applications built with modern frameworks and best practices.',
       'Transform your ideas into powerful software. We build: custom web applications (React, Node.js, Django, Laravel), mobile apps (Android, iOS, Flutter), desktop applications, APIs and microservices, database design and management, and legacy system modernization. Full lifecycle from requirements to deployment and maintenance.', 1200000, 'development'],

      ['Web Development', 'Responsive websites, e-commerce stores, blogs, portals, and web applications tailored to your brand.',
       'Establish your online presence with a professional website. We develop: business websites and landing pages, e-commerce stores (Shopify, WooCommerce, custom), blogs and content portals, school and church management systems, booking and reservation systems, and custom web portals. All sites are mobile-responsive and SEO-optimized.', 700000, 'development'],

      ['IT Support & Maintenance', '24/7 help desk, remote support, system monitoring, and proactive IT maintenance for businesses.',
       'Never worry about IT issues again. Our support package includes: 24/7 help desk (phone, email, remote), system monitoring and alerts, proactive maintenance and updates, troubleshooting and issue resolution, user training, and monthly health reports. Available for small offices, schools, NGOs, and enterprises.', 250000, 'support'],

      ['Data Backup & Recovery', 'Automated backups, disaster recovery planning, data restoration, and cloud backup solutions.',
       'Protect your valuable data from loss. We provide: automated local and cloud backups, disaster recovery planning, data restoration services, server and database backups, offsite backup storage, and ransomware recovery. Ensure business continuity with our comprehensive backup solutions.', 400000, 'support'],

      ['Consulting & Strategy', 'Technology roadmap, digital transformation, IT strategy, system audit, and technology advisory.',
       'Make informed technology decisions. Our consulting services include: IT strategy and roadmap development, digital transformation planning, technology stack recommendations, system audit and assessment, cybersecurity audit, cost optimization, and vendor selection. We help you align technology with your business goals.', 600000, 'consulting'],
    ];
    for (const s of svc) {
      run('INSERT INTO services (name, description, long_description, price, category) VALUES (?, ?, ?, ?, ?)',
        [s[0], s[1], s[2], s[3], s[4]]);
    }

    const socialSvc = get('SELECT id FROM services WHERE name = ?', ['Social Media Boosting']);
    if (socialSvc) {
      const sid = socialSvc.id;
      const opts = [
        ['Instagram Followers 1K', '1,000 Instagram followers', 10000],
        ['Instagram Followers 2K', '2,000 Instagram followers', 15000],
        ['Instagram Followers 5K', '5,000 Instagram followers', 30000],
        ['Instagram Followers 10K', '10,000 Instagram followers', 40000],
        ['Instagram Likes 1K', '1,000 Instagram likes', 2000],
        ['Instagram Comments 500', '500 Instagram comments', 5000],
        ['Facebook Followers 1K', '1,000 Facebook followers', 8000],
        ['Facebook Followers 2K', '2,000 Facebook followers', 12000],
        ['Facebook Followers 5K', '5,000 Facebook followers', 25000],
        ['Facebook Likes 1K', '1,000 Facebook likes', 1500],
        ['Twitter Followers 1K', '1,000 Twitter followers', 8000],
        ['Twitter Followers 2K', '2,000 Twitter followers', 12000],
        ['Twitter Likes 1K', '1,000 Twitter likes', 1500],
        ['Twitter Retweets 1K', '1,000 Twitter retweets', 5000],
        ['YouTube Subscribers 1K', '1,000 YouTube subscribers', 15000],
        ['YouTube Views 1K', '1,000 YouTube views', 3000],
        ['YouTube Likes 1K', '1,000 YouTube likes', 2000],
        ['LinkedIn Followers 1K', '1,000 LinkedIn followers', 10000],
        ['LinkedIn Followers 2K', '2,000 LinkedIn followers', 15000],
        ['LinkedIn Likes 500', '500 LinkedIn likes', 3000],
        ['TikTok Followers 1K', '1,000 TikTok followers', 10000],
        ['TikTok Likes 1K', '1,000 TikTok likes', 2000],
        ['TikTok Views 1K', '1,000 TikTok views', 2500],
      ];
      for (const o of opts) {
        run('INSERT INTO service_options (service_id, name, description, price) VALUES (?, ?, ?, ?)',
          [sid, o[0], o[1], o[2]]);
      }
    }

    const cctvSvc = get('SELECT id FROM services WHERE name = ?', ['CCTV Camera Installation']);
    if (cctvSvc) {
      const cid = cctvSvc.id;
      const cameras = [
        ['Dome Camera (Indoor)', 'Compact indoor camera with wide-angle lens, ideal for offices and shops', 0],
        ['Bullet Camera (Outdoor)', 'Weatherproof outdoor camera with long-range night vision', 0],
        ['PTZ Camera (Pan-Tilt-Zoom)', 'Motorized camera that can pan, tilt, and zoom remotely', 0],
        ['IP / WiFi Camera', 'Wireless camera connects to your WiFi, easy installation', 0],
        ['4MP Security Camera', 'High-resolution 4MP camera with crystal clear detail', 0],
        ['8MP (4K) Security Camera', 'Ultra HD 4K camera with maximum detail', 0],
        ['Night Vision Camera', 'Enhanced infrared night vision up to 50 meters', 0],
        ['Solar Powered Camera', 'Off-grid solar powered camera for remote areas', 0],
      ];
      for (const c of cameras) {
        run('INSERT INTO service_options (service_id, name, description, price) VALUES (?, ?, ?, ?)',
          [cid, c[0], c[1], c[2]]);
      }
    }
  }
}

module.exports = { initDB, getDB, query, get, all, run, exec, saveDB };
