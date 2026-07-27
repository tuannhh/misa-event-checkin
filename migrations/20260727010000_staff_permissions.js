// Thay `event_staff.staff_type` (enum cứng 4 giá trị, hành vi rải rác ở nhiều chỗ trong code)
// bằng mô hình QUYỀN TICK-CHỌN theo dữ liệu (Đợt 2, mục 3 - KE-HOACH-NANG-CAP-2026-07.md).
// Giữ NGUYÊN cột staff_type/booth_id cũ trên event_staff (không xoá dữ liệu, không đổi hành vi
// cột này) để có thể đối chiếu thủ công nếu cần; toàn bộ route API từ migration này trở đi CHỈ
// đọc quyền qua bảng mới (permissions/staff_roles/staff_role_permissions/event_staff.role_id),
// không còn đọc staff_type.
exports.up = async function up(knex) {
  await knex.schema.createTable('permissions', (t) => {
    t.string('code', 30).primary();
    t.string('name', 100).notNullable();
    t.string('description', 255).notNullable().defaultTo('');
    t.integer('sort').notNullable().defaultTo(0);
  });

  await knex.schema.createTable('staff_roles', (t) => {
    t.increments('id').primary();
    t.integer('event_id').nullable(); // NULL = mẫu dùng chung toàn hệ thống (is_template=1)
    t.string('name', 100).notNullable();
    t.boolean('is_template').notNullable().defaultTo(false);
    // Phạm vi cho quyền "view_checkin_list": all (mọi khách) / checked_in (chỉ người đã check-in)
    // / my_booth (chỉ khách đã ghé booth mình phụ trách). Không có ý nghĩa nếu role không có quyền đó.
    t.enu('checkin_list_scope', ['all', 'checked_in', 'my_booth']).notNullable().defaultTo('checked_in');
    t.timestamp('created_at').defaultTo(knex.raw('(UTC_TIMESTAMP())')); // MySQL bắt buộc bọc ngoặc cho default là biểu thức
    t.foreign('event_id').references('id').inTable('events').onDelete('CASCADE');
  });

  await knex.schema.createTable('staff_role_permissions', (t) => {
    t.integer('role_id').unsigned().notNullable();
    t.string('permission_code', 30).notNullable();
    t.primary(['role_id', 'permission_code']);
    t.foreign('role_id').references('id').inTable('staff_roles').onDelete('CASCADE');
    t.foreign('permission_code').references('code').inTable('permissions').onDelete('CASCADE');
  });

  await knex.schema.alterTable('event_staff', (t) => {
    t.integer('role_id').unsigned().nullable();
    // Tick thêm/bớt quyền riêng cho 1 người mà không cần tạo nhóm chức năng mới (mảng mã quyền JSON).
    // VD: {"add":["print_badge"],"remove":["assign_badge"]}. Quyền hiệu lực = quyền của role_id,
    // cộng "add", trừ "remove" - tính ở backend mỗi request (xem routes/lib/permissions.js).
    t.text('extra_permissions').nullable();
    t.foreign('role_id').references('id').inTable('staff_roles').onDelete('SET NULL');
  });

  // ---- Seed danh mục quyền: 7 quyền theo yêu cầu chủ dự án + view_pii tách riêng (đã chốt Q4,
  // để giữ được hành vi "manager chỉ xem số liệu ẩn danh" khi tách quyền khỏi staff_type cứng). ----
  const PERMISSIONS = [
    ['checkin', 'Check-in', 'Quét QR / check-in tay / thêm khách vãng lai', 1],
    ['view_checkin_list', 'Xem danh sách check-in', 'Xem danh sách người tham dự', 2],
    ['view_pii', 'Xem thông tin cá nhân khách', 'Thấy email/số điện thoại khách trong danh sách và báo cáo', 3],
    ['note', 'Ghi chú', 'Ghi chú khách tại booth', 4],
    ['mark_potential', 'Xác định khách hàng tiềm năng', 'Tick và ghi chú khách hàng tiềm năng', 5],
    ['view_report', 'Xem báo cáo', 'Vào tab Báo cáo, xuất Excel', 6],
    ['print_badge', 'In thẻ', 'In tem QR / gửi lệnh in', 7],
    ['assign_badge', 'Gán thẻ', 'Gán phôi thẻ cho khách, ngừng thẻ', 8],
  ];
  for (const [code, name, description, sort] of PERMISSIONS) {
    await knex('permissions').insert({ code, name, description, sort });
  }

  // ---- Seed 4 nhóm chức năng MẪU (event_id NULL, is_template=1) - tick quyền ĐÚNG NGUYÊN VẸN
  // hành vi 4 staff_type cũ (đối chiếu từng route trong routes/*.js trước khi viết migration này)
  // để KHÔNG đổi quyền của bất kỳ ai đang được gán sẵn khi migration này chạy. ----
  const ROLE_TEMPLATES = [
    // 'checkin' cũ: quét/check-in, chỉ thấy người ĐÃ check-in, thấy đủ thông tin, được gán thẻ
    // (badgeOpGuard cũ chỉ chặn supervisor/manager, không chặn checkin thường).
    { name: 'Nhân viên check-in', scope: 'checked_in', perms: ['checkin', 'view_checkin_list', 'view_pii', 'assign_badge'] },
    // 'reception' cũ: như checkin nhưng thấy TOÀN BỘ khách + được in tem (tab riêng).
    { name: 'Lễ tân', scope: 'all', perms: ['checkin', 'view_checkin_list', 'view_pii', 'print_badge', 'assign_badge'] },
    // 'supervisor' cũ: KHÔNG quét/check-in, chỉ ghi chú + tick tiềm năng qua booth-monitor
    // (không có view_checkin_list vì màn /attendees vốn trả rows=[] cho supervisor).
    { name: 'Giám sát booth', scope: 'checked_in', perms: ['note', 'mark_potential'] },
    // 'manager' cũ: không có quyền nào trong 8 quyền này - dashboard /stats không bị chặn theo
    // quyền (mở cho mọi nhân viên đã được gán vào sự kiện, giữ nguyên hành vi cũ).
    { name: 'Quản lý (xem số liệu)', scope: 'checked_in', perms: [] },
  ];
  const roleIdByName = {};
  for (const r of ROLE_TEMPLATES) {
    const [id] = await knex('staff_roles').insert({ event_id: null, name: r.name, is_template: 1, checkin_list_scope: r.scope });
    roleIdByName[r.name] = id;
    for (const code of r.perms) await knex('staff_role_permissions').insert({ role_id: id, permission_code: code });
  }

  // ---- Chuyển dữ liệu event_staff hiện có: staff_type -> role_id tương ứng ----
  const STAFF_TYPE_TO_ROLE = {
    checkin: 'Nhân viên check-in',
    reception: 'Lễ tân',
    supervisor: 'Giám sát booth',
    manager: 'Quản lý (xem số liệu)',
  };
  const rows = await knex('event_staff').select('event_id', 'user_id', 'staff_type');
  for (const row of rows) {
    const roleName = STAFF_TYPE_TO_ROLE[row.staff_type] || 'Nhân viên check-in';
    await knex('event_staff').where({ event_id: row.event_id, user_id: row.user_id }).update({ role_id: roleIdByName[roleName] });
  }
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('event_staff', (t) => {
    t.dropForeign('role_id');
    t.dropColumn('role_id');
    t.dropColumn('extra_permissions');
  });
  await knex.schema.dropTableIfExists('staff_role_permissions');
  await knex.schema.dropTableIfExists('staff_roles');
  await knex.schema.dropTableIfExists('permissions');
};
