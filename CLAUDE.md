# MISA Event Check-in

Hệ thống quản lý check-in sự kiện bằng QR code của MISA. Chủ dự án là người **không biết code** — luôn giải thích bằng tiếng Việt, đơn giản, làm thay mọi thao tác kỹ thuật.

## Tổng quan kỹ thuật
- **Stack:** Node.js + Express + better-sqlite3, frontend thuần HTML/JS/CSS (SPA) trong `public/`, không dùng framework.
- **Chạy local:** `npm start` → http://localhost:3000 (hoặc nháy đúp `KHOI-DONG.bat`). DB tự tạo tại `data/checkin.db`.
- **Bản chính thức (production):** https://misa-event-checkin-production.up.railway.app — Railway project `misa-event-checkin`, tài khoản tuanbui88vn@gmail.com.
- **Deploy:** `railway up --detach` từ thư mục dự án (cần `railway login` lần đầu trên máy mới). Volume `/data` (biến môi trường `DATA_DIR=/data`) giữ dữ liệu lâu dài — local và cloud là 2 database RIÊNG.
- Xem thêm: `HUONG-DAN.md` (hướng dẫn sử dụng), `DEPLOY.md` (thông tin deploy).

## Cấu trúc file
- `server.js` — khởi động Express, session, scheduler email cảm ơn
- `db.js` — schema SQLite + migration (ALTER TABLE khi thêm cột mới) + seed super admin
- `routes/api.js` — TOÀN BỘ API (auth, users, events, attendees, booths, scan, email settings, reports)
- `email.js` — gửi email: Brevo HTTP API (ưu tiên nếu có key, dùng cho cloud vì Railway chặn SMTP) hoặc Gmail SMTP (local); buildEmail có 3 mode ảnh: cid/web/remote
- `public/app.js` — toàn bộ giao diện (hash routing, render từng trang/tab)
- `config.js` — DATA_DIR/UPLOAD_DIR (env DATA_DIR trên cloud)

## Nghiệp vụ chính
- **Vai trò:** super_admin (toàn quyền; seed sẵn tuanbui88vn@gmail.com) / admin (giới hạn theo `unit` - đơn vị) / checkin (chỉ sự kiện được gán qua `event_staff`; đăng nhập tự vào thẳng màn quét nếu có đúng 1 sự kiện).
- **QR:** mỗi khách 1 `qr_token` ngẫu nhiên, quét được NHIỀU lần — lần đầu tại cổng ghi `checked_in_at`, các lần sau chỉ hiển thị. Hết hạn sau ngày sự kiện.
- **Booth journey:** bảng `booths` + `booth_visits` (unique booth+attendee). Tab Quét QR có chọn vị trí (cổng/booth). Báo cáo đếm lượt ghé từng booth.
- **Điều kiện tham dự:** `events.eligibility_field` + `eligibility_values` (JSON). Người không đạt: khoá nút gửi email, gửi hàng loạt bỏ qua, vẫn sửa được.
- **Email:** template có biến `{{xung_ho}} {{ho_ten}} {{ten_su_kien}} {{thoi_gian}} {{cong_ty}} {{qr_code}}`; nội dung nhận cả HTML; ảnh header/footer (data/uploads) dùng chung 2 thư; email cảm ơn gửi tự động sau N phút check-in (scheduler 60s).
- **Mức độ quan trọng khách:** Bình thường/VIP/VVIP/Speaker/Ban lãnh đạo/Ban Tổ chức. Xưng hô: Anh/Chị/Ông/Bà.

## Bẫy kỹ thuật cần nhớ
- Tạo dòng bảng `<tr>` trong JS PHẢI dùng `<template>` (hàm `el()` trong app.js) — div.innerHTML sẽ phá cấu trúc bảng.
- Railway chặn outbound SMTP ở gói Hobby → email cloud bắt buộc qua Brevo API (key trong DB, bảng `smtp_settings`).
- Brevo: nếu lỗi 401 "unrecognised IP" → tắt Authorized IPs trong cài đặt bảo mật Brevo.
- Thời gian lưu UTC (`datetime('now')`) — frontend hiển thị bằng `fmtDate(x, true)`, backend bằng `fmtVN()`.
- PowerShell 5.1: gửi JSON có tiếng Việt qua curl phải ghi file UTF-8 không BOM rồi `-d "@file"`.
