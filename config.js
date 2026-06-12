// Cấu hình đường dẫn dữ liệu - trên cloud sẽ đặt biến môi trường DATA_DIR trỏ vào ổ lưu trữ lâu dài
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

module.exports = { DATA_DIR, UPLOAD_DIR };
