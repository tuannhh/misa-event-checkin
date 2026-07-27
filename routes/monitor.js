// Giám sát booth: xem khách đã ghé + ghi chú; "giám sát bóng ma" (tra khách bằng mã thẻ, không quét)
const express = require('express');
const db = require('../db');
const { resolveAttendee } = require('./lib/badges');
const { requireLogin, getEventOr404, getAssignment, canManageEvent } = require('./lib/helpers');

const router = express.Router();

async function resolveMonitorBooth(req, ev) {
  if (req.user.role === 'checkin') {
    const mine = await getAssignment(req.user, ev.id);
    if (!mine || mine.staff_type !== 'supervisor') return { error: 'Chỉ dành cho Giám sát viên booth' };
    if (!mine.booth_id) return { error: 'Bạn chưa được gán vào booth nào để giám sát' };
    return { boothId: mine.booth_id };
  }
  if (!canManageEvent(req.user, ev)) return { error: 'Bạn không có quyền' };
  const bid = (req.query.booth_id || req.body.booth_id) ? Number(req.query.booth_id || req.body.booth_id) : null;
  if (!bid) return { error: 'Cần chọn booth' };
  return { boothId: bid };
}

router.get('/events/:id/booth-monitor', requireLogin, async (req, res) => {
  const ev = await getEventOr404(req, res); if (!ev) return;
  const r = await resolveMonitorBooth(req, ev);
  if (r.error) return res.status(403).json({ error: r.error });
  const booth = await db.prepare('SELECT * FROM booths WHERE id = ? AND event_id = ?').get(r.boothId, ev.id);
  if (!booth) return res.status(404).json({ error: 'Không tìm thấy booth' });
  const rows = await db.prepare(`SELECT a.id, a.name, a.salutation, a.position, a.company, v.note, v.visited_at
    FROM booth_visits v JOIN attendees a ON a.id = v.attendee_id
    WHERE v.event_id = ? AND v.booth_id = ? ORDER BY v.visited_at DESC`).all(ev.id, booth.id);
  res.json({ booth: { id: booth.id, name: booth.name }, rows });
});

router.put('/events/:id/booth-note', requireLogin, async (req, res) => {
  const ev = await getEventOr404(req, res); if (!ev) return;
  const r = await resolveMonitorBooth(req, ev);
  if (r.error) return res.status(403).json({ error: r.error });
  const attendeeId = Number(req.body.attendee_id);
  if (!attendeeId) return res.status(400).json({ error: 'Thiếu thông tin khách' });
  const note = String(req.body.note ?? '').trim();
  const upd = await db.prepare('UPDATE booth_visits SET note = ? WHERE event_id = ? AND booth_id = ? AND attendee_id = ?')
    .run(note, ev.id, r.boothId, attendeeId);
  if (!upd.changes) return res.status(404).json({ error: 'Khách này chưa được ghi nhận ghé booth' });
  res.json({ ok: true });
});

// "Giám sát bóng ma": tra khách bằng mã thẻ (không quét), ghi chú + tick tiềm năng lưu TÁCH BIỆT
// khỏi booth_visits để không ảnh hưởng điều kiện lucky draw. Chỉ áp dụng sự kiện có phôi thẻ.
router.get('/events/:id/booth-monitor/lookup', requireLogin, async (req, res) => {
  const ev = await getEventOr404(req, res); if (!ev) return;
  const r = await resolveMonitorBooth(req, ev);
  if (r.error) return res.status(403).json({ error: r.error });
  const badgeCount = (await db.prepare('SELECT COUNT(*) AS c FROM badges WHERE event_id = ?').get(ev.id)).c;
  if (!badgeCount) return res.status(400).json({ error: 'Sự kiện này không dùng phôi thẻ, không tra được bằng mã thẻ' });
  const code = String(req.query.code || '').trim();
  if (!code) return res.status(400).json({ error: 'Nhập mã thẻ cần tra' });
  const attendee = await resolveAttendee(ev.id, code);
  if (!attendee) return res.status(404).json({ error: 'Không tìm thấy khách với mã thẻ này' });
  const existing = await db.prepare('SELECT note, is_potential FROM booth_potential_notes WHERE booth_id = ? AND attendee_id = ?')
    .get(r.boothId, attendee.id);
  res.json({
    attendee: { id: attendee.id, name: attendee.name, salutation: attendee.salutation, position: attendee.position, company: attendee.company },
    note: existing ? existing.note : '',
    is_potential: existing ? !!existing.is_potential : false,
  });
});

router.put('/events/:id/booth-monitor/potential-note', requireLogin, async (req, res) => {
  const ev = await getEventOr404(req, res); if (!ev) return;
  const r = await resolveMonitorBooth(req, ev);
  if (r.error) return res.status(403).json({ error: r.error });
  const attendeeId = Number(req.body.attendee_id);
  if (!attendeeId) return res.status(400).json({ error: 'Thiếu thông tin khách' });
  const note = String(req.body.note ?? '').trim();
  const isPotential = req.body.is_potential ? 1 : 0;
  await db.prepare(`INSERT INTO booth_potential_notes (event_id, booth_id, attendee_id, note, is_potential, updated_by)
    VALUES (?,?,?,?,?,?)
    ON DUPLICATE KEY UPDATE note = VALUES(note), is_potential = VALUES(is_potential), updated_by = VALUES(updated_by)`)
    .run(ev.id, r.boothId, attendeeId, note, isPotential, req.user.id);
  res.json({ ok: true });
});

module.exports = router;
