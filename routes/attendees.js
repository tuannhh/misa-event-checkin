// Người tham dự: CRUD, import Excel, ảnh QR, gửi email xác nhận
const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const QRCode = require('qrcode');
const db = require('../db');
const { sendConfirmEmail, getTransport } = require('../email');
const {
  requireLogin, getEventOr404, canManageEvent, canViewEvent, getAssignment, getEmailSettings,
  newToken, isEligible, POSITIONS, COMPANY_SIZES, IMPORTANCES, SALUTATIONS,
} = require('./lib/helpers');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ============ NGƯỜI THAM DỰ ============
router.get('/events/:id/attendees', requireLogin, async (req, res) => {
  const ev = await getEventOr404(req, res); if (!ev) return;
  let rows = await db.prepare(`
    SELECT a.*, u.name AS checked_in_by_name FROM attendees a
    LEFT JOIN users u ON u.id = a.checked_in_by
    WHERE a.event_id = ? ORDER BY a.id DESC`).all(ev.id);
  if (req.user.role === 'checkin') {
    const asg = await getAssignment(req.user, ev.id);
    const type = asg ? asg.staff_type : 'checkin';
    if (type === 'reception') {
      // Lễ tân in QR: xem TOÀN BỘ khách
    } else if (type === 'supervisor' || type === 'manager') {
      rows = [];
    } else if (req.query.all !== '1') {
      rows = rows.filter(r => r.checked_in_at);
    }
  } else {
    rows = rows.filter(r => !r.is_walkin);
  }
  res.json(rows.map(r => ({ ...r, eligible: isEligible(r, ev) })));
});

router.post('/events/:id/attendees', requireLogin, async (req, res) => {
  const ev = await getEventOr404(req, res); if (!ev) return;
  if (!canManageEvent(req.user, ev)) return res.status(403).json({ error: 'Bạn không có quyền thêm người tham dự' });
  const { name, email, phone, position, company, tax_code, company_size, salutation, importance, force } = req.body;
  if (!name) return res.status(400).json({ error: 'Cần nhập Họ và tên' });
  if (phone) {
    const dup = await db.prepare('SELECT name, phone FROM attendees WHERE event_id = ? AND phone = ?').get(ev.id, String(phone).trim());
    if (dup && !force) {
      return res.status(409).json({ duplicate: true, error: `Số điện thoại ${dup.phone} đã có trong danh sách (${dup.name}). Bạn có chắc muốn thêm?` });
    }
  }
  const info = await db.prepare(`INSERT INTO attendees (event_id, name, email, phone, position, company, tax_code, company_size, salutation, importance, qr_token)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(ev.id, name.trim(), (email || '').trim(), String(phone || '').trim(), position || '', company || '', tax_code || '', company_size || '',
      salutation || '', importance || 'Bình thường', newToken());
  const attendee = await db.prepare('SELECT * FROM attendees WHERE id = ?').get(info.lastInsertRowid);
  const settings = await getEmailSettings(ev.id);
  let emailResult = null;
  if (settings.auto_send_confirm && attendee.email && isEligible(attendee, ev)) {
    sendConfirmEmail(attendee, ev, settings).then(() => {}).catch(e => console.error('Lỗi gửi email:', e.message));
    emailResult = 'sending';
  }
  res.json({ id: attendee.id, email: emailResult });
});

router.put('/attendees/:id', requireLogin, async (req, res) => {
  const a = await db.prepare('SELECT * FROM attendees WHERE id = ?').get(req.params.id);
  if (!a) return res.status(404).json({ error: 'Không tìm thấy người tham dự' });
  const ev = await db.prepare('SELECT * FROM events WHERE id = ?').get(a.event_id);
  if (!canManageEvent(req.user, ev)) return res.status(403).json({ error: 'Bạn không có quyền sửa' });
  const b = req.body;
  if (b.name !== undefined && !String(b.name).trim()) return res.status(400).json({ error: 'Họ và tên không được để trống' });
  const newPhone = b.phone !== undefined ? String(b.phone).trim() : a.phone;
  if (newPhone && newPhone !== a.phone) {
    const dup = await db.prepare('SELECT name, phone FROM attendees WHERE event_id = ? AND phone = ? AND id != ?').get(ev.id, newPhone, a.id);
    if (dup && !b.force) {
      return res.status(409).json({ duplicate: true, error: `Số điện thoại ${dup.phone} đã có trong danh sách (${dup.name}). Vẫn lưu?` });
    }
  }
  await db.prepare(`UPDATE attendees SET name=?, email=?, phone=?, position=?, company=?, tax_code=?, company_size=?, salutation=?, importance=? WHERE id=?`)
    .run((b.name ?? a.name).trim(), (b.email ?? a.email).trim(), newPhone, b.position ?? a.position, b.company ?? a.company,
      b.tax_code ?? a.tax_code, b.company_size ?? a.company_size, b.salutation ?? a.salutation, b.importance ?? a.importance, a.id);
  res.json({ ok: true });
});

router.delete('/attendees/:id', requireLogin, async (req, res) => {
  const a = await db.prepare('SELECT * FROM attendees WHERE id = ?').get(req.params.id);
  if (!a) return res.status(404).json({ error: 'Không tìm thấy' });
  const ev = await db.prepare('SELECT * FROM events WHERE id = ?').get(a.event_id);
  if (!canManageEvent(req.user, ev)) return res.status(403).json({ error: 'Bạn không có quyền' });
  await db.prepare('DELETE FROM attendees WHERE id = ?').run(a.id);
  res.json({ ok: true });
});

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

router.post('/events/:id/attendees/import', requireLogin, upload.single('file'), async (req, res) => {
  const ev = await getEventOr404(req, res); if (!ev) return;
  if (!canManageEvent(req.user, ev)) return res.status(403).json({ error: 'Bạn không có quyền' });
  if (!req.file) return res.status(400).json({ error: 'Chưa chọn file' });
  const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  let added = 0; const errors = []; const newIds = [];
  for (const [i, r] of rows.entries()) {
    const name = String(r['Họ và tên'] || '').trim();
    if (!name) continue;
    const phone = String(r['Số điện thoại'] || '').trim();
    if (phone && await db.prepare('SELECT 1 AS ok FROM attendees WHERE event_id = ? AND phone = ?').get(ev.id, phone)) {
      errors.push(`Dòng ${i + 2}: số điện thoại ${phone} (${name}) đã có trong danh sách - bỏ qua`);
      continue;
    }
    const imp = String(r['Mức độ quan trọng'] || '').trim();
    const info = await db.prepare(`INSERT INTO attendees (event_id, name, email, phone, position, company, tax_code, company_size, salutation, importance, qr_token)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(ev.id, name, String(r['Email'] || '').trim(), phone, String(r['Chức vụ'] || '').trim(),
        String(r['Nơi công tác/Tên công ty'] || r['Nơi công tác'] || r['Tên công ty'] || '').trim(),
        String(r['MST công ty'] || '').trim(), String(r['Quy mô nhân sự'] || '').trim(),
        String(r['Xưng hô'] || '').trim(), IMPORTANCES.includes(imp) ? imp : 'Bình thường', newToken());
    newIds.push(info.lastInsertRowid);
    added++;
  }
  const settings = await getEmailSettings(ev.id);
  const transportOn = !!(settings.auto_send_confirm && (await getTransport()));
  if (transportOn) {
    (async () => {
      for (const id of newIds) {
        const a = await db.prepare('SELECT * FROM attendees WHERE id = ?').get(id);
        if (a && a.email && isEligible(a, ev)) {
          try { await sendConfirmEmail(a, ev, settings); }
          catch (e) { console.error('Lỗi gửi email cho', a.email, e.message); }
        }
      }
    })();
  }
  res.json({ added, errors, auto_email: transportOn });
});

// Ảnh QR công khai theo mã token
router.get('/qr/:token.png', async (req, res) => {
  const a = await db.prepare('SELECT qr_token FROM attendees WHERE qr_token = ?').get(req.params.token);
  if (!a) return res.status(404).end();
  const png = await QRCode.toBuffer(a.qr_token, { width: 300, margin: 2 });
  res.type('png').send(png);
});

router.get('/attendees/:id/qr.png', requireLogin, async (req, res) => {
  if (req.params.id === '0') {
    const png = await QRCode.toBuffer('MA-QR-MAU-XEM-TRUOC', { width: 300, margin: 2 });
    return res.type('png').send(png);
  }
  const a = await db.prepare('SELECT * FROM attendees WHERE id = ?').get(req.params.id);
  if (!a) return res.status(404).end();
  const ev = await db.prepare('SELECT * FROM events WHERE id = ?').get(a.event_id);
  if (!(await canViewEvent(req.user, ev))) return res.status(403).end();
  const png = await QRCode.toBuffer(a.qr_token, { width: 300, margin: 2 });
  res.type('png').send(png);
});

// Gửi (lại) email xác nhận cho 1 người
router.post('/attendees/:id/send-email', requireLogin, async (req, res) => {
  const a = await db.prepare('SELECT * FROM attendees WHERE id = ?').get(req.params.id);
  if (!a) return res.status(404).json({ error: 'Không tìm thấy' });
  const ev = await db.prepare('SELECT * FROM events WHERE id = ?').get(a.event_id);
  if (!canManageEvent(req.user, ev)) return res.status(403).json({ error: 'Bạn không có quyền' });
  if (!isEligible(a, ev)) return res.status(403).json({ error: 'Người này KHÔNG đủ điều kiện tham dự (theo thiết lập của sự kiện) nên không thể gửi email' });
  try {
    await sendConfirmEmail(a, ev, await getEmailSettings(ev.id));
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/events/:id/send-emails', requireLogin, async (req, res) => {
  const ev = await getEventOr404(req, res); if (!ev) return;
  if (!canManageEvent(req.user, ev)) return res.status(403).json({ error: 'Bạn không có quyền' });
  if (!(await getTransport())) return res.status(400).json({ error: 'Chưa cấu hình gửi email (vào mục Cấu hình Email)' });
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Boolean) : [];
  if (!ids.length) return res.status(400).json({ error: 'Chưa chọn người nào' });
  const settings = await getEmailSettings(ev.id);
  let sent = 0, skipped = 0; const errors = [];
  for (const id of ids) {
    const a = await db.prepare('SELECT * FROM attendees WHERE id = ? AND event_id = ?').get(id, ev.id);
    if (!a || !a.email) { skipped++; continue; }
    if (!isEligible(a, ev)) { skipped++; continue; }
    try { await sendConfirmEmail(a, ev, settings); sent++; }
    catch (e) { errors.push(`${a.email}: ${e.message}`); }
  }
  res.json({ sent, skipped, errors });
});

router.post('/events/:id/send-all-emails', requireLogin, async (req, res) => {
  const ev = await getEventOr404(req, res); if (!ev) return;
  if (!canManageEvent(req.user, ev)) return res.status(403).json({ error: 'Bạn không có quyền' });
  if (!(await getTransport())) return res.status(400).json({ error: 'Chưa cấu hình SMTP (vào mục Cài đặt Email)' });
  const settings = await getEmailSettings(ev.id);
  const all = await db.prepare("SELECT * FROM attendees WHERE event_id = ? AND confirm_email_sent_at IS NULL AND email != ''").all(ev.id);
  const pending = all.filter(a => isEligible(a, ev));
  const skipped = all.length - pending.length;
  let sent = 0; const errors = [];
  for (const a of pending) {
    try { await sendConfirmEmail(a, ev, settings); sent++; }
    catch (e) { errors.push(`${a.email}: ${e.message}`); }
  }
  res.json({ sent, total: pending.length, skipped, errors });
});

module.exports = router;
