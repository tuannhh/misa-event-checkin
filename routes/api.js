// Toàn bộ API của hệ thống
const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const multer = require('multer');
const XLSX = require('xlsx');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { sendConfirmEmail, getTransport, buildEmail, fillTemplate } = require('../email');
const { UPLOAD_DIR } = require('../config');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const POSITIONS = ['CEO/Founder/TGĐ', 'C-Level', 'Chuyên gia', 'Chuyên viên'];
const COMPANY_SIZES = [
  'Dưới 10 người', 'Từ 10 đến dưới 50 người', 'Từ 50 đến dưới 100 người',
  'Từ 100 đến dưới 300 người', 'Từ 300 người đến 500 người', 'Từ 500 người trở lên',
];
const ROLES = ['super_admin', 'admin', 'checkin'];

// ============ HELPER: phân quyền ============
function requireLogin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Chưa đăng nhập' });
  req.user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);
  if (!req.user) { req.session.destroy(() => {}); return res.status(401).json({ error: 'Tài khoản không tồn tại' }); }
  next();
}
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Bạn không có quyền thực hiện thao tác này' });
    next();
  };
}
// Sự kiện mà user được nhìn thấy
function visibleEventsSql(user) {
  if (user.role === 'super_admin') return { where: '1=1', params: [] };
  if (user.role === 'admin') return { where: 'e.unit = ?', params: [user.unit] };
  return { where: 'e.id IN (SELECT event_id FROM event_staff WHERE user_id = ?)', params: [user.id] };
}
function canViewEvent(user, event) {
  if (user.role === 'super_admin') return true;
  if (user.role === 'admin') return event.unit === user.unit;
  return !!db.prepare('SELECT 1 FROM event_staff WHERE event_id = ? AND user_id = ?').get(event.id, user.id);
}
function canManageEvent(user, event) {
  if (user.role === 'super_admin') return true;
  if (user.role === 'admin') return event.unit === user.unit;
  return false;
}
function getEventOr404(req, res) {
  const ev = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  if (!ev) { res.status(404).json({ error: 'Không tìm thấy sự kiện' }); return null; }
  if (!canViewEvent(req.user, ev)) { res.status(403).json({ error: 'Bạn không có quyền với sự kiện này' }); return null; }
  return ev;
}
function newToken() {
  return crypto.randomBytes(10).toString('hex').toUpperCase(); // chuỗi 20 ký tự ngẫu nhiên, vô nghĩa
}
function getEmailSettings(eventId) {
  db.prepare('INSERT OR IGNORE INTO email_settings (event_id) VALUES (?)').run(eventId);
  return db.prepare('SELECT * FROM email_settings WHERE event_id = ?').get(eventId);
}

// ============ ĐĂNG NHẬP ============
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get((email || '').trim());
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

// ============ THÀNH VIÊN ============
router.get('/users', requireLogin, requireRole('super_admin', 'admin'), (req, res) => {
  let rows;
  if (req.user.role === 'super_admin') {
    rows = db.prepare('SELECT id, name, department, unit, email, role, created_at FROM users ORDER BY id').all();
  } else {
    rows = db.prepare("SELECT id, name, department, unit, email, role, created_at FROM users WHERE unit = ? AND role != 'super_admin' ORDER BY id").all(req.user.unit);
  }
  res.json(rows);
});

function validateNewUserRole(actor, role, unit) {
  if (!ROLES.includes(role)) return 'Vai trò không hợp lệ';
  if (actor.role === 'admin') {
    if (role !== 'checkin') return 'Admin chỉ được tạo Nhân viên check-in';
    if (unit !== actor.unit) return 'Admin chỉ được tạo thành viên trong đơn vị của mình';
  }
  return null;
}

router.post('/users', requireLogin, requireRole('super_admin', 'admin'), (req, res) => {
  const { name, department, unit, email, role, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Cần nhập Họ tên, Email và Mật khẩu' });
  const err = validateNewUserRole(req.user, role, unit || '');
  if (err) return res.status(403).json({ error: err });
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email.trim())) {
    return res.status(409).json({ error: 'Email này đã tồn tại trong hệ thống' });
  }
  const info = db.prepare('INSERT INTO users (name, department, unit, email, password_hash, role) VALUES (?,?,?,?,?,?)')
    .run(name.trim(), department || '', unit || '', email.trim(), bcrypt.hashSync(password, 10), role);
  res.json({ id: info.lastInsertRowid });
});

router.put('/users/:id', requireLogin, requireRole('super_admin', 'admin'), (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'Không tìm thấy thành viên' });
  if (req.user.role === 'admin' && (target.unit !== req.user.unit || target.role === 'super_admin' || target.role === 'admin')) {
    return res.status(403).json({ error: 'Bạn không có quyền sửa thành viên này' });
  }
  const { name, department, unit, email, role, password } = req.body;
  if (role) {
    const err = validateNewUserRole(req.user, role, unit !== undefined ? unit : target.unit);
    if (err && target.role !== role) return res.status(403).json({ error: err });
  }
  db.prepare('UPDATE users SET name=?, department=?, unit=?, email=?, role=? WHERE id=?')
    .run(name ?? target.name, department ?? target.department, unit ?? target.unit, email ?? target.email, role ?? target.role, target.id);
  if (password) db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(password, 10), target.id);
  res.json({ ok: true });
});

router.delete('/users/:id', requireLogin, requireRole('super_admin', 'admin'), (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'Không tìm thấy thành viên' });
  if (target.role === 'super_admin') return res.status(403).json({ error: 'Không thể xoá Super Admin' });
  if (req.user.role === 'admin' && (target.unit !== req.user.unit || target.role === 'admin')) {
    return res.status(403).json({ error: 'Bạn không có quyền xoá thành viên này' });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(target.id);
  res.json({ ok: true });
});

// File Excel mẫu cho danh sách thành viên
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

router.post('/users/import', requireLogin, requireRole('super_admin', 'admin'), upload.single('file'), (req, res) => {
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
    if (!name && !email) continue; // dòng trống / ghi chú
    if (!name || !email || !password) { errors.push(`Dòng ${i + 2}: thiếu Họ tên, Email hoặc Mật khẩu`); continue; }
    if (!ROLES.includes(role) || role === 'super_admin') { errors.push(`Dòng ${i + 2}: vai trò "${role}" không hợp lệ`); continue; }
    const err = validateNewUserRole(req.user, role, req.user.role === 'admin' ? req.user.unit : unit);
    if (err) { errors.push(`Dòng ${i + 2}: ${err}`); continue; }
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) { errors.push(`Dòng ${i + 2}: email ${email} đã tồn tại`); continue; }
    db.prepare('INSERT INTO users (name, department, unit, email, password_hash, role) VALUES (?,?,?,?,?,?)')
      .run(name, String(r['Bộ phận'] || '').trim(), req.user.role === 'admin' ? req.user.unit : unit, email, bcrypt.hashSync(password, 10), role);
    added++;
  }
  res.json({ added, errors });
});

// ============ SỰ KIỆN ============
router.get('/events', requireLogin, (req, res) => {
  const v = visibleEventsSql(req.user);
  const rows = db.prepare(`
    SELECT e.*, u.name AS creator_name,
      (SELECT COUNT(*) FROM attendees a WHERE a.event_id = e.id) AS total_attendees,
      (SELECT COUNT(*) FROM attendees a WHERE a.event_id = e.id AND a.checked_in_at IS NOT NULL) AS total_checkedin
    FROM events e JOIN users u ON u.id = e.created_by
    WHERE ${v.where} ORDER BY e.event_date DESC`).all(...v.params);
  res.json(rows);
});

router.post('/events', requireLogin, requireRole('super_admin', 'admin'), (req, res) => {
  const { name, event_date, organizer, unit } = req.body;
  if (!name || !event_date) return res.status(400).json({ error: 'Cần nhập Tên sự kiện và Thời gian tổ chức' });
  const evUnit = req.user.role === 'super_admin' ? (unit || '') : req.user.unit;
  const info = db.prepare('INSERT INTO events (name, event_date, organizer, unit, created_by) VALUES (?,?,?,?,?)')
    .run(name.trim(), event_date, organizer || '', evUnit, req.user.id);
  getEmailSettings(info.lastInsertRowid);
  res.json({ id: info.lastInsertRowid });
});

router.get('/events/:id', requireLogin, (req, res) => {
  const ev = getEventOr404(req, res); if (!ev) return;
  const staff = db.prepare(`SELECT u.id, u.name, u.email FROM event_staff s JOIN users u ON u.id = s.user_id WHERE s.event_id = ?`).all(ev.id);
  res.json({ ...ev, staff, can_manage: canManageEvent(req.user, ev) });
});

router.put('/events/:id', requireLogin, (req, res) => {
  const ev = getEventOr404(req, res); if (!ev) return;
  if (!canManageEvent(req.user, ev)) return res.status(403).json({ error: 'Bạn không có quyền sửa sự kiện này' });
  const { name, event_date, organizer, unit } = req.body;
  const evUnit = req.user.role === 'super_admin' ? (unit ?? ev.unit) : ev.unit;
  db.prepare('UPDATE events SET name=?, event_date=?, organizer=?, unit=? WHERE id=?')
    .run(name ?? ev.name, event_date ?? ev.event_date, organizer ?? ev.organizer, evUnit, ev.id);
  res.json({ ok: true });
});

router.delete('/events/:id', requireLogin, (req, res) => {
  const ev = getEventOr404(req, res); if (!ev) return;
  if (!canManageEvent(req.user, ev)) return res.status(403).json({ error: 'Bạn không có quyền xoá sự kiện này' });
  db.prepare('DELETE FROM events WHERE id = ?').run(ev.id);
  res.json({ ok: true });
});

// Gán nhân viên check-in cho sự kiện
router.put('/events/:id/staff', requireLogin, (req, res) => {
  const ev = getEventOr404(req, res); if (!ev) return;
  if (!canManageEvent(req.user, ev)) return res.status(403).json({ error: 'Bạn không có quyền' });
  const ids = Array.isArray(req.body.user_ids) ? req.body.user_ids : [];
  db.prepare('DELETE FROM event_staff WHERE event_id = ?').run(ev.id);
  const ins = db.prepare('INSERT OR IGNORE INTO event_staff (event_id, user_id) VALUES (?,?)');
  for (const uid of ids) ins.run(ev.id, uid);
  res.json({ ok: true });
});

// Tạo nhanh tài khoản nhân viên check-in ngay trong sự kiện và gán luôn
router.post('/events/:id/staff/create', requireLogin, requireRole('super_admin', 'admin'), (req, res) => {
  const ev = getEventOr404(req, res); if (!ev) return;
  if (!canManageEvent(req.user, ev)) return res.status(403).json({ error: 'Bạn không có quyền' });
  const { name, email, password, department } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Cần nhập Họ tên, Email và Mật khẩu' });
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email.trim())) {
    return res.status(409).json({ error: 'Email này đã tồn tại trong hệ thống' });
  }
  const unit = req.user.role === 'admin' ? req.user.unit : (ev.unit || '');
  const info = db.prepare("INSERT INTO users (name, department, unit, email, password_hash, role) VALUES (?,?,?,?,?,'checkin')")
    .run(name.trim(), department || '', unit, email.trim(), bcrypt.hashSync(password, 10));
  db.prepare('INSERT OR IGNORE INTO event_staff (event_id, user_id) VALUES (?,?)').run(ev.id, info.lastInsertRowid);
  res.json({ id: info.lastInsertRowid });
});

// Danh sách nhân viên check-in có thể gán (cùng đơn vị)
router.get('/events/:id/available-staff', requireLogin, (req, res) => {
  const ev = getEventOr404(req, res); if (!ev) return;
  let rows;
  if (req.user.role === 'super_admin') {
    rows = db.prepare("SELECT id, name, email, unit FROM users WHERE role = 'checkin' ORDER BY name").all();
  } else {
    rows = db.prepare("SELECT id, name, email, unit FROM users WHERE role = 'checkin' AND unit = ? ORDER BY name").all(req.user.unit);
  }
  res.json(rows);
});

// ============ NGƯỜI THAM DỰ ============
router.get('/events/:id/attendees', requireLogin, (req, res) => {
  const ev = getEventOr404(req, res); if (!ev) return;
  let rows = db.prepare(`
    SELECT a.*, u.name AS checked_in_by_name FROM attendees a
    LEFT JOIN users u ON u.id = a.checked_in_by
    WHERE a.event_id = ? ORDER BY a.id DESC`).all(ev.id);
  // Nhân viên check-in chỉ xem danh sách người ĐÃ check-in
  if (req.user.role === 'checkin' && req.query.all !== '1') {
    rows = rows.filter(r => r.checked_in_at);
  }
  res.json(rows);
});

router.post('/events/:id/attendees', requireLogin, (req, res) => {
  const ev = getEventOr404(req, res); if (!ev) return;
  if (!canManageEvent(req.user, ev)) return res.status(403).json({ error: 'Bạn không có quyền thêm người tham dự' });
  const { name, email, phone, position, company, tax_code, company_size, force } = req.body;
  if (!name) return res.status(400).json({ error: 'Cần nhập Họ và tên' });
  if (phone) {
    const dup = db.prepare('SELECT name, phone FROM attendees WHERE event_id = ? AND phone = ?').get(ev.id, String(phone).trim());
    if (dup && !force) {
      return res.status(409).json({ duplicate: true, error: `Số điện thoại ${dup.phone} đã có trong danh sách (${dup.name}). Bạn có chắc muốn thêm?` });
    }
  }
  const info = db.prepare(`INSERT INTO attendees (event_id, name, email, phone, position, company, tax_code, company_size, qr_token)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(ev.id, name.trim(), (email || '').trim(), String(phone || '').trim(), position || '', company || '', tax_code || '', company_size || '', newToken());
  const attendee = db.prepare('SELECT * FROM attendees WHERE id = ?').get(info.lastInsertRowid);
  // Tự động gửi email xác nhận nếu đã bật
  const settings = getEmailSettings(ev.id);
  let emailResult = null;
  if (settings.auto_send_confirm && attendee.email) {
    sendConfirmEmail(attendee, ev, settings).then(() => {}).catch(e => console.error('Lỗi gửi email:', e.message));
    emailResult = 'sending';
  }
  res.json({ id: attendee.id, email: emailResult });
});

router.delete('/attendees/:id', requireLogin, (req, res) => {
  const a = db.prepare('SELECT * FROM attendees WHERE id = ?').get(req.params.id);
  if (!a) return res.status(404).json({ error: 'Không tìm thấy' });
  const ev = db.prepare('SELECT * FROM events WHERE id = ?').get(a.event_id);
  if (!canManageEvent(req.user, ev)) return res.status(403).json({ error: 'Bạn không có quyền' });
  db.prepare('DELETE FROM attendees WHERE id = ?').run(a.id);
  res.json({ ok: true });
});

// File Excel mẫu cho danh sách người tham dự
router.get('/attendees/template', requireLogin, (req, res) => {
  const ws = XLSX.utils.aoa_to_sheet([
    ['Họ và tên', 'Email', 'Số điện thoại', 'Chức vụ', 'Nơi công tác/Tên công ty', 'MST công ty', 'Quy mô nhân sự'],
    ['Nguyễn Văn B', 'vanb@congty.com', '0912345678', 'CEO/Founder/TGĐ', 'Công ty TNHH ABC', '0101234567', 'Từ 50 đến dưới 100 người'],
    [],
    ['Chức vụ hợp lệ:', POSITIONS.join(' | ')],
    ['Quy mô hợp lệ:', COMPANY_SIZES.join(' | ')],
  ]);
  ws['!cols'] = [{ wch: 25 }, { wch: 28 }, { wch: 15 }, { wch: 18 }, { wch: 30 }, { wch: 14 }, { wch: 28 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'NguoiThamDu');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="mau-nguoi-tham-du.xlsx"');
  res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(buf);
});

router.post('/events/:id/attendees/import', requireLogin, upload.single('file'), (req, res) => {
  const ev = getEventOr404(req, res); if (!ev) return;
  if (!canManageEvent(req.user, ev)) return res.status(403).json({ error: 'Bạn không có quyền' });
  if (!req.file) return res.status(400).json({ error: 'Chưa chọn file' });
  const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  let added = 0; const errors = []; const newIds = [];
  for (const [i, r] of rows.entries()) {
    const name = String(r['Họ và tên'] || '').trim();
    if (!name) continue;
    const phone = String(r['Số điện thoại'] || '').trim();
    if (phone && db.prepare('SELECT 1 FROM attendees WHERE event_id = ? AND phone = ?').get(ev.id, phone)) {
      errors.push(`Dòng ${i + 2}: số điện thoại ${phone} (${name}) đã có trong danh sách - bỏ qua`);
      continue;
    }
    const info = db.prepare(`INSERT INTO attendees (event_id, name, email, phone, position, company, tax_code, company_size, qr_token)
      VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(ev.id, name, String(r['Email'] || '').trim(), phone, String(r['Chức vụ'] || '').trim(),
        String(r['Nơi công tác/Tên công ty'] || r['Nơi công tác'] || r['Tên công ty'] || '').trim(),
        String(r['MST công ty'] || '').trim(), String(r['Quy mô nhân sự'] || '').trim(), newToken());
    newIds.push(info.lastInsertRowid);
    added++;
  }
  // Tự động gửi email xác nhận nếu đã bật
  const settings = getEmailSettings(ev.id);
  if (settings.auto_send_confirm && getTransport()) {
    (async () => {
      for (const id of newIds) {
        const a = db.prepare('SELECT * FROM attendees WHERE id = ?').get(id);
        if (a && a.email) {
          try { await sendConfirmEmail(a, ev, settings); }
          catch (e) { console.error('Lỗi gửi email cho', a.email, e.message); }
        }
      }
    })();
  }
  res.json({ added, errors, auto_email: !!(settings.auto_send_confirm && getTransport()) });
});

// Xem ảnh QR của 1 người (cho quản trị viên kiểm tra)
router.get('/attendees/:id/qr.png', requireLogin, async (req, res) => {
  if (req.params.id === '0') { // ảnh QR mẫu cho phần xem trước email
    const png = await QRCode.toBuffer('MA-QR-MAU-XEM-TRUOC', { width: 300, margin: 2 });
    return res.type('png').send(png);
  }
  const a = db.prepare('SELECT * FROM attendees WHERE id = ?').get(req.params.id);
  if (!a) return res.status(404).end();
  const ev = db.prepare('SELECT * FROM events WHERE id = ?').get(a.event_id);
  if (!canViewEvent(req.user, ev)) return res.status(403).end();
  const png = await QRCode.toBuffer(a.qr_token, { width: 300, margin: 2 });
  res.type('png').send(png);
});

// Gửi (lại) email xác nhận cho 1 người
router.post('/attendees/:id/send-email', requireLogin, async (req, res) => {
  const a = db.prepare('SELECT * FROM attendees WHERE id = ?').get(req.params.id);
  if (!a) return res.status(404).json({ error: 'Không tìm thấy' });
  const ev = db.prepare('SELECT * FROM events WHERE id = ?').get(a.event_id);
  if (!canManageEvent(req.user, ev)) return res.status(403).json({ error: 'Bạn không có quyền' });
  try {
    await sendConfirmEmail(a, ev, getEmailSettings(ev.id));
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Gửi email xác nhận cho TẤT CẢ người chưa được gửi
router.post('/events/:id/send-all-emails', requireLogin, async (req, res) => {
  const ev = getEventOr404(req, res); if (!ev) return;
  if (!canManageEvent(req.user, ev)) return res.status(403).json({ error: 'Bạn không có quyền' });
  if (!getTransport()) return res.status(400).json({ error: 'Chưa cấu hình SMTP (vào mục Cài đặt Email)' });
  const settings = getEmailSettings(ev.id);
  const pending = db.prepare("SELECT * FROM attendees WHERE event_id = ? AND confirm_email_sent_at IS NULL AND email != ''").all(ev.id);
  let sent = 0; const errors = [];
  for (const a of pending) {
    try { await sendConfirmEmail(a, ev, settings); sent++; }
    catch (e) { errors.push(`${a.email}: ${e.message}`); }
  }
  res.json({ sent, total: pending.length, errors });
});

// ============ CHECK-IN (QUÉT QR) ============
router.post('/events/:id/scan', requireLogin, (req, res) => {
  const ev = getEventOr404(req, res); if (!ev) return;
  const token = String(req.body.token || '').trim();
  if (!token) return res.status(400).json({ error: 'Không đọc được mã' });

  const a = db.prepare(`SELECT a.*, u.name AS checked_in_by_name FROM attendees a
    LEFT JOIN users u ON u.id = a.checked_in_by WHERE a.qr_token = ?`).get(token);

  if (!a) return res.json({ status: 'invalid', message: 'Mã QR không hợp lệ - không có trong hệ thống' });
  if (a.event_id !== ev.id) {
    const other = db.prepare('SELECT name FROM events WHERE id = ?').get(a.event_id);
    return res.json({ status: 'wrong_event', message: `Mã này thuộc sự kiện khác: ${other ? other.name : '?'}`, attendee: a });
  }
  // Hết hạn sau ngày tổ chức sự kiện
  const evDay = new Date(ev.event_date); evDay.setHours(23, 59, 59, 999);
  if (Date.now() > evDay.getTime() && !a.checked_in_at) {
    return res.json({ status: 'expired', message: 'Mã QR đã hết hạn (sự kiện đã kết thúc)', attendee: a });
  }
  if (a.checked_in_at) {
    return res.json({
      status: 'already_used',
      message: `MÃ ĐÃ ĐƯỢC SỬ DỤNG! ${a.name} đã check-in lúc ${new Date(a.checked_in_at + 'Z').toLocaleString('vi-VN')}${a.checked_in_by_name ? ' (NV: ' + a.checked_in_by_name + ')' : ''}. Có thể mã đã bị chuyển cho người khác.`,
      attendee: a,
    });
  }
  // Tự động xác nhận luôn nếu nhân viên bật chế độ này
  if (req.body.auto_confirm) {
    db.prepare("UPDATE attendees SET checked_in_at = datetime('now'), checked_in_by = ? WHERE id = ?").run(req.user.id, a.id);
    return res.json({ status: 'checked_in', message: 'Check-in thành công!', attendee: a });
  }
  res.json({ status: 'valid', message: 'Khách đã đăng ký - hợp lệ', attendee: a });
});

router.post('/events/:id/checkin/:attendeeId', requireLogin, (req, res) => {
  const ev = getEventOr404(req, res); if (!ev) return;
  const a = db.prepare('SELECT * FROM attendees WHERE id = ? AND event_id = ?').get(req.params.attendeeId, ev.id);
  if (!a) return res.status(404).json({ error: 'Không tìm thấy người tham dự' });
  if (a.checked_in_at) return res.status(409).json({ error: 'Người này đã check-in rồi' });
  db.prepare("UPDATE attendees SET checked_in_at = datetime('now'), checked_in_by = ? WHERE id = ?").run(req.user.id, a.id);
  res.json({ ok: true });
});

// Thêm khách vãng lai (chưa đăng ký trước) và check-in luôn
router.post('/events/:id/walkin', requireLogin, (req, res) => {
  const ev = getEventOr404(req, res); if (!ev) return; // nhân viên check-in được phép
  const { name, email, phone, position, company, tax_code, company_size } = req.body;
  if (!name) return res.status(400).json({ error: 'Cần nhập Họ và tên' });
  const info = db.prepare(`INSERT INTO attendees (event_id, name, email, phone, position, company, tax_code, company_size, qr_token, is_walkin, checked_in_at, checked_in_by)
    VALUES (?,?,?,?,?,?,?,?,?,1,datetime('now'),?)`)
    .run(ev.id, name.trim(), (email || '').trim(), String(phone || '').trim(), position || '', company || '', tax_code || '', company_size || '', newToken(), req.user.id);
  res.json({ id: info.lastInsertRowid });
});

// ============ CÀI ĐẶT EMAIL CỦA SỰ KIỆN ============
router.get('/events/:id/email-settings', requireLogin, (req, res) => {
  const ev = getEventOr404(req, res); if (!ev) return;
  res.json(getEmailSettings(ev.id));
});
router.put('/events/:id/email-settings', requireLogin, (req, res) => {
  const ev = getEventOr404(req, res); if (!ev) return;
  if (!canManageEvent(req.user, ev)) return res.status(403).json({ error: 'Bạn không có quyền' });
  const s = getEmailSettings(ev.id);
  const b = req.body;
  db.prepare(`UPDATE email_settings SET confirm_subject=?, confirm_body=?, auto_send_confirm=?,
    thank_subject=?, thank_body=?, thank_delay_minutes=?, thank_enabled=?, header_width=?, footer_width=? WHERE event_id=?`)
    .run(b.confirm_subject ?? s.confirm_subject, b.confirm_body ?? s.confirm_body,
      b.auto_send_confirm ? 1 : 0, b.thank_subject ?? s.thank_subject, b.thank_body ?? s.thank_body,
      Number(b.thank_delay_minutes) || 60, b.thank_enabled ? 1 : 0,
      Math.min(100, Math.max(10, Number(b.header_width) || s.header_width || 100)),
      Math.min(100, Math.max(10, Number(b.footer_width) || s.footer_width || 100)), ev.id);
  res.json({ ok: true });
});

// Upload ảnh header/footer cho email của sự kiện
router.post('/events/:id/email-image/:type', requireLogin, upload.single('file'), (req, res) => {
  const ev = getEventOr404(req, res); if (!ev) return;
  if (!canManageEvent(req.user, ev)) return res.status(403).json({ error: 'Bạn không có quyền' });
  const type = req.params.type;
  if (!['header', 'footer'].includes(type)) return res.status(400).json({ error: 'Loại ảnh không hợp lệ' });
  if (!req.file) return res.status(400).json({ error: 'Chưa chọn ảnh' });
  const ext = (path.extname(req.file.originalname) || '.png').toLowerCase();
  if (!['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) return res.status(400).json({ error: 'Chỉ nhận ảnh PNG, JPG, GIF, WEBP' });
  const filename = `event${ev.id}-${type}${ext}`;
  const s = getEmailSettings(ev.id);
  // Xoá ảnh cũ nếu khác tên
  const old = type === 'header' ? s.header_image : s.footer_image;
  if (old && old !== filename && fs.existsSync(path.join(UPLOAD_DIR, old))) fs.unlinkSync(path.join(UPLOAD_DIR, old));
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), req.file.buffer);
  db.prepare(`UPDATE email_settings SET ${type === 'header' ? 'header_image' : 'footer_image'} = ? WHERE event_id = ?`).run(filename, ev.id);
  res.json({ ok: true, filename });
});

// Xoá ảnh header/footer
router.delete('/events/:id/email-image/:type', requireLogin, (req, res) => {
  const ev = getEventOr404(req, res); if (!ev) return;
  if (!canManageEvent(req.user, ev)) return res.status(403).json({ error: 'Bạn không có quyền' });
  const type = req.params.type;
  if (!['header', 'footer'].includes(type)) return res.status(400).json({ error: 'Loại ảnh không hợp lệ' });
  const s = getEmailSettings(ev.id);
  const old = type === 'header' ? s.header_image : s.footer_image;
  if (old && fs.existsSync(path.join(UPLOAD_DIR, old))) fs.unlinkSync(path.join(UPLOAD_DIR, old));
  db.prepare(`UPDATE email_settings SET ${type === 'header' ? 'header_image' : 'footer_image'} = '' WHERE event_id = ?`).run(ev.id);
  res.json({ ok: true });
});

// Xem trước email trên trình duyệt (dữ liệu mẫu hoặc người đầu tiên trong danh sách)
router.get('/events/:id/email-preview', requireLogin, (req, res) => {
  const ev = getEventOr404(req, res); if (!ev) return;
  const type = req.query.type === 'thank' ? 'thank' : 'confirm';
  const settings = getEmailSettings(ev.id);
  let attendee = db.prepare('SELECT * FROM attendees WHERE event_id = ? ORDER BY id LIMIT 1').get(ev.id);
  if (!attendee) {
    attendee = { id: 0, name: 'Nguyễn Văn A (mẫu)', company: 'Công ty TNHH ABC', qr_token: 'MA-QR-MAU-XEM-TRUOC' };
  }
  const { html } = buildEmail(type, attendee, ev, settings, 'web');
  const subject = fillTemplate(type === 'confirm' ? settings.confirm_subject : settings.thank_subject, attendee, ev)
    || (type === 'confirm' ? `Xác nhận đăng ký: ${ev.name}` : `Cảm ơn bạn đã tham dự ${ev.name}`);
  res.json({ subject, html });
});

// ============ CẤU HÌNH SMTP (gửi email) ============
router.get('/smtp', requireLogin, requireRole('super_admin', 'admin'), (req, res) => {
  const s = db.prepare('SELECT * FROM smtp_settings WHERE id = 1').get();
  res.json({ ...s, smtp_pass: s.smtp_pass ? '********' : '' });
});
router.put('/smtp', requireLogin, requireRole('super_admin', 'admin'), (req, res) => {
  const cur = db.prepare('SELECT * FROM smtp_settings WHERE id = 1').get();
  const b = req.body;
  const pass = (b.smtp_pass && b.smtp_pass !== '********') ? b.smtp_pass : cur.smtp_pass;
  db.prepare('UPDATE smtp_settings SET host=?, port=?, secure=?, smtp_user=?, smtp_pass=?, from_name=? WHERE id=1')
    .run(b.host || 'smtp.gmail.com', Number(b.port) || 465, b.secure ? 1 : 0, b.smtp_user || '', pass, b.from_name || '');
  res.json({ ok: true });
});
router.post('/smtp/test', requireLogin, requireRole('super_admin', 'admin'), async (req, res) => {
  const t = getTransport();
  if (!t) return res.status(400).json({ error: 'Chưa nhập đủ thông tin SMTP' });
  try {
    await t.transporter.sendMail({
      from: t.from, to: req.user.email,
      subject: 'Email kiểm tra - Hệ thống Check-in',
      html: 'Cấu hình email của bạn đã hoạt động! ✔',
    });
    res.json({ ok: true, message: `Đã gửi email kiểm tra tới ${req.user.email}` });
  } catch (e) { res.status(400).json({ error: 'Gửi thất bại: ' + e.message }); }
});

// ============ BÁO CÁO ============
router.get('/events/:id/report', requireLogin, (req, res) => {
  const ev = getEventOr404(req, res); if (!ev) return;
  const rows = db.prepare(`SELECT a.*, u.name AS checked_in_by_name FROM attendees a
    LEFT JOIN users u ON u.id = a.checked_in_by WHERE a.event_id = ? ORDER BY a.checked_in_at DESC, a.id`).all(ev.id);
  const total = rows.length;
  const checkedin = rows.filter(r => r.checked_in_at).length;
  const walkin = rows.filter(r => r.is_walkin).length;
  res.json({ total, checkedin, walkin, not_checkedin: total - checkedin, rows, positions: POSITIONS, company_sizes: COMPANY_SIZES });
});

router.get('/events/:id/report/export', requireLogin, (req, res) => {
  const ev = getEventOr404(req, res); if (!ev) return;
  const rows = db.prepare(`SELECT a.*, u.name AS checked_in_by_name FROM attendees a
    LEFT JOIN users u ON u.id = a.checked_in_by WHERE a.event_id = ? ORDER BY a.id`).all(ev.id);
  const data = rows.map(r => ({
    'Họ và tên': r.name, 'Email': r.email, 'Số điện thoại': r.phone, 'Chức vụ': r.position,
    'Nơi công tác/Tên công ty': r.company, 'MST công ty': r.tax_code, 'Quy mô nhân sự': r.company_size,
    'Đã check-in': r.checked_in_at ? 'Có' : 'Không',
    'Thời gian check-in': r.checked_in_at ? new Date(r.checked_in_at + 'Z').toLocaleString('vi-VN') : '',
    'Nhân viên check-in': r.checked_in_by_name || '',
    'Khách vãng lai': r.is_walkin ? 'Có' : '',
    'Đã gửi email xác nhận': r.confirm_email_sent_at ? 'Có' : 'Không',
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [{ wch: 25 }, { wch: 28 }, { wch: 14 }, { wch: 16 }, { wch: 30 }, { wch: 13 }, { wch: 26 }, { wch: 11 }, { wch: 19 }, { wch: 20 }, { wch: 13 }, { wch: 20 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'BaoCao');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', `attachment; filename="bao-cao-su-kien-${ev.id}.xlsx"`);
  res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(buf);
});

// Danh sách lựa chọn cho form
router.get('/options', requireLogin, (req, res) => res.json({ positions: POSITIONS, company_sizes: COMPANY_SIZES, roles: ROLES }));

module.exports = router;
