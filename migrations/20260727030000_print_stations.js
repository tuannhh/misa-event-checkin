// Đợt 4 (mục 5 kế hoạch nâng cấp): in tem QR từ điện thoại KHÔNG qua máy tính + Chrome
// --kiosk-printing. 2 hướng đã chốt với chủ dự án (Q3 = "Cả hai"):
// - Trạm in LAN: máy chủ bắn thẳng lệnh in (TSPL) qua TCP tới IP máy in trong cùng mạng.
// - Trạm in Agent: chương trình nhỏ chạy trên 1 máy tính (không cần Chrome) tự ghép nối bằng
//   pairing_code, poll việc cần in về rồi tự in (qua LAN nội bộ của nó hoặc máy in USB).
exports.up = async function up(knex) {
  await knex.schema.createTable('print_stations', (t) => {
    t.increments('id').primary();
    t.integer('event_id').notNullable();
    t.string('name', 100).notNullable();
    t.enu('kind', ['lan', 'agent']).notNullable().defaultTo('lan');
    t.string('pairing_code', 20).notNullable();
    t.string('host', 255).nullable(); // IP/hostname máy in (lan), hoặc IP agent tự báo khi ghép nối
    t.integer('port').notNullable().defaultTo(9100); // 9100 = cổng chuẩn RAW/JetDirect của máy in mạng
    t.string('printer_name', 255).nullable(); // tên máy in cục bộ ở phía agent (nếu in qua driver)
    t.timestamp('last_seen_at').nullable();
    t.timestamp('created_at').defaultTo(knex.raw('(UTC_TIMESTAMP())'));
    t.unique('pairing_code');
    t.foreign('event_id').references('id').inTable('events').onDelete('CASCADE');
  });

  await knex.schema.createTable('print_jobs', (t) => {
    t.increments('id').primary();
    t.integer('event_id').notNullable();
    t.integer('station_id').unsigned().nullable();
    t.string('kind', 20).notNullable(); // 'attendee_qr' (mở rộng thêm loại sau nếu cần)
    t.integer('ref_id').notNullable(); // attendee_id
    t.text('payload').notNullable(); // lệnh TSPL đã dựng sẵn - xem lib/tspl.js
    t.enu('status', ['pending', 'done', 'failed']).notNullable().defaultTo('pending');
    t.integer('attempts').notNullable().defaultTo(0);
    t.text('error').nullable();
    t.timestamp('created_at').defaultTo(knex.raw('(UTC_TIMESTAMP())'));
    t.timestamp('updated_at').defaultTo(knex.raw('(UTC_TIMESTAMP())'));
    t.foreign('event_id').references('id').inTable('events').onDelete('CASCADE');
    t.foreign('station_id').references('id').inTable('print_stations').onDelete('SET NULL');
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('print_jobs');
  await knex.schema.dropTableIfExists('print_stations');
};
