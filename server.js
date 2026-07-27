// Máy chủ chính - chạy bằng lệnh: npm start
require('dotenv').config(); // đọc file .env nếu có (local dev); trên Docker/Cloud Run biến môi trường đã có sẵn
const express = require('express');
const session = require('express-session');
const { RedisStore } = require('connect-redis');
const { createClient } = require('redis'); // connect-redis dùng API của gói "redis" (node-redis),
                                            // KHÔNG tương thích ioredis - BullMQ ở lib/redis.js
                                            // dùng ioredis riêng, 2 gói khác nhau cho 2 việc khác nhau.
const path = require('path');
const fs = require('fs');
const { UPLOAD_DIR } = require('./config');
const db = require('./db');
const { startThankYouScheduler } = require('./email');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_CLOUD = !!process.env.RAILWAY_ENVIRONMENT || !!process.env.RENDER || process.env.NODE_ENV === 'production';

if (IS_CLOUD) app.set('trust proxy', 1); // chạy sau proxy HTTPS của nhà cung cấp cloud

if (!process.env.SESSION_SECRET) {
  console.error(
    '✖ Thiếu biến môi trường SESSION_SECRET (chuỗi bí mật ký session đăng nhập). ' +
    'Tạo bằng lệnh: openssl rand -hex 32, rồi đặt vào .env hoặc docker-compose trước khi chạy lại.'
  );
  process.exit(1);
}

async function start() {
  // Session lưu ở Redis (REDIS_URL) khi có - bắt buộc nếu chạy nhiều instance song song
  // (MemoryStore mặc định của express-session sẽ làm user bị đăng xuất ngẫu nhiên khi có >1
  // instance, và rò rỉ bộ nhớ). Không có REDIS_URL vẫn chạy được (dev/demo 1 instance) nhưng
  // in cảnh báo rõ ràng.
  let sessionStore;
  if (process.env.REDIS_URL) {
    const redisClient = createClient({ url: process.env.REDIS_URL });
    redisClient.on('error', (err) => console.error('Lỗi kết nối Redis (session):', err.message));
    await redisClient.connect();
    sessionStore = new RedisStore({ client: redisClient, prefix: 'checkin-sess:' });
  } else {
    console.warn(
      '⚠ Chưa cấu hình REDIS_URL - session đang lưu trong RAM (MemoryStore). ' +
      'CHỈ chạy được đúng 1 instance; nếu scale nhiều instance, user sẽ bị đăng xuất ngẫu nhiên.'
    );
  }

  app.use(express.json({ limit: '2mb' }));
  app.use(session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    // 'auto': cookie chỉ đặt secure khi kết nối là HTTPS (nhờ trust proxy đọc X-Forwarded-Proto).
    // Nhờ vậy chạy được cả sau proxy HTTPS (cloud/nội bộ) lẫn HTTP trực tiếp (Docker nội bộ/test).
    cookie: { maxAge: 12 * 60 * 60 * 1000, secure: 'auto' }, // đăng nhập giữ 12 tiếng
  }));

  app.use('/api', require('./routes'));
  app.use('/uploads', express.static(UPLOAD_DIR));
  // Ưu tiên bản Vue đã build (public-vue) nếu có; ngược lại dùng bản cũ (public)
  const VUE_DIST = path.join(__dirname, 'public-vue');
  const STATIC_DIR = fs.existsSync(path.join(VUE_DIST, 'index.html')) ? VUE_DIST : path.join(__dirname, 'public');
  app.use(express.static(STATIC_DIR));

  // Khởi tạo database (tạo bảng + seed) rồi mới mở cổng
  await db.init();
  startThankYouScheduler(); // Bộ hẹn giờ gửi email cảm ơn
  app.listen(PORT, () => {
    console.log(`✔ Hệ thống Check-in đang chạy tại: http://localhost:${PORT}`);
  });
}

start().catch(err => {
  console.error('✖ Không khởi động được:', err.message);
  process.exit(1);
});
