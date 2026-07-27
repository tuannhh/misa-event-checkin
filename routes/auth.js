// Đăng nhập / đăng xuất / thông tin tài khoản hiện tại
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireLogin } = require('./lib/helpers');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await db.prepare('SELECT * FROM users WHERE email = ?').get((email || '').trim());
  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
    return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng' });
  }
  req.session.user = { id: user.id };
  res.json({ id: user.id, name: user.name, email: user.email, role: user.role, unit: user.unit });
});
router.post('/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));
router.get('/me', requireLogin, (req, res) => {
  const u = req.user;
  res.json({ id: u.id, name: u.name, email: u.email, role: u.role, unit: u.unit, department: u.department });
});

module.exports = router;
