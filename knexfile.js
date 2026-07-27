// Cấu hình knex CHỈ dùng để quản lý migration (tạo/đổi bảng có version, có lịch sử).
// Toàn bộ truy vấn nghiệp vụ trong routes/ vẫn dùng db.js (pool mysql2 thuần) như cũ -
// tách 2 việc: knex lo "cấu trúc bảng", db.js lo "đọc/ghi dữ liệu". Không đổi cách viết
// query hiện có, tránh rủi ro khi viết lại hàng nghìn dòng SQL đang chạy tốt.
require('dotenv').config();

module.exports = {
  client: 'mysql2',
  // DB_SOCKET_PATH -> Unix socket (Cloud Run + Cloud SQL); không đặt thì TCP host/port như cũ.
  connection: {
    ...(process.env.DB_SOCKET_PATH
      ? { socketPath: process.env.DB_SOCKET_PATH }
      : { host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT) || 3307 }),
    user: process.env.DB_USER || 'checkin',
    password: process.env.DB_PASSWORD || 'checkinpw',
    database: process.env.DB_NAME || 'checkin',
    charset: 'utf8mb4',
  },
  migrations: {
    directory: './migrations',
    tableName: 'knex_migrations',
  },
};
