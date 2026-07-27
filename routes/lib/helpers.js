// Helper dùng chung cho các module route (phân quyền, hằng số nghiệp vụ, tiện ích ngày giờ).
// Tách ra khỏi routes/api.js (trước đây 1 file 1128 dòng gộp mọi thứ) để mỗi module route
// độc lập, dễ đọc/dễ diff. KHÔNG đổi logic - chỉ chuyển nguyên vị trí.
const crypto = require('crypto');
const db = require('../../db');

const POSITIONS = ['CEO/Founder/TGĐ', 'C-Level', 'Chuyên gia', 'Chuyên viên'];
const COMPANY_SIZES = [
  'Dưới 10 người', 'Từ 10 đến dưới 50 người', 'Từ 50 đến dưới 100 người',
  'Từ 100 đến dưới 300 người', 'Từ 300 người đến 500 người', 'Từ 500 người trở lên',
];
const ROLES = ['super_admin', 'admin', 'checkin'];
const SALUTATIONS = ['Anh', 'Chị', 'Ông', 'Bà'];
const IMPORTANCES = ['Bình thường', 'VIP', 'VVIP', 'Speaker', 'Ban lãnh đạo', 'Ban Tổ chức'];
const ELIGIBILITY_FIELDS = {
  importance: { label: 'Mức độ quan trọng', options: IMPORTANCES },
  position: { label: 'Chức vụ', options: POSITIONS },
  company_size: { label: 'Quy mô nhân sự', options: COMPANY_SIZES },
  salutation: { label: 'Xưng hô', options: SALUTATIONS },
};
async function requireLogin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Chưa đăng nhập' });
  req.user = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);
  if (!req.user) { req.session.destroy(() => {}); return res.status(401).json({ error: 'Tài khoản không tồn tại' }); }
  next();
}
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Bạn không có quyền thực hiện thao tác này' });
    next();
  };
}
function visibleEventsSql(user) {
  if (user.role === 'super_admin') return { where: '1=1', params: [] };
  if (user.role === 'admin') return { where: 'e.unit = ?', params: [user.unit] };
  return { where: 'e.id IN (SELECT event_id FROM event_staff WHERE user_id = ?)', params: [user.id] };
}
async function canViewEvent(user, event) {
  if (user.role === 'super_admin') return true;
  if (user.role === 'admin') return event.unit === user.unit;
  return !!(await db.prepare('SELECT 1 AS ok FROM event_staff WHERE event_id = ? AND user_id = ?').get(event.id, user.id));
}
function canManageEvent(user, event) {
  if (user.role === 'super_admin') return true;
  if (user.role === 'admin') return event.unit === user.unit;
  return false;
}
async function getEventOr404(req, res) {
  const ev = await db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  if (!ev) { res.status(404).json({ error: 'Không tìm thấy sự kiện' }); return null; }
  if (!(await canViewEvent(req.user, ev))) { res.status(403).json({ error: 'Bạn không có quyền với sự kiện này' }); return null; }
  return ev;
}
function newToken() {
  return crypto.randomBytes(10).toString('hex').toUpperCase(); // chuỗi 20 ký tự ngẫu nhiên, vô nghĩa
}
function isEligible(attendee, event) {
  if (!event.eligibility_field || !ELIGIBILITY_FIELDS[event.eligibility_field]) return true;
  let vals = [];
  try { vals = JSON.parse(event.eligibility_values || '[]'); } catch (e) {}
  if (!Array.isArray(vals) || !vals.length) return true;
  return vals.includes(attendee[event.eligibility_field]);
}
function fmtVN(isoUtc) {
  return new Date(isoUtc + 'Z').toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
}
function isEventToday(ev) {
  const todayVN = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
  return (ev.event_date || '').slice(0, 10) === todayVN;
}
async function getEmailSettings(eventId) {
  await db.prepare('INSERT IGNORE INTO email_settings (event_id) VALUES (?)').run(eventId);
  return db.prepare('SELECT * FROM email_settings WHERE event_id = ?').get(eventId);
}
function validateNewUserRole(actor, role, unit) {
  if (!ROLES.includes(role)) return 'Vai trò không hợp lệ';
  if (actor.role === 'admin') {
    if (role !== 'checkin') return 'Admin chỉ được tạo Nhân viên check-in';
    if (unit !== actor.unit) return 'Admin chỉ được tạo thành viên trong đơn vị của mình';
  }
  return null;
}
function eligibilityJson(field, values) {
  if (!field || !ELIGIBILITY_FIELDS[field]) return ['', '[]'];
  const valid = Array.isArray(values) ? values.filter(v => ELIGIBILITY_FIELDS[field].options.includes(v)) : [];
  return [field, JSON.stringify(valid)];
}

module.exports = {
  POSITIONS, COMPANY_SIZES, ROLES, SALUTATIONS, IMPORTANCES, ELIGIBILITY_FIELDS,
  requireLogin, requireRole, visibleEventsSql, canViewEvent, canManageEvent, getEventOr404,
  newToken, isEligible, fmtVN, isEventToday, getEmailSettings,
  validateNewUserRole, eligibilityJson,
};
