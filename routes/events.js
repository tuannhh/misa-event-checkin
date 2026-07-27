// Sự kiện + Booth + Gán nhân viên vào sự kiện
const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const XLSX = require('xlsx');
const db = require('../db');
const {
  requireLogin, requireRole, getEventOr404, canManageEvent, visibleEventsSql,
  getEmailSettings, getAssignment, STAFF_TYPES, eligibilityJson,
} = require('./lib/helpers');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ============ SỰ KIỆN ============
router.get('/events', requireLogin, async (req, res) => {
  const v = visibleEventsSql(req.user);
  const rows = await db.prepare(`
    SELECT e.*, u.name AS creator_name,
      (SELECT COUNT(*) FROM attendees a WHERE a.event_id = e.id) AS total_attendees,
      (SELECT COUNT(*) FROM attendees a WHERE a.event_id = e.id AND a.checked_in_at IS NOT NULL) AS total_checkedin
    FROM events e JOIN users u ON u.id = e.created_by
    WHERE ${v.where} ORDER BY e.event_date DESC`).all(...v.params);
  if (req.user.role === 'checkin') {
    const asg = await db.prepare('SELECT event_id, staff_type FROM event_staff WHERE user_id = ?').all(req.user.id);
    const m = new Map(asg.map(a => [a.event_id, STAFF_TYPES.includes(a.staff_type) ? a.staff_type : 'checkin']));
    rows.forEach(r => { r.my_staff_type = m.get(r.id) || 'checkin'; });
  }
  res.json(rows);
});

router.post('/events', requireLogin, requireRole('super_admin', 'admin'), async (req, res) => {
  const { name, event_date, organizer, unit, eligibility_field, eligibility_values } = req.body;
  if (!name || !event_date) return res.status(400).json({ error: 'Cần nhập Tên sự kiện và Thời gian tổ chức' });
  const evUnit = req.user.role === 'super_admin' ? (unit || '') : req.user.unit;
  const [ef, evs] = eligibilityJson(eligibility_field, eligibility_values);
  const info = await db.prepare('INSERT INTO events (name, event_date, organizer, unit, created_by, eligibility_field, eligibility_values) VALUES (?,?,?,?,?,?,?)')
    .run(name.trim(), event_date, organizer || '', evUnit, req.user.id, ef, evs);
  await getEmailSettings(info.lastInsertRowid);
  res.json({ id: info.lastInsertRowid });
});

router.get('/events/:id', requireLogin, async (req, res) => {
  const ev = await getEventOr404(req, res); if (!ev) return;
  const staff = (await db.prepare(`SELECT u.id, u.name, u.email, s.booth_id, s.staff_type FROM event_staff s JOIN users u ON u.id = s.user_id WHERE s.event_id = ?`).all(ev.id))
    .map(s => ({ ...s, staff_type: STAFF_TYPES.includes(s.staff_type) ? s.staff_type : 'checkin' }));
  const booths = await db.prepare('SELECT * FROM booths WHERE event_id = ? ORDER BY sort, id').all(ev.id);
  let my_position;
  if (req.user.role === 'checkin') {
    const mine = await getAssignment(req.user, ev.id);
    const boothId = mine ? mine.booth_id : null;
    const b = boothId ? booths.find(x => x.id === boothId) : null;
    my_position = { booth_id: b ? b.id : null, name: b ? b.name : 'Cổng check-in', staff_type: mine ? mine.staff_type : 'checkin' };
  }
  const badge_count = (await db.prepare('SELECT COUNT(*) AS c FROM badges WHERE event_id = ?').get(ev.id)).c;
  res.json({ ...ev, staff, booths, my_position, badge_count, can_manage: canManageEvent(req.user, ev) });
});

router.put('/events/:id', requireLogin, async (req, res) => {
  const ev = await getEventOr404(req, res); if (!ev) return;
  if (!canManageEvent(req.user, ev)) return res.status(403).json({ error: 'Bạn không có quyền sửa sự kiện này' });
  const { name, event_date, organizer, unit, eligibility_field, eligibility_values } = req.body;
  const evUnit = req.user.role === 'super_admin' ? (unit ?? ev.unit) : ev.unit;
  const [ef, evs] = eligibility_field !== undefined
    ? eligibilityJson(eligibility_field, eligibility_values)
    : [ev.eligibility_field, ev.eligibility_values];
  await db.prepare('UPDATE events SET name=?, event_date=?, organizer=?, unit=?, eligibility_field=?, eligibility_values=? WHERE id=?')
    .run(name ?? ev.name, event_date ?? ev.event_date, organizer ?? ev.organizer, evUnit, ef, evs, ev.id);
  res.json({ ok: true });
});

// ============ BOOTH ============
router.post('/events/:id/booths', requireLogin, async (req, res) => {
  const ev = await getEventOr404(req, res); if (!ev) return;
  if (!canManageEvent(req.user, ev)) return res.status(403).json({ error: 'Bạn không có quyền' });
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Cần nhập tên booth' });
  const max = (await db.prepare('SELECT COALESCE(MAX(sort),0) AS m FROM booths WHERE event_id = ?').get(ev.id)).m;
  const info = await db.prepare('INSERT INTO booths (event_id, name, sort) VALUES (?,?,?)').run(ev.id, name, max + 1);
  res.json({ id: info.lastInsertRowid });
});
router.put('/booths/:id', requireLogin, async (req, res) => {
  const b = await db.prepare('SELECT * FROM booths WHERE id = ?').get(req.params.id);
  if (!b) return res.status(404).json({ error: 'Không tìm thấy booth' });
  const ev = await db.prepare('SELECT * FROM events WHERE id = ?').get(b.event_id);
  if (!canManageEvent(req.user, ev)) return res.status(403).json({ error: 'Bạn không có quyền' });
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Cần nhập tên booth' });
  await db.prepare('UPDATE booths SET name = ? WHERE id = ?').run(name, b.id);
  res.json({ ok: true });
});
router.delete('/booths/:id', requireLogin, async (req, res) => {
  const b = await db.prepare('SELECT * FROM booths WHERE id = ?').get(req.params.id);
  if (!b) return res.status(404).json({ error: 'Không tìm thấy booth' });
  const ev = await db.prepare('SELECT * FROM events WHERE id = ?').get(b.event_id);
  if (!canManageEvent(req.user, ev)) return res.status(403).json({ error: 'Bạn không có quyền' });
  await db.prepare('UPDATE event_staff SET booth_id = NULL WHERE booth_id = ?').run(b.id);
  await db.prepare('DELETE FROM booths WHERE id = ?').run(b.id);
  res.json({ ok: true });
});

router.delete('/events/:id', requireLogin, async (req, res) => {
  const ev = await getEventOr404(req, res); if (!ev) return;
  if (!canManageEvent(req.user, ev)) return res.status(403).json({ error: 'Bạn không có quyền xoá sự kiện này' });
  await db.prepare('DELETE FROM events WHERE id = ?').run(ev.id);
  res.json({ ok: true });
});

// Gán nhân viên check-in cho sự kiện
router.put('/events/:id/staff', requireLogin, async (req, res) => {
  const ev = await getEventOr404(req, res); if (!ev) return;
  if (!canManageEvent(req.user, ev)) return res.status(403).json({ error: 'Bạn không có quyền' });
  let assignments = Array.isArray(req.body.assignments) ? req.body.assignments : null;
  if (!assignments) {
    const ids = Array.isArray(req.body.user_ids) ? req.body.user_ids : [];
    assignments = ids.map(id => ({ user_id: id, booth_id: null }));
  }
  const validBooths = new Set((await db.prepare('SELECT id FROM booths WHERE event_id = ?').all(ev.id)).map(b => b.id));
  await db.prepare('DELETE FROM event_staff WHERE event_id = ?').run(ev.id);
  const ins = db.prepare('INSERT IGNORE INTO event_staff (event_id, user_id, booth_id, staff_type) VALUES (?,?,?,?)');
  for (const a of assignments) {
    const type = STAFF_TYPES.includes(a.staff_type) ? a.staff_type : 'checkin';
    let bid = a.booth_id && validBooths.has(Number(a.booth_id)) ? Number(a.booth_id) : null;
    if (type === 'reception' || type === 'manager') bid = null;
    await ins.run(ev.id, a.user_id, bid, type);
  }
  res.json({ ok: true });
});

router.post('/events/:id/staff/create', requireLogin, requireRole('super_admin', 'admin'), async (req, res) => {
  const ev = await getEventOr404(req, res); if (!ev) return;
  if (!canManageEvent(req.user, ev)) return res.status(403).json({ error: 'Bạn không có quyền' });
  const { name, email, password, department } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Cần nhập Họ tên, Email và Mật khẩu' });
  if (await db.prepare('SELECT 1 AS ok FROM users WHERE email = ?').get(email.trim())) {
    return res.status(409).json({ error: 'Email này đã tồn tại trong hệ thống' });
  }
  const unit = req.user.role === 'admin' ? req.user.unit : (ev.unit || '');
  const info = await db.prepare("INSERT INTO users (name, department, unit, email, password_hash, role) VALUES (?,?,?,?,?,'checkin')")
    .run(name.trim(), department || '', unit, email.trim(), bcrypt.hashSync(password, 10));
  await db.prepare('INSERT IGNORE INTO event_staff (event_id, user_id) VALUES (?,?)').run(ev.id, info.lastInsertRowid);
  res.json({ id: info.lastInsertRowid });
});

router.get('/events/:id/staff/template', requireLogin, requireRole('super_admin', 'admin'), async (req, res) => {
  const ev = await getEventOr404(req, res); if (!ev) return;
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

router.post('/events/:id/staff/import', requireLogin, requireRole('super_admin', 'admin'), upload.single('file'), async (req, res) => {
  const ev = await getEventOr404(req, res); if (!ev) return;
  if (!canManageEvent(req.user, ev)) return res.status(403).json({ error: 'Bạn không có quyền' });
  if (!req.file) return res.status(400).json({ error: 'Chưa chọn file' });
  const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  const unit = req.user.role === 'admin' ? req.user.unit : (ev.unit || '');
  let added = 0, assigned = 0; const errors = [];
  const insUser = db.prepare("INSERT INTO users (name, department, unit, email, password_hash, role) VALUES (?,?,?,?,?,'checkin')");
  const insStaff = db.prepare('INSERT IGNORE INTO event_staff (event_id, user_id, booth_id) VALUES (?,?,NULL)');
  for (const [i, r] of rows.entries()) {
    const name = String(r['Họ và tên'] || '').trim();
    const email = String(r['Email đăng nhập'] || r['Email'] || '').trim();
    const password = String(r['Mật khẩu'] || '').trim();
    const dept = String(r['Bộ phận'] || '').trim();
    if (!name && !email) continue;
    const exist = await db.prepare('SELECT id, role FROM users WHERE email = ?').get(email);
    if (exist) {
      if (exist.role === 'checkin') { await insStaff.run(ev.id, exist.id); assigned++; }
      else errors.push(`Dòng ${i + 2}: email ${email} đang dùng cho vai trò khác - bỏ qua`);
      continue;
    }
    if (!name || !email || !password) { errors.push(`Dòng ${i + 2}: thiếu Họ tên, Email hoặc Mật khẩu`); continue; }
    const info = await insUser.run(name, dept, unit, email, bcrypt.hashSync(password, 10));
    await insStaff.run(ev.id, info.lastInsertRowid);
    added++;
  }
  res.json({ added, assigned, errors });
});

router.get('/events/:id/available-staff', requireLogin, async (req, res) => {
  const ev = await getEventOr404(req, res); if (!ev) return;
  let rows;
  if (req.user.role === 'super_admin') {
    rows = await db.prepare("SELECT id, name, email, unit FROM users WHERE role = 'checkin' ORDER BY name").all();
  } else {
    rows = await db.prepare("SELECT id, name, email, unit FROM users WHERE role = 'checkin' AND unit = ? ORDER BY name").all(req.user.unit);
  }
  res.json(rows);
});

module.exports = router;
