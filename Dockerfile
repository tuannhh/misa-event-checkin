# Đóng gói MISA Event Check-in để chạy trên Google Cloud Run
# Kèm Litestream để sao lưu database SQLite xuống bucket (Cloud Storage) theo thời gian thực
FROM node:20-slim

# Cài Litestream (công cụ sao lưu SQLite liên tục)
ADD https://github.com/benbjohnson/litestream/releases/download/v0.3.13/litestream-v0.3.13-linux-amd64.deb /tmp/litestream.deb
RUN apt-get update && apt-get install -y /tmp/litestream.deb && rm /tmp/litestream.deb && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Cài thư viện Node (tách riêng để tận dụng cache khi build lại)
COPY package.json package-lock.json ./
RUN npm install --omit=dev

# Copy toàn bộ mã nguồn
COPY . .

# Cấu hình Litestream và script khởi động
COPY litestream.yml /etc/litestream.yml
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENV NODE_ENV=production
ENV DATA_DIR=/data

# Cloud Run gọi vào cổng 8080
EXPOSE 8080
ENTRYPOINT ["/docker-entrypoint.sh"]
