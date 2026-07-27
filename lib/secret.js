// Mã hoá các giá trị bí mật lưu trong DB (smtp_pass, brevo_api_key) bằng AES-256-GCM.
// Khoá lấy từ biến môi trường ENCRYPTION_KEY (chuỗi base64, 32 byte sau khi decode).
// Giá trị đã mã hoá có tiền tố "enc:v1:" để phân biệt với dữ liệu cũ còn ở dạng chữ thường
// (cho phép nâng cấp dần, không cần script chuyển đổi riêng: đọc ra chữ thường thì dùng luôn,
// lần lưu tiếp theo sẽ tự động mã hoá lại).
const crypto = require('crypto');

const PREFIX = 'enc:v1:';

function getKey() {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) return null;
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('ENCRYPTION_KEY phải là chuỗi base64 giải mã ra đúng 32 byte (dùng: openssl rand -base64 32)');
  }
  return key;
}

function encrypt(plain) {
  if (!plain) return '';
  const key = getKey();
  if (!key) return plain; // chưa cấu hình ENCRYPTION_KEY -> giữ nguyên (dev/local), không chặn khởi động
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join(':');
}

function decrypt(value) {
  if (!value) return '';
  if (!value.startsWith(PREFIX)) return value; // dữ liệu cũ chưa mã hoá, hoặc chưa cấu hình khoá
  const key = getKey();
  if (!key) throw new Error('Dữ liệu đã mã hoá nhưng thiếu biến môi trường ENCRYPTION_KEY để giải mã');
  const [ivB64, tagB64, dataB64] = value.slice(PREFIX.length).split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const dec = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
  return dec.toString('utf8');
}

module.exports = { encrypt, decrypt };
