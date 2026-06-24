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
const { sendConfirmEmail, getTransport, deliver, buildEmail, fillTemplate } = require('../email');
const { UPLOAD_DIR } = require('../config');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const POSITIONS = ['CEO/Founder/TGĐ', 'C-Level', 'Chuyên gia', 'Chuyên viên'];
const COMPANY_SIZES = [
  'Dưới 10 người', 'Từ 10 đến dưới 50 người', 'Từ 50 đến dưới 100 người',
  'Từ 100 đến dưới 300 người', 'Từ 300 người đến 500 người', 'Từ 500 người trở lên',
];
const ROLES = ['super_admin', 'admin', 'checkin'];
const SALUTATIONS = ['Anh', 'Chị', 'Ông', 'Bà'];
const IMPORTANCES = ['Bình thường', 'VIP', 'VVIP', 'Speaker', 'Ban lãnh đạo', 'Ban Tổ chức'];
// Các trường có thể dùng làm điều kiện đủ tham dự
const ELIGIBILITY_FIELDS = {
  importance: { label: 'Mức độ quan trọng', options: IMPORTANCES },
  position: { label: 'Chức vụ', options: POSITIONS },
  company_size: { label: 'Quy mô nhân sự', options: COMPANY_SIZES },
  salutation: { label: 'Xưng hô', options: SALUTATIONS },
};

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
// Xét 1 người có đủ điều kiện tham dự theo thiết lập của sự kiện không
function isEligible(attendee, event) {
  if (!event.eligibility_field || !ELIGIBILITY_FIELDS[event.eligibility_field]) return true;
  let vals = [];
  try { vals = JSON.parse(event.eligibility_values || '[]'); } catch (e) {}
  if (!Array.isArray(vals) || !vals.length) return true;
  return vals.includes(attendee[event.eligibility_field]);
}
function fmtVN(isoUtc) {
  return new Date(isoUtc + 'Z').toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
}
// Sự kiện có tổ chức đúng ngày hôm nay không (theo giờ Việt Nam) - dùng để khoá quét theo ngày
function isEventToday(ev) {
  const todayVN = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
  return (ev.event_date || '').slice(0, 10) === todayVN;
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

function eligibilityJson(field, values) {
  if (!field || !ELIGIBILITY_FIELDS[field]) return ['', '[]'];
  const valid = Array.isArray(values) ? values.filter(v => ELIGIBILITY_FIELDS[field].options.includes(v)) : [];
  return [field, JSON.stringify(valid)];
}

router.post('/events', requireLogin, requireRole('super_admin', 'admin'), (req, res) => {
  const { name, event_date, organizer, unit, eligibility_field, eligibility_values } = req.body;
  if (!name || !event_date) return res.status(400).json({ error: 'Cần nhập Tên sự kiện và Thời gian tổ chức' });
  const evUnit = req.user.role === 'super_admin' ? (unit || '') : req.user.unit;
  const [ef, evs] = eligibilityJson(eligibility_field, eligibility_values);
  const info = db.prepare('INSERT INTO events (name, event_date, organizer, unit, created_by, eligibility_field, eligibility_values) VALUES (?,?,?,?,?,?,?)')
    .run(name.trim(), event_date, organizer || '', evUnit, req.user.id, ef, evs);
  getEmailSettings(info.lastInsertRowid);
  res.json({ id: info.lastInsertRowid });
});

router.get('/events/:id', requireLogin, (req, res) => {
  const ev = getEventOr404(req, res); if (!ev) return;
  const staff = db.prepare(`SELECT u.id, u.name, u.email, s.booth_id FROM event_staff s JOIN users u ON u.id = s.user_id WHERE s.event_id = ?`).all(ev.id);
  const booths = db.prepare('SELECT * FROM booths WHERE event_id = ? ORDER BY sort, id').all(ev.id);
  // Vị trí được gán của nhân viên đang đăng nhập (để màn Quét QR khoá đúng chỗ)
  let my_position;
  if (req.user.role === 'checkin') {
    const mine = db.prepare('SELECT booth_id FROM event_staff WHERE event_id = ? AND user_id = ?').get(ev.id, req.user.id);
    const boothId = mine ? mine.booth_id : null;
    const b = boothId ? booths.find(x => x.id === boothId) : null;
    my_position = { booth_id: b ? b.id : null, name: b ? b.name : 'Cổng check-in' };
  }
  res.json({ ...ev, staff, booths, my_position, can_manage: canManageEvent(req.user, ev) });
});

router.put('/events/:id', requireLogin, (req, res) => {
  const ev = getEventOr404(req, res); if (!ev) return;
  if (!canManageEvent(req.user, ev)) return res.status(403).json({ error: 'Bạn không có quyền sửa sự kiện này' });
  const { name, event_date, organizer, unit, eligibility_field, eligibility_values } = req.body;
  const evUnit = req.user.role === 'super_admin' ? (unit ?? ev.unit) : ev.unit;
  const [ef, evs] = eligibility_field !== undefined
    ? eligibilityJson(eligibility_field, eligibility_values)
    : [ev.eligibility_field, ev.eligibility_values];
  db.prepare('UPDATE events SET name=?, event_date=?, organizer=?, unit=?, eligibility_field=?, eligibility_values=? WHERE id=?')
    .run(name ?? ev.name, event_date ?? ev.event_date, organizer ?? ev.organizer, evUnit, ef, evs, ev.id);
  res.json({ ok: true });
});

// ============ BOOTH (hành trình quét QR) ============
router.post('/events/:id/booths', requireLogin, (req, res) => {
  const ev = getEventOr404(req, res); if (!ev) return;
  if (!canManageEvent(req.user, ev)) return res.status(403).json({ error: 'Bạn không có quyền' });
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Cần nhập tên booth' });
  const max = db.prepare('SELECT COALESCE(MAX(sort),0) AS m FROM booths WHERE event_id = ?').get(ev.id).m;
  const info = db.prepare('INSERT INTO booths (event_id, name, sort) VALUES (?,?,?)').run(ev.id, name, max + 1);
  res.json({ id: info.lastInsertRowid });
});
router.put('/booths/:id', requireLogin, (req, res) => {
  const b = db.prepare('SELECT * FROM booths WHERE id = ?').get(req.params.id);
  if (!b) return res.status(404).json({ error: 'Không tìm thấy booth' });
  const ev = db.prepare('SELECT * FROM events WHERE id = ?').get(b.event_id);
  if (!canManageEvent(req.user, ev)) return res.status(403).json({ error: 'Bạn không có quyền' });
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Cần nhập tên booth' });
  db.prepare('UPDATE booths SET name = ? WHERE id = ?').run(name, b.id);
  res.json({ ok: true });
});
router.delete('/booths/:id', requireLogin, (req, res) => {
  const b = db.prepare('SELECT * FROM booths WHERE id = ?').get(req.params.id);
  if (!b) return res.status(404).json({ error: 'Không tìm thấy booth' });
  const ev = db.prepare('SELECT * FROM events WHERE id = ?').get(b.event_id);
  if (!canManageEvent(req.user, ev)) return res.status(403).json({ error: 'Bạn không có quyền' });
  db.prepare('UPDATE event_staff SET booth_id = NULL WHERE booth_id = ?').run(b.id); // NV đang đứng booth này -> chuyển về cổng
  db.prepare('DELETE FROM booths WHERE id = ?').run(b.id);
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
  // Hỗ trợ cả định dạng mới (assignments: [{user_id, booth_id}]) lẫn cũ (user_ids)
  let assignments = Array.isArray(req.body.assignments) ? req.body.assignments : null;
  if (!assignments) {
    const ids = Array.isArray(req.body.user_ids) ? req.body.user_ids : [];
    assignments = ids.map(id => ({ user_id: id, booth_id: null }));
  }
  const validBooths = new Set(db.prepare('SELECT id FROM booths WHERE event_id = ?').all(ev.id).map(b => b.id));
  db.prepare('DELETE FROM event_staff WHERE event_id = ?').run(ev.id);
  const ins = db.prepare('INSERT OR IGNORE INTO event_staff (event_id, user_id, booth_id) VALUES (?,?,?)');
  for (const a of assignments) {
    const bid = a.booth_id && validBooths.has(Number(a.booth_id)) ? Number(a.booth_id) : null;
    ins.run(ev.id, a.user_id, bid);
  }
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

// File Excel mẫu cho danh sách nhân viên check-in (các trường giống nhập tay)
router.get('/events/:id/staff/template', requireLogin, requireRole('super_admin', 'admin'), (req, res) => {
  const ev = getEventOr404(req, res); if (!ev) return;
  const ws = XLSX.utils.aoa_to_sheet([
    ['Họ và tên', 'Bộ phận', 'Email đăng nhập', 'Mật khẩu'],
    ['Nguyễn Văn A', 'Lễ tân', 'le.tan@congty.com', 'MatKhau123'],
    ['(Vị trí đứng (cổng/booth) chọn sau khi import, trong tab Nhân viên)', '', '', ''],
  ]);
  ws['!cols'] = [{ wch: 25 }, { wch: 18 }, { wch: 28 }, { wch: 16 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'NhanVien');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="mau-nhan-vien-checkin.xlsx"');
  res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(buf);
});

// Import danh sách nhân viên check-in từ Excel và gán luôn vào sự kiện
router.post('/events/:id/staff/import', requireLogin, requireRole('super_admin', 'admin'), upload.single('file'), (req, res) => {
  const ev = getEventOr404(req, res); if (!ev) return;
  if (!canManageEvent(req.user, ev)) return res.status(403).json({ error: 'Bạn không có quyền' });
  if (!req.file) return res.status(400).json({ error: 'Chưa chọn file' });
  const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  const unit = req.user.role === 'admin' ? req.user.unit : (ev.unit || '');
  let added = 0, assigned = 0; const errors = [];
  const insUser = db.prepare("INSERT INTO users (name, department, unit, email, password_hash, role) VALUES (?,?,?,?,?,'checkin')");
  const insStaff = db.prepare('INSERT OR IGNORE INTO event_staff (event_id, user_id, booth_id) VALUES (?,?,NULL)');
  for (const [i, r] of rows.entries()) {
    const name = String(r['Họ và tên'] || '').trim();
    const email = String(r['Email đăng nhập'] || r['Email'] || '').trim();
    const password = String(r['Mật khẩu'] || '').trim();
    const dept = String(r['Bộ phận'] || '').trim();
    if (!name && !email) continue; // dòng trống / ghi chú
    const exist = db.prepare('SELECT id, role FROM users WHERE email = ?').get(email);
    if (exist) {
      if (exist.role === 'checkin') { insStaff.run(ev.id, exist.id); assigned++; }
      else errors.push(`Dòng ${i + 2}: email ${email} đang dùng cho vai trò khác - bỏ qua`);
      continue;
    }
    if (!name || !email || !password) { errors.push(`Dòng ${i + 2}: thiếu Họ tên, Email hoặc Mật khẩu`); continue; }
    const info = insUser.run(name, dept, unit, email, bcrypt.hashSync(password, 10));
    insStaff.run(ev.id, info.lastInsertRowid);
    added++;
  }
  res.json({ added, assigned, errors });
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
  if (req.user.role === 'checkin') {
    // Nhân viên check-in chỉ xem danh sách người ĐÃ check-in
    if (req.query.all !== '1') rows = rows.filter(r => r.checked_in_at);
  } else {
    // Mục 4: khách vãng lai KHÔNG nằm trong danh sách đăng ký (chỉ xuất hiện ở Báo cáo)
    rows = rows.filter(r => !r.is_walkin);
  }
  res.json(rows.map(r => ({ ...r, eligible: isEligible(r, ev) })));
});

router.post('/events/:id/attendees', requireLogin, (req, res) => {
  const ev = getEventOr404(req, res); if (!ev) return;
  if (!canManageEvent(req.user, ev)) return res.status(403).json({ error: 'Bạn không có quyền thêm người tham dự' });
  const { name, email, phone, position, company, tax_code, company_size, salutation, importance, force } = req.body;
  if (!name) return res.status(400).json({ error: 'Cần nhập Họ và tên' });
  if (phone) {
    const dup = db.prepare('SELECT name, phone FROM attendees WHERE event_id = ? AND phone = ?').get(ev.id, String(phone).trim());
    if (dup && !force) {
      return res.status(409).json({ duplicate: true, error: `Số điện thoại ${dup.phone} đã có trong danh sách (${dup.name}). Bạn có chắc muốn thêm?` });
    }
  }
  const info = db.prepare(`INSERT INTO attendees (event_id, name, email, phone, position, company, tax_code, company_size, salutation, importance, qr_token)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(ev.id, name.trim(), (email || '').trim(), String(phone || '').trim(), position || '', company || '', tax_code || '', company_size || '',
      salutation || '', importance || 'Bình thường', newToken());
  const attendee = db.prepare('SELECT * FROM attendees WHERE id = ?').get(info.lastInsertRowid);
  // Tự động gửi email xác nhận nếu đã bật (bỏ qua người không đủ điều kiện)
  const settings = getEmailSettings(ev.id);
  let emailResult = null;
  if (settings.auto_send_confirm && attendee.email && isEligible(attendee, ev)) {
    sendConfirmEmail(attendee, ev, settings).then(() => {}).catch(e => console.error('Lỗi gửi email:', e.message));
    emailResult = 'sending';
  }
  res.json({ id: attendee.id, email: emailResult });
});

// Sửa thông tin người tham dự
router.put('/attendees/:id', requireLogin, (req, res) => {
  const a = db.prepare('SELECT * FROM attendees WHERE id = ?').get(req.params.id);
  if (!a) return res.status(404).json({ error: 'Không tìm thấy người tham dự' });
  const ev = db.prepare('SELECT * FROM events WHERE id = ?').get(a.event_id);
  if (!canManageEvent(req.user, ev)) return res.status(403).json({ error: 'Bạn không có quyền sửa' });
  const b = req.body;
  if (b.name !== undefined && !String(b.name).trim()) return res.status(400).json({ error: 'Họ và tên không được để trống' });
  const newPhone = b.phone !== undefined ? String(b.phone).trim() : a.phone;
  if (newPhone && newPhone !== a.phone) {
    const dup = db.prepare('SELECT name, phone FROM attendees WHERE event_id = ? AND phone = ? AND id != ?').get(ev.id, newPhone, a.id);
    if (dup && !b.force) {
      return res.status(409).json({ duplicate: true, error: `Số điện thoại ${dup.phone} đã có trong danh sách (${dup.name}). Vẫn lưu?` });
    }
  }
  db.prepare(`UPDATE attendees SET name=?, email=?, phone=?, position=?, company=?, tax_code=?, company_size=?, salutation=?, importance=? WHERE id=?`)
    .run((b.name ?? a.name).trim(), (b.email ?? a.email).trim(), newPhone, b.position ?? a.position, b.company ?? a.company,
      b.tax_code ?? a.tax_code, b.company_size ?? a.company_size, b.salutation ?? a.salutation, b.importance ?? a.importance, a.id);
  res.json({ ok: true });
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
    ['Xưng hô', 'Họ và tên', 'Email', 'Số điện thoại', 'Chức vụ', 'Mức độ quan trọng', 'Nơi công tác/Tên công ty', 'MST công ty', 'Quy mô nhân sự'],
    ['Anh', 'Nguyễn Văn B', 'vanb@congty.com', '0912345678', 'CEO/Founder/TGĐ', 'VIP', 'Công ty TNHH ABC', '0101234567', 'Từ 50 đến dưới 100 người'],
    [],
    ['Xưng hô hợp lệ:', SALUTATIONS.join(' | ')],
    ['Chức vụ hợp lệ:', POSITIONS.join(' | ')],
    ['Mức độ hợp lệ:', IMPORTANCES.join(' | ')],
    ['Quy mô hợp lệ:', COMPANY_SIZES.join(' | ')],
  ]);
  ws['!cols'] = [{ wch: 10 }, { wch: 25 }, { wch: 28 }, { wch: 15 }, { wch: 18 }, { wch: 16 }, { wch: 30 }, { wch: 14 }, { wch: 28 }];
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
    const imp = String(r['Mức độ quan trọng'] || '').trim();
    const info = db.prepare(`INSERT INTO attendees (event_id, name, email, phone, position, company, tax_code, company_size, salutation, importance, qr_token)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(ev.id, name, String(r['Email'] || '').trim(), phone, String(r['Chức vụ'] || '').trim(),
        String(r['Nơi công tác/Tên công ty'] || r['Nơi công tác'] || r['Tên công ty'] || '').trim(),
        String(r['MST công ty'] || '').trim(), String(r['Quy mô nhân sự'] || '').trim(),
        String(r['Xưng hô'] || '').trim(), IMPORTANCES.includes(imp) ? imp : 'Bình thường', newToken());
    newIds.push(info.lastInsertRowid);
    added++;
  }
  // Tự động gửi email xác nhận nếu đã bật (bỏ qua người không đủ điều kiện)
  const settings = getEmailSettings(ev.id);
  if (settings.auto_send_confirm && getTransport()) {
    (async () => {
      for (const id of newIds) {
        const a = db.prepare('SELECT * FROM attendees WHERE id = ?').get(id);
        if (a && a.email && isEligible(a, ev)) {
          try { await sendConfirmEmail(a, ev, settings); }
          catch (e) { console.error('Lỗi gửi email cho', a.email, e.message); }
        }
      }
    })();
  }
  res.json({ added, errors, auto_email: !!(settings.auto_send_confirm && getTransport()) });
});

// Ảnh QR công khai theo mã token (dùng trong email gửi qua Brevo - ai có token tức là chủ của mã QR đó)
router.get('/qr/:token.png', async (req, res) => {
  const a = db.prepare('SELECT qr_token FROM attendees WHERE qr_token = ?').get(req.params.token);
  if (!a) return res.status(404).end();
  const png = await QRCode.toBuffer(a.qr_token, { width: 300, margin: 2 });
  res.type('png').send(png);
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
  if (!isEligible(a, ev)) return res.status(403).json({ error: 'Người này KHÔNG đủ điều kiện tham dự (theo thiết lập của sự kiện) nên không thể gửi email' });
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
  const all = db.prepare("SELECT * FROM attendees WHERE event_id = ? AND confirm_email_sent_at IS NULL AND email != ''").all(ev.id);
  const pending = all.filter(a => isEligible(a, ev));
  const skipped = all.length - pending.length;
  let sent = 0; const errors = [];
  for (const a of pending) {
    try { await sendConfirmEmail(a, ev, settings); sent++; }
    catch (e) { errors.push(`${a.email}: ${e.message}`); }
  }
  res.json({ sent, total: pending.length, skipped, errors });
});

// ============ CHECK-IN (QUÉT QR) ============
router.post('/events/:id/scan', requireLogin, (req, res) => {
  const ev = getEventOr404(req, res); if (!ev) return;
  // Mục 3: nhân viên check-in chỉ được quét vào đúng ngày tổ chức (chặn sớm, bất kể mã nào)
  if (req.user.role === 'checkin' && !isEventToday(ev)) {
    return res.status(403).json({ error: 'Chỉ được quét vào đúng ngày tổ chức sự kiện' });
  }
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

  // Nhân viên check-in bị KHOÁ đúng vị trí được gán; quản lý (admin/super_admin) quét tự do
  let boothId = req.body.booth_id ? Number(req.body.booth_id) : null;
  if (req.user.role === 'checkin') {
    const mine = db.prepare('SELECT booth_id FROM event_staff WHERE event_id = ? AND user_id = ?').get(ev.id, req.user.id);
    if (!mine) return res.status(403).json({ error: 'Bạn chưa được gán vào sự kiện này' });
    boothId = mine.booth_id || null; // luôn dùng vị trí được gán
  }

  // ----- Quét tại BOOTH: ghi nhận hành trình tham quan -----
  if (boothId) {
    const booth = db.prepare('SELECT * FROM booths WHERE id = ? AND event_id = ?').get(boothId, ev.id);
    if (!booth) return res.status(400).json({ error: 'Booth không tồn tại trong sự kiện này' });
    const existed = db.prepare('SELECT * FROM booth_visits WHERE booth_id = ? AND attendee_id = ?').get(booth.id, a.id);
    if (existed) {
      return res.json({ status: 'booth_already', message: `${a.name} đã ghé booth "${booth.name}" lúc ${fmtVN(existed.visited_at)}`, attendee: a, booth: booth.name });
    }
    db.prepare('INSERT INTO booth_visits (event_id, booth_id, attendee_id, visited_by) VALUES (?,?,?,?)').run(ev.id, booth.id, a.id, req.user.id);
    return res.json({ status: 'booth_recorded', message: `Đã ghi nhận ghé booth "${booth.name}"`, attendee: a, booth: booth.name, gate_checked_in: !!a.checked_in_at });
  }

  // ----- Quét tại CỔNG CHECK-IN -----
  // QR được phép quét nhiều lần; lần đầu ghi nhận thời điểm check-in, các lần sau chỉ hiển thị thông tin
  if (a.checked_in_at) {
    return res.json({
      status: 'already_checked',
      message: `Khách ĐÃ check-in trước đó lúc ${fmtVN(a.checked_in_at)}${a.checked_in_by_name ? ' (NV: ' + a.checked_in_by_name + ')' : ''}`,
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

// Thêm khách vãng lai (chưa đăng ký trước) và check-in luôn.
// Nếu nhân viên đứng ở booth (hoặc quản lý chọn booth) -> ghi nhận luôn lượt ghé booth đó.
router.post('/events/:id/walkin', requireLogin, (req, res) => {
  const ev = getEventOr404(req, res); if (!ev) return; // nhân viên check-in được phép
  if (req.user.role === 'checkin' && !isEventToday(ev)) return res.status(403).json({ error: 'Chỉ được thêm khách vào đúng ngày tổ chức sự kiện' });
  const { name, email, phone, position, company, tax_code, company_size, salutation, importance } = req.body;
  if (!name) return res.status(400).json({ error: 'Cần nhập Họ và tên' });
  // Xác định vị trí ghi nhận: nhân viên dùng đúng vị trí được gán; quản lý dùng booth gửi lên (nếu hợp lệ)
  let boothId = req.body.booth_id ? Number(req.body.booth_id) : null;
  if (req.user.role === 'checkin') {
    const mine = db.prepare('SELECT booth_id FROM event_staff WHERE event_id = ? AND user_id = ?').get(ev.id, req.user.id);
    if (!mine) return res.status(403).json({ error: 'Bạn chưa được gán vào sự kiện này' });
    boothId = mine.booth_id || null;
  } else if (boothId && !db.prepare('SELECT 1 FROM booths WHERE id = ? AND event_id = ?').get(boothId, ev.id)) {
    boothId = null;
  }
  const info = db.prepare(`INSERT INTO attendees (event_id, name, email, phone, position, company, tax_code, company_size, salutation, importance, qr_token, is_walkin, checked_in_at, checked_in_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,1,datetime('now'),?)`)
    .run(ev.id, name.trim(), (email || '').trim(), String(phone || '').trim(), position || '', company || '', tax_code || '', company_size || '',
      salutation || '', importance || 'Bình thường', newToken(), req.user.id);
  if (boothId) {
    db.prepare('INSERT OR IGNORE INTO booth_visits (event_id, booth_id, attendee_id, visited_by) VALUES (?,?,?,?)').run(ev.id, boothId, info.lastInsertRowid, req.user.id);
  }
  const booth = boothId ? db.prepare('SELECT name FROM booths WHERE id = ?').get(boothId) : null;
  res.json({ id: info.lastInsertRowid, booth_id: boothId, booth_name: booth ? booth.name : null });
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

// Upload ảnh header/footer cho email của sự kiện (lưu thẳng vào database để Litestream sao lưu được)
const MIME_BY_EXT = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };
router.post('/events/:id/email-image/:type', requireLogin, upload.single('file'), (req, res) => {
  const ev = getEventOr404(req, res); if (!ev) return;
  if (!canManageEvent(req.user, ev)) return res.status(403).json({ error: 'Bạn không có quyền' });
  const type = req.params.type;
  if (!['header', 'footer'].includes(type)) return res.status(400).json({ error: 'Loại ảnh không hợp lệ' });
  if (!req.file) return res.status(400).json({ error: 'Chưa chọn ảnh' });
  const ext = (path.extname(req.file.originalname) || '.png').toLowerCase();
  if (!MIME_BY_EXT[ext]) return res.status(400).json({ error: 'Chỉ nhận ảnh PNG, JPG, GIF, WEBP' });
  getEmailSettings(ev.id);
  db.prepare('INSERT INTO email_images (event_id, kind, mime, data) VALUES (?,?,?,?) ON CONFLICT(event_id, kind) DO UPDATE SET mime=excluded.mime, data=excluded.data')
    .run(ev.id, type, MIME_BY_EXT[ext], req.file.buffer);
  // Cột này dùng làm "cờ" báo có ảnh + lưu mime (giao diện cũ vẫn hoạt động)
  db.prepare(`UPDATE email_settings SET ${type === 'header' ? 'header_image' : 'footer_image'} = ? WHERE event_id = ?`).run(MIME_BY_EXT[ext], ev.id);
  res.json({ ok: true });
});

// Xoá ảnh header/footer
router.delete('/events/:id/email-image/:type', requireLogin, (req, res) => {
  const ev = getEventOr404(req, res); if (!ev) return;
  if (!canManageEvent(req.user, ev)) return res.status(403).json({ error: 'Bạn không có quyền' });
  const type = req.params.type;
  if (!['header', 'footer'].includes(type)) return res.status(400).json({ error: 'Loại ảnh không hợp lệ' });
  getEmailSettings(ev.id);
  db.prepare('DELETE FROM email_images WHERE event_id = ? AND kind = ?').run(ev.id, type);
  db.prepare(`UPDATE email_settings SET ${type === 'header' ? 'header_image' : 'footer_image'} = '' WHERE event_id = ?`).run(ev.id);
  res.json({ ok: true });
});

// Phục vụ ảnh header/footer từ database (công khai - để email gửi qua Brevo lấy được ảnh)
router.get('/events/:id/email-image/:type.img', (req, res) => {
  const row = db.prepare('SELECT mime, data FROM email_images WHERE event_id = ? AND kind = ?').get(req.params.id, req.params.type);
  if (!row) return res.status(404).end();
  res.type(row.mime).set('Cache-Control', 'no-cache').send(row.data);
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
  res.json({ ...s, smtp_pass: s.smtp_pass ? '********' : '', brevo_api_key: s.brevo_api_key ? '********' : '' });
});
router.put('/smtp', requireLogin, requireRole('super_admin', 'admin'), (req, res) => {
  const cur = db.prepare('SELECT * FROM smtp_settings WHERE id = 1').get();
  const b = req.body;
  const pass = (b.smtp_pass && b.smtp_pass !== '********') ? b.smtp_pass : cur.smtp_pass;
  const brevoKey = b.brevo_api_key === '********' ? cur.brevo_api_key : (b.brevo_api_key || '').trim();
  db.prepare('UPDATE smtp_settings SET host=?, port=?, secure=?, smtp_user=?, smtp_pass=?, from_name=?, brevo_api_key=?, sender_email=? WHERE id=1')
    .run(b.host || 'smtp.gmail.com', Number(b.port) || 465, b.secure ? 1 : 0, b.smtp_user || '', pass, b.from_name || '', brevoKey, (b.sender_email || '').trim());
  res.json({ ok: true });
});
router.post('/smtp/test', requireLogin, requireRole('super_admin', 'admin'), async (req, res) => {
  const t = getTransport();
  if (!t) return res.status(400).json({ error: 'Chưa nhập đủ thông tin gửi email' });
  try {
    await deliver(t, {
      to: req.user.email,
      subject: 'Email kiểm tra - MISA Event Check-in',
      html: `Cấu hình email của bạn đã hoạt động! ✔ (Kênh gửi: ${t.provider === 'brevo' ? 'Brevo' : 'SMTP'})`,
    });
    res.json({ ok: true, message: `Đã gửi email kiểm tra tới ${req.user.email} qua ${t.provider === 'brevo' ? 'Brevo' : 'SMTP'}` });
  } catch (e) { res.status(400).json({ error: 'Gửi thất bại: ' + e.message }); }
});

// ============ BÁO CÁO ============
function attachBoothVisits(eventId, rows) {
  const visits = db.prepare(`SELECT v.attendee_id, v.visited_at, b.name FROM booth_visits v
    JOIN booths b ON b.id = v.booth_id WHERE v.event_id = ? ORDER BY v.visited_at`).all(eventId);
  const byAttendee = {};
  for (const v of visits) (byAttendee[v.attendee_id] = byAttendee[v.attendee_id] || []).push({ name: v.name, visited_at: v.visited_at });
  return rows.map(r => ({ ...r, booth_visits: byAttendee[r.id] || [] }));
}

router.get('/events/:id/report', requireLogin, (req, res) => {
  const ev = getEventOr404(req, res); if (!ev) return;
  let rows = db.prepare(`SELECT a.*, u.name AS checked_in_by_name FROM attendees a
    LEFT JOIN users u ON u.id = a.checked_in_by WHERE a.event_id = ? ORDER BY a.checked_in_at DESC, a.id`).all(ev.id);
  rows = attachBoothVisits(ev.id, rows).map(r => ({ ...r, eligible: isEligible(r, ev) }));
  const total = rows.length;
  const checkedin = rows.filter(r => r.checked_in_at).length;
  const walkin = rows.filter(r => r.is_walkin).length;
  // Thống kê lượt ghé từng booth
  const booths = db.prepare(`SELECT b.id, b.name, COUNT(v.id) AS visit_count FROM booths b
    LEFT JOIN booth_visits v ON v.booth_id = b.id WHERE b.event_id = ? GROUP BY b.id ORDER BY b.sort, b.id`).all(ev.id);
  res.json({ total, checkedin, walkin, not_checkedin: total - checkedin, rows, booths,
    positions: POSITIONS, company_sizes: COMPANY_SIZES, importances: IMPORTANCES });
});

router.get('/events/:id/report/export', requireLogin, (req, res) => {
  const ev = getEventOr404(req, res); if (!ev) return;
  let rows = db.prepare(`SELECT a.*, u.name AS checked_in_by_name FROM attendees a
    LEFT JOIN users u ON u.id = a.checked_in_by WHERE a.event_id = ? ORDER BY a.id`).all(ev.id);
  rows = attachBoothVisits(ev.id, rows);
  const data = rows.map(r => ({
    'Xưng hô': r.salutation, 'Họ và tên': r.name, 'Email': r.email, 'Số điện thoại': r.phone,
    'Chức vụ': r.position, 'Mức độ quan trọng': r.importance,
    'Nơi công tác/Tên công ty': r.company, 'MST công ty': r.tax_code, 'Quy mô nhân sự': r.company_size,
    'Đủ điều kiện': isEligible(r, ev) ? 'Có' : 'Không',
    'Đã check-in': r.checked_in_at ? 'Có' : 'Không',
    'Thời gian check-in': r.checked_in_at ? fmtVN(r.checked_in_at) : '',
    'Nhân viên check-in': r.checked_in_by_name || '',
    'Booth đã ghé': r.booth_visits.map(v => `${v.name} (${fmtVN(v.visited_at)})`).join('; '),
    'Số booth đã ghé': r.booth_visits.length,
    'Khách vãng lai': r.is_walkin ? 'Có' : '',
    'Đã gửi email xác nhận': r.confirm_email_sent_at ? 'Có' : 'Không',
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [{ wch: 8 }, { wch: 25 }, { wch: 28 }, { wch: 14 }, { wch: 16 }, { wch: 15 }, { wch: 30 }, { wch: 13 }, { wch: 26 }, { wch: 11 }, { wch: 11 }, { wch: 19 }, { wch: 20 }, { wch: 45 }, { wch: 12 }, { wch: 13 }, { wch: 20 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'BaoCao');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', `attachment; filename="bao-cao-su-kien-${ev.id}.xlsx"`);
  res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(buf);
});

// Danh sách lựa chọn cho form
router.get('/options', requireLogin, (req, res) => res.json({
  positions: POSITIONS, company_sizes: COMPANY_SIZES, roles: ROLES,
  salutations: SALUTATIONS, importances: IMPORTANCES,
  eligibility_fields: Object.fromEntries(Object.entries(ELIGIBILITY_FIELDS).map(([k, v]) => [k, v])),
}));

module.exports = router;
