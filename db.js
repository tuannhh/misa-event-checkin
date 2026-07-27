// Tầng dữ liệu MySQL (thay cho SQLite/better-sqlite3).
// Giữ API quen thuộc db.prepare(sql).get/all/run nhưng BẤT ĐỒNG BỘ (phải await),
// để mã nguồn cũ chỉ cần thêm `await` thay vì viết lại toàn bộ truy vấn.
// Cấu trúc bảng (schema) do knex quản lý qua migrations/ (có version, có lịch sử) -
// xem knexfile.js. db.js chỉ còn lo seed dữ liệu ban đầu (Super Admin, dòng smtp_settings).
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const knex = require('knex')(require('./knexfile'));

// DB_SOCKET_PATH (VD /cloudsql/project:region:instance) -> kết nối qua Unix socket, dùng khi
// chạy Cloud Run + Cloud SQL (cách kết nối chuẩn của Google, không cần lộ IP). Không đặt biến
// này thì kết nối TCP qua host/port như cũ - không đổi hành vi mặc định.
const pool = mysql.createPool({
  ...(process.env.DB_SOCKET_PATH
    ? { socketPath: process.env.DB_SOCKET_PATH }
    : { host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT) || 3307 }),
  user: process.env.DB_USER || 'checkin',
  password: process.env.DB_PASSWORD || 'checkinpw',
  database: process.env.DB_NAME || 'checkin',
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4',
  dateStrings: true,   // trả datetime dạng chuỗi 'YYYY-MM-DD HH:MM:SS' (UTC) - frontend thêm 'Z' khi hiển thị
});

// prepare(sql) trả về đối tượng có get/all/run nhận tham số dạng varargs (?), giống better-sqlite3
function prepare(sql) {
  return {
    async get(...params) { const [rows] = await pool.query(sql, params); return rows[0]; },
    async all(...params) { const [rows] = await pool.query(sql, params); return rows; },
    async run(...params) {
      const [r] = await pool.query(sql, params);
      return { lastInsertRowid: r.insertId, changes: r.affectedRows };
    },
  };
}
async function exec(sql) { await pool.query(sql); }

const db = { prepare, exec, pool };

// Chạy migration (tạo/cập nhật bảng) + seed dữ liệu ban đầu - gọi 1 lần lúc khởi động
// server (await db.init()). Migration nằm ở migrations/ (quản lý bằng knex, xem knexfile.js).
async function init() {
  await knex.migrate.latest();

  // Seed Super Admin lần đầu - KHÔNG hard-code email/mật khẩu trong source.
  // Bắt buộc khai báo ADMIN_EMAIL + ADMIN_PASSWORD qua biến môi trường (.env, docker-compose...).
  const [supers] = await pool.query("SELECT id FROM users WHERE role = 'super_admin' LIMIT 1");
  if (!supers.length) {
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    if (!email || !password) {
      throw new Error(
        'Chưa có tài khoản Super Admin nào trong database và thiếu biến môi trường ADMIN_EMAIL/ADMIN_PASSWORD ' +
        'để tạo tài khoản đầu tiên. Đặt 2 biến này (VD trong file .env hoặc docker-compose) rồi khởi động lại.'
      );
    }
    const hash = bcrypt.hashSync(password, 10);
    await pool.query(
      "INSERT INTO users (name, department, unit, email, password_hash, role) VALUES ('Super Admin','','',?,?,'super_admin')",
      [email, hash]
    );
    console.log(`✔ Đã tạo tài khoản Super Admin: ${email}`);
  }
  // Đảm bảo có 1 dòng cấu hình SMTP
  await pool.query('INSERT IGNORE INTO smtp_settings (id) VALUES (1)');
}

db.init = init;
module.exports = db;
