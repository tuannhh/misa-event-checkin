// Quản lý thành viên hệ thống (users.role: super_admin/admin/checkin)
const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const XLSX = require('xlsx');
const db = require('../db');
const { requireLogin, requireRole, ROLES, validateNewUserRole } = require('./lib/helpers');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.get('/users', requireLogin, requireRole('super_admin', 'admin'), async (req, res) => {
  let rows;
  if (req.user.role === 'super_admin') {
    rows = await db.prepare('SELECT id, name, department, unit, email, role, created_at FROM users ORDER BY id').all();
  } else {
    rows = await db.prepare("SELECT id, name, department, unit, email, role, created_at FROM users WHERE unit = ? AND role != 'super_admin' ORDER BY id").all(req.user.unit);
  }
  res.json(rows);
});

router.post('/users', requireLogin, requireRole('super_admin', 'admin'), async (req, res) => {
  const { name, department, unit, email, role, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Cần nhập Họ tên, Email và Mật khẩu' });
  const err = validateNewUserRole(req.user, role, unit || '');
  if (err) return res.status(403).json({ error: err });
  if (await db.prepare('SELECT 1 AS ok FROM users WHERE email = ?').get(email.trim())) {
    return res.status(409).json({ error: 'Email này đã tồn tại trong hệ thống' });
  }
  const info = await db.prepare('INSERT INTO users (name, department, unit, email, password_hash, role) VALUES (?,?,?,?,?,?)')
    .run(name.trim(), department || '', unit || '', email.trim(), bcrypt.hashSync(password, 10), role);
  res.json({ id: info.lastInsertRowid });
});

router.put('/users/:id', requireLogin, requireRole('super_admin', 'admin'), async (req, res) => {
  const target = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'Không tìm thấy thành viên' });
  if (req.user.role === 'admin' && (target.unit !== req.user.unit || target.role === 'super_admin' || target.role === 'admin')) {
    return res.status(403).json({ error: 'Bạn không có quyền sửa thành viên này' });
  }
  const { name, department, unit, email, role, password } = req.body;
  if (role) {
    const err = validateNewUserRole(req.user, role, unit !== undefined ? unit : target.unit);
    if (err && target.role !== role) return res.status(403).json({ error: err });
  }
  await db.prepare('UPDATE users SET name=?, department=?, unit=?, email=?, role=? WHERE id=?')
    .run(name ?? target.name, department ?? target.department, unit ?? target.unit, email ?? target.email, role ?? target.role, target.id);
  if (password) await db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(password, 10), target.id);
  res.json({ ok: true });
});

router.delete('/users/:id', requireLogin, requireRole('super_admin', 'admin'), async (req, res) => {
  const target = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'Không tìm thấy thành viên' });
  if (target.role === 'super_admin') return res.status(403).json({ error: 'Không thể xoá Super Admin' });
  if (req.user.role === 'admin' && (target.unit !== req.user.unit || target.role === 'admin')) {
    return res.status(403).json({ error: 'Bạn không có quyền xoá thành viên này' });
  }
  await db.prepare('DELETE FROM users WHERE id = ?').run(target.id);
  res.json({ ok: true });
});

router.get('/users/template', requireLogin, requireRole('super_admin', 'admin'), (req, res) => {
  const ws = XLSX.utils.aoa_to_sheet([
    ['Họ và tên', 'Bộ phận', 'Đơn vị', 'Email', 'Vai trò', 'Mật khẩu'],
    ['Nguyễn Văn A', 'Marketing', 'Công ty X', 'vana@example.com', 'checkin', 'MatKhau123'],
    ['(Vai trò hợp lệ: admin, checkin)', '', '', '', '', ''],
  ]);
  ws['!cols'] = [{ wch: 25 }, { wch: 18 }, { wch: 18 }, { wch: 28 }, { wch: 12 }, { wch: 15 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'ThanhVien');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="mau-thanh-vien.xlsx"');
  res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(buf);
});

router.post('/users/import', requireLogin, requireRole('super_admin', 'admin'), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Chưa chọn file' });
  const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  let added = 0; const errors = [];
  for (const [i, r] of rows.entries()) {
    const name = String(r['Họ và tên'] || '').trim();
    const email = String(r['Email'] || '').trim();
    const role = String(r['Vai trò'] || '').trim().toLowerCase();
    const password = String(r['Mật khẩu'] || '').trim();
    const unit = String(r['Đơn vị'] || '').trim();
    if (!name && !email) continue;
    if (!name || !email || !password) { errors.push(`Dòng ${i + 2}: thiếu Họ tên, Email hoặc Mật khẩu`); continue; }
    if (!ROLES.includes(role) || role === 'super_admin') { errors.push(`Dòng ${i + 2}: vai trò "${role}" không hợp lệ`); continue; }
    const err = validateNewUserRole(req.user, role, req.user.role === 'admin' ? req.user.unit : unit);
    if (err) { errors.push(`Dòng ${i + 2}: ${err}`); continue; }
    if (await db.prepare('SELECT 1 AS ok FROM users WHERE email = ?').get(email)) { errors.push(`Dòng ${i + 2}: email ${email} đã tồn tại`); continue; }
    await db.prepare('INSERT INTO users (name, department, unit, email, password_hash, role) VALUES (?,?,?,?,?,?)')
      .run(name, String(r['Bộ phận'] || '').trim(), req.user.role === 'admin' ? req.user.unit : unit, email, bcrypt.hashSync(password, 10), role);
    added++;
  }
  res.json({ added, errors });
});

module.exports = router;
