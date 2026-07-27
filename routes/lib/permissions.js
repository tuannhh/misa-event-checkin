// Quyền tick-chọn thay cho event_staff.staff_type cứng (Đợt 2, mục 3 kế hoạch nâng cấp).
// Chỉ áp dụng cho user.role === 'checkin' (super_admin/admin không bị giới hạn theo bảng này -
// vẫn dùng canManageEvent như cũ). Xem migrations/20260727010000_staff_permissions.js để biết
// 8 mã quyền và 4 nhóm mẫu (Nhân viên check-in/Lễ tân/Giám sát booth/Quản lý).
const db = require('../../db');

const PERMISSION_CODES = [
  'checkin', 'view_checkin_list', 'view_pii', 'note', 'mark_potential',
  'view_report', 'print_badge', 'assign_badge',
];

async function listPermissions() {
  return db.prepare('SELECT * FROM permissions ORDER BY sort').all();
}

// Trả về { boothId, roleId, roleName, checkinListScope, permissions:Set<string> } hoặc null
// nếu user chưa được gán vào sự kiện này.
async function getAssignment(user, eventId) {
  const row = await db.prepare(`
    SELECT es.booth_id, es.role_id, es.extra_permissions, sr.name AS role_name, sr.checkin_list_scope
    FROM event_staff es LEFT JOIN staff_roles sr ON sr.id = es.role_id
    WHERE es.event_id = ? AND es.user_id = ?`).get(eventId, user.id);
  if (!row) return null;

  const rolePerms = row.role_id
    ? (await db.prepare('SELECT permission_code FROM staff_role_permissions WHERE role_id = ?').all(row.role_id)).map(r => r.permission_code)
    : [];
  let extra = {};
  try { extra = JSON.parse(row.extra_permissions || '{}') || {}; } catch (e) { extra = {}; }
  const add = Array.isArray(extra.add) ? extra.add.filter(c => PERMISSION_CODES.includes(c)) : [];
  const remove = new Set(Array.isArray(extra.remove) ? extra.remove : []);

  const permissions = new Set([...rolePerms, ...add].filter(c => !remove.has(c)));
  return {
    boothId: row.booth_id || null,
    roleId: row.role_id || null,
    roleName: row.role_name || null,
    checkinListScope: row.checkin_list_scope || 'checked_in',
    permissions,
  };
}

function hasPerm(assignment, code) {
  return !!(assignment && assignment.permissions.has(code));
}

// Map ngược tên 4 nhóm MẪU built-in -> staff_type cũ, CHỈ để trả field `my_staff_type`/`staff_type`
// tương thích ngược cho bản FE cũ (EventsView.vue, EventDetailView.vue... còn đọc field này) trong
// lúc chờ làm lại FE. Nhóm chức năng tự tạo mới (VD "Tư vấn") không map được -> trả về 'checkin'
// (FE cũ hiển thị tab mặc định, không sập, nhưng chưa vẽ đúng tab riêng - sẽ sửa khi làm FE).
const LEGACY_ROLE_NAME_TO_STAFF_TYPE = {
  'Nhân viên check-in': 'checkin',
  'Lễ tân': 'reception',
  'Giám sát booth': 'supervisor',
  'Quản lý (xem số liệu)': 'manager',
};
function legacyStaffType(assignment) {
  if (!assignment || !assignment.roleName) return 'checkin';
  return LEGACY_ROLE_NAME_TO_STAFF_TYPE[assignment.roleName] || 'checkin';
}

// Map ngược staff_type cũ -> id nhóm MẪU tương ứng, dùng khi client (FE cũ) vẫn gửi staff_type
// thay vì role_id lên PUT /events/:id/staff (tương thích ngược, xem routes/events.js).
async function getLegacyRoleIdMap() {
  const rows = await db.prepare("SELECT id, name FROM staff_roles WHERE is_template = 1").all();
  const byName = Object.fromEntries(rows.map(r => [r.name, r.id]));
  return {
    checkin: byName['Nhân viên check-in'],
    reception: byName['Lễ tân'],
    supervisor: byName['Giám sát booth'],
    manager: byName['Quản lý (xem số liệu)'],
  };
}
async function getDefaultRoleId() {
  return (await getLegacyRoleIdMap()).checkin;
}

// Kiểm tra quyền `code` cho route hiện tại. super_admin/admin luôn qua (không giới hạn theo
// bảng quyền - vẫn dùng canManageEvent riêng). Trả { ok:false } và tự gửi response lỗi nếu
// không đạt; { ok:true, assignment } nếu đạt (assignment=null với super_admin/admin).
async function requirePerm(req, res, ev, code) {
  if (req.user.role !== 'checkin') return { ok: true, assignment: null };
  const assignment = await getAssignment(req.user, ev.id);
  if (!assignment) { res.status(403).json({ error: 'Bạn chưa được gán vào sự kiện này' }); return { ok: false }; }
  if (!hasPerm(assignment, code)) { res.status(403).json({ error: 'Bạn không có quyền thực hiện thao tác này' }); return { ok: false }; }
  return { ok: true, assignment };
}

module.exports = {
  PERMISSION_CODES, listPermissions, getAssignment, hasPerm, requirePerm,
  legacyStaffType, getLegacyRoleIdMap, getDefaultRoleId,
};
