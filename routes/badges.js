// Phôi thẻ in sẵn: sinh phôi, xuất ZIP cho nhà in, tra cứu, gán thẻ, ngừng/kích hoạt
const express = require('express');
const JSZip = require('jszip');
const db = require('../db');
const { findBadge, resolveAttendee, badgesOfAttendee, badgeOpGuard, buildBadgeSvg } = require('./lib/badges');
const { requireLogin, getEventOr404, canManageEvent } = require('./lib/helpers');

const router = express.Router();

router.post('/events/:id/badges/generate', requireLogin, async (req, res) => {
  const ev = await getEventOr404(req, res); if (!ev) return;
  if (!canManageEvent(req.user, ev)) return res.status(403).json({ error: 'Bạn không có quyền' });
  const count = Math.min(2000, Math.max(1, Number(req.body.count) || 0));
  if (!count) return res.status(400).json({ error: 'Nhập số lượng phôi cần in (1 - 2000)' });
  let maxN = 0;
  for (const r of await db.prepare('SELECT code FROM badges WHERE event_id = ?').all(ev.id)) {
    const n = parseInt(r.code, 10);
    if (!isNaN(n) && n > maxN) maxN = n;
  }
  const start = maxN + 1;
  // Chèn nhiều dòng trong 1 câu lệnh cho nhanh
  const values = [];
  const params = [];
  for (let i = 0; i < count; i++) { values.push('(?,?)'); params.push(ev.id, String(start + i).padStart(4, '0')); }
  await db.prepare(`INSERT IGNORE INTO badges (event_id, code) VALUES ${values.join(',')}`).run(...params);
  res.json({ added: count, from: String(start).padStart(4, '0'), to: String(start + count - 1).padStart(4, '0') });
});

router.get('/events/:id/badges', requireLogin, async (req, res) => {
  const ev = await getEventOr404(req, res); if (!ev) return;
  if (!canManageEvent(req.user, ev)) return res.status(403).json({ error: 'Bạn không có quyền' });
  const rows = await db.prepare(`SELECT b.id, b.code, b.status, b.attendee_id, b.paired_at,
      a.name AS attendee_name, a.company AS attendee_company FROM badges b
    LEFT JOIN attendees a ON a.id = b.attendee_id WHERE b.event_id = ? ORDER BY b.code`).all(ev.id);
  const total = rows.length;
  const paired = rows.filter(r => r.attendee_id).length;
  const stopped = rows.filter(r => r.status === 'stopped').length;
  res.json({ rows, total, paired, unpaired: total - paired, stopped });
});

router.get('/events/:id/badges/export', requireLogin, async (req, res) => {
  const ev = await getEventOr404(req, res); if (!ev) return;
  if (!canManageEvent(req.user, ev)) return res.status(403).json({ error: 'Bạn không có quyền' });
  const badges = await db.prepare('SELECT code FROM badges WHERE event_id = ? ORDER BY code').all(ev.id);
  if (!badges.length) return res.status(400).json({ error: 'Chưa có phôi thẻ nào để xuất. Hãy sinh phôi trước.' });
  const zip = new JSZip();
  let csv = 'STT,Ma the\n';
  for (const [i, b] of badges.entries()) {
    zip.file(`${b.code}.svg`, await buildBadgeSvg(ev.id, b.code));
    csv += `${i + 1},${b.code}\n`;
  }
  zip.file('danh-sach-ma.csv', '﻿' + csv);
  zip.file('HUONG-DAN.txt', `PHOI THE SU KIEN: ${ev.name}\n\n` +
    `- Moi file .svg la 1 phoi the (QR + ma ID ben duoi), khung vuong ti le 1:1.\n` +
    `- SVG la anh vector: in net o moi kich thuoc.\n` +
    `- Gui ca thu muc nay cho nha in de ho ghep vao thiet ke the mau (in so nhay).\n` +
    `- Tong so phoi: ${badges.length}.\n`);
  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  res.setHeader('Content-Disposition', `attachment; filename="phoi-the-su-kien-${ev.id}.zip"`);
  res.type('application/zip').send(buf);
});

router.get('/events/:id/badges/lookup', requireLogin, async (req, res) => {
  const ev = await getEventOr404(req, res); if (!ev) return;
  if (!(await badgeOpGuard(req, res, ev))) return;
  const token = String(req.query.token || '').trim();
  if (!token) return res.status(400).json({ error: 'Không đọc được mã' });
  const a = await resolveAttendee(ev.id, token);
  if (!a) return res.status(404).json({ error: 'Không tìm thấy khách với mã này. Hãy quét mã QR trong email của khách.' });
  res.json({ attendee: a, badges: await badgesOfAttendee(a.id) });
});

router.post('/events/:id/badges/pair', requireLogin, async (req, res) => {
  const ev = await getEventOr404(req, res); if (!ev) return;
  if (!(await badgeOpGuard(req, res, ev))) return;
  const guestToken = String(req.body.attendee_token || '').trim();
  const badgeToken = String(req.body.badge_code || '').trim();
  if (!guestToken || !badgeToken) return res.status(400).json({ error: 'Cần quét cả mã khách và mã phôi thẻ' });
  const a = await resolveAttendee(ev.id, guestToken);
  if (!a) return res.status(404).json({ error: 'Không tìm thấy khách với mã này' });
  const badge = await findBadge(ev.id, badgeToken);
  if (!badge || badge === 'wrong_event') return res.status(404).json({ error: `Không tìm thấy phôi thẻ số "${badgeToken}" trong sự kiện này` });
  if (badge.attendee_id && badge.attendee_id === a.id) {
    return res.json({ ok: true, already: true, message: `Thẻ số ${badge.code} đã gán cho khách này rồi`, attendee: a, badges: await badgesOfAttendee(a.id) });
  }
  if (badge.attendee_id && badge.attendee_id !== a.id && !req.body.force) {
    const other = await db.prepare('SELECT name FROM attendees WHERE id = ?').get(badge.attendee_id);
    return res.status(409).json({ duplicate: true, error: `Thẻ số ${badge.code} đã gán cho khách khác (${other ? other.name : '?'}). Vẫn gán lại cho khách này?` });
  }
  await db.prepare("UPDATE badges SET attendee_id = ?, status = 'active', paired_at = UTC_TIMESTAMP(), paired_by = ? WHERE id = ?")
    .run(a.id, req.user.id, badge.id);
  if (!a.checked_in_at) {
    await db.prepare('UPDATE attendees SET checked_in_at = UTC_TIMESTAMP(), checked_in_by = ? WHERE id = ?').run(req.user.id, a.id);
  }
  const fresh = await db.prepare('SELECT * FROM attendees WHERE id = ?').get(a.id);
  res.json({ ok: true, message: `Đã gán thẻ số ${badge.code} cho ${fresh.name}`, attendee: fresh, badges: await badgesOfAttendee(a.id) });
});

router.put('/events/:id/badges/:badgeId/status', requireLogin, async (req, res) => {
  const ev = await getEventOr404(req, res); if (!ev) return;
  if (!(await badgeOpGuard(req, res, ev))) return;
  const badge = await db.prepare('SELECT * FROM badges WHERE id = ? AND event_id = ?').get(req.params.badgeId, ev.id);
  if (!badge) return res.status(404).json({ error: 'Không tìm thấy phôi thẻ' });
  const status = req.body.status === 'stopped' ? 'stopped' : 'active';
  await db.prepare('UPDATE badges SET status = ? WHERE id = ?').run(status, badge.id);
  res.json({ ok: true, status });
});

module.exports = router;
