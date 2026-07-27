// Quản lý "nhóm chức năng" (staff_roles) + ma trận tick quyền - thay cho việc phải sửa code mỗi
// khi cần thêm 1 kiểu vị trí mới cho nhân viên (Đợt 2, mục 3 kế hoạch nâng cấp).
// - Nhóm MẪU (event_id NULL, is_template=1): dùng chung toàn hệ thống, chỉ super_admin sửa được.
// - Nhóm riêng theo sự kiện (event_id = X): admin/super_admin quản lý sự kiện đó tạo/sửa được,
//   dùng khi 1 sự kiện cần một vị trí đặc thù không muốn ảnh hưởng các sự kiện khác.
const express = require('express');
const db = require('../db');
const { requireLogin, requireRole, getEventOr404, canManageEvent } = require('./lib/helpers');
const { PERMISSION_CODES, listPermissions } = require('./lib/permissions');

const router = express.Router();

router.get('/permissions', requireLogin, async (req, res) => {
  res.json(await listPermissions());
});

async function loadRoleWithPerms(roleId) {
  const role = await db.prepare('SELECT * FROM staff_roles WHERE id = ?').get(roleId);
  if (!role) return null;
  const perms = (await db.prepare('SELECT permission_code FROM staff_role_permissions WHERE role_id = ?').all(roleId)).map(p => p.permission_code);
  return { ...role, permissions: perms };
}

// ?event_id=X -> nhóm mẫu dùng chung + nhóm riêng của sự kiện X. Không truyền event_id -> chỉ nhóm mẫu.
router.get('/staff-roles', requireLogin, async (req, res) => {
  const eventId = req.query.event_id ? Number(req.query.event_id) : null;
  let roles;
  if (eventId) {
    const ev = await db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
    if (!ev) return res.status(404).json({ error: 'Không tìm thấy sự kiện' });
    roles = await db.prepare('SELECT * FROM staff_roles WHERE is_template = 1 OR event_id = ? ORDER BY is_template DESC, id').all(eventId);
  } else {
    roles = await db.prepare('SELECT * FROM staff_roles WHERE is_template = 1 ORDER BY id').all();
  }
  const roleIds = roles.map(r => r.id);
  let permsByRole = {};
  if (roleIds.length) {
    const rows = await db.prepare(`SELECT role_id, permission_code FROM staff_role_permissions WHERE role_id IN (${roleIds.map(() => '?').join(',')})`).all(...roleIds);
    for (const r of rows) (permsByRole[r.role_id] = permsByRole[r.role_id] || []).push(r.permission_code);
  }
  res.json(roles.map(r => ({ ...r, permissions: permsByRole[r.id] || [] })));
});

function validatePermissions(perms) {
  if (!Array.isArray(perms)) return [];
  return [...new Set(perms.filter(p => PERMISSION_CODES.includes(p)))];
}

// Tạo nhóm chức năng mới. event_id=null -> nhóm mẫu dùng chung (CHỈ super_admin); event_id=X ->
// nhóm riêng cho sự kiện X (admin quản lý sự kiện đó cũng tạo được).
router.post('/staff-roles', requireLogin, async (req, res) => {
  const { name, checkin_list_scope, permissions } = req.body;
  const eventId = req.body.event_id ? Number(req.body.event_id) : null;
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Cần nhập tên nhóm chức năng' });
  if (eventId) {
    const ev = await db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
    if (!ev) return res.status(404).json({ error: 'Không tìm thấy sự kiện' });
    if (!canManageEvent(req.user, ev)) return res.status(403).json({ error: 'Bạn không có quyền với sự kiện này' });
  } else if (req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Chỉ Super Admin được tạo nhóm chức năng dùng chung toàn hệ thống' });
  }
  const scope = ['all', 'checked_in', 'my_booth'].includes(checkin_list_scope) ? checkin_list_scope : 'checked_in';
  const info = await db.prepare('INSERT INTO staff_roles (event_id, name, is_template, checkin_list_scope) VALUES (?,?,?,?)')
    .run(eventId, String(name).trim(), eventId ? 0 : 1, scope);
  const perms = validatePermissions(permissions);
  for (const code of perms) await db.prepare('INSERT IGNORE INTO staff_role_permissions (role_id, permission_code) VALUES (?,?)').run(info.lastInsertRowid, code);
  res.json(await loadRoleWithPerms(info.lastInsertRowid));
});

router.put('/staff-roles/:id', requireLogin, async (req, res) => {
  const role = await db.prepare('SELECT * FROM staff_roles WHERE id = ?').get(req.params.id);
  if (!role) return res.status(404).json({ error: 'Không tìm thấy nhóm chức năng' });
  if (role.is_template) {
    if (req.user.role !== 'super_admin') return res.status(403).json({ error: 'Chỉ Super Admin được sửa nhóm chức năng dùng chung' });
  } else {
    const ev = await db.prepare('SELECT * FROM events WHERE id = ?').get(role.event_id);
    if (!ev || !canManageEvent(req.user, ev)) return res.status(403).json({ error: 'Bạn không có quyền' });
  }
  const { name, checkin_list_scope, permissions } = req.body;
  const scope = ['all', 'checked_in', 'my_booth'].includes(checkin_list_scope) ? checkin_list_scope : role.checkin_list_scope;
  await db.prepare('UPDATE staff_roles SET name = ?, checkin_list_scope = ? WHERE id = ?')
    .run((name ?? role.name).trim(), scope, role.id);
  if (Array.isArray(permissions)) {
    await db.prepare('DELETE FROM staff_role_permissions WHERE role_id = ?').run(role.id);
    for (const code of validatePermissions(permissions)) {
      await db.prepare('INSERT IGNORE INTO staff_role_permissions (role_id, permission_code) VALUES (?,?)').run(role.id, code);
    }
  }
  res.json(await loadRoleWithPerms(role.id));
});

router.delete('/staff-roles/:id', requireLogin, async (req, res) => {
  const role = await db.prepare('SELECT * FROM staff_roles WHERE id = ?').get(req.params.id);
  if (!role) return res.status(404).json({ error: 'Không tìm thấy nhóm chức năng' });
  if (role.is_template) {
    if (req.user.role !== 'super_admin') return res.status(403).json({ error: 'Chỉ Super Admin được xoá nhóm chức năng dùng chung' });
  } else {
    const ev = await db.prepare('SELECT * FROM events WHERE id = ?').get(role.event_id);
    if (!ev || !canManageEvent(req.user, ev)) return res.status(403).json({ error: 'Bạn không có quyền' });
  }
  const inUse = (await db.prepare('SELECT COUNT(*) AS c FROM event_staff WHERE role_id = ?').get(role.id)).c;
  if (inUse > 0) return res.status(409).json({ error: `Đang có ${inUse} nhân viên dùng nhóm này - đổi nhóm cho họ trước khi xoá` });
  await db.prepare('DELETE FROM staff_roles WHERE id = ?').run(role.id);
  res.json({ ok: true });
});

module.exports = router;
