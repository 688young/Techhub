const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/techhub',
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

async function get(sql, params = []) {
  const res = await pool.query(sql, params);
  return res.rows.length > 0 ? res.rows[0] : null;
}

async function all(sql, params = []) {
  const res = await pool.query(sql, params);
  return res.rows;
}

async function run(sql, params = []) {
  const res = await pool.query(sql, params);
  return res;
}

async function tableExists(name) {
  const res = await pool.query(
    "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = $1) as e", [name]
  );
  return res.rows[0].e;
}

async function initDB() {
  if (!(await tableExists('users'))) {
    await run(`
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role VARCHAR(50) DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  if (!(await tableExists('messages'))) {
    await run(`
      CREATE TABLE messages (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        subject TEXT DEFAULT '',
        message TEXT NOT NULL,
        is_read INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  if (!(await tableExists('services'))) {
    await run(`
      CREATE TABLE services (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        description TEXT,
        long_description TEXT DEFAULT '',
        price REAL NOT NULL DEFAULT 0,
        category TEXT DEFAULT 'general',
      is_active INTEGER DEFAULT 1,
      has_options INTEGER DEFAULT 0,
      needs_quote INTEGER DEFAULT 0
      )
    `);
  }

  if (!(await tableExists('service_options'))) {
    await run(`
      CREATE TABLE service_options (
        id SERIAL PRIMARY KEY,
        service_id INTEGER NOT NULL REFERENCES services(id),
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        price REAL NOT NULL,
        is_active INTEGER DEFAULT 1
      )
    `);
  }

  if (!(await tableExists('reset_tokens'))) {
    await run(`
      CREATE TABLE reset_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        token TEXT NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  if (!(await tableExists('orders'))) {
    await run(`
      CREATE TABLE orders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
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
        payment_proof_date TIMESTAMP,
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  const adminExists = await get('SELECT id FROM users WHERE role = $1', ['admin']);
  if (!adminExists) {
    const hash = bcrypt.hashSync('admin123', 10);
    await run('INSERT INTO users (username, email, password, role) VALUES ($1, $2, $3, $4)',
      ['Admin', 'admin@techhub.com', hash, 'admin']);
    console.log('Admin created: admin@techhub.com / admin123');
  }

  const count = await get('SELECT COUNT(*) as c FROM services');
  if (parseInt(count.c) === 0) {
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
      await run('INSERT INTO services (name, description, long_description, price, category, needs_quote) VALUES ($1, $2, $3, $4, $5, $6)',
        [s[0], s[1], s[2], s[3], s[4], s[5]]);
    }

    const socialSvc = await get('SELECT id FROM services WHERE name = $1', ['Social Media Boosting']);
    if (socialSvc) {
      const opts = [
        ['Instagram Followers 1K', '1,000 Instagram followers', 10000],
        ['Instagram Followers 2K', '2,000 Instagram followers', 15000],
        ['Instagram Followers 5K', '5,000 Instagram followers', 30000],
        ['Instagram Followers 10K', '10,000 Instagram followers', 40000],
        ['Instagram Likes 1K', '1,000 Instagram likes', 2000],
        ['Instagram Comments 500', '500 Instagram comments', 5000],
        ['Facebook Followers 1K', '1,000 Facebook followers', 8000],
        ['Facebook Followers 2K', '2,000 Facebook followers', 12000],
        ['Twitter Followers 1K', '1,000 Twitter followers', 8000],
        ['YouTube Subscribers 1K', '1,000 YouTube subscribers', 15000],
        ['YouTube Views 1K', '1,000 YouTube views', 3000],
        ['TikTok Followers 1K', '1,000 TikTok followers', 10000],
      ];
      for (const o of opts) {
        await run('INSERT INTO service_options (service_id, name, description, price) VALUES ($1, $2, $3, $4)',
          [socialSvc.id, o[0], o[1], o[2]]);
      }
    }

    const cctvSvc = await get('SELECT id FROM services WHERE name = $1', ['CCTV Camera Installation']);
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
        await run('INSERT INTO service_options (service_id, name, description, price) VALUES ($1, $2, $3, $4)',
          [cctvSvc.id, c[0], c[1], c[2]]);
      }
    }
    console.log('Sample services created');
  }
}

module.exports = { initDB, get, all, run };