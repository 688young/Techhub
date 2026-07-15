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
      name TEXT NOT NULL, email TEXT NOT NULL,
      subject TEXT DEFAULT '', message TEXT NOT NULL,
      is_read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL, description TEXT,
      long_description TEXT DEFAULT '',
      price REAL NOT NULL DEFAULT 0,
      category TEXT DEFAULT 'general',
      is_active INTEGER DEFAULT 1,
      has_options INTEGER DEFAULT 0,
      needs_quote INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS service_options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      service_id INTEGER NOT NULL, name TEXT NOT NULL,
      description TEXT DEFAULT '', price REAL NOT NULL,
      is_active INTEGER DEFAULT 1,
      FOREIGN KEY (service_id) REFERENCES services(id)
    );
    CREATE TABLE IF NOT EXISTS reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL, token TEXT NOT NULL,
      expires_at DATETIME NOT NULL, used INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER, customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL, service TEXT NOT NULL,
      service_option TEXT DEFAULT '', price REAL NOT NULL,
      phone TEXT DEFAULT '', payment_network TEXT DEFAULT '',
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
  try { exec('ALTER TABLE services ADD COLUMN needs_quote INTEGER DEFAULT 0'); } catch(e) {}
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
      ['Admin', 'admin@techhub.com', hash, 'admin']);
    console.log('Admin created');
  }

  const count = get('SELECT COUNT(*) as c FROM services');
  if (count.c === 0) {
    const svc = [
      ['Network Setup & Security', 'Structured cabling, router/switch configuration, firewall setup, VPN, and WiFi deployment.',
       'We design and implement secure, high-performance network infrastructure...', 0, 'networking', 1],
      ['Computer Maintenance', 'Hardware repair, software installation, virus removal, system optimization.',
       'Keep your computers running at peak performance...', 0, 'maintenance', 1],
      ['CCTV Camera Installation', 'Professional security camera installation with remote viewing.',
       'Protect your property with professional CCTV solutions...', 0, 'security', 1],
      ['Graphics Design', 'Professional logo design, branding, flyers, banners, business cards.',
       'Stand out with stunning visuals...', 200000, 'design', 0],
      ['Social Media Management', 'Content creation, posting, scheduling, account growth.',
       'Grow your online presence with professional social media management...', 300000, 'marketing', 0],
      ['Social Media Boosting', 'Increase followers, likes, comments, and views on social media.',
       'Get real engagement on your social media accounts...', 10000, 'marketing', 0],
      ['Cloud Solutions', 'Cloud migration, hosting, virtual machines, storage.',
       'Move your business to the cloud with confidence...', 0, 'cloud', 1],
      ['Software Development', 'Custom web, mobile, and desktop applications.',
       'Transform your ideas into powerful software...', 0, 'development', 1],
      ['Web Development', 'Responsive websites, e-commerce stores, blogs, portals.',
       'Establish your online presence with a professional website...', 0, 'development', 1],
      ['IT Support & Maintenance', '24/7 help desk, remote support, system monitoring.',
       'Never worry about IT issues again...', 0, 'support', 1],
      ['Data Backup & Recovery', 'Automated backups, disaster recovery planning.',
       'Protect your valuable data from loss...', 0, 'support', 1],
      ['Consulting & Strategy', 'Technology roadmap, digital transformation, IT strategy.',
       'Make informed technology decisions...', 0, 'consulting', 1],
    ];
    for (const s of svc) {
      run('INSERT INTO services (name, description, long_description, price, category, needs_quote) VALUES (?, ?, ?, ?, ?, ?)',
        [s[0], s[1], s[2], s[3], s[4], s[5]]);
    }

    const socialSvc = get('SELECT id FROM services WHERE name = ?', ['Social Media Boosting']);
    if (socialSvc) {
      const opts = [
        ['Instagram Followers 1K', '1,000 Instagram followers', 10000],
        ['Instagram Followers 2K', '2,000 Instagram followers', 15000],
        ['Instagram Likes 1K', '1,000 Instagram likes', 2000],
        ['Facebook Followers 1K', '1,000 Facebook followers', 8000],
        ['Twitter Followers 1K', '1,000 Twitter followers', 8000],
        ['YouTube Subscribers 1K', '1,000 YouTube subscribers', 15000],
        ['TikTok Followers 1K', '1,000 TikTok followers', 10000],
      ];
      for (const o of opts) {
        run('INSERT INTO service_options (service_id, name, description, price) VALUES (?, ?, ?, ?)',
          [socialSvc.id, o[0], o[1], o[2]]);
      }
    }

    const cctvSvc = get('SELECT id FROM services WHERE name = ?', ['CCTV Camera Installation']);
    if (cctvSvc) {
      const cameras = [
        ['Dome Camera (Indoor)', 'Compact indoor camera', 0],
        ['Bullet Camera (Outdoor)', 'Weatherproof outdoor camera', 0],
        ['PTZ Camera (Pan-Tilt-Zoom)', 'Motorized remote-controlled camera', 0],
        ['IP / WiFi Camera', 'Wireless WiFi camera', 0],
        ['4MP Security Camera', 'High-resolution 4MP', 0],
        ['8MP (4K) Security Camera', 'Ultra HD 4K', 0],
        ['Night Vision Camera', 'Enhanced IR night vision', 0],
        ['Solar Powered Camera', 'Off-grid solar powered', 0],
      ];
      for (const c of cameras) {
        run('INSERT INTO service_options (service_id, name, description, price) VALUES (?, ?, ?, ?)',
          [cctvSvc.id, c[0], c[1], c[2]]);
      }
    }
    run('UPDATE services SET has_options = 1 WHERE name = ?', ['Social Media Boosting']);
    run('UPDATE services SET has_options = 1 WHERE name = ?', ['CCTV Camera Installation']);
  }
}

module.exports = { initDB, getDB, query, get, all, run, exec, saveDB };