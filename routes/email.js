// Cài đặt email của từng sự kiện (nội dung, ảnh header/footer) + cấu hình SMTP toàn hệ thống
const express = require('express');
const multer = require('multer');
const path = require('path');
const db = require('../db');
const { getTransport, deliver, buildEmail, fillTemplate } = require('../email');
const secret = require('../lib/secret');
const { requireLogin, requireRole, getEventOr404, canManageEvent, getEmailSettings } = require('./lib/helpers');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ============ CÀI ĐẶT EMAIL CỦA SỰ KIỆN ============
router.get('/events/:id/email-settings', requireLogin, async (req, res) => {
  const ev = await getEventOr404(req, res); if (!ev) return;
  res.json(await getEmailSettings(ev.id));
});
router.put('/events/:id/email-settings', requireLogin, async (req, res) => {
  const ev = await getEventOr404(req, res); if (!ev) return;
  if (!canManageEvent(req.user, ev)) return res.status(403).json({ error: 'Bạn không có quyền' });
  const s = await getEmailSettings(ev.id);
  const b = req.body;
  await db.prepare(`UPDATE email_settings SET confirm_subject=?, confirm_body=?, auto_send_confirm=?,
    thank_subject=?, thank_body=?, thank_delay_minutes=?, thank_enabled=?, header_width=?, footer_width=? WHERE event_id=?`)
    .run(b.confirm_subject ?? s.confirm_subject, b.confirm_body ?? s.confirm_body,
      b.auto_send_confirm ? 1 : 0, b.thank_subject ?? s.thank_subject, b.thank_body ?? s.thank_body,
      Number(b.thank_delay_minutes) || 60, b.thank_enabled ? 1 : 0,
      Math.min(100, Math.max(10, Number(b.header_width) || s.header_width || 100)),
      Math.min(100, Math.max(10, Number(b.footer_width) || s.footer_width || 100)), ev.id);
  res.json({ ok: true });
});

const MIME_BY_EXT = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };
router.post('/events/:id/email-image/:type', requireLogin, upload.single('file'), async (req, res) => {
  const ev = await getEventOr404(req, res); if (!ev) return;
  if (!canManageEvent(req.user, ev)) return res.status(403).json({ error: 'Bạn không có quyền' });
  const type = req.params.type;
  if (!['header', 'footer'].includes(type)) return res.status(400).json({ error: 'Loại ảnh không hợp lệ' });
  if (!req.file) return res.status(400).json({ error: 'Chưa chọn ảnh' });
  const ext = (path.extname(req.file.originalname) || '.png').toLowerCase();
  if (!MIME_BY_EXT[ext]) return res.status(400).json({ error: 'Chỉ nhận ảnh PNG, JPG, GIF, WEBP' });
  await getEmailSettings(ev.id);
  await db.prepare('INSERT INTO email_images (event_id, kind, mime, data) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE mime=VALUES(mime), data=VALUES(data)')
    .run(ev.id, type, MIME_BY_EXT[ext], req.file.buffer);
  await db.prepare(`UPDATE email_settings SET ${type === 'header' ? 'header_image' : 'footer_image'} = ? WHERE event_id = ?`).run(MIME_BY_EXT[ext], ev.id);
  res.json({ ok: true });
});

router.delete('/events/:id/email-image/:type', requireLogin, async (req, res) => {
  const ev = await getEventOr404(req, res); if (!ev) return;
  if (!canManageEvent(req.user, ev)) return res.status(403).json({ error: 'Bạn không có quyền' });
  const type = req.params.type;
  if (!['header', 'footer'].includes(type)) return res.status(400).json({ error: 'Loại ảnh không hợp lệ' });
  await getEmailSettings(ev.id);
  await db.prepare('DELETE FROM email_images WHERE event_id = ? AND kind = ?').run(ev.id, type);
  await db.prepare(`UPDATE email_settings SET ${type === 'header' ? 'header_image' : 'footer_image'} = '' WHERE event_id = ?`).run(ev.id);
  res.json({ ok: true });
});

router.get('/events/:id/email-image/:type.img', async (req, res) => {
  const row = await db.prepare('SELECT mime, data FROM email_images WHERE event_id = ? AND kind = ?').get(req.params.id, req.params.type);
  if (!row) return res.status(404).end();
  res.type(row.mime).set('Cache-Control', 'no-cache').send(row.data);
});

router.get('/events/:id/email-preview', requireLogin, async (req, res) => {
  const ev = await getEventOr404(req, res); if (!ev) return;
  const type = req.query.type === 'thank' ? 'thank' : 'confirm';
  const settings = await getEmailSettings(ev.id);
  let attendee = await db.prepare('SELECT * FROM attendees WHERE event_id = ? ORDER BY id LIMIT 1').get(ev.id);
  if (!attendee) {
    attendee = { id: 0, name: 'Nguyễn Văn A (mẫu)', company: 'Công ty TNHH ABC', qr_token: 'MA-QR-MAU-XEM-TRUOC' };
  }
  const { html } = await buildEmail(type, attendee, ev, settings, 'web');
  const subject = fillTemplate(type === 'confirm' ? settings.confirm_subject : settings.thank_subject, attendee, ev)
    || (type === 'confirm' ? `Xác nhận đăng ký: ${ev.name}` : `Cảm ơn bạn đã tham dự ${ev.name}`);
  res.json({ subject, html });
});

// ============ CẤU HÌNH SMTP ============
router.get('/smtp', requireLogin, requireRole('super_admin', 'admin'), async (req, res) => {
  const s = await db.prepare('SELECT * FROM smtp_settings WHERE id = 1').get();
  res.json({ ...s, smtp_pass: s.smtp_pass ? '********' : '', brevo_api_key: s.brevo_api_key ? '********' : '' });
});
router.put('/smtp', requireLogin, requireRole('super_admin', 'admin'), async (req, res) => {
  const cur = await db.prepare('SELECT * FROM smtp_settings WHERE id = 1').get();
  const b = req.body;
  // Giữ nguyên giá trị cũ (đã mã hoá) nếu client gửi lại placeholder "********";
  // ngược lại mã hoá giá trị mới trước khi lưu (xem lib/secret.js).
  const pass = (b.smtp_pass && b.smtp_pass !== '********') ? secret.encrypt(b.smtp_pass) : cur.smtp_pass;
  const brevoKey = b.brevo_api_key === '********' ? cur.brevo_api_key : secret.encrypt((b.brevo_api_key || '').trim());
  const provider = ['brevo', 'gmail', 'manual'].includes(b.provider) ? b.provider : cur.provider;
  await db.prepare('UPDATE smtp_settings SET host=?, port=?, secure=?, smtp_user=?, smtp_pass=?, from_name=?, brevo_api_key=?, sender_email=?, provider=? WHERE id=1')
    .run(b.host || 'smtp.gmail.com', Number(b.port) || 465, b.secure ? 1 : 0, b.smtp_user || '', pass, b.from_name || '', brevoKey, (b.sender_email || '').trim(), provider);
  res.json({ ok: true });
});
router.post('/smtp/test', requireLogin, requireRole('super_admin', 'admin'), async (req, res) => {
  const t = await getTransport();
  if (!t) return res.status(400).json({ error: 'Chưa nhập đủ thông tin gửi email' });
  try {
    await deliver(t, {
      to: req.user.email,
      subject: 'Email kiểm tra - MISA Event Check-in',
      html: `Cấu hình email của bạn đã hoạt động! (Kênh gửi: ${t.provider === 'brevo' ? 'Brevo' : 'SMTP'})`,
    });
    res.json({ ok: true, message: `Đã gửi email kiểm tra tới ${req.user.email} qua ${t.provider === 'brevo' ? 'Brevo' : 'SMTP'}` });
  } catch (e) { res.status(400).json({ error: 'Gửi thất bại: ' + e.message }); }
});

module.exports = router;
