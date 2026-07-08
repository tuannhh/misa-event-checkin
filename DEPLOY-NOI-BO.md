# 🏢 Hướng dẫn chạy trên hạ tầng nội bộ MISA (Docker)

Tài liệu cho dev MISA. Bản này **không phụ thuộc Google Cloud / Litestream** (khác bản Cloud Run).

## 1. Chạy nhanh bằng Docker Compose (khuyến nghị)

```bash
# Tại thư mục dự án:
docker compose -f docker-compose.internal.yml up -d --build

# Xem log:
docker compose -f docker-compose.internal.yml logs -f

# Dừng (giữ nguyên dữ liệu):
docker compose -f docker-compose.internal.yml down
```

Mở http://localhost:3000 — đăng nhập Super Admin mặc định:
- Email: `tuanbui88vn@gmail.com` · Mật khẩu: `SocTho0607!9@@` (đổi ngay sau khi chạy thật).

## 2. Hoặc chạy bằng Docker thuần

```bash
docker build -f Dockerfile.internal -t misa-event-checkin:noibo .
docker run -d --name misa-event-checkin \
  -p 3000:3000 \
  -e SESSION_SECRET="doi-chuoi-bi-mat" \
  -v checkin-data:/data \
  --restart unless-stopped \
  misa-event-checkin:noibo
```

## 3. Biến môi trường

| Biến | Bắt buộc | Ý nghĩa |
|---|---|---|
| `DATA_DIR` | Có (ảnh đã set `/data`) | Nơi lưu `checkin.db` + thư mục uploads. **Phải gắn volume** vào đây để không mất dữ liệu. |
| `PORT` | Không (mặc định 3000) | Cổng ứng dụng bên trong container. |
| `SESSION_SECRET` | Nên đổi | Chuỗi ký session đăng nhập. Đổi thành chuỗi ngẫu nhiên khi chạy thật. |
| `BASE_URL` | Chỉ khi gửi email qua Brevo | URL công khai của web (để ảnh trong email hiển thị). VD `https://checkin.noi-bo.misa.vn`. |

## 4. Dữ liệu & sao lưu

- Toàn bộ dữ liệu nằm trong **volume `checkin-data`** (gắn vào `/data`): file SQLite `checkin.db` (WAL mode) + ảnh email.
- Sao lưu: `docker run --rm -v checkin-data:/data -v $(pwd):/backup alpine tar czf /backup/checkin-backup.tgz -C /data .`
- Không cần Litestream/GCS ở bản nội bộ; sao lưu volume theo lịch của hạ tầng MISA là đủ.

## 5. HTTPS (bắt buộc cho camera quét QR)

Camera trình duyệt **chỉ hoạt động trên HTTPS hoặc localhost**. Trên hạ tầng nội bộ, đặt ứng dụng sau **reverse proxy** (Nginx / Traefik / API Gateway của MISA) có chứng chỉ TLS, trỏ về container cổng 3000. App đã tự bật `trust proxy` khi phát hiện chạy sau proxy cloud; nếu proxy nội bộ, đảm bảo forward header `X-Forwarded-Proto`.

## 6. Gửi email

- **Local/nội bộ có thể gửi SMTP** (Gmail App Password hoặc SMTP nội bộ MISA) — cấu hình trong menu *Cấu hình Email* của web.
- Nếu hạ tầng chặn SMTP outbound → dùng Brevo API (điền key trong cùng màn hình), khi đó cần set `BASE_URL`.

## 7. Lưu ý về stack (khoảng cách với chuẩn MISA)

| Thành phần | Hiện tại | Chuẩn MISA | Ghi chú |
|---|---|---|---|
| Backend | Node.js + Express | Node.js hoặc .NET Core | ✅ Khớp (Node.js) |
| Frontend | HTML/CSS/JS thuần (SPA) | Vue.js + Tailwind | ⚠️ Chưa dùng Vue — chạy tốt nhưng chưa đúng chuẩn UI |
| Database | **SQLite** (file trong volume) | **MySQL** | ⚠️ Điểm khác lớn nhất — xem mục dưới |

**Về database:** app đang dùng SQLite (thư viện `better-sqlite3`, truy vấn đồng bộ). Nếu policy MISA yêu cầu dùng **MySQL tập trung**, cần một đợt chuyển đổi tầng dữ liệu (`db.js` + các truy vấn trong `routes/api.js`, `email.js`). Không phức tạp về logic nhưng cần làm cẩn thận + test. Liên hệ để lên kế hoạch nếu cần.

Xem thêm kiến trúc đầy đủ ở [MEMORYBANK.md](MEMORYBANK.md).
