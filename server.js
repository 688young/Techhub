require('express-async-errors');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { sendSMS } = require('./utils/sms');

const app = express();
const PORT = process.env.PORT || 3000;

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

var transporter = null;
function initTransporter() {
  const pass = (process.env.EMAIL_PASS || '').replace(/\s+/g, '');
  if (!pass || pass === 'your-app-password-here') {
    console.log('[EMAIL] No EMAIL_PASS set — email disabled');
    return;
  }
  transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: { user: 'sosthenes688@gmail.com', pass },
    connectionTimeout: 20000,
    greetingTimeout: 10000
  });
  transporter.verify(function(err) {
    if (err) console.error('[EMAIL] Transport verify failed:', err.message);
    else console.log('[EMAIL] Transport ready');
  });
}
initTransporter();

function sendEmail(to, subject, html) {
  if (!transporter) {
    console.error('[EMAIL] Cannot send — no transporter configured');
    return Promise.reject(new Error('No EMAIL_PASS configured'));
  }
  return transporter.sendMail({
    from: '"TechHub Company" <sosthenes688@gmail.com>',
    to, subject, html
  }).then(r => console.log('[EMAIL] Sent to', to, ':', r.messageId))
    .catch(e => console.error('[EMAIL] Failed to', to, ':', e.message, e.code ? '('+e.code+')' : ''));
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
  const { initDB, get, all, run } = await require('./database/db-pg');
  await initDB();

  app.get('/', (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    res.redirect('/dashboard');
  });

  app.get('/login', (req, res) => {
    if (req.session.user) return res.redirect('/dashboard');
    res.render('login', { error: null, goodbye: req.query.goodbye === '1' ? true : false });
  });

  app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    const user = await get('SELECT * FROM users WHERE email = $1', [email]);
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

  app.post('/signup', async (req, res) => {
    const { username, email, password } = req.body;
    const existing = await get('SELECT id FROM users WHERE email = $1 OR username = $2', [email, username]);
    if (existing) {
      return res.render('signup', { error: 'Username or email already exists' });
    }
    const hash = bcrypt.hashSync(password, 10);
    await run('INSERT INTO users (username, email, password) VALUES ($1, $2, $3)', [username, email, hash]);
    res.redirect('/login');
  });

  app.get('/logout', (req, res) => {
    var uname = req.session.user ? req.session.user.username : 'User';
    req.session.destroy(function() {
      res.render('goodbye', { username: uname });
    });
  });

  app.get('/forgot-password', (req, res) => {
    res.render('forgot-password', { error: null, success: null, token: null, resetLink: null });
  });

  app.post('/forgot-password', async (req, res) => {
    const { email } = req.body;
    const user = await get('SELECT id FROM users WHERE email = $1', [email]);
    if (!user) {
      return res.render('forgot-password', { error: 'Email not found', success: null, token: null, resetLink: null });
    }
    const token = crypto.randomBytes(20).toString('hex');
    const expires = new Date(Date.now() + 3600000);
    await run('INSERT INTO reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)', [user.id, token, expires]);
    const siteUrl = process.env.SITE_URL || 'http://localhost:3000';
    const resetLink = `${siteUrl}/reset-password/${token}`;
    sendEmail(email, 'Password Reset - TechHub Company',
      `<h2>Password Reset</h2><p>Click <a href="${resetLink}">here</a> to reset your password.</p><p>Token: <strong>${token}</strong></p><p>Expires in 1 hour.</p>`);
    res.render('forgot-password', {
      error: null,
      success: 'Reset link generated. Check your email or use the link below:',
      token: token,
      resetLink: resetLink
    });
  });

  app.get('/reset-password/:token', async (req, res) => {
    const t = req.params.token;
    const row = await get('SELECT * FROM reset_tokens WHERE token = $1 AND used = 0 AND expires_at > NOW()', [t]);
    if (!row) return res.send('Invalid or expired reset token.');
    res.render('reset-password', { token: t, error: null, success: null });
  });

  app.post('/reset-password', async (req, res) => {
    const { token, password } = req.body;
    const row = await get('SELECT * FROM reset_tokens WHERE token = $1 AND used = 0 AND expires_at > NOW()', [token]);
    if (!row) return res.render('reset-password', { token, error: 'Invalid or expired token.', success: null });
    const hash = bcrypt.hashSync(password, 10);
    await run('UPDATE users SET password = $1 WHERE id = $2', [hash, row.user_id]);
    await run('UPDATE reset_tokens SET used = 1 WHERE id = $1', [row.id]);
    res.render('reset-password', { token: null, error: null, success: 'Password reset successful! <a href="/login">Login now</a>' });
  });

  app.get('/services', isAuth, async (req, res) => {
    const services = await all('SELECT * FROM services WHERE is_active = 1 ORDER BY category, name');
    const allOpts = await all('SELECT * FROM service_options');
    const optsBySvc = {};
    for (const o of allOpts) {
      if (!optsBySvc[o.service_id]) optsBySvc[o.service_id] = [];
      optsBySvc[o.service_id].push(o);
    }
    res.render('services', { user: req.session.user, services, optsBySvc, formatTZS });
  });

  app.get('/order/:serviceId', isAuth, async (req, res) => {
    const service = await get('SELECT * FROM services WHERE id = $1 AND is_active = 1', [req.params.serviceId]);
    if (!service) return res.redirect('/services');
    const options = service.has_options ? await all('SELECT * FROM service_options WHERE service_id = $1', [service.id]) : [];
    const queryOpt = req.query.opt || null;
    res.render('order', { user: req.session.user, service, options, queryOpt, error: null, formatTZS });
  });

  app.post('/order/quote', isAuth, async (req, res) => {
    const { service_id, name, phone, selected_option, location, quantity, description } = req.body;
    const service = await get('SELECT * FROM services WHERE id = $1 AND is_active = 1', [service_id]);
    if (!service) return res.redirect('/services');
    let optInfo = '';
    if (selected_option) optInfo = `Package: ${selected_option} | `;
    const details = `${optInfo}Location: ${location || 'N/A'} | Qty: ${quantity || 'N/A'} | Desc: ${description || 'N/A'}`;
    await run('INSERT INTO orders (user_id, customer_name, customer_email, service, price, phone, status, service_option, is_confirmed) VALUES ($1, $2, $3, $4, 0, $5, $6, $7, 1)',
      [req.session.user.id, name || req.session.user.username, req.session.user.email, service.name, phone, 'quote', details]);
    sendEmail('sosthenes688@gmail.com', `Service Request: ${service.name} from ${name}`,
      `<h2>New Service Request</h2><p><strong>Service:</strong> ${service.name}</p><p><strong>Name:</strong> ${name}</p><p><strong>Phone:</strong> ${phone}</p>${selected_option ? `<p><strong>Package:</strong> ${selected_option}</p>` : ''}<p><strong>Location:</strong> ${location || 'Not specified'}</p><p><strong>Quantity:</strong> ${quantity || 'Not specified'}</p><p><strong>Description:</strong> ${description || 'Not specified'}</p><hr><p>Login to admin to view all requests.</p>`);
    res.redirect(`/order/quote-success?service=${encodeURIComponent(service.name)}&pkg=${encodeURIComponent(selected_option||'')}&location=${encodeURIComponent(location||'')}&quantity=${encodeURIComponent(quantity||'')}&desc=${encodeURIComponent(description||'')}`);
  });

  app.get('/order/quote-success', isAuth, (req, res) => {
    res.render('quote-success', { user: req.session.user, service: req.query.service, pkg: req.query.pkg, location: req.query.location, quantity: req.query.quantity, desc: req.query.desc });
  });

  app.post('/order', isAuth, async (req, res) => {
    const { service_id, service_option_id, phone, payment_network, profile_url, post_link } = req.body;
    const service = await get('SELECT * FROM services WHERE id = $1 AND is_active = 1', [service_id]);
    if (!service) return res.redirect('/services');

    let finalPrice = service.price;
    let optionName = '';
    if (service.has_options && service_option_id) {
      const opt = await get('SELECT * FROM service_options WHERE id = $1 AND service_id = $2', [service_option_id, service_id]);
      if (opt) { finalPrice = opt.price; optionName = opt.name; }
    }

    const user = req.session.user;
    const code = crypto.randomInt(100000, 999999).toString();

    const result = await run('INSERT INTO orders (user_id, customer_name, customer_email, service, service_option, price, phone, payment_network, confirmation_code, profile_url, post_link) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id',
      [user.id, user.username, user.email, service.name, optionName, finalPrice, phone, payment_network, code, profile_url || '', post_link || '']);
    const order = result.rows[0];

    sendEmail(user.email, `Order Confirmation Code - ${formatTZS(finalPrice)}`,
      `<h2>Order Confirmation</h2><p>Hi <strong>${user.username}</strong>,</p><p>You placed an order for <strong>${service.name}${optionName ? ' - ' + optionName : ''}</strong>.</p><p><strong>Total:</strong> ${formatTZS(finalPrice)}</p><p><strong>Payment Network:</strong> ${payment_network} | <strong>Phone:</strong> ${phone}</p>${profile_url ? `<p><strong>Profile URL:</strong> ${profile_url}</p>` : ''}${post_link ? `<p><strong>Post Link:</strong> ${post_link}</p>` : ''}<hr><p style="font-size:18px">Your confirmation code is:</p><h1 style="background:#00d4ff;color:#1a1a2e;padding:15px;text-align:center;border-radius:8px;letter-spacing:5px;font-size:32px">${code}</h1><p>Enter this code on the website to confirm your order.</p><hr><p><strong>Make Payment To:</strong></p><p><strong>MIX by YAS:</strong> 45490505 (ERNEST AMOS MAKARANGA)</p><p><strong>Equity Bank:</strong> 3015111947559 (ERNEST MAKARANGA)</p><hr><p>After payment, confirm with the code above. Admin will approve once payment is verified.</p><p>Thank you!<br><strong>TechHub Company</strong><br>Developed by Ernest Sosthenes</p>`);

    transporter.sendMail({
      from: '"TechHub" <sosthenes688@gmail.com>',
      to: 'sosthenes688@gmail.com',
      subject: `New Order: ${service.name} from ${user.username}`,
      text: `Customer: ${user.username} (${user.email})\nService: ${service.name}${optionName ? ' - ' + optionName : ''}\nPrice: ${formatTZS(finalPrice)}\nPhone: ${phone}\nPayment: ${payment_network}${profile_url ? '\nProfile URL: ' + profile_url : ''}${post_link ? '\nPost Link: ' + post_link : ''}\nConfirmation Code: ${code}`
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

  app.post('/order/confirm', isAuth, async (req, res) => {
    const { order_id, code } = req.body;
    const order = await get('SELECT * FROM orders WHERE id = $1 AND user_id = $2', [order_id, req.session.user.id]);
    if (!order) return res.status(404).send('Order not found');
    if (order.confirmation_code === code) {
      await run('UPDATE orders SET is_confirmed = 1, status = $1 WHERE id = $2', ['pending', order_id]);
      res.redirect('/dashboard?msg=Order confirmed! Wait for admin approval.');
    } else {
      res.redirect('/dashboard?msg=Invalid confirmation code. Check your email.&error=1');
    }
  });

  app.post('/order/proof', isAuth, async (req, res) => {
    const { order_id, transaction_id } = req.body;
    const order = await get('SELECT * FROM orders WHERE id = $1 AND user_id = $2', [order_id, req.session.user.id]);
    if (!order) return res.status(404).send('Order not found');
    await run('UPDATE orders SET transaction_id = $1, payment_proof_date = NOW(), payment_verified = 0 WHERE id = $2',
      [transaction_id, order_id]);
    res.redirect('/dashboard?msg=Payment proof submitted! Admin will verify it.');
  });

  app.get('/dashboard', isAuth, async (req, res) => {
    const uid = req.session.user.id;
    const allOrders = await all('SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC', [uid]);
    const pendingOrders = allOrders.filter(o => o.status === 'pending' || o.is_confirmed === 0);
    const activeOrders = allOrders.filter(o => o.status === 'confirmed' || o.status === 'quote');
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
      pendingOrders, activeOrders, completedOrders, stats,
      formatTZS, paymentInfo,
      msg: req.query.msg || null,
      error: req.query.error || null,
      welcome: req.query.welcome === '1' ? true : false
    });
  });

  app.post('/contact', async (req, res) => {
    const { name, email, message } = req.body;
    await run('INSERT INTO messages (name, email, message) VALUES ($1, $2, $3)', [name, email, message]);
    transporter.sendMail({
      from: '"TechHub Contact" <sosthenes688@gmail.com>',
      to: 'sosthenes688@gmail.com',
      subject: `New Contact Message from ${name}`,
      html: `<h2>New Contact Message</h2><p><strong>Name:</strong> ${name}</p><p><strong>Email:</strong> ${email}</p><p><strong>Message:</strong></p><p>${message}</p>`
    }).catch(err => console.error('[EMAIL] Contact:', err.message));
    res.json({ success: true, message: 'Thank you! We will get back to you shortly.' });
  });

  app.get('/admin', isAuth, isAdmin, async (req, res) => {
    const users = await all('SELECT id, username, email, role, created_at FROM users ORDER BY created_at DESC');
    const messages = await all('SELECT * FROM messages ORDER BY created_at DESC');
    const orders = await all('SELECT * FROM orders ORDER BY created_at DESC');
    const services = await all('SELECT * FROM services ORDER BY category, name');
    const allOpts = await all('SELECT * FROM service_options');
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

  app.post('/admin/service/add', isAuth, isAdmin, async (req, res) => {
    const { name, description, long_description, price, category, has_options, needs_quote } = req.body;
    await run('INSERT INTO services (name, description, long_description, price, category, has_options, needs_quote) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [name, description, long_description || '', parseFloat(price), category, has_options === 'on' ? 1 : 0, needs_quote === 'on' ? 1 : 0]);
    res.redirect('/admin');
  });

  app.post('/admin/service/edit', isAuth, isAdmin, async (req, res) => {
    const { id, name, description, long_description, price, category, has_options, needs_quote } = req.body;
    await run('UPDATE services SET name=$1, description=$2, long_description=$3, price=$4, category=$5, has_options=$6, needs_quote=$7 WHERE id=$8',
      [name, description, long_description || '', parseFloat(price), category, has_options === 'on' ? 1 : 0, needs_quote === 'on' ? 1 : 0, id]);
    res.redirect('/admin');
  });

  app.post('/admin/service/toggle', isAuth, isAdmin, async (req, res) => {
    const { id } = req.body;
    const s = await get('SELECT is_active FROM services WHERE id = $1', [id]);
    if (s) await run('UPDATE services SET is_active = $1 WHERE id = $2', [s.is_active ? 0 : 1, id]);
    res.redirect('/admin');
  });

  app.post('/admin/service/delete', isAuth, isAdmin, async (req, res) => {
    const { id } = req.body;
    await run('DELETE FROM service_options WHERE service_id = $1', [id]);
    await run('DELETE FROM services WHERE id = $1', [id]);
    res.redirect('/admin');
  });

  app.post('/admin/option/add', isAuth, isAdmin, async (req, res) => {
    const { service_id, name, price, description } = req.body;
    await run('INSERT INTO service_options (service_id, name, price, description) VALUES ($1, $2, $3, $4)',
      [service_id, name, parseFloat(price), description || '']);
    res.redirect('/admin');
  });

  app.post('/admin/option/edit', isAuth, isAdmin, async (req, res) => {
    const { id, name, price, description } = req.body;
    await run('UPDATE service_options SET name=$1, price=$2, description=$3 WHERE id=$4',
      [name, parseFloat(price), description || '', id]);
    res.redirect('/admin');
  });

  app.post('/admin/option/toggle', isAuth, isAdmin, async (req, res) => {
    const { id } = req.body;
    const o = await get('SELECT is_active FROM service_options WHERE id = $1', [id]);
    if (o) await run('UPDATE service_options SET is_active = $1 WHERE id = $2', [o.is_active ? 0 : 1, id]);
    res.redirect('/admin');
  });

  app.post('/admin/option/delete', isAuth, isAdmin, async (req, res) => {
    const { id } = req.body;
    await run('DELETE FROM service_options WHERE id = $1', [id]);
    res.redirect('/admin');
  });

  app.post('/admin/order/status', isAuth, isAdmin, async (req, res) => {
    const { id, status } = req.body;
    await run('UPDATE orders SET status = $1 WHERE id = $2', [status, id]);
    res.redirect('/admin');
  });

  app.post('/admin/message/read', isAuth, isAdmin, async (req, res) => {
    const { id } = req.body;
    await run('UPDATE messages SET is_read = 1 WHERE id = $1', [id]);
    res.redirect('/admin');
  });

  app.post('/admin/message/delete', isAuth, isAdmin, async (req, res) => {
    const { id } = req.body;
    await run('DELETE FROM messages WHERE id = $1', [id]);
    res.redirect('/admin');
  });

  app.post('/admin/user/delete', isAuth, isAdmin, async (req, res) => {
    const { id } = req.body;
    await run('DELETE FROM orders WHERE user_id = $1', [id]);
    await run('DELETE FROM reset_tokens WHERE user_id = $1', [id]);
    await run('DELETE FROM users WHERE id = $1 AND role != $2', [id, 'admin']);
    res.redirect('/admin');
  });

  app.post('/admin/payment/verify', isAuth, isAdmin, async (req, res) => {
    const { id } = req.body;
    await run('UPDATE orders SET payment_verified = 1 WHERE id = $1', [id]);
    res.redirect('/admin');
  });

  app.post('/admin/payment/unverify', isAuth, isAdmin, async (req, res) => {
    const { id } = req.body;
    await run('UPDATE orders SET payment_verified = 0 WHERE id = $1', [id]);
    res.redirect('/admin');
  });

  app.post('/admin/service/needs_quote', isAuth, isAdmin, async (req, res) => {
    const { id } = req.body;
    const s = await get('SELECT needs_quote FROM services WHERE id = $1', [id]);
    if (s) await run('UPDATE services SET needs_quote = $1 WHERE id = $2', [s.needs_quote ? 0 : 1, id]);
    res.redirect('/admin');
  });

  app.use((err, req, res, next) => {
    console.error('[ERROR]', err);
    res.status(500).send(`<h1>Server Error</h1><pre>${err.message}</pre><p>Check server logs for details.</p>`);
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