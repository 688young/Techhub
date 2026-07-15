const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { sendSMS } = require('./utils/sms');

const app = express();
const PORT = 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
  secret: process.env.SESSION_SECRET || 'techhub-secret-key-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: 'sosthenes688@gmail.com',
    pass: (process.env.EMAIL_PASS || '').replace(/\s+/g, '') || 'your-app-password-here'
  },
  connectionTimeout: 15000
});

function sendEmail(to, subject, html) {
  return transporter.sendMail({
    from: '"TechHub Company" <sosthenes688@gmail.com>',
    to, subject, html
  }).then(r => console.log('[EMAIL] Sent to', to, ':', r.messageId))
    .catch(e => console.error('[EMAIL] Failed to', to, ':', e.message, '-', e.code || ''));
}

function formatTZS(n) {
  return 'TZS ' + Number(n).toLocaleString();
}

function isAuth(req, res, next) {
  if (req.session.user) return next();
  res.redirect('/login');
}

function isAdmin(req, res, next) {
  if (req.session.user && req.session.user.role === 'admin') return next();
  res.status(403).send('Access denied. Admins only.');
}

async function start() {
  const { initDB, get, all, run } = await require('./database/db');
  await initDB();

  const adminExists = get('SELECT id FROM users WHERE role = ?', ['admin']);
  if (!adminExists) {
    const hash = bcrypt.hashSync('admin123', 10);
    run('INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)',
      ['Admin', 'admin@techhub.com', hash, 'admin']);
    console.log('Admin created: admin@techhub.com / admin123');
  }

  const svc = get('SELECT id FROM services LIMIT 1');
  if (!svc) {
    const sampleServices = [
      { name: 'Web Design', cat: 'design', desc: 'Professional website design', price: 150000 },
      { name: 'Network Installation', cat: 'networking', desc: 'Complete network setup & configuration', price: 200000 },
      { name: 'CCTV Installation', cat: 'security', desc: 'CCTV camera installation & setup', price: 250000, opts: true },
    ];
    for (const s of sampleServices) {
      run('INSERT INTO services (name, category, description, price, has_options) VALUES (?, ?, ?, ?, ?)',
        [s.name, s.cat, s.desc, s.price, s.opts ? 1 : 0]);
      if (s.opts) {
        const sid = get('SELECT id FROM services ORDER BY id DESC LIMIT 1').id;
        run('INSERT INTO service_options (service_id, name, description, price) VALUES (?, ?, ?, ?)',
          [sid, 'Basic Package', '4 cameras + DVR', 250000]);
        run('INSERT INTO service_options (service_id, name, description, price) VALUES (?, ?, ?, ?)',
          [sid, 'Premium Package', '8 cameras + NVR', 450000]);
      }
    }
    console.log('Sample services created');
  }

  app.get('/', (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    res.redirect('/dashboard');
  });

  app.get('/login', (req, res) => {
    if (req.session.user) return res.redirect('/dashboard');
    res.render('login', { error: null, goodbye: req.query.goodbye === '1' ? true : false });
  });

  app.post('/login', (req, res) => {
    const { email, password } = req.body;
    const user = get('SELECT * FROM users WHERE email = ?', [email]);
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.render('login', { error: 'Invalid email or password' });
    }
    req.session.user = { id: user.id, username: user.username, email: user.email, role: user.role };
    res.redirect((user.role === 'admin' ? '/admin' : '/dashboard') + '?welcome=1');
  });

  app.get('/signup', (req, res) => {
    if (req.session.user) return res.redirect('/dashboard');
    res.render('signup', { error: null });
  });

  app.post('/signup', (req, res) => {
    const { username, email, password } = req.body;
    const existing = get('SELECT id FROM users WHERE email = ? OR username = ?', [email, username]);
    if (existing) {
      return res.render('signup', { error: 'Username or email already exists' });
    }
    const hash = bcrypt.hashSync(password, 10);
    run('INSERT INTO users (username, email, password) VALUES (?, ?, ?)', [username, email, hash]);
    res.redirect('/login');
  });

  app.get('/logout', (req, res) => {
    var uname = req.session.user ? req.session.user.username : 'User';
    req.session.destroy(function() {
      res.render('goodbye', { username: uname });
    });
  });

  app.get('/forgot-password', (req, res) => {
    res.render('forgot-password', { error: null, success: null, token: null });
  });

  app.post('/forgot-password', (req, res) => {
    const { email } = req.body;
    const user = get('SELECT id FROM users WHERE email = ?', [email]);
    if (!user) {
      return res.render('forgot-password', { error: 'Email not found', success: null, token: null });
    }
    const token = crypto.randomBytes(20).toString('hex');
    const expires = new Date(Date.now() + 3600000).toISOString();
    run('INSERT INTO reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)', [user.id, token, expires]);
    const siteUrl = process.env.SITE_URL || 'http://localhost:3000';
    sendEmail(email, 'Password Reset - TechHub Company',
      `<h2>Password Reset</h2><p>Click <a href="${siteUrl}/reset-password/${token}">here</a> to reset your password.</p><p>Token: <strong>${token}</strong></p><p>Expires in 1 hour.</p>`);
    res.render('forgot-password', {
      error: null,
      success: 'If that email exists, a reset link has been sent.',
      token: token
    });
  });

  app.get('/reset-password/:token', (req, res) => {
    const t = req.params.token;
    const row = get('SELECT * FROM reset_tokens WHERE token = ? AND used = 0 AND expires_at > datetime("now")', [t]);
    if (!row) return res.send('Invalid or expired reset token.');
    res.render('reset-password', { token: t, error: null, success: null });
  });

  app.post('/reset-password', (req, res) => {
    const { token, password } = req.body;
    const row = get('SELECT * FROM reset_tokens WHERE token = ? AND used = 0 AND expires_at > datetime("now")', [token]);
    if (!row) return res.render('reset-password', { token, error: 'Invalid or expired token.', success: null });
    const hash = bcrypt.hashSync(password, 10);
    run('UPDATE users SET password = ? WHERE id = ?', [hash, row.user_id]);
    run('UPDATE reset_tokens SET used = 1 WHERE id = ?', [row.id]);
    res.render('reset-password', { token: null, error: null, success: 'Password reset successful! <a href="/login">Login now</a>' });
  });

  app.get('/services', isAuth, (req, res) => {
    const services = all('SELECT * FROM services WHERE is_active = 1 ORDER BY category, name');
    const allOpts = all('SELECT * FROM service_options');
    const optsBySvc = {};
    for (const o of allOpts) {
      if (!optsBySvc[o.service_id]) optsBySvc[o.service_id] = [];
      optsBySvc[o.service_id].push(o);
    }
    res.render('services', { user: req.session.user, services, optsBySvc, formatTZS });
  });

  app.get('/order/:serviceId', isAuth, (req, res) => {
    const service = get('SELECT * FROM services WHERE id = ? AND is_active = 1', [req.params.serviceId]);
    if (!service) return res.redirect('/services');
    const options = service.has_options ? all('SELECT * FROM service_options WHERE service_id = ?', [service.id]) : [];
    const queryOpt = req.query.opt || null;
    res.render('order', { user: req.session.user, service, options, queryOpt, error: null, formatTZS });
  });

  app.post('/order', isAuth, (req, res) => {
    const { service_id, service_option_id, phone, payment_network } = req.body;
    const service = get('SELECT * FROM services WHERE id = ? AND is_active = 1', [service_id]);
    if (!service) return res.redirect('/services');

    let finalPrice = service.price;
    let optionName = '';
    if (service.has_options && service_option_id) {
      const opt = get('SELECT * FROM service_options WHERE id = ? AND service_id = ?', [service_option_id, service_id]);
      if (opt) { finalPrice = opt.price; optionName = opt.name; }
    }

    const user = req.session.user;
    const code = crypto.randomInt(100000, 999999).toString();

    run('INSERT INTO orders (user_id, customer_name, customer_email, service, service_option, price, phone, payment_network, confirmation_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [user.id, user.username, user.email, service.name, optionName, finalPrice, phone, payment_network, code]);

    const order = get('SELECT id FROM orders WHERE user_id = ? AND confirmation_code = ? ORDER BY id DESC LIMIT 1', [user.id, code]);

    sendEmail(user.email, `Order Confirmation Code - ${formatTZS(finalPrice)}`,
      `<h2>Order Confirmation</h2><p>Hi <strong>${user.username}</strong>,</p><p>You placed an order for <strong>${service.name}${optionName ? ' - ' + optionName : ''}</strong>.</p><p><strong>Total:</strong> ${formatTZS(finalPrice)}</p><p><strong>Payment Network:</strong> ${payment_network} | <strong>Phone:</strong> ${phone}</p><hr><p style="font-size:18px">Your confirmation code is:</p><h1 style="background:#00d4ff;color:#1a1a2e;padding:15px;text-align:center;border-radius:8px;letter-spacing:5px;font-size:32px">${code}</h1><p>Enter this code on the website to confirm your order.</p><hr><p><strong>Make Payment To:</strong></p><p><strong>MIX by YAS:</strong> 45490505 (ERNEST AMOS MAKARANGA)</p><p><strong>Equity Bank:</strong> 3015111947559 (ERNEST MAKARANGA)</p><hr><p>After payment, confirm with the code above. Admin will approve once payment is verified.</p><p>Thank you!<br><strong>TechHub Company</strong><br>Developed by Ernest Sosthenes</p>`);

    transporter.sendMail({
      from: '"TechHub" <sosthenes688@gmail.com>',
      to: 'sosthenes688@gmail.com',
      subject: `New Order: ${service.name} from ${user.username}`,
      text: `Customer: ${user.username} (${user.email})\nService: ${service.name}${optionName ? ' - ' + optionName : ''}\nPrice: ${formatTZS(finalPrice)}\nPhone: ${phone}\nPayment: ${payment_network}\nConfirmation Code: ${code}`
    }).catch(err => console.error('[EMAIL] Admin notify:', err.message));

    sendSMS(phone, `TechHub: Order received for ${service.name}${optionName ? ' - '+optionName : ''}. Amount: ${formatTZS(finalPrice)}. Use code: ${code} to confirm. Pay via MIX(YAS) 45490505 or Equity 3015111947559. After payment, enter Transaction ID on the website.`);

    const paymentInfo = {
      mobile: { number: '45490505', name: 'ERNEST AMOS MAKARANGA' },
      bank: { account: '3015111947559', name: 'ERNEST MAKARANGA', bankName: 'Equity Bank' }
    };
    res.render('order-confirm', {
      user: req.session.user, service, optionName, phone, payment_network,
      finalPrice, code, order_id: order ? order.id : null, emailSent: user.email,
      paymentInfo, formatTZS
    });
  });

  app.post('/order/confirm', isAuth, (req, res) => {
    const { order_id, code } = req.body;
    const order = get('SELECT * FROM orders WHERE id = ? AND user_id = ?', [order_id, req.session.user.id]);
    if (!order) return res.status(404).send('Order not found');
    if (order.confirmation_code === code) {
      run('UPDATE orders SET is_confirmed = 1, status = ? WHERE id = ?', ['pending', order_id]);
      res.redirect('/dashboard?msg=Order confirmed! Wait for admin approval.');
    } else {
      res.redirect('/dashboard?msg=Invalid confirmation code. Check your email.&error=1');
    }
  });

  // ── Payment Proof ──
  app.post('/order/proof', isAuth, (req, res) => {
    const { order_id, transaction_id } = req.body;
    const order = get('SELECT * FROM orders WHERE id = ? AND user_id = ?', [order_id, req.session.user.id]);
    if (!order) return res.status(404).send('Order not found');
    run('UPDATE orders SET transaction_id = ?, payment_proof_date = datetime("now"), payment_verified = 0 WHERE id = ?',
      [transaction_id, order_id]);
    res.redirect('/dashboard?msg=Payment proof submitted! Admin will verify it.');
  });

  app.get('/dashboard', isAuth, (req, res) => {
    const uid = req.session.user.id;
    const allOrders = all('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC', [uid]);
    const pendingOrders = allOrders.filter(o => o.status === 'pending' || o.is_confirmed === 0);
    const activeOrders = allOrders.filter(o => o.status === 'confirmed');
    const completedOrders = allOrders.filter(o => o.status === 'completed');
    const stats = {
      total: allOrders.length,
      pending: pendingOrders.length,
      confirmed: activeOrders.length,
      completed: completedOrders.length
    };
    const paymentInfo = {
      mobile: { number: '45490505', name: 'ERNEST AMOS MAKARANGA' },
      bank: { account: '3015111947559', bank: 'Equity Bank', name: 'ERNEST MAKARANGA' }
    };
    res.render('dashboard', {
      user: req.session.user,
      pendingOrders,
      activeOrders,
      completedOrders,
      stats,
      formatTZS,
      paymentInfo,
      msg: req.query.msg || null,
      error: req.query.error || null,
      welcome: req.query.welcome === '1' ? true : false
    });
  });

  app.post('/contact', (req, res) => {
    const { name, email, message } = req.body;
    run('INSERT INTO messages (name, email, message) VALUES (?, ?, ?)', [name, email, message]);
    transporter.sendMail({
      from: '"TechHub Contact" <sosthenes688@gmail.com>',
      to: 'sosthenes688@gmail.com',
      subject: `New Contact Message from ${name}`,
      html: `<h2>New Contact Message</h2><p><strong>Name:</strong> ${name}</p><p><strong>Email:</strong> ${email}</p><p><strong>Message:</strong></p><p>${message}</p>`
    }).catch(err => console.error('[EMAIL] Contact:', err.message));
    res.json({ success: true, message: 'Thank you! We will get back to you shortly.' });
  });

  app.get('/admin', isAuth, isAdmin, (req, res) => {
    const users = all('SELECT id, username, email, role, created_at FROM users ORDER BY created_at DESC');
    const messages = all('SELECT * FROM messages ORDER BY created_at DESC');
    const orders = all('SELECT * FROM orders ORDER BY created_at DESC');
    const services = all('SELECT * FROM services ORDER BY category, name');
    const allOpts = all('SELECT * FROM service_options');
    const optsBySvc = {};
    for (const o of allOpts) {
      if (!optsBySvc[o.service_id]) optsBySvc[o.service_id] = [];
      optsBySvc[o.service_id].push(o);
    }
    const stats = {
      total_users: users.length, total_messages: messages.length, total_orders: orders.length,
      pending_orders: orders.filter(o => o.status === 'pending' || o.is_confirmed === 0).length,
      confirmed_orders: orders.filter(o => o.status === 'confirmed').length,
      completed_orders: orders.filter(o => o.status === 'completed').length,
      total_services: services.length
    };
    res.render('admin', { user: req.session.user, users, messages, orders, services, options: allOpts, optsBySvc, stats, formatTZS, welcome: req.query.welcome === '1' ? true : false });
  });

  app.post('/admin/service/add', isAuth, isAdmin, (req, res) => {
    const { name, description, long_description, price, category, has_options } = req.body;
    run('INSERT INTO services (name, description, long_description, price, category, has_options) VALUES (?, ?, ?, ?, ?, ?)',
      [name, description, long_description || '', parseFloat(price), category, has_options === 'on' ? 1 : 0]);
    res.redirect('/admin');
  });

  app.post('/admin/service/edit', isAuth, isAdmin, (req, res) => {
    const { id, name, description, long_description, price, category, has_options } = req.body;
    run('UPDATE services SET name=?, description=?, long_description=?, price=?, category=?, has_options=? WHERE id=?',
      [name, description, long_description || '', parseFloat(price), category, has_options === 'on' ? 1 : 0, id]);
    res.redirect('/admin');
  });

  app.post('/admin/service/toggle', isAuth, isAdmin, (req, res) => {
    const { id } = req.body;
    const s = get('SELECT is_active FROM services WHERE id = ?', [id]);
    if (s) run('UPDATE services SET is_active = ? WHERE id = ?', [s.is_active ? 0 : 1, id]);
    res.redirect('/admin');
  });

  app.post('/admin/service/delete', isAuth, isAdmin, (req, res) => {
    const { id } = req.body;
    run('DELETE FROM service_options WHERE service_id = ?', [id]);
    run('DELETE FROM services WHERE id = ?', [id]);
    res.redirect('/admin');
  });

  app.post('/admin/option/add', isAuth, isAdmin, (req, res) => {
    const { service_id, name, price, description } = req.body;
    run('INSERT INTO service_options (service_id, name, price, description) VALUES (?, ?, ?, ?)',
      [service_id, name, parseFloat(price), description || '']);
    res.redirect('/admin');
  });

  app.post('/admin/option/edit', isAuth, isAdmin, (req, res) => {
    const { id, name, price, description } = req.body;
    run('UPDATE service_options SET name=?, price=?, description=? WHERE id=?',
      [name, parseFloat(price), description || '', id]);
    res.redirect('/admin');
  });

  app.post('/admin/option/toggle', isAuth, isAdmin, (req, res) => {
    const { id } = req.body;
    const o = get('SELECT is_active FROM service_options WHERE id = ?', [id]);
    if (o) run('UPDATE service_options SET is_active = ? WHERE id = ?', [o.is_active ? 0 : 1, id]);
    res.redirect('/admin');
  });

  app.post('/admin/option/delete', isAuth, isAdmin, (req, res) => {
    const { id } = req.body;
    run('DELETE FROM service_options WHERE id = ?', [id]);
    res.redirect('/admin');
  });

  app.post('/admin/order/status', isAuth, isAdmin, (req, res) => {
    const { id, status } = req.body;
    run('UPDATE orders SET status = ? WHERE id = ?', [status, id]);
    res.redirect('/admin');
  });

  app.post('/admin/message/read', isAuth, isAdmin, (req, res) => {
    const { id } = req.body;
    run('UPDATE messages SET is_read = 1 WHERE id = ?', [id]);
    res.redirect('/admin');
  });

  app.post('/admin/message/delete', isAuth, isAdmin, (req, res) => {
    const { id } = req.body;
    run('DELETE FROM messages WHERE id = ?', [id]);
    res.redirect('/admin');
  });

  // ── Admin: User Management ──
  app.post('/admin/user/delete', isAuth, isAdmin, (req, res) => {
    const { id } = req.body;
    run('DELETE FROM orders WHERE user_id = ?', [id]);
    run('DELETE FROM reset_tokens WHERE user_id = ?', [id]);
    run('DELETE FROM users WHERE id = ? AND role != ?', [id, 'admin']);
    res.redirect('/admin');
  });

  // ── Admin: Verify Payment ──
  app.post('/admin/payment/verify', isAuth, isAdmin, (req, res) => {
    const { id } = req.body;
    run('UPDATE orders SET payment_verified = 1 WHERE id = ?', [id]);
    res.redirect('/admin');
  });

  app.post('/admin/payment/unverify', isAuth, isAdmin, (req, res) => {
    const { id } = req.body;
    run('UPDATE orders SET payment_verified = 0 WHERE id = ?', [id]);
    res.redirect('/admin');
  });

  const nets = os.networkInterfaces();
  let ip = 'localhost';
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) { ip = net.address; break; }
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`On phone use: http://${ip}:${PORT}`);
    console.log(`Admin: admin@techhub.com / admin123`);
    console.log(`Developed by Ernest Sosthenes`);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
