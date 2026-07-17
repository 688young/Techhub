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
      profile_url TEXT DEFAULT '',
      post_link TEXT DEFAULT '',
      status VARCHAR(50) DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  try { await run('ALTER TABLE services ADD COLUMN IF NOT EXISTS has_options INTEGER DEFAULT 0'); } catch(e) {}
  try { await run('ALTER TABLE services ADD COLUMN IF NOT EXISTS long_description TEXT DEFAULT \'\''); } catch(e) {}
  try { await run('ALTER TABLE services ADD COLUMN IF NOT EXISTS needs_quote INTEGER DEFAULT 0'); } catch(e) {}
  try { await run('ALTER TABLE orders ADD COLUMN IF NOT EXISTS service_option TEXT DEFAULT \'\''); } catch(e) {}
  try { await run('ALTER TABLE orders ADD COLUMN IF NOT EXISTS confirmation_code VARCHAR(50) DEFAULT \'\''); } catch(e) {}
  try { await run('ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_confirmed INTEGER DEFAULT 0'); } catch(e) {}
  try { await run('ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_network VARCHAR(100) DEFAULT \'\''); } catch(e) {}
  try { await run('ALTER TABLE orders ADD COLUMN IF NOT EXISTS phone VARCHAR(100) DEFAULT \'\''); } catch(e) {}
  try { await run('ALTER TABLE orders ADD COLUMN IF NOT EXISTS transaction_id VARCHAR(255) DEFAULT \'\''); } catch(e) {}
  try { await run('ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_verified INTEGER DEFAULT 0'); } catch(e) {}
  try { await run('ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_proof_date TIMESTAMP'); } catch(e) {}
  try { await run('ALTER TABLE orders ADD COLUMN IF NOT EXISTS profile_url TEXT DEFAULT \'\''); } catch(e) {}
  try { await run('ALTER TABLE orders ADD COLUMN IF NOT EXISTS post_link TEXT DEFAULT \'\''); } catch(e) {}

  await run(`UPDATE services SET needs_quote = 1, description = 'Cloud hosting, VPS, domain registration, email hosting, backup solutions, and cloud migration.', long_description = 'Take your business to the cloud with TechHub! We offer reliable cloud hosting, VPS servers, domain registration, business email setup, Google Workspace, Microsoft 365, online data backup, and cloud migration. Affordable monthly packages with 24/7 support.' WHERE name = 'Cloud Solutions'`);
  await run(`UPDATE services SET description = 'Structured cabling, router/switch configuration, firewall setup, VPN, and WiFi deployment for homes and businesses.', long_description = 'We design and implement secure, high-performance network infrastructure tailored for homes and businesses. Our services include structured cabling, router and switch configuration, firewall setup, VPN deployment, and WiFi optimization. Get reliable, fast, and secure connectivity.' WHERE name = 'Network Setup & Security'`);
  await run(`UPDATE services SET description = 'Hardware repair, software installation, virus removal, system optimization, and upgrades.', long_description = 'We keep your computers and laptops running at peak performance. Services include hardware repair and upgrades, software installation, virus and malware removal, system optimization, SSD upgrades, and data backup. Fast, reliable, and affordable.' WHERE name = 'Computer Maintenance'`);
  await run(`UPDATE services SET description = 'Professional security camera installation with remote viewing on your phone.', long_description = 'Protect your property with professional CCTV solutions. We install and configure dome, bullet, PTZ, IP, and wireless cameras with remote viewing on your phone. 24/7 monitoring, motion detection, and cloud storage options available.' WHERE name = 'CCTV Camera Installation'`);
  await run(`UPDATE services SET description = 'Custom web, mobile app, and desktop software development for your business.', long_description = 'Transform your ideas into powerful software. We build custom web applications, mobile apps (Android & iOS), desktop software, APIs, and system integration. From startups to enterprises, we deliver scalable, high-quality solutions.' WHERE name = 'Software Development'`);
  await run(`UPDATE services SET description = 'Responsive websites, e-commerce stores, blogs, and web portals.', long_description = 'Establish your online presence with a professional website. We create responsive websites, e-commerce stores, blogs, custom web portals, and web applications using modern technologies. Fast loading, mobile-friendly, SEO optimized.' WHERE name = 'Web Development'`);
  await run(`UPDATE services SET description = '24/7 help desk, remote support, system monitoring, and IT maintenance.', long_description = 'Never worry about IT issues again. Our team provides 24/7 help desk support, remote assistance, system monitoring, proactive maintenance, and on-site support when needed. Keep your business running smoothly.' WHERE name = 'IT Support & Maintenance'`);
  await run(`UPDATE services SET description = 'Automated backups, data recovery, and disaster recovery planning.', long_description = 'Protect your valuable data from loss. We provide automated on-site and cloud backup solutions, data recovery services, and comprehensive disaster recovery planning for businesses of all sizes.' WHERE name = 'Data Backup & Recovery'`);
  await run(`UPDATE services SET description = 'Technology roadmap, digital transformation, IT strategy, and technology audits.', long_description = 'Make informed technology decisions with our consulting services. We help businesses plan their technology roadmap, implement digital transformation, conduct IT audits, and optimize their technology investments.' WHERE name = 'Consulting & Strategy'`);
  await run(`UPDATE services SET needs_quote = 0, has_options = 1, price = 0, description = 'Professional logo design, branding, posters, banners, wedding cards, business cards, flyers, and social media graphics.', long_description = 'Stand out with stunning visuals! Our expert designers create professional logos, brand identity packages, posters, banners, wedding cards, business cards, flyers, brochures, and social media graphics. Choose from our packages below or contact us for custom orders.' WHERE name = 'Graphics Design'`);
  await run(`UPDATE services SET needs_quote = 0, has_options = 1, price = 0, description = 'Professional social media content creation, posting, scheduling, and account growth.', long_description = 'Grow your online presence with our social media management services. We handle content creation, posting, scheduling, audience engagement, analytics, and ad management across all major platforms. Packages available for all budgets.' WHERE name = 'Social Media Management'`);
  await run(`UPDATE services SET needs_quote = 0, has_options = 1, price = 0 WHERE name = 'Social Media Boosting'`);

  const socialSvc = await get('SELECT id FROM services WHERE name = $1', ['Social Media Boosting']);
  if (socialSvc) {
    await run('UPDATE services SET has_options = 1 WHERE name = $1', ['Social Media Boosting']);
    const optCount = await get('SELECT COUNT(*) as c FROM service_options WHERE service_id = $1', [socialSvc.id]);
    if (parseInt(optCount.c) === 0) {
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
    }
  }

  const cctvSvc = await get('SELECT id FROM services WHERE name = $1', ['CCTV Camera Installation']);
  if (cctvSvc) {
    await run('UPDATE services SET has_options = 1 WHERE name = $1', ['CCTV Camera Installation']);
    const optCount = await get('SELECT COUNT(*) as c FROM service_options WHERE service_id = $1', [cctvSvc.id]);
    if (parseInt(optCount.c) === 0) {
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
    }
  }

  const cloudSvc = await get('SELECT id FROM services WHERE name = $1', ['Cloud Solutions']);
  if (cloudSvc) {
    await run('UPDATE services SET has_options = 1 WHERE name = $1', ['Cloud Solutions']);
    const optCount = await get('SELECT COUNT(*) as c FROM service_options WHERE service_id = $1', [cloudSvc.id]);
    if (parseInt(optCount.c) === 0) {
      for (const o of [
        ['Shared Hosting (Basic)', 'Single website, 10GB storage, 100GB bandwidth', 0],
        ['Business Hosting', '5 websites, 50GB storage, unlimited bandwidth, free SSL', 0],
        ['VPS Hosting (2GB RAM)', '2 vCPU, 2GB RAM, 40GB SSD, full root access', 0],
        ['VPS Hosting (4GB RAM)', '2 vCPU, 4GB RAM, 80GB SSD, full root access', 0],
        ['VPS Hosting (8GB RAM)', '4 vCPU, 8GB RAM, 160GB SSD, full root access', 0],
        ['Domain Registration (.com/.net/.org)', 'Register or transfer your domain name', 0],
        ['Business Email Setup', 'Professional email @yourdomain.com', 0],
        ['Cloud Migration Service', 'Migrate your website, apps, or data to the cloud', 0],
        ['Data Backup (Cloud)', 'Automated daily backup for your files/databases', 0],
        ['Dedicated Server', 'Full dedicated hardware, custom specs, 24/7 support', 0],
      ]) {
        await run('INSERT INTO service_options (service_id, name, description, price) VALUES ($1, $2, $3, $4)',
          [cloudSvc.id, o[0], o[1], o[2]]);
      }
    }
  }

  const gfxSvc = await get('SELECT id FROM services WHERE name = $1', ['Graphics Design']);
  if (gfxSvc) {
    await run('UPDATE services SET has_options = 1, price = 0 WHERE name = $1', ['Graphics Design']);
    const optCount = await get('SELECT COUNT(*) as c FROM service_options WHERE service_id = $1', [gfxSvc.id]);
    if (parseInt(optCount.c) === 0) {
      for (const o of [
        ['Logo Design', 'Professional custom logo for your brand — includes 3 concept options', 20000],
        ['Poster / Flyer Design', 'Eye-catching posters, flyers, and promotional materials (A4/A3)', 15000],
        ['Wedding Card Design', 'Elegant wedding invitation cards — fully customized (negotiable)', 0],
        ['Business Card Design', 'Professional business cards with your brand identity', 10000],
        ['Banner / Roll-up Design', 'Large format banner, roll-up, and outdoor signage design', 25000],
        ['Brochure / Catalog', 'Multi-page brochure, catalog, or booklet design', 30000],
        ['Social Media Graphics', 'Custom posts, stories, and cover images for social media', 8000],
        ['Brand Identity Package', 'Complete brand kit: logo, colors, fonts, business card, letterhead', 50000],
      ]) {
        await run('INSERT INTO service_options (service_id, name, description, price) VALUES ($1, $2, $3, $4)',
          [gfxSvc.id, o[0], o[1], o[2]]);
      }
    }
  }

  async function seedOptions(serviceName, opts) {
    const svc = await get('SELECT id FROM services WHERE name = $1', [serviceName]);
    if (!svc) return;
    const cnt = await get('SELECT COUNT(*) as c FROM service_options WHERE service_id = $1', [svc.id]);
    if (parseInt(cnt.c) === 0) {
      for (const o of opts) {
        await run('INSERT INTO service_options (service_id, name, description, price) VALUES ($1, $2, $3, $4)',
          [svc.id, o[0], o[1], o[2]]);
      }
      console.log('  Seeded options for', serviceName);
    }
  }

  await seedOptions('Network Setup & Security', [
    ['Home Network Setup', 'Complete home WiFi network setup with router configuration', 0],
    ['Office Network Setup', 'Full office network with switches, structured cabling, and WiFi', 0],
    ['WiFi Installation & Optimization', 'WiFi access point installation, mesh setup, signal optimization', 0],
    ['Firewall & Security Setup', 'Network firewall installation and security configuration', 0],
    ['VPN Configuration', 'Site-to-site or remote access VPN setup', 0],
    ['Structured Cabling', 'Professional Ethernet cabling for offices and buildings', 0],
  ]);
  await seedOptions('Computer Maintenance', [
    ['PC Tune-up & Optimization', 'Cleanup, speed up, and optimize your computer', 0],
    ['Virus & Malware Removal', 'Full system scan, virus removal, and protection setup', 0],
    ['Hardware Repair', 'Diagnostic and repair of computer hardware issues', 0],
    ['Software Installation', 'Windows/Mac installation, drivers, and essential software', 0],
    ['SSD Upgrade', 'Upgrade from HDD to SSD for faster performance', 0],
    ['Data Recovery', 'Recover lost or deleted files from damaged drives', 0],
  ]);
  await seedOptions('Software Development', [
    ['Web Application', 'Custom web application built with modern technologies', 0],
    ['Mobile App (Android)', 'Native Android app development', 0],
    ['Mobile App (iOS)', 'Native iOS app development', 0],
    ['Desktop Application', 'Windows/Mac desktop software development', 0],
    ['API Development', 'RESTful or GraphQL API development and integration', 0],
    ['System Integration', 'Connect and integrate your business systems', 0],
  ]);
  await seedOptions('Web Development', [
    ['Basic Website (5 pages)', 'Simple responsive website with up to 5 pages', 0],
    ['Business Website (10 pages)', 'Professional business website with up to 10 pages', 0],
    ['E-commerce Store', 'Online store with product management and payments', 0],
    ['Blog / Content Portal', 'Blog or content management website', 0],
    ['Custom Web Portal', 'Custom web portal with user accounts and features', 0],
    ['Website Redesign', 'Redesign and modernize your existing website', 0],
  ]);
  await seedOptions('IT Support & Maintenance', [
    ['Monthly Support (Basic)', 'Remote support, 5 hours/month, email & phone', 0],
    ['Monthly Support (Premium)', 'Remote + on-site support, 15 hours/month, priority response', 0],
    ['One-time Fix', 'Single issue diagnosis and resolution', 0],
    ['Remote Support Session', 'One remote support session (up to 2 hours)', 0],
    ['System Audit', 'Full IT systems audit and recommendations', 0],
  ]);
  await seedOptions('Data Backup & Recovery', [
    ['Automated Backup Setup', 'Configure automatic backups for your systems', 0],
    ['Cloud Backup Subscription', 'Monthly cloud backup service (per GB)', 0],
    ['Disaster Recovery Plan', 'Comprehensive disaster recovery planning and documentation', 0],
    ['Data Recovery Service', 'Professional data recovery from failed drives', 0],
  ]);
  await seedOptions('Consulting & Strategy', [
    ['Technology Audit', 'Full audit of your current technology stack and infrastructure', 0],
    ['IT Strategy Planning', 'Strategic IT planning aligned with your business goals', 0],
    ['Digital Transformation', 'Plan and implement your digital transformation journey', 0],
    ['Technology Roadmap', 'Create a 1-3 year technology roadmap for your business', 0],
    ['Cloud Strategy', 'Cloud adoption strategy and migration planning', 0],
  ]);
  await seedOptions('Social Media Management', [
    ['Basic Package (3 posts/week)', '3 posts per week on one platform + engagement', 150000],
    ['Standard Package (5 posts/week)', '5 posts per week on two platforms + engagement + stories', 250000],
    ['Premium Package (Daily posts)', 'Daily posts on all platforms + stories + ads + analytics', 400000],
    ['Account Setup & Optimization', 'Profile setup, bio optimization, and branding', 50000],
  ]);

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
      ['Graphics Design', 'Professional logo design, branding, posters, banners, wedding cards, business cards, flyers, and social media graphics — customized to your brand.',
       'Stand out with stunning visuals! Our expert designers create professional logos, brand identity packages, posters, banners, wedding cards, business cards, flyers, brochures, and social media graphics. Whether you need a new brand look or promotional materials, we deliver high-quality designs that make your business shine.', 0, 'design', 0],
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

    const gfxSvc = await get('SELECT id FROM services WHERE name = $1', ['Graphics Design']);
    if (gfxSvc) {
      for (const o of [
        ['Logo Design', 'Professional custom logo for your brand — includes 3 concept options', 20000],
        ['Poster / Flyer Design', 'Eye-catching posters, flyers, and promotional materials (A4/A3)', 15000],
        ['Wedding Card Design', 'Elegant wedding invitation cards — fully customized (negotiable)', 0],
        ['Business Card Design', 'Professional business cards with your brand identity', 10000],
        ['Banner / Roll-up Design', 'Large format banner, roll-up, and outdoor signage design', 25000],
        ['Brochure / Catalog', 'Multi-page brochure, catalog, or booklet design', 30000],
        ['Social Media Graphics', 'Custom posts, stories, and cover images for social media', 8000],
        ['Brand Identity Package', 'Complete brand kit: logo, colors, fonts, business card, letterhead', 50000],
      ]) {
        await run('INSERT INTO service_options (service_id, name, description, price) VALUES ($1, $2, $3, $4)',
          [gfxSvc.id, o[0], o[1], o[2]]);
      }
      await run('UPDATE services SET has_options = 1, price = 0 WHERE name = $1', ['Graphics Design']);
    }

    await seedOptions('Network Setup & Security', [
      ['Home Network Setup', 'Complete home WiFi network setup with router configuration', 0],
      ['Office Network Setup', 'Full office network with switches, structured cabling, and WiFi', 0],
      ['WiFi Installation & Optimization', 'WiFi access point installation, mesh setup, signal optimization', 0],
      ['Firewall & Security Setup', 'Network firewall installation and security configuration', 0],
      ['VPN Configuration', 'Site-to-site or remote access VPN setup', 0],
      ['Structured Cabling', 'Professional Ethernet cabling for offices and buildings', 0],
    ]);
    await seedOptions('Computer Maintenance', [
      ['PC Tune-up & Optimization', 'Cleanup, speed up, and optimize your computer', 0],
      ['Virus & Malware Removal', 'Full system scan, virus removal, and protection setup', 0],
      ['Hardware Repair', 'Diagnostic and repair of computer hardware issues', 0],
      ['Software Installation', 'Windows/Mac installation, drivers, and essential software', 0],
      ['SSD Upgrade', 'Upgrade from HDD to SSD for faster performance', 0],
      ['Data Recovery', 'Recover lost or deleted files from damaged drives', 0],
    ]);
    await seedOptions('Software Development', [
      ['Web Application', 'Custom web application built with modern technologies', 0],
      ['Mobile App (Android)', 'Native Android app development', 0],
      ['Mobile App (iOS)', 'Native iOS app development', 0],
      ['Desktop Application', 'Windows/Mac desktop software development', 0],
      ['API Development', 'RESTful or GraphQL API development and integration', 0],
      ['System Integration', 'Connect and integrate your business systems', 0],
    ]);
    await seedOptions('Web Development', [
      ['Basic Website (5 pages)', 'Simple responsive website with up to 5 pages', 0],
      ['Business Website (10 pages)', 'Professional business website with up to 10 pages', 0],
      ['E-commerce Store', 'Online store with product management and payments', 0],
      ['Blog / Content Portal', 'Blog or content management website', 0],
      ['Custom Web Portal', 'Custom web portal with user accounts and features', 0],
      ['Website Redesign', 'Redesign and modernize your existing website', 0],
    ]);
    await seedOptions('IT Support & Maintenance', [
      ['Monthly Support (Basic)', 'Remote support, 5 hours/month, email & phone', 0],
      ['Monthly Support (Premium)', 'Remote + on-site support, 15 hours/month, priority response', 0],
      ['One-time Fix', 'Single issue diagnosis and resolution', 0],
      ['Remote Support Session', 'One remote support session (up to 2 hours)', 0],
      ['System Audit', 'Full IT systems audit and recommendations', 0],
    ]);
    await seedOptions('Data Backup & Recovery', [
      ['Automated Backup Setup', 'Configure automatic backups for your systems', 0],
      ['Cloud Backup Subscription', 'Monthly cloud backup service (per GB)', 0],
      ['Disaster Recovery Plan', 'Comprehensive disaster recovery planning and documentation', 0],
      ['Data Recovery Service', 'Professional data recovery from failed drives', 0],
    ]);
    await seedOptions('Consulting & Strategy', [
      ['Technology Audit', 'Full audit of your current technology stack and infrastructure', 0],
      ['IT Strategy Planning', 'Strategic IT planning aligned with your business goals', 0],
      ['Digital Transformation', 'Plan and implement your digital transformation journey', 0],
      ['Technology Roadmap', 'Create a 1-3 year technology roadmap for your business', 0],
      ['Cloud Strategy', 'Cloud adoption strategy and migration planning', 0],
    ]);
    await seedOptions('Social Media Management', [
      ['Basic Package (3 posts/week)', '3 posts per week on one platform + engagement', 150000],
      ['Standard Package (5 posts/week)', '5 posts per week on two platforms + engagement + stories', 250000],
      ['Premium Package (Daily posts)', 'Daily posts on all platforms + stories + ads + analytics', 400000],
      ['Account Setup & Optimization', 'Profile setup, bio optimization, and branding', 50000],
    ]);
    await run('UPDATE services SET has_options = 1 WHERE name IN (\'Social Media Management\', \'Network Setup & Security\', \'Computer Maintenance\', \'Software Development\', \'Web Development\', \'IT Support & Maintenance\', \'Data Backup & Recovery\', \'Consulting & Strategy\')');
  }

  console.log('Database initialized');
}

module.exports = { initDB, pool, query, get, all, run };