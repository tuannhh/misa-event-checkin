// Đợt 3 (mục 6+8 kế hoạch nâng cấp): nhóm khách với nội dung email riêng + chọn tường minh
// nhà cung cấp gửi email (Brevo/Gmail/Manual). Thiết kế CỘNG THÊM, không đổi bảng cũ:
// - `email_settings` (đã có) vẫn là nội dung MẶC ĐỊNH của sự kiện, dùng khi khách không thuộc
//   nhóm nào hoặc nhóm chưa có mẫu riêng cho đúng loại email (confirm/thank).
// - `email_images` (đã có) vẫn là ảnh header/footer MẶC ĐỊNH - không đổi.
// - Nhóm có mẫu riêng thì override qua email_group_templates/email_group_images (bảng mới),
//   không có thì tự lùi về mặc định - xem email.js resolveGroupOverride().
exports.up = async function up(knex) {
  await knex.schema.createTable('attendee_groups', (t) => {
    t.increments('id').primary();
    t.integer('event_id').notNullable(); // events.id là INT signed (tạo bằng SQL thô ở baseline) - KHÔNG unsigned, phải khớp kiểu mới tạo được FK
    t.string('name', 100).notNullable();
    t.integer('sort').notNullable().defaultTo(0);
    t.timestamp('created_at').defaultTo(knex.raw('(UTC_TIMESTAMP())'));
    t.foreign('event_id').references('id').inTable('events').onDelete('CASCADE');
  });

  await knex.schema.alterTable('attendees', (t) => {
    t.integer('group_id').unsigned().nullable();
    t.foreign('group_id').references('id').inTable('attendee_groups').onDelete('SET NULL');
  });

  await knex.schema.createTable('email_group_templates', (t) => {
    t.increments('id').primary();
    t.integer('group_id').unsigned().notNullable();
    t.enu('type', ['confirm', 'thank']).notNullable();
    t.string('subject', 500).notNullable().defaultTo('');
    t.text('body');
    t.string('header_image', 50).notNullable().defaultTo(''); // mime-type làm cờ "có ảnh", giống email_settings
    t.string('footer_image', 50).notNullable().defaultTo('');
    t.integer('header_width').notNullable().defaultTo(100);
    t.integer('footer_width').notNullable().defaultTo(100);
    t.unique(['group_id', 'type']);
    t.foreign('group_id').references('id').inTable('attendee_groups').onDelete('CASCADE');
  });

  await knex.schema.createTable('email_group_images', (t) => {
    t.integer('template_id').unsigned().notNullable();
    t.string('kind', 20).notNullable(); // 'header' | 'footer'
    t.string('mime', 50).notNullable();
    t.specificType('data', 'LONGBLOB').notNullable();
    t.primary(['template_id', 'kind']);
    t.foreign('template_id').references('id').inTable('email_group_templates').onDelete('CASCADE');
  });

  // Chọn nhà cung cấp gửi email tường minh thay vì suy đoán ngầm (có brevo_api_key thì dùng
  // Brevo). Backfill provider theo dữ liệu đang có để KHÔNG đổi hành vi gửi email hiện tại.
  await knex.schema.alterTable('smtp_settings', (t) => {
    t.enu('provider', ['brevo', 'gmail', 'manual']).notNullable().defaultTo('manual');
  });
  await knex.raw(`
    UPDATE smtp_settings
    SET provider = CASE
      WHEN brevo_api_key != '' THEN 'brevo'
      WHEN host = 'smtp.gmail.com' AND smtp_user != '' THEN 'gmail'
      ELSE 'manual'
    END
  `);
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('smtp_settings', (t) => t.dropColumn('provider'));
  await knex.schema.dropTableIfExists('email_group_images');
  await knex.schema.dropTableIfExists('email_group_templates');
  await knex.schema.alterTable('attendees', (t) => { t.dropForeign('group_id'); t.dropColumn('group_id'); });
  await knex.schema.dropTableIfExists('attendee_groups');
};
