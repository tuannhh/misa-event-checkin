// Helper liên quan phôi thẻ (badge) dùng chung giữa routes/badges.js, routes/checkin.js (quét mã
// có thể là mã thẻ) và routes/monitor.js (tra khách bằng mã thẻ - "giám sát bóng ma").
const QRCode = require('qrcode');
const db = require('../../db');
const { isEventToday, getAssignment, canManageEvent, VIEW_ONLY_TYPES } = require('./helpers');

async function findBadge(eventId, token) {
  let code = token;
  const m = String(token).match(/^(\d+)-(.+)$/);
  if (m) { if (Number(m[1]) !== Number(eventId)) return 'wrong_event'; code = m[2]; }
  return (await db.prepare('SELECT * FROM badges WHERE event_id = ? AND code = ?').get(eventId, code)) || null;
}
async function resolveAttendee(eventId, token) {
  const a = await db.prepare('SELECT * FROM attendees WHERE qr_token = ? AND event_id = ?').get(token, eventId);
  if (a) return a;
  const badge = await findBadge(eventId, token);
  if (badge && badge !== 'wrong_event' && badge.attendee_id) {
    return db.prepare('SELECT * FROM attendees WHERE id = ?').get(badge.attendee_id);
  }
  return null;
}
async function badgesOfAttendee(attendeeId) {
  return db.prepare('SELECT id, code, status FROM badges WHERE attendee_id = ? ORDER BY code').all(attendeeId);
}
async function badgeOpGuard(req, res, ev) {
  if (req.user.role === 'checkin') {
    if (!isEventToday(ev)) { res.status(403).json({ error: 'Chỉ thao tác thẻ vào đúng ngày tổ chức sự kiện' }); return false; }
    const mine = await getAssignment(req.user, ev.id);
    if (mine && VIEW_ONLY_TYPES.includes(mine.staff_type)) { res.status(403).json({ error: 'Vị trí của bạn chỉ được xem, không gán thẻ' }); return false; }
    return true;
  }
  if (!canManageEvent(req.user, ev)) { res.status(403).json({ error: 'Bạn không có quyền' }); return false; }
  return true;
}
async function buildBadgeSvg(eventId, code) {
  let qr = await QRCode.toString(`${eventId}-${code}`, { type: 'svg', margin: 0, width: 240 });
  qr = qr.replace('<svg ', '<svg x="30" y="26" ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">` +
    `<rect width="300" height="300" fill="#ffffff"/>${qr}` +
    `<text x="150" y="288" text-anchor="middle" font-family="'Courier New',monospace" font-size="26" font-weight="700" letter-spacing="1.5" fill="#111827">${code}</text></svg>`;
}

module.exports = { findBadge, resolveAttendee, badgesOfAttendee, badgeOpGuard, buildBadgeSvg };
