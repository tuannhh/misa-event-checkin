// Máy chủ chính - chạy bằng lệnh: npm start
const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const { UPLOAD_DIR } = require('./config');
const db = require('./db');
const { startThankYouScheduler } = require('./email');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_CLOUD = !!process.env.RAILWAY_ENVIRONMENT || !!process.env.RENDER || process.env.NODE_ENV === 'production';

if (IS_CLOUD) app.set('trust proxy', 1); // chạy sau proxy HTTPS của nhà cung cấp cloud

app.use(express.json({ limit: '2mb' }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'event-checkin-secret-2026',
  resave: false,
  saveUninitialized: false,
  // 'auto': cookie chỉ đặt secure khi kết nối là HTTPS (nhờ trust proxy đọc X-Forwarded-Proto).
  // Nhờ vậy chạy được cả sau proxy HTTPS (cloud/nội bộ) lẫn HTTP trực tiếp (Docker nội bộ/test).
  cookie: { maxAge: 12 * 60 * 60 * 1000, secure: 'auto' }, // đăng nhập giữ 12 tiếng
}));

app.use('/api', require('./routes/api'));
app.use('/uploads', express.static(UPLOAD_DIR));
// Ưu tiên bản Vue đã build (public-vue) nếu có; ngược lại dùng bản cũ (public)
const VUE_DIST = path.join(__dirname, 'public-vue');
const STATIC_DIR = fs.existsSync(path.join(VUE_DIST, 'index.html')) ? VUE_DIST : path.join(__dirname, 'public');
app.use(express.static(STATIC_DIR));

// Khởi tạo database (tạo bảng + seed) rồi mới mở cổng
db.init().then(() => {
  // Bộ hẹn giờ gửi email cảm ơn
  startThankYouScheduler();
  app.listen(PORT, () => {
    console.log(`✔ Hệ thống Check-in đang chạy tại: http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('✖ Không kết nối được database:', err.message);
  process.exit(1);
});
