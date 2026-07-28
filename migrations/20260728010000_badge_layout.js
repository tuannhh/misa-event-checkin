// Cấu hình mẫu thẻ in (tem QR khách, xem lib/tspl.js) theo TỪNG SỰ KIỆN - màn "Tuỳ chỉnh mẫu
// thẻ" ở tab Phôi thẻ (mục 2026-07-28, sau khi chốt khổ 100x75mm ở migration/commit trước).
// Lưu 1 cột JSON đơn giản trên events (giống cách eligibility_values đã làm), không tách bảng
// riêng vì chỉ 1-1 với sự kiện và không cần join/tìm kiếm theo cột này.
exports.up = async function up(knex) {
  await knex.schema.alterTable('events', (t) => {
    t.text('badge_layout').nullable();
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('events', (t) => {
    t.dropColumn('badge_layout');
  });
};
