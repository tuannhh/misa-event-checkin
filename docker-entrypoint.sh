#!/bin/sh
# Khởi động: khôi phục database từ bucket (nếu có), rồi chạy app dưới sự giám sát của Litestream
set -e

mkdir -p /data

# Khôi phục database từ bucket nếu trên đó đã có bản sao lưu (lần đầu chạy thì bỏ qua)
if [ -n "$REPLICA_URL" ]; then
  echo "Litestream: đang kiểm tra bản sao lưu trên bucket..."
  litestream restore -if-replica-exists -o /data/checkin.db "$REPLICA_URL" || echo "Chưa có bản sao lưu - bắt đầu với database mới"
  # Chạy app, đồng thời Litestream liên tục sao lưu mọi thay đổi xuống bucket
  exec litestream replicate -exec "node server.js"
else
  echo "Không có REPLICA_URL - chạy không sao lưu bucket (chỉ dùng để thử)"
  exec node server.js
fi
