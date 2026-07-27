// Check-in bằng quét QR (mã khách hoặc mã phôi thẻ), check-in thủ công, thêm khách vãng lai
const express = require('express');
const db = require('../db');
const { findBadge } = require('./lib/badges');
const { requireLogin, getEventOr404, newToken, fmtVN, isEventToday } = require('./lib/helpers');
const { requirePerm } = require('./lib/permissions');

const router = express.Router();

router.post('/events/:id/scan', requireLogin, async (req, res) => {
  const ev = await getEventOr404(req, res); if (!ev) return;
  if (req.user.role === 'checkin' && !isEventToday(ev)) {
    return res.status(403).json({ error: 'Chỉ được quét vào đúng ngày tổ chức sự kiện' });
  }
  const perm = await requirePerm(req, res, ev, 'checkin'); if (!perm.ok) return;
  const token = String(req.body.token || '').trim();
  if (!token) return res.status(400).json({ error: 'Không đọc được mã' });

  let a = await db.prepare(`SELECT a.*, u.name AS checked_in_by_name FROM attendees a
    LEFT JOIN users u ON u.id = a.checked_in_by WHERE a.qr_token = ?`).get(token);

  if (!a) {
    const badge = await findBadge(ev.id, token);
    if (badge === 'wrong_event') return res.json({ status: 'wrong_event', message: 'Thẻ này thuộc sự kiện khác' });
    if (badge) {
      if (badge.status === 'stopped') return res.json({ status: 'badge_stopped', message: `Thẻ số ${badge.code} đã bị NGỪNG sử dụng (không hợp lệ)` });
      if (!badge.attendee_id) return res.json({ status: 'badge_unassigned', message: `Thẻ số ${badge.code} chưa được gán cho khách nào. Hãy gán thẻ tại quầy trước.` });
      a = await db.prepare(`SELECT a.*, u.name AS checked_in_by_name FROM attendees a
        LEFT JOIN users u ON u.id = a.checked_in_by WHERE a.id = ?`).get(badge.attendee_id);
    }
  }

  if (!a) return res.json({ status: 'invalid', message: 'Mã QR không hợp lệ - không có trong hệ thống' });
  if (a.event_id !== ev.id) {
    const other = await db.prepare('SELECT name FROM events WHERE id = ?').get(a.event_id);
    return res.json({ status: 'wrong_event', message: `Mã này thuộc sự kiện khác: ${other ? other.name : '?'}`, attendee: a });
  }
  const evDay = new Date(ev.event_date); evDay.setHours(23, 59, 59, 999);
  if (Date.now() > evDay.getTime() && !a.checked_in_at) {
    return res.json({ status: 'expired', message: 'Mã QR đã hết hạn (sự kiện đã kết thúc)', attendee: a });
  }

  let boothId = req.body.booth_id ? Number(req.body.booth_id) : null;
  if (req.user.role === 'checkin') boothId = perm.assignment.boothId || null; // ép theo phân công, bỏ qua booth_id client gửi

  // ----- Quét tại BOOTH -----
  if (boothId) {
    const booth = await db.prepare('SELECT * FROM booths WHERE id = ? AND event_id = ?').get(boothId, ev.id);
    if (!booth) return res.status(400).json({ error: 'Booth không tồn tại trong sự kiện này' });
    let justCheckedIn = false;
    if (!a.checked_in_at) {
      await db.prepare('UPDATE attendees SET checked_in_at = UTC_TIMESTAMP(), checked_in_by = ? WHERE id = ?').run(req.user.id, a.id);
      justCheckedIn = true;
    }
    const existed = await db.prepare('SELECT * FROM booth_visits WHERE booth_id = ? AND attendee_id = ?').get(booth.id, a.id);
    if (existed) {
      return res.json({ status: 'booth_already', message: `${a.name} đã ghé booth "${booth.name}" lúc ${fmtVN(existed.visited_at)}`, attendee: a, booth: booth.name });
    }
    await db.prepare('INSERT INTO booth_visits (event_id, booth_id, attendee_id, visited_by) VALUES (?,?,?,?)').run(ev.id, booth.id, a.id, req.user.id);
    return res.json({ status: 'booth_recorded', message: `Đã ghi nhận ghé booth "${booth.name}"`, attendee: a, booth: booth.name, just_checked_in: justCheckedIn });
  }

  // ----- Quét tại CỔNG CHECK-IN -----
  if (a.checked_in_at) {
    return res.json({
      status: 'already_checked',
      message: `Khách ĐÃ check-in trước đó lúc ${fmtVN(a.checked_in_at)}${a.checked_in_by_name ? ' (NV: ' + a.checked_in_by_name + ')' : ''}`,
      attendee: a,
    });
  }
  if (req.body.auto_confirm) {
    await db.prepare('UPDATE attendees SET checked_in_at = UTC_TIMESTAMP(), checked_in_by = ? WHERE id = ?').run(req.user.id, a.id);
    return res.json({ status: 'checked_in', message: 'Check-in thành công!', attendee: a });
  }
  res.json({ status: 'valid', message: 'Khách đã đăng ký - hợp lệ', attendee: a });
});

router.post('/events/:id/checkin/:attendeeId', requireLogin, async (req, res) => {
  const ev = await getEventOr404(req, res); if (!ev) return;
  const perm = await requirePerm(req, res, ev, 'checkin'); if (!perm.ok) return;
  const a = await db.prepare('SELECT * FROM attendees WHERE id = ? AND event_id = ?').get(req.params.attendeeId, ev.id);
  if (!a) return res.status(404).json({ error: 'Không tìm thấy người tham dự' });
  if (a.checked_in_at) return res.status(409).json({ error: 'Người này đã check-in rồi' });
  await db.prepare('UPDATE attendees SET checked_in_at = UTC_TIMESTAMP(), checked_in_by = ? WHERE id = ?').run(req.user.id, a.id);
  res.json({ ok: true });
});

router.post('/events/:id/walkin', requireLogin, async (req, res) => {
  const ev = await getEventOr404(req, res); if (!ev) return;
  if (req.user.role === 'checkin' && !isEventToday(ev)) return res.status(403).json({ error: 'Chỉ được thêm khách vào đúng ngày tổ chức sự kiện' });
  const perm = await requirePerm(req, res, ev, 'checkin'); if (!perm.ok) return;
  const { name, email, phone, position, company, tax_code, company_size, salutation, importance } = req.body;
  if (!name) return res.status(400).json({ error: 'Cần nhập Họ và tên' });
  let boothId = req.body.booth_id ? Number(req.body.booth_id) : null;
  if (req.user.role === 'checkin') {
    boothId = perm.assignment.boothId || null;
  } else if (boothId && !(await db.prepare('SELECT 1 AS ok FROM booths WHERE id = ? AND event_id = ?').get(boothId, ev.id))) {
    boothId = null;
  }
  const info = await db.prepare(`INSERT INTO attendees (event_id, name, email, phone, position, company, tax_code, company_size, salutation, importance, qr_token, is_walkin, checked_in_at, checked_in_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,1,UTC_TIMESTAMP(),?)`)
    .run(ev.id, name.trim(), (email || '').trim(), String(phone || '').trim(), position || '', company || '', tax_code || '', company_size || '',
      salutation || '', importance || 'Bình thường', newToken(), req.user.id);
  if (boothId) {
    await db.prepare('INSERT IGNORE INTO booth_visits (event_id, booth_id, attendee_id, visited_by) VALUES (?,?,?,?)').run(ev.id, boothId, info.lastInsertRowid, req.user.id);
  }
  const booth = boothId ? await db.prepare('SELECT name FROM booths WHERE id = ?').get(boothId) : null;
  res.json({ id: info.lastInsertRowid, booth_id: boothId, booth_name: booth ? booth.name : null });
});

module.exports = router;
