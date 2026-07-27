// In tem QR từ điện thoại qua trạm in (LAN hoặc Agent) - mục 5 kế hoạch nâng cấp, thay cho
// file .bat + Chrome --kiosk-printing dev MISA đang dùng. Xem lib/tspl.js + lib/printSender.js.
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { requireLogin, getEventOr404, canManageEvent } = require('./lib/helpers');
const { requirePerm } = require('./lib/permissions');
const { buildAttendeeLabel } = require('../lib/tspl');
const { sendToLan } = require('../lib/printSender');

const router = express.Router();

// ============ QUẢN LÝ TRẠM IN (admin/quản lý sự kiện) ============
router.get('/events/:id/print-stations', requireLogin, async (req, res) => {
  const ev = await getEventOr404(req, res); if (!ev) return;
  const rows = await db.prepare(`SELECT id, name, kind, pairing_code, host, port, printer_name, last_seen_at
    FROM print_stations WHERE event_id = ? ORDER BY id`).all(ev.id);
  res.json(rows);
});

router.post('/events/:id/print-stations', requireLogin, async (req, res) => {
  const ev = await getEventOr404(req, res); if (!ev) return;
  if (!canManageEvent(req.user, ev)) return res.status(403).json({ error: 'Bạn không có quyền' });
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Cần nhập tên trạm in' });
  const kind = req.body.kind === 'agent' ? 'agent' : 'lan';
  if (kind === 'lan' && !req.body.host) return res.status(400).json({ error: 'Trạm in LAN cần nhập IP máy in' });
  const pairingCode = crypto.randomBytes(4).toString('hex').toUpperCase();
  const info = await db.prepare('INSERT INTO print_stations (event_id, name, kind, pairing_code, host, port) VALUES (?,?,?,?,?,?)')
    .run(ev.id, name, kind, pairingCode, req.body.host || null, Number(req.body.port) || 9100);
  res.json({ id: info.lastInsertRowid, pairing_code: pairingCode });
});

router.delete('/print-stations/:id', requireLogin, async (req, res) => {
  const st = await db.prepare('SELECT * FROM print_stations WHERE id = ?').get(req.params.id);
  if (!st) return res.status(404).json({ error: 'Không tìm thấy trạm in' });
  const ev = await db.prepare('SELECT * FROM events WHERE id = ?').get(st.event_id);
  if (!canManageEvent(req.user, ev)) return res.status(403).json({ error: 'Bạn không có quyền' });
  await db.prepare('DELETE FROM print_stations WHERE id = ?').run(st.id);
  res.json({ ok: true });
});

// ============ AGENT (chương trình chạy trên máy tính riêng - KHÔNG cần đăng nhập user,
// xác thực bằng pairing_code hiển thị trên UI quản lý trạm in) ============
router.post('/print-stations/pair', async (req, res) => {
  const st = await db.prepare('SELECT * FROM print_stations WHERE pairing_code = ?').get(req.body.pairing_code);
  if (!st) return res.status(404).json({ error: 'Mã ghép nối không đúng' });
  await db.prepare('UPDATE print_stations SET printer_name = ?, host = ?, last_seen_at = UTC_TIMESTAMP() WHERE id = ?')
    .run(req.body.printer_name || st.printer_name, req.body.host || st.host, st.id);
  res.json({ station_id: st.id, name: st.name });
});

router.get('/print-stations/:pairingCode/jobs', async (req, res) => {
  const st = await db.prepare('SELECT * FROM print_stations WHERE pairing_code = ?').get(req.params.pairingCode);
  if (!st) return res.status(404).json({ error: 'Mã ghép nối không đúng' });
  await db.prepare('UPDATE print_stations SET last_seen_at = UTC_TIMESTAMP() WHERE id = ?').run(st.id);
  const jobs = await db.prepare("SELECT id, payload FROM print_jobs WHERE station_id = ? AND status = 'pending' ORDER BY id LIMIT 5").all(st.id);
  res.json(jobs);
});

router.post('/print-jobs/:id/result', async (req, res) => {
  const job = await db.prepare('SELECT * FROM print_jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Không tìm thấy lệnh in' });
  const status = req.body.status === 'failed' ? 'failed' : 'done';
  await db.prepare('UPDATE print_jobs SET status = ?, error = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?')
    .run(status, req.body.error || null, job.id);
  res.json({ ok: true });
});

// ============ ĐẶT LỆNH IN (từ app - nhân viên có quyền print_badge) ============
router.post('/events/:id/print', requireLogin, async (req, res) => {
  const ev = await getEventOr404(req, res); if (!ev) return;
  const perm = await requirePerm(req, res, ev, 'print_badge'); if (!perm.ok) return;
  const station = await db.prepare('SELECT * FROM print_stations WHERE id = ? AND event_id = ?').get(req.body.station_id, ev.id);
  if (!station) return res.status(400).json({ error: 'Chưa chọn trạm in hợp lệ' });
  const a = await db.prepare('SELECT * FROM attendees WHERE id = ? AND event_id = ?').get(req.body.attendee_id, ev.id);
  if (!a) return res.status(404).json({ error: 'Không tìm thấy khách' });

  const payload = buildAttendeeLabel({ token: a.qr_token, name: (a.salutation ? a.salutation + ' ' : '') + a.name, company: a.company });
  const info = await db.prepare('INSERT INTO print_jobs (event_id, station_id, kind, ref_id, payload) VALUES (?,?,?,?,?)')
    .run(ev.id, station.id, 'attendee_qr', a.id, payload);

  if (station.kind === 'lan') {
    if (!station.host) return res.status(400).json({ error: 'Trạm in này chưa có IP máy in' });
    try {
      await sendToLan(station.host, station.port, payload);
      await db.prepare("UPDATE print_jobs SET status = 'done', updated_at = UTC_TIMESTAMP() WHERE id = ?").run(info.lastInsertRowid);
      return res.json({ ok: true, status: 'done' });
    } catch (e) {
      await db.prepare("UPDATE print_jobs SET status = 'failed', error = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?").run(e.message, info.lastInsertRowid);
      return res.status(502).json({ error: e.message });
    }
  }
  // kind === 'agent' -> nằm chờ agent tự lấy về in, FE tự hỏi lại trạng thái qua job_id
  res.json({ ok: true, status: 'pending', job_id: info.lastInsertRowid });
});

router.get('/events/:id/print-jobs/:jobId', requireLogin, async (req, res) => {
  const ev = await getEventOr404(req, res); if (!ev) return;
  const job = await db.prepare('SELECT id, status, error FROM print_jobs WHERE id = ? AND event_id = ?').get(req.params.jobId, ev.id);
  if (!job) return res.status(404).json({ error: 'Không tìm thấy lệnh in' });
  res.json(job);
});

module.exports = router;
