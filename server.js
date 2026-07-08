// Máy chủ chính - chạy bằng lệnh: npm start
const express = require('express');
const session = require('express-session');
const path = require('path');
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
  cookie: { maxAge: 12 * 60 * 60 * 1000, secure: IS_CLOUD }, // đăng nhập giữ 12 tiếng
}));

app.use('/api', require('./routes/api'));
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname, 'public')));

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
