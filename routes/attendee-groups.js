// Nhóm khách (VD: Khách bình thường / VIP / Hiệp hội...) + nội dung email riêng theo nhóm -
// mục 6 kế hoạch nâng cấp. Khách được gán vào 1 nhóm (tay, import Excel, hoặc sau này landing
// page gửi kèm mã nhóm) -> khi gửi email, hệ thống TỰ CHỌN đúng mẫu của nhóm đó (xem
// email.js resolveGroupOverride), người dùng không cần chọn tay ở bước gửi.
const express = require('express');
const multer = require('multer');
const path = require('path');
const db = require('../db');
const { buildEmail, fillTemplate } = require('../email');
const { requireLogin, getEventOr404, canManageEvent } = require('./lib/helpers');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const MIME_BY_EXT = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };

async function getGroupOr404(req, res) {
  const g = await db.prepare('SELECT * FROM attendee_groups WHERE id = ?').get(req.params.id);
  if (!g) { res.status(404).json({ error: 'Không tìm thấy nhóm khách' }); return null; }
  const ev = await db.prepare('SELECT * FROM events WHERE id = ?').get(g.event_id);
  if (!canManageEvent(req.user, ev)) { res.status(403).json({ error: 'Bạn không có quyền' }); return null; }
  return { group: g, event: ev };
}

// ============ NHÓM KHÁCH ============
router.get('/events/:id/groups', requireLogin, async (req, res) => {
  const ev = await getEventOr404(req, res); if (!ev) return;
  res.json(await db.prepare('SELECT * FROM attendee_groups WHERE event_id = ? ORDER BY sort, id').all(ev.id));
});

router.post('/events/:id/groups', requireLogin, async (req, res) => {
  const ev = await getEventOr404(req, res); if (!ev) return;
  if (!canManageEvent(req.user, ev)) return res.status(403).json({ error: 'Bạn không có quyền' });
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Cần nhập tên nhóm khách' });
  const max = (await db.prepare('SELECT COALESCE(MAX(sort),0) AS m FROM attendee_groups WHERE event_id = ?').get(ev.id)).m;
  const info = await db.prepare('INSERT INTO attendee_groups (event_id, name, sort) VALUES (?,?,?)').run(ev.id, name, max + 1);
  res.json({ id: info.lastInsertRowid, name });
});

router.put('/groups/:id', requireLogin, async (req, res) => {
  const ctx = await getGroupOr404(req, res); if (!ctx) return;
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Cần nhập tên nhóm khách' });
  await db.prepare('UPDATE attendee_groups SET name = ? WHERE id = ?').run(name, ctx.group.id);
  res.json({ ok: true });
});

router.delete('/groups/:id', requireLogin, async (req, res) => {
  const ctx = await getGroupOr404(req, res); if (!ctx) return;
  // Khách đang thuộc nhóm này tự chuyển về "không thuộc nhóm nào" (group_id NULL, xem FK ON
  // DELETE SET NULL) - dùng mẫu email mặc định của sự kiện, không mất dữ liệu khách.
  await db.prepare('DELETE FROM attendee_groups WHERE id = ?').run(ctx.group.id);
  res.json({ ok: true });
});

// ============ MẪU EMAIL RIÊNG CỦA NHÓM ============
router.get('/groups/:id/email-template', requireLogin, async (req, res) => {
  const ctx = await getGroupOr404(req, res); if (!ctx) return;
  const type = req.query.type === 'thank' ? 'thank' : 'confirm';
  const tpl = await db.prepare('SELECT * FROM email_group_templates WHERE group_id = ? AND type = ?').get(ctx.group.id, type);
  res.json(tpl || { group_id: ctx.group.id, type, subject: '', body: '', header_image: '', footer_image: '', header_width: 100, footer_width: 100 });
});

router.put('/groups/:id/email-template', requireLogin, async (req, res) => {
  const ctx = await getGroupOr404(req, res); if (!ctx) return;
  const type = req.body.type === 'thank' ? 'thank' : 'confirm';
  const b = req.body;
  const cur = await db.prepare('SELECT * FROM email_group_templates WHERE group_id = ? AND type = ?').get(ctx.group.id, type);
  const headerWidth = Math.min(100, Math.max(10, Number(b.header_width) || cur?.header_width || 100));
  const footerWidth = Math.min(100, Math.max(10, Number(b.footer_width) || cur?.footer_width || 100));
  await db.prepare(`
    INSERT INTO email_group_templates (group_id, type, subject, body, header_width, footer_width)
    VALUES (?,?,?,?,?,?)
    ON DUPLICATE KEY UPDATE subject = VALUES(subject), body = VALUES(body), header_width = VALUES(header_width), footer_width = VALUES(footer_width)
  `).run(ctx.group.id, type, b.subject || '', b.body || '', headerWidth, footerWidth);
  res.json({ ok: true });
});

async function getOrCreateTemplateId(groupId, type) {
  const cur = await db.prepare('SELECT id FROM email_group_templates WHERE group_id = ? AND type = ?').get(groupId, type);
  if (cur) return cur.id;
  const info = await db.prepare('INSERT INTO email_group_templates (group_id, type) VALUES (?,?)').run(groupId, type);
  return info.lastInsertRowid;
}

router.post('/groups/:id/email-template/:type/image/:kind', requireLogin, upload.single('file'), async (req, res) => {
  const ctx = await getGroupOr404(req, res); if (!ctx) return;
  const type = req.params.type === 'thank' ? 'thank' : 'confirm';
  const kind = req.params.kind;
  if (!['header', 'footer'].includes(kind)) return res.status(400).json({ error: 'Loại ảnh không hợp lệ' });
  if (!req.file) return res.status(400).json({ error: 'Chưa chọn ảnh' });
  const ext = (path.extname(req.file.originalname) || '.png').toLowerCase();
  if (!MIME_BY_EXT[ext]) return res.status(400).json({ error: 'Chỉ nhận ảnh PNG, JPG, GIF, WEBP' });
  const templateId = await getOrCreateTemplateId(ctx.group.id, type);
  await db.prepare('INSERT INTO email_group_images (template_id, kind, mime, data) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE mime=VALUES(mime), data=VALUES(data)')
    .run(templateId, kind, MIME_BY_EXT[ext], req.file.buffer);
  await db.prepare(`UPDATE email_group_templates SET ${kind === 'header' ? 'header_image' : 'footer_image'} = ? WHERE id = ?`).run(MIME_BY_EXT[ext], templateId);
  res.json({ ok: true, template_id: templateId });
});

router.delete('/groups/:id/email-template/:type/image/:kind', requireLogin, async (req, res) => {
  const ctx = await getGroupOr404(req, res); if (!ctx) return;
  const type = req.params.type === 'thank' ? 'thank' : 'confirm';
  const kind = req.params.kind;
  if (!['header', 'footer'].includes(kind)) return res.status(400).json({ error: 'Loại ảnh không hợp lệ' });
  const tpl = await db.prepare('SELECT id FROM email_group_templates WHERE group_id = ? AND type = ?').get(ctx.group.id, type);
  if (tpl) {
    await db.prepare('DELETE FROM email_group_images WHERE template_id = ? AND kind = ?').run(tpl.id, kind);
    await db.prepare(`UPDATE email_group_templates SET ${kind === 'header' ? 'header_image' : 'footer_image'} = '' WHERE id = ?`).run(tpl.id);
  }
  res.json({ ok: true });
});

// Public - ảnh header/footer riêng của mẫu nhóm (dùng trong email đã gửi, giống email-image sự kiện)
router.get('/email-templates/:templateId/image/:kind.img', async (req, res) => {
  const row = await db.prepare('SELECT mime, data FROM email_group_images WHERE template_id = ? AND kind = ?').get(req.params.templateId, req.params.kind);
  if (!row) return res.status(404).end();
  res.type(row.mime).set('Cache-Control', 'no-cache').send(row.data);
});

// Xem trước email của nhóm - dùng khách mẫu (hoặc khách thật đầu tiên của nhóm nếu có) để mẫu
// biến {{...}} hiển thị được, và để đúng luôn cả header/footer riêng của nhóm.
router.get('/groups/:id/email-preview', requireLogin, async (req, res) => {
  const ctx = await getGroupOr404(req, res); if (!ctx) return;
  const type = req.query.type === 'thank' ? 'thank' : 'confirm';
  const settings = await db.prepare('SELECT * FROM email_settings WHERE event_id = ?').get(ctx.event.id);
  let attendee = await db.prepare('SELECT * FROM attendees WHERE group_id = ? ORDER BY id LIMIT 1').get(ctx.group.id);
  if (!attendee) attendee = { id: 0, name: 'Nguyễn Văn A (mẫu)', company: 'Công ty TNHH ABC', qr_token: 'MA-QR-MAU-XEM-TRUOC', group_id: ctx.group.id };
  const { html } = await buildEmail(type, attendee, ctx.event, settings, 'web');
  const tpl = await db.prepare('SELECT subject FROM email_group_templates WHERE group_id = ? AND type = ?').get(ctx.group.id, type);
  const subject = fillTemplate(tpl?.subject, attendee, ctx.event)
    || (type === 'confirm' ? `Xác nhận đăng ký: ${ctx.event.name}` : `Cảm ơn bạn đã tham dự ${ctx.event.name}`);
  res.json({ subject, html });
});

module.exports = router;
