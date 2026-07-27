// Sự kiện + Booth + Gán nhân viên vào sự kiện
const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const XLSX = require('xlsx');
const db = require('../db');
const {
  requireLogin, requireRole, getEventOr404, canManageEvent, visibleEventsSql,
  getEmailSettings, eligibilityJson,
} = require('./lib/helpers');
const {
  getAssignment, legacyStaffType, getLegacyRoleIdMap, getDefaultRoleId,
} = require('./lib/permissions');

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
    // Số sự kiện 1 nhân viên được gán thường nhỏ - lấy quyền theo từng sự kiện là đủ nhanh,
    // không cần tối ưu 1 câu SQL gộp (khác GET /events/:id vốn chỉ 1 sự kiện).
    for (const r of rows) {
      const asg = await getAssignment(req.user, r.id);
      r.my_permissions = asg ? [...asg.permissions] : [];
      r.my_staff_type = legacyStaffType(asg); // tương thích ngược cho FE cũ (EventsView.vue)
    }
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
  const staff = (await db.prepare(`
    SELECT u.id, u.name, u.email, s.booth_id, s.role_id, sr.name AS role_name
    FROM event_staff s JOIN users u ON u.id = s.user_id
    LEFT JOIN staff_roles sr ON sr.id = s.role_id
    WHERE s.event_id = ?`).all(ev.id))
    .map(s => ({ ...s, staff_type: legacyStaffType({ roleName: s.role_name }) })); // tương thích ngược FE cũ
  const booths = await db.prepare('SELECT * FROM booths WHERE event_id = ? ORDER BY sort, id').all(ev.id);
  let my_position, my_permissions;
  if (req.user.role === 'checkin') {
    const asg = await getAssignment(req.user, ev.id);
    const boothId = asg ? asg.boothId : null;
    const b = boothId ? booths.find(x => x.id === boothId) : null;
    my_position = { booth_id: b ? b.id : null, name: b ? b.name : 'Cổng check-in', staff_type: legacyStaffType(asg) };
    my_permissions = asg ? [...asg.permissions] : [];
  }
  const badge_count = (await db.prepare('SELECT COUNT(*) AS c FROM badges WHERE event_id = ?').get(ev.id)).c;
  res.json({ ...ev, staff, booths, my_position, my_permissions, badge_count, can_manage: canManageEvent(req.user, ev) });
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

// Gán nhân viên vào sự kiện (thay toàn bộ danh sách). Nhận `role_id` (mô hình quyền tick-chọn
// mới, xem migrations/20260727010000_staff_permissions.js) - vẫn chấp nhận `staff_type` cũ để
// FE cũ chưa cập nhật không bị gãy (tự quy đổi sang role mẫu tương ứng).
router.put('/events/:id/staff', requireLogin, async (req, res) => {
  const ev = await getEventOr404(req, res); if (!ev) return;
  if (!canManageEvent(req.user, ev)) return res.status(403).json({ error: 'Bạn không có quyền' });
  let assignments = Array.isArray(req.body.assignments) ? req.body.assignments : null;
  if (!assignments) {
    const ids = Array.isArray(req.body.user_ids) ? req.body.user_ids : [];
    assignments = ids.map(id => ({ user_id: id, booth_id: null }));
  }
  const validBooths = new Set((await db.prepare('SELECT id FROM booths WHERE event_id = ?').all(ev.id)).map(b => b.id));
  const legacyRoleIdMap = await getLegacyRoleIdMap();
  const defaultRoleId = await getDefaultRoleId();
  await db.prepare('DELETE FROM event_staff WHERE event_id = ?').run(ev.id);
  const ins = db.prepare('INSERT IGNORE INTO event_staff (event_id, user_id, booth_id, role_id, extra_permissions) VALUES (?,?,?,?,?)');
  for (const a of assignments) {
    let bid = a.booth_id && validBooths.has(Number(a.booth_id)) ? Number(a.booth_id) : null;
    let roleId = Number(a.role_id) || null;
    if (!roleId && a.staff_type) {
      roleId = legacyRoleIdMap[a.staff_type] || null;
      if (a.staff_type === 'reception' || a.staff_type === 'manager') bid = null; // giữ đúng quy tắc cũ
    }
    if (!roleId) roleId = defaultRoleId;
    const extra = a.extra_permissions ? JSON.stringify(a.extra_permissions) : null;
    await ins.run(ev.id, a.user_id, bid, roleId, extra);
  }
  res.json({ ok: true });
});

// Đổi quyền/vị trí NHANH cho 1 người (không cần gửi lại toàn bộ danh sách nhân viên) - dùng cho
// màn hình đổi việc tại hiện trường (mục 3 kế hoạch nâng cấp: "đổi việc ≤ 3 chạm").
router.put('/events/:id/staff/:userId', requireLogin, async (req, res) => {
  const ev = await getEventOr404(req, res); if (!ev) return;
  if (!canManageEvent(req.user, ev)) return res.status(403).json({ error: 'Bạn không có quyền' });
  const exists = await db.prepare('SELECT 1 AS ok FROM event_staff WHERE event_id = ? AND user_id = ?').get(ev.id, req.params.userId);
  if (!exists) return res.status(404).json({ error: 'Người này chưa được gán vào sự kiện' });
  const b = req.body;
  const roleId = Number(b.role_id) || (await getDefaultRoleId());
  const validBooth = b.booth_id ? await db.prepare('SELECT 1 AS ok FROM booths WHERE id = ? AND event_id = ?').get(b.booth_id, ev.id) : null;
  const boothId = validBooth ? Number(b.booth_id) : null;
  const extra = b.extra_permissions ? JSON.stringify(b.extra_permissions) : null;
  await db.prepare('UPDATE event_staff SET role_id = ?, booth_id = ?, extra_permissions = ? WHERE event_id = ? AND user_id = ?')
    .run(roleId, boothId, extra, ev.id, req.params.userId);
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
  await db.prepare('INSERT IGNORE INTO event_staff (event_id, user_id, role_id) VALUES (?,?,?)')
    .run(ev.id, info.lastInsertRowid, await getDefaultRoleId());
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
  const defaultRoleId = await getDefaultRoleId();
  let added = 0, assigned = 0; const errors = [];
  const insUser = db.prepare("INSERT INTO users (name, department, unit, email, password_hash, role) VALUES (?,?,?,?,?,'checkin')");
  const insStaff = db.prepare('INSERT IGNORE INTO event_staff (event_id, user_id, booth_id, role_id) VALUES (?,?,NULL,?)');
  for (const [i, r] of rows.entries()) {
    const name = String(r['Họ và tên'] || '').trim();
    const email = String(r['Email đăng nhập'] || r['Email'] || '').trim();
    const password = String(r['Mật khẩu'] || '').trim();
    const dept = String(r['Bộ phận'] || '').trim();
    if (!name && !email) continue;
    const exist = await db.prepare('SELECT id, role FROM users WHERE email = ?').get(email);
    if (exist) {
      if (exist.role === 'checkin') { await insStaff.run(ev.id, exist.id, defaultRoleId); assigned++; }
      else errors.push(`Dòng ${i + 2}: email ${email} đang dùng cho vai trò khác - bỏ qua`);
      continue;
    }
    if (!name || !email || !password) { errors.push(`Dòng ${i + 2}: thiếu Họ tên, Email hoặc Mật khẩu`); continue; }
    const info = await insUser.run(name, dept, unit, email, bcrypt.hashSync(password, 10));
    await insStaff.run(ev.id, info.lastInsertRowid, defaultRoleId);
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
