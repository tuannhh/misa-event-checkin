// Gửi email xác nhận (kèm QR code) và email cảm ơn
const nodemailer = require('nodemailer');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');
const db = require('./db');
const { UPLOAD_DIR } = require('./config');

// Địa chỉ công khai của website (cần cho ảnh trong email khi gửi qua Brevo)
const BASE_URL = (process.env.BASE_URL || '').replace(/\/$/, '');

function getSettings() {
  return db.prepare('SELECT * FROM smtp_settings WHERE id = 1').get();
}

function getTransport() {
  const s = getSettings();
  if (!s) return null;
  if (s.brevo_api_key) return { provider: 'brevo', settings: s }; // ưu tiên Brevo nếu có key
  if (!s.smtp_user || !s.smtp_pass) return null;
  return {
    provider: 'smtp',
    settings: s,
    transporter: nodemailer.createTransport({
      host: s.host,
      port: s.port,
      secure: !!s.secure,
      auth: { user: s.smtp_user, pass: s.smtp_pass },
    }),
    from: `"${s.from_name}" <${s.smtp_user}>`,
  };
}

// Gửi email qua Brevo API (HTTPS - hoạt động trên mọi nền tảng cloud)
async function sendViaBrevo(s, to, subject, html) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': s.brevo_api_key, 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({
      sender: { name: s.from_name || 'Ban Tổ Chức', email: s.sender_email || s.smtp_user },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error('Brevo: ' + (err.message || res.status));
  }
}

// Gửi 1 email qua kênh đang cấu hình (Brevo hoặc SMTP)
async function deliver(t, { to, subject, html, attachments }) {
  if (t.provider === 'brevo') return sendViaBrevo(t.settings, to, subject, html);
  return t.transporter.sendMail({ from: t.from, to, subject, html, attachments });
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Thay các biến {{...}} trong nội dung email
function fillTemplate(text, attendee, event) {
  return (text || '')
    .replace(/\{\{\s*xung_ho\s*\}\}/g, attendee.salutation || 'Anh/Chị')
    .replace(/\{\{\s*ho_ten\s*\}\}/g, attendee.name)
    .replace(/\{\{\s*ten_su_kien\s*\}\}/g, event.name)
    .replace(/\{\{\s*thoi_gian\s*\}\}/g, formatDate(event.event_date))
    .replace(/\{\{\s*cong_ty\s*\}\}/g, attendee.company || '');
}

// Nội dung có thể là văn bản thường hoặc HTML - tự nhận biết
function bodyToHtml(body) {
  if (/<[a-z][^>]*>/i.test(body)) return body; // người dùng đã viết HTML
  return body.replace(/\n/g, '<br/>');
}

/**
 * Dựng email hoàn chỉnh (header + nội dung + footer).
 * mode = 'cid'    : ảnh nhúng dạng đính kèm (gửi qua SMTP)
 * mode = 'web'    : ảnh dùng đường dẫn tương đối (xem trước trên trình duyệt)
 * mode = 'remote' : ảnh dùng đường dẫn công khai đầy đủ (gửi qua Brevo)
 * Trả về { html, attachments }
 */
function buildEmail(type, attendee, event, settings, mode) {
  const isConfirm = type === 'confirm';
  const rawBody = isConfirm ? settings.confirm_body : settings.thank_body;
  let body = bodyToHtml(fillTemplate(rawBody, attendee, event));
  const attachments = [];

  // Mã QR (chỉ email xác nhận)
  if (isConfirm) {
    const qrSrc = mode === 'cid' ? 'cid:qrcode'
      : mode === 'remote' ? `${BASE_URL}/api/qr/${attendee.qr_token}.png`
      : `/api/attendees/${attendee.id}/qr.png`;
    const qrImg = `<div style="text-align:center;margin:16px 0"><img src="${qrSrc}" alt="QR Code" style="width:220px"/>` +
      `<div style="font-family:monospace;font-size:12px;color:#6b7280;margin-top:4px">${attendee.qr_token}</div></div>`;
    if (/\{\{\s*qr_code\s*\}\}/.test(body)) body = body.replace(/\{\{\s*qr_code\s*\}\}/g, qrImg);
    else body += qrImg; // không đặt vị trí thì QR nằm cuối
  }

  // Ảnh header / footer
  let headerHtml = '', footerHtml = '';
  const imgSrc = (filename, cidName) => mode === 'cid' ? `cid:${cidName}` : (mode === 'remote' ? `${BASE_URL}/uploads/${filename}` : `/uploads/${filename}`);
  if (settings.header_image && fs.existsSync(path.join(UPLOAD_DIR, settings.header_image))) {
    headerHtml = `<div style="text-align:center"><img src="${imgSrc(settings.header_image, 'headerimg')}" alt="" style="width:${settings.header_width || 100}%;max-width:600px;display:block;margin:0 auto"/></div>`;
    if (mode === 'cid') attachments.push({ filename: settings.header_image, path: path.join(UPLOAD_DIR, settings.header_image), cid: 'headerimg' });
  }
  if (settings.footer_image && fs.existsSync(path.join(UPLOAD_DIR, settings.footer_image))) {
    footerHtml = `<div style="text-align:center"><img src="${imgSrc(settings.footer_image, 'footerimg')}" alt="" style="width:${settings.footer_width || 100}%;max-width:600px;display:block;margin:0 auto"/></div>`;
    if (mode === 'cid') attachments.push({ filename: settings.footer_image, path: path.join(UPLOAD_DIR, settings.footer_image), cid: 'footerimg' });
  }

  const html = `
  <div style="background:#f3f4f6;padding:16px 0">
    <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden">
      ${headerHtml}
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#111827;padding:24px">${body}</div>
      ${footerHtml}
    </div>
  </div>`;
  return { html, attachments };
}

// Gửi email xác nhận đăng ký kèm mã QR
async function sendConfirmEmail(attendee, event, settings) {
  const t = getTransport();
  if (!t) throw new Error('Chưa cấu hình gửi email (vào mục Cấu hình Email)');
  if (!attendee.email) throw new Error('Người tham dự không có email');

  const mode = t.provider === 'brevo' ? 'remote' : 'cid';
  const { html, attachments } = buildEmail('confirm', attendee, event, settings, mode);
  if (mode === 'cid') {
    const qrPng = await QRCode.toBuffer(attendee.qr_token, { width: 300, margin: 2 });
    attachments.push({ filename: 'qrcode.png', content: qrPng, cid: 'qrcode' });
  }

  await deliver(t, {
    to: attendee.email,
    subject: fillTemplate(settings.confirm_subject, attendee, event) || `Xác nhận đăng ký: ${event.name}`,
    html,
    attachments,
  });
  db.prepare("UPDATE attendees SET confirm_email_sent_at = datetime('now') WHERE id = ?").run(attendee.id);
}

// Gửi email cảm ơn
async function sendThankEmail(attendee, event, settings) {
  const t = getTransport();
  if (!t) return false;
  if (!attendee.email) return false;
  const mode = t.provider === 'brevo' ? 'remote' : 'cid';
  const { html, attachments } = buildEmail('thank', attendee, event, settings, mode);
  await deliver(t, {
    to: attendee.email,
    subject: fillTemplate(settings.thank_subject, attendee, event) || `Cảm ơn bạn đã tham dự ${event.name}`,
    html,
    attachments,
  });
  db.prepare("UPDATE attendees SET thankyou_email_sent_at = datetime('now') WHERE id = ?").run(attendee.id);
  return true;
}

// Bộ hẹn giờ: mỗi phút kiểm tra ai đã check-in đủ lâu thì gửi email cảm ơn
function startThankYouScheduler() {
  setInterval(async () => {
    try {
      const rows = db.prepare(`
        SELECT a.id AS att_id, a.event_id
        FROM attendees a
        JOIN email_settings s ON s.event_id = a.event_id
        WHERE a.checked_in_at IS NOT NULL
          AND a.thankyou_email_sent_at IS NULL
          AND a.email != ''
          AND s.thank_enabled = 1
          AND s.thank_body != ''
          AND datetime(a.checked_in_at, '+' || s.thank_delay_minutes || ' minutes') <= datetime('now')
        LIMIT 20
      `).all();
      for (const r of rows) {
        const attendee = db.prepare('SELECT * FROM attendees WHERE id = ?').get(r.att_id);
        const event = db.prepare('SELECT * FROM events WHERE id = ?').get(r.event_id);
        const settings = db.prepare('SELECT * FROM email_settings WHERE event_id = ?').get(r.event_id);
        try { await sendThankEmail(attendee, event, settings); }
        catch (e) { console.error('Lỗi gửi email cảm ơn cho', attendee.email, e.message); }
      }
    } catch (e) { console.error('Lỗi scheduler:', e.message); }
  }, 60 * 1000);
}

module.exports = { sendConfirmEmail, sendThankEmail, startThankYouScheduler, getTransport, deliver, buildEmail, fillTemplate };
