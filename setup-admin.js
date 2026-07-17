// Run on local first, database will be empty on Render
const bcrypt = require('bcryptjs');
const db = require('./database/db');

async function setup() {
  const { initDB, get, run } = await db;
  await initDB();

  const existing = get('SELECT id FROM users WHERE email = ?', ['admin@techhub.com']);
  if (!existing) {
    const hash = bcrypt.hashSync('admin123', 10);
    run('INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)',
      ['Admin', 'admin@techhub.com', hash, 'admin']);
    console.log('Admin created: admin@techhub.com / admin123');
  } else {
    console.log('Admin already exists');
  }

  // Create some sample services
  const svc = get('SELECT id FROM services LIMIT 1');
  if (!svc) {
    const services = [
      { name: 'Web Design', cat: 'design', desc: 'Professional website design', price: 150000 },
      { name: 'Network Installation', cat: 'networking', desc: 'Complete network setup & configuration', price: 200000 },
      { name: 'CCTV Installation', cat: 'security', desc: 'CCTV camera installation & setup', price: 250000, opts: true },
    ];
    for (const s of services) {
      run('INSERT INTO services (name, category, description, price, has_options) VALUES (?, ?, ?, ?, ?)',
        [s.name, s.cat, s.desc, s.price, s.opts ? 1 : 0]);
      if (s.opts) {
        const id = get('SELECT id FROM services ORDER BY id DESC LIMIT 1').id;
        run('INSERT INTO service_options (service_id, name, description, price) VALUES (?, ?, ?, ?)',
          [id, 'Basic Package', '4 cameras + DVR', 250000]);
        run('INSERT INTO service_options (service_id, name, description, price) VALUES (?, ?, ?, ?)',
          [id, 'Premium Package', '8 cameras + NVR', 450000]);
      }
    }
    console.log('Sample services created');
  }
}

setup().catch(console.error);