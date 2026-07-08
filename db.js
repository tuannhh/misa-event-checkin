// Tầng dữ liệu MySQL (thay cho SQLite/better-sqlite3).
// Giữ API quen thuộc db.prepare(sql).get/all/run nhưng BẤT ĐỒNG BỘ (phải await),
// để mã nguồn cũ chỉ cần thêm `await` thay vì viết lại toàn bộ truy vấn.
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3307,
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

// Tạo bảng (nếu chưa có) + seed - gọi 1 lần lúc khởi động server (await db.init()).
// Dùng DEFAULT (UTC_TIMESTAMP()) để created_at luôn theo giờ UTC, không phụ thuộc timezone server MySQL.
async function init() {
  const statements = [
    `CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      department VARCHAR(255) NOT NULL DEFAULT '',
      unit VARCHAR(255) NOT NULL DEFAULT '',
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(20) NOT NULL,
      created_at DATETIME DEFAULT (UTC_TIMESTAMP())
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

    `CREATE TABLE IF NOT EXISTS events (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(500) NOT NULL,
      event_date VARCHAR(30) NOT NULL,
      organizer VARCHAR(255) NOT NULL DEFAULT '',
      unit VARCHAR(255) NOT NULL DEFAULT '',
      created_by INT NOT NULL,
      created_at DATETIME DEFAULT (UTC_TIMESTAMP()),
      eligibility_field VARCHAR(50) NOT NULL DEFAULT '',
      eligibility_values TEXT,
      CONSTRAINT fk_events_user FOREIGN KEY (created_by) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

    `CREATE TABLE IF NOT EXISTS event_staff (
      event_id INT NOT NULL,
      user_id INT NOT NULL,
      booth_id INT NULL,
      staff_type VARCHAR(20) NOT NULL DEFAULT 'checkin',
      PRIMARY KEY (event_id, user_id),
      CONSTRAINT fk_es_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
      CONSTRAINT fk_es_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

    `CREATE TABLE IF NOT EXISTS attendees (
      id INT AUTO_INCREMENT PRIMARY KEY,
      event_id INT NOT NULL,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL DEFAULT '',
      phone VARCHAR(50) NOT NULL DEFAULT '',
      position VARCHAR(100) NOT NULL DEFAULT '',
      company VARCHAR(500) NOT NULL DEFAULT '',
      tax_code VARCHAR(50) NOT NULL DEFAULT '',
      company_size VARCHAR(100) NOT NULL DEFAULT '',
      qr_token VARCHAR(40) NOT NULL UNIQUE,
      checked_in_at DATETIME NULL,
      checked_in_by INT NULL,
      is_walkin TINYINT NOT NULL DEFAULT 0,
      confirm_email_sent_at DATETIME NULL,
      thankyou_email_sent_at DATETIME NULL,
      created_at DATETIME DEFAULT (UTC_TIMESTAMP()),
      salutation VARCHAR(20) NOT NULL DEFAULT '',
      importance VARCHAR(50) NOT NULL DEFAULT 'Bình thường',
      CONSTRAINT fk_att_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

    `CREATE TABLE IF NOT EXISTS email_settings (
      event_id INT PRIMARY KEY,
      confirm_subject VARCHAR(500) NOT NULL DEFAULT '',
      confirm_body TEXT,
      auto_send_confirm TINYINT NOT NULL DEFAULT 0,
      thank_subject VARCHAR(500) NOT NULL DEFAULT '',
      thank_body TEXT,
      thank_delay_minutes INT NOT NULL DEFAULT 60,
      thank_enabled TINYINT NOT NULL DEFAULT 0,
      header_image VARCHAR(50) NOT NULL DEFAULT '',
      footer_image VARCHAR(50) NOT NULL DEFAULT '',
      header_width INT NOT NULL DEFAULT 100,
      footer_width INT NOT NULL DEFAULT 100,
      CONSTRAINT fk_ems_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

    `CREATE TABLE IF NOT EXISTS booths (
      id INT AUTO_INCREMENT PRIMARY KEY,
      event_id INT NOT NULL,
      name VARCHAR(255) NOT NULL,
      sort INT NOT NULL DEFAULT 0,
      CONSTRAINT fk_booth_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

    `CREATE TABLE IF NOT EXISTS booth_visits (
      id INT AUTO_INCREMENT PRIMARY KEY,
      event_id INT NOT NULL,
      booth_id INT NOT NULL,
      attendee_id INT NOT NULL,
      visited_at DATETIME DEFAULT (UTC_TIMESTAMP()),
      visited_by INT NULL,
      note TEXT,
      UNIQUE KEY uq_booth_attendee (booth_id, attendee_id),
      CONSTRAINT fk_bv_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
      CONSTRAINT fk_bv_booth FOREIGN KEY (booth_id) REFERENCES booths(id) ON DELETE CASCADE,
      CONSTRAINT fk_bv_att FOREIGN KEY (attendee_id) REFERENCES attendees(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

    `CREATE TABLE IF NOT EXISTS email_images (
      event_id INT NOT NULL,
      kind VARCHAR(20) NOT NULL,
      mime VARCHAR(50) NOT NULL,
      data LONGBLOB NOT NULL,
      PRIMARY KEY (event_id, kind),
      CONSTRAINT fk_ei_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

    `CREATE TABLE IF NOT EXISTS badges (
      id INT AUTO_INCREMENT PRIMARY KEY,
      event_id INT NOT NULL,
      code VARCHAR(50) NOT NULL,
      attendee_id INT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      paired_at DATETIME NULL,
      paired_by INT NULL,
      created_at DATETIME DEFAULT (UTC_TIMESTAMP()),
      UNIQUE KEY uq_event_code (event_id, code),
      CONSTRAINT fk_badge_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
      CONSTRAINT fk_badge_att FOREIGN KEY (attendee_id) REFERENCES attendees(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

    `CREATE TABLE IF NOT EXISTS smtp_settings (
      id INT PRIMARY KEY,
      host VARCHAR(255) NOT NULL DEFAULT 'smtp.gmail.com',
      port INT NOT NULL DEFAULT 465,
      secure TINYINT NOT NULL DEFAULT 1,
      smtp_user VARCHAR(255) NOT NULL DEFAULT '',
      smtp_pass VARCHAR(255) NOT NULL DEFAULT '',
      from_name VARCHAR(255) NOT NULL DEFAULT 'Ban Tổ Chức Sự Kiện',
      brevo_api_key VARCHAR(255) NOT NULL DEFAULT '',
      sender_email VARCHAR(255) NOT NULL DEFAULT ''
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  ];

  for (const sql of statements) await pool.query(sql);

  // Seed Super Admin lần đầu
  const [supers] = await pool.query("SELECT id FROM users WHERE role = 'super_admin' LIMIT 1");
  if (!supers.length) {
    const hash = bcrypt.hashSync('SocTho0607!9@@', 10);
    await pool.query(
      "INSERT INTO users (name, department, unit, email, password_hash, role) VALUES ('Super Admin','','','tuanbui88vn@gmail.com',?,'super_admin')",
      [hash]
    );
    console.log('✔ Đã tạo tài khoản Super Admin: tuanbui88vn@gmail.com');
  }
  // Đảm bảo có 1 dòng cấu hình SMTP
  await pool.query('INSERT IGNORE INTO smtp_settings (id) VALUES (1)');
}

db.init = init;
module.exports = db;
