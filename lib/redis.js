// Kết nối Redis dùng chung cho session store (connect-redis) và hàng đợi (BullMQ).
// Không có REDIS_URL -> trả về null, các nơi gọi tự lùi về phương án dự phòng (MemoryStore,
// setInterval trong-process) kèm cảnh báo - chỉ chấp nhận được khi chạy 1 instance (dev/demo).
const Redis = require('ioredis');

let client = null;

function getRedis() {
  if (!process.env.REDIS_URL) return null;
  if (!client) {
    // BullMQ yêu cầu maxRetriesPerRequest: null trên connection dùng cho Worker/Queue.
    client = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
  }
  return client;
}

module.exports = { getRedis };
