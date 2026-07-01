# MISA Event Check-in

Hệ thống quản lý check-in sự kiện bằng QR code của MISA. Chủ dự án là người **không biết code** — luôn giải thích bằng tiếng Việt, đơn giản, làm thay mọi thao tác kỹ thuật.

## Tổng quan kỹ thuật
- **Stack:** Node.js + Express + better-sqlite3, frontend thuần HTML/JS/CSS (SPA) trong `public/`, không dùng framework.
- **Chạy local:** `npm start` → http://localhost:3000 (hoặc nháy đúp `KHOI-DONG.bat`). DB tự tạo tại `data/checkin.db`.
- **Bản chính thức (production) — Google Cloud Run:** https://misa-event-checkin-784559735000.asia-southeast1.run.app
  - Project GCP `prapplication-479309` (number 784559735000), tài khoản tuanbui88vn@gmail.com, region `asia-southeast1`.
  - SQLite chạy local trong container + **Litestream** sao lưu liên tục xuống bucket `gs://prapplication-479309-checkin-db/checkin.db`. Container restart → entrypoint tự `litestream restore` từ bucket → KHÔNG mất dữ liệu.
  - BẮT BUỘC 1 instance: `--min-instances=1 --max-instances=1 --no-cpu-throttling` (Litestream single-writer + scheduler email cần CPU luôn bật). Tăng instance = hỏng dữ liệu.
  - Deploy lại: `gcloud run deploy misa-event-checkin --source . --region asia-southeast1` (gcloud tại `%LOCALAPPDATA%\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd`).
  - Ảnh header/footer email lưu TRONG database (bảng `email_images`, cột BLOB) để Litestream sao lưu cùng — không lưu ra file. Cột `email_settings.header_image/footer_image` giờ chứa mime-type làm "cờ có ảnh".
- **Bản cũ (Railway, sẽ ngừng dùng):** https://misa-event-checkin-production.up.railway.app — `railway up --detach`.
- Local, Railway, Cloud Run là các database RIÊNG biệt (`DATA_DIR`).
- Xem thêm: `HUONG-DAN.md` (hướng dẫn sử dụng), `DEPLOY.md` (thông tin deploy).

## Cấu trúc file
- `server.js` — khởi động Express, session, scheduler email cảm ơn
- `db.js` — schema SQLite + migration (ALTER TABLE khi thêm cột mới) + seed super admin
- `routes/api.js` — TOÀN BỘ API (auth, users, events, attendees, booths, scan, email settings, reports)
- `email.js` — gửi email: Brevo HTTP API (ưu tiên nếu có key, dùng cho cloud vì Railway/Cloud Run chặn SMTP) hoặc Gmail SMTP (local); buildEmail có 3 mode ảnh: cid/web/remote; ảnh đọc từ bảng email_images
- `Dockerfile` + `docker-entrypoint.sh` + `litestream.yml` — đóng gói cho Cloud Run; Dockerfile cài ca-certificates + python3/make/g++ (better-sqlite3 cần biên dịch)
- `public/app.js` — toàn bộ giao diện (hash routing, render từng trang/tab)
- `config.js` — DATA_DIR/UPLOAD_DIR (env DATA_DIR trên cloud)

## Nghiệp vụ chính
- **Vai trò (users.role):** super_admin (toàn quyền; seed sẵn tuanbui88vn@gmail.com) / admin (giới hạn theo `unit` - đơn vị) / checkin (chỉ sự kiện được gán qua `event_staff`; đăng nhập tự vào thẳng màn phù hợp nếu có đúng 1 sự kiện hôm nay).
- **Loại vị trí trong 1 sự kiện (`event_staff.staff_type`):** phân biệt hành vi của tài khoản `checkin` theo TỪNG sự kiện (1 người có thể là lễ tân sự kiện A, giám sát sự kiện B). Gán ở tab Nhân viên (chọn "Vai trò tại sự kiện" + "Vị trí").
  - `checkin` (mặc định) — quét QR/check-in tại Cổng hoặc 1 booth (hành vi cũ). Chỉ xem danh sách người ĐÃ check-in.
  - `reception` (Lễ tân in QR) — đứng ở Cổng (booth_id luôn NULL), xem TOÀN BỘ khách (đăng ký trước + vãng lai) để tra cứu & in tem QR (máy tính nối máy in PD304). Có tab riêng "🖨 Danh sách & In QR" + vẫn quét/check-in được.
  - `supervisor` (Giám sát booth) — BẮT BUỘC gán 1 booth. Chỉ có tab "📝 Ghi chú booth": xem khách đã ghé đúng booth mình phụ trách (Họ tên/Chức vụ/Công ty) + ô ghi chú (thêm/sửa/xoá/lưu). KHÔNG được quét/check-in/xem danh sách khác. Ghi chú lưu vào `booth_visits.note`, tổng hợp về Báo cáo + xuất Excel (cột "Ghi chú giám sát").
- **QR:** mỗi khách 1 `qr_token` ngẫu nhiên, quét được NHIỀU lần — lần đầu tại cổng ghi `checked_in_at`, các lần sau chỉ hiển thị. Hết hạn sau ngày sự kiện.
- **Booth journey:** bảng `booths` + `booth_visits` (unique booth+attendee, có cột `note` cho giám sát). Tab Quét QR có chọn vị trí (cổng/booth). Báo cáo đếm lượt ghé từng booth. **Quét ở booth cũng tự set `checked_in_at`** nếu chưa có (khách ở booth = đã đến sự kiện) — trả về `just_checked_in`. Khách chỉ hiện trong danh sách giám sát SAU KHI được quét QR tại booth đó.
- **Tab Người tham dự:** có tìm kiếm (tên/công ty/SĐT/email) + lọc (mức độ/chức vụ/quy mô/trạng thái) + tick chọn nhiều người → gửi email hàng loạt (`POST /events/:id/send-emails` {ids}); hiển thị "Hiển thị X / tổng Y". Báo cáo có nút in tem QR cho người đã check-in + xuất Excel.
- **Điều kiện tham dự:** `events.eligibility_field` + `eligibility_values` (JSON). Người không đạt: khoá nút gửi email, gửi hàng loạt bỏ qua, vẫn sửa được.
- **Email:** template có biến `{{xung_ho}} {{ho_ten}} {{ten_su_kien}} {{thoi_gian}} {{cong_ty}} {{qr_code}}`; nội dung nhận cả HTML; ảnh header/footer lưu TRONG database (bảng `email_images`) dùng chung 2 thư; email cảm ơn gửi tự động sau N phút check-in (scheduler 60s).
- **Mức độ quan trọng khách:** Bình thường/VIP/VVIP/Speaker/Ban lãnh đạo/Ban Tổ chức. Xưng hô: Anh/Chị/Ông/Bà.

## Trạng thái hiện tại (cập nhật 2026-06-24)
- Repo làm việc: `D:\TEMP\1606\event-checkin` (KHÔNG còn ở Desktop). GitHub: https://github.com/tuannhh/misa-event-checkin (private, tài khoản GitHub `tuannhh`, `gh` CLI đã đăng nhập trên máy công ty).
- **Production chính thức = Google Cloud Run** (xem link + chi tiết ở mục Tổng quan kỹ thuật). Đang trong quá trình chuyển hẳn khỏi Railway — Railway vẫn còn chạy nhưng coi là bản cũ, KHÔNG cập nhật thêm.
- Cloud Run hiện đang chạy database TRỐNG (dữ liệu sự kiện thật "Hội thảo Hợp đồng lao động điện tử" với 3 khách vẫn còn nằm bên Railway, CHƯA di chuyển sang). Nếu người dùng cần dữ liệu cũ trên Cloud Run, phải hỏi lại có nên chuyển sang hay bắt đầu mới.
- Quy trình làm việc 2 máy (công ty / nhà): trước khi sửa `git pull`, sau khi sửa xong `git commit` + `git push`. Sau khi sửa và test xong, deploy lại Cloud Run bằng lệnh ở mục trên — nhớ hỏi người dùng trước khi deploy production nếu thay đổi lớn.
- 3 việc gần nhất đã làm và deploy thành công: (1) tab Người tham dự thêm tìm kiếm/lọc/tick chọn nhiều để gửi email hàng loạt, (2) quét QR tại booth giờ tự động ghi nhận check-in luôn (trước đây chỉ ghi lượt ghé, khiến báo cáo hiển thị sai "chưa check-in"), (3) xác nhận nút in tem QR + xuất Excel ở tab Báo cáo đã có sẵn và hoạt động đúng sau khi sửa (2).
- Việc còn treo: chưa quyết định có chuyển dữ liệu Railway → Cloud Run hay không.
- Tem in QR: khổ **50×30mm** (máy in nhiệt PD304, in qua LAN). Android: dùng app cầu nối PrinterL/RawBT trỏ IP máy in. iPhone/iPad: cần AirPrint — PD304 nhiều khả năng KHÔNG hỗ trợ, nên bố trí máy tính Windows nối máy in để in tem (`printQr()` trong app.js).
- 2026-07-01: thêm 2 loại vị trí **Lễ tân in QR** + **Giám sát booth** (xem mục Loại vị trí ở trên) — đã deploy Railway + Cloud Run + push GitHub.

## Bẫy kỹ thuật cần nhớ
- Tạo dòng bảng `<tr>` trong JS PHẢI dùng `<template>` (hàm `el()` trong app.js) — div.innerHTML sẽ phá cấu trúc bảng.
- Railway chặn outbound SMTP ở gói Hobby → email cloud bắt buộc qua Brevo API (key trong DB, bảng `smtp_settings`).
- Brevo: nếu lỗi 401 "unrecognised IP" → tắt Authorized IPs trong cài đặt bảo mật Brevo.
- Thời gian lưu UTC (`datetime('now')`) — frontend hiển thị bằng `fmtDate(x, true)`, backend bằng `fmtVN()`.
- PowerShell 5.1: gửi JSON có tiếng Việt qua curl phải ghi file UTF-8 không BOM rồi `-d "@file"`.
- Cloud Run (Google Front End) bắt buộc POST có Content-Length → curl POST phải kèm body (`-d "{}"`), không thì lỗi 411. Trình duyệt thật tự thêm nên không sao.
- Litestream cần `ca-certificates` trong image (Go dùng CA store của OS, khác Node). Thiếu → lỗi "x509: certificate signed by unknown authority", sao lưu bucket thất bại âm thầm.
