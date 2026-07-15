const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000
});

async function query(sql, params = []) {
  const result = await pool.query(sql, params);
  return result;
}

async function get(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows.length > 0 ? result.rows[0] : null;
}

async function all(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

async function run(sql, params = []) {
  const result = await pool.query(sql, params);
  return result;
}

async function initDB() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(255) UNIQUE NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(50) DEFAULT 'user',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL,
      subject VARCHAR(255) DEFAULT '',
      message TEXT NOT NULL,
      is_read INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS services (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) UNIQUE NOT NULL,
      description TEXT,
      long_description TEXT DEFAULT '',
      price REAL NOT NULL DEFAULT 0,
      category VARCHAR(255) DEFAULT 'general',
      is_active INTEGER DEFAULT 1,
      has_options INTEGER DEFAULT 0,
      needs_quote INTEGER DEFAULT 0
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS service_options (
      id SERIAL PRIMARY KEY,
      service_id INTEGER NOT NULL REFERENCES services(id),
      name VARCHAR(255) NOT NULL,
      description TEXT DEFAULT '',
      price REAL NOT NULL,
      is_active INTEGER DEFAULT 1
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS reset_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      token VARCHAR(255) NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      used INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      customer_name VARCHAR(255) NOT NULL,
      customer_email VARCHAR(255) NOT NULL,
      service VARCHAR(255) NOT NULL,
      service_option TEXT DEFAULT '',
      price REAL NOT NULL,
      phone VARCHAR(100) DEFAULT '',
      payment_network VARCHAR(100) DEFAULT '',
      confirmation_code VARCHAR(50) DEFAULT '',
      is_confirmed INTEGER DEFAULT 0,
      transaction_id VARCHAR(255) DEFAULT '',
      payment_verified INTEGER DEFAULT 0,
      payment_proof_date TIMESTAMP,
      status VARCHAR(50) DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const adminExists = await get('SELECT id FROM users WHERE role = $1', ['admin']);
  if (!adminExists) {
    const hash = bcrypt.hashSync('admin123', 10);
    await run('INSERT INTO users (username, email, password, role) VALUES ($1, $2, $3, $4)',
      ['Admin', 'admin@techhub.com', hash, 'admin']);
    console.log('Admin created');
  }

  const count = await get('SELECT COUNT(*) as c FROM services');
  if (parseInt(count.c) === 0) {
    for (const s of [
      ['Network Setup & Security', 'Structured cabling, router/switch configuration, firewall setup, VPN, and WiFi deployment.',
       'We design and implement secure, high-performance network infrastructure tailored for homes and businesses. Services include structured cabling, router and switch configuration, firewall setup, VPN deployment, and WiFi optimization.', 0, 'networking', 1],
      ['Computer Maintenance', 'Hardware repair, software installation, virus removal, system optimization.',
       'We keep your computers running at peak performance with professional hardware repair, software installation, virus and malware removal, and system optimization services.', 0, 'maintenance', 1],
      ['CCTV Camera Installation', 'Professional security camera installation with remote viewing.',
       'Protect your property with professional CCTV solutions. We install and configure dome, bullet, PTZ, IP, and wireless cameras with remote viewing on your phone.', 0, 'security', 1],
      ['Graphics Design', 'Professional logo design, branding, flyers, banners, business cards.',
       'Stand out with stunning visuals! Our designers create professional logos, branding materials, flyers, banners, business cards, and social media graphics.', 200000, 'design', 0],
      ['Social Media Management', 'Content creation, posting, scheduling, account growth.',
       'Grow your online presence with professional social media management including content creation, posting, scheduling, and audience engagement.', 300000, 'marketing', 0],
      ['Social Media Boosting', 'Increase followers, likes, comments, and views on social media.',
       'Get real engagement on your social media accounts. We boost followers, likes, comments, and views across all major platforms.', 10000, 'marketing', 0],
      ['Cloud Solutions', 'Cloud hosting, VPS, domain registration, email hosting, backup solutions, and cloud migration.',
       'Take your business to the cloud with TechHub! We offer reliable cloud hosting, VPS servers, domain registration, business email setup, Google Workspace, Microsoft 365, online data backup, and cloud migration. Affordable monthly packages with 24/7 support.', 0, 'cloud', 1],
      ['Software Development', 'Custom web, mobile, and desktop applications.',
       'Transform your ideas into powerful software. We build custom web applications, mobile apps (Android/iOS), and desktop software tailored to your business needs.', 0, 'development', 1],
      ['Web Development', 'Responsive websites, e-commerce stores, blogs, portals.',
       'Establish your online presence with a professional website. We create responsive websites, e-commerce stores, blogs, and web portals using modern technologies.', 0, 'development', 1],
      ['IT Support & Maintenance', '24/7 help desk, remote support, system monitoring.',
       'Never worry about IT issues again. Our team provides 24/7 help desk support, remote assistance, system monitoring, and proactive maintenance.', 0, 'support', 1],
      ['Data Backup & Recovery', 'Automated backups, disaster recovery planning.',
       'Protect your valuable data from loss with automated backup solutions and comprehensive disaster recovery planning for your business.', 0, 'support', 1],
      ['Consulting & Strategy', 'Technology roadmap, digital transformation, IT strategy.',
       'Make informed technology decisions with our consulting services including technology roadmap planning, digital transformation strategy, and IT audits.', 0, 'consulting', 1],
    ]) {
      await run('INSERT INTO services (name, description, long_description, price, category, needs_quote) VALUES ($1, $2, $3, $4, $5, $6)',
        [s[0], s[1], s[2], s[3], s[4], s[5]]);
    }

    const socialSvc = await get('SELECT id FROM services WHERE name = $1', ['Social Media Boosting']);
    if (socialSvc) {
      for (const o of [
        ['Instagram Followers 1K', '1,000 Instagram followers', 10000],
        ['Instagram Followers 2K', '2,000 Instagram followers', 15000],
        ['Instagram Likes 1K', '1,000 Instagram likes', 2000],
        ['Facebook Followers 1K', '1,000 Facebook followers', 8000],
        ['Twitter Followers 1K', '1,000 Twitter followers', 8000],
        ['YouTube Subscribers 1K', '1,000 YouTube subscribers', 15000],
        ['TikTok Followers 1K', '1,000 TikTok followers', 10000],
      ]) {
        await run('INSERT INTO service_options (service_id, name, description, price) VALUES ($1, $2, $3, $4)',
          [socialSvc.id, o[0], o[1], o[2]]);
      }
      await run('UPDATE services SET has_options = 1 WHERE name = $1', ['Social Media Boosting']);
    }

    const cctvSvc = await get('SELECT id FROM services WHERE name = $1', ['CCTV Camera Installation']);
    if (cctvSvc) {
      for (const c of [
        ['Dome Camera (Indoor)', 'Compact indoor camera', 0],
        ['Bullet Camera (Outdoor)', 'Weatherproof outdoor camera', 0],
        ['PTZ Camera (Pan-Tilt-Zoom)', 'Motorized remote-controlled camera', 0],
        ['IP / WiFi Camera', 'Wireless WiFi camera', 0],
        ['4MP Security Camera', 'High-resolution 4MP', 0],
        ['8MP (4K) Security Camera', 'Ultra HD 4K', 0],
        ['Night Vision Camera', 'Enhanced IR night vision', 0],
        ['Solar Powered Camera', 'Off-grid solar powered', 0],
      ]) {
        await run('INSERT INTO service_options (service_id, name, description, price) VALUES ($1, $2, $3, $4)',
          [cctvSvc.id, c[0], c[1], c[2]]);
      }
      await run('UPDATE services SET has_options = 1 WHERE name = $1', ['CCTV Camera Installation']);
    }

    const cloudSvc = await get('SELECT id FROM services WHERE name = $1', ['Cloud Solutions']);
    if (cloudSvc) {
      for (const o of [
        ['Shared Hosting (Basic)', 'Single website, 10GB storage, 100GB bandwidth — ideal for small sites', 0],
        ['Business Hosting', '5 websites, 50GB storage, unlimited bandwidth, free SSL', 0],
        ['VPS Hosting (2GB RAM)', '2 vCPU, 2GB RAM, 40GB SSD, full root access', 0],
        ['VPS Hosting (4GB RAM)', '2 vCPU, 4GB RAM, 80GB SSD, full root access', 0],
        ['VPS Hosting (8GB RAM)', '4 vCPU, 8GB RAM, 160GB SSD, full root access', 0],
        ['Domain Registration (.com/.net/.org)', 'Register or transfer your domain name', 0],
        ['Business Email Setup', 'Professional email @yourdomain.com (Google/MS)', 0],
        ['Cloud Migration Service', 'Migrate your website, apps, or data to the cloud', 0],
        ['Data Backup (Cloud)', 'Automated daily backup for your files/databases', 0],
        ['Dedicated Server', 'Full dedicated hardware, custom specs, 24/7 support', 0],
      ]) {
        await run('INSERT INTO service_options (service_id, name, description, price) VALUES ($1, $2, $3, $4)',
          [cloudSvc.id, o[0], o[1], o[2]]);
      }
      await run('UPDATE services SET has_options = 1 WHERE name = $1', ['Cloud Solutions']);
    }
  }

  console.log('Database initialized');
}

module.exports = { initDB, pool, query, get, all, run };