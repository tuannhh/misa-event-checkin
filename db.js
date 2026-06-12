// Cơ sở dữ liệu SQLite - tự động tạo file data/checkin.db khi chạy lần đầu
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const { DATA_DIR } = require('./config');

const db = new Database(path.join(DATA_DIR, 'checkin.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  department TEXT DEFAULT '',
  unit TEXT DEFAULT '',
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('super_admin','admin','moderator','checkin')),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  event_date TEXT NOT NULL,
  organizer TEXT DEFAULT '',
  unit TEXT DEFAULT '',
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS event_staff (
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, user_id)
);

CREATE TABLE IF NOT EXISTS attendees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  position TEXT DEFAULT '',
  company TEXT DEFAULT '',
  tax_code TEXT DEFAULT '',
  company_size TEXT DEFAULT '',
  qr_token TEXT NOT NULL UNIQUE,
  checked_in_at TEXT,
  checked_in_by INTEGER REFERENCES users(id),
  is_walkin INTEGER DEFAULT 0,
  confirm_email_sent_at TEXT,
  thankyou_email_sent_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS email_settings (
  event_id INTEGER PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  confirm_subject TEXT DEFAULT '',
  confirm_body TEXT DEFAULT '',
  auto_send_confirm INTEGER DEFAULT 0,
  thank_subject TEXT DEFAULT '',
  thank_body TEXT DEFAULT '',
  thank_delay_minutes INTEGER DEFAULT 60,
  thank_enabled INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS smtp_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  host TEXT DEFAULT 'smtp.gmail.com',
  port INTEGER DEFAULT 465,
  secure INTEGER DEFAULT 1,
  smtp_user TEXT DEFAULT '',
  smtp_pass TEXT DEFAULT '',
  from_name TEXT DEFAULT 'Ban Tổ Chức Sự Kiện'
);
`);

// Nâng cấp CSDL cũ: thêm cột ảnh header/footer email nếu chưa có
const emailCols = db.prepare("PRAGMA table_info(email_settings)").all().map(c => c.name);
for (const [col, def] of [
  ['header_image', "TEXT DEFAULT ''"], ['footer_image', "TEXT DEFAULT ''"],
  ['header_width', 'INTEGER DEFAULT 100'], ['footer_width', 'INTEGER DEFAULT 100'],
]) {
  if (!emailCols.includes(col)) db.exec(`ALTER TABLE email_settings ADD COLUMN ${col} ${def}`);
}

// Bỏ vai trò Moderator: chuyển các tài khoản moderator cũ thành nhân viên check-in
db.prepare("UPDATE users SET role = 'checkin' WHERE role = 'moderator'").run();

// Tạo tài khoản Super Admin lần đầu tiên
const existing = db.prepare('SELECT id FROM users WHERE role = ?').get('super_admin');
if (!existing) {
  const hash = bcrypt.hashSync('SocTho0607!9@@', 10);
  db.prepare(`INSERT INTO users (name, department, unit, email, password_hash, role)
              VALUES ('Super Admin', '', '', 'tuanbui88vn@gmail.com', ?, 'super_admin')`).run(hash);
  console.log('✔ Đã tạo tài khoản Super Admin: tuanbui88vn@gmail.com');
}

// Đảm bảo có 1 dòng cấu hình SMTP
db.prepare('INSERT OR IGNORE INTO smtp_settings (id) VALUES (1)').run();

module.exports = db;
