# MISA Event Check-in

Hệ thống quản lý check-in sự kiện bằng QR code của MISA. Chủ dự án là người **không biết code** — luôn giải thích bằng tiếng Việt, đơn giản, làm thay mọi thao tác kỹ thuật.

## ⚠️ Đọc và cập nhật MEMORYBANK.md
[MEMORYBANK.md](MEMORYBANK.md) là tài liệu bàn giao đầy đủ (schema DB, toàn bộ API, luồng nghiệp vụ, UI, deploy, bẫy kỹ thuật, lịch sử phát triển). File CLAUDE.md này chỉ là bản tóm tắt ngắn.
**Sau khi hoàn thành bất kỳ tính năng, thay đổi kiến trúc, hoặc quyết định nghiệp vụ quan trọng nào (kể cả chỉ là tư vấn/trao đổi chưa code) — PHẢI cập nhật MEMORYBANK.md tương ứng, không cần hỏi lại chủ dự án.** Xem quy tắc chi tiết ở mục 11 của file đó.

## Tổng quan kỹ thuật (viết lại 2026-07-28 sau khi merge bản rewrite vào `main`)
- **Stack:** Node.js + Express + MySQL (`mysql2` thuần JS, KHÔNG dùng `better-sqlite3` nữa) + `knex` quản lý migration (`migrations/`, chạy tự động lúc khởi động qua `db.js` → `knex.migrate.latest()`). Frontend **Vue 3 + Tailwind + MDS 2.0** tại `web/src` (build ra `public-vue/`, Vite). Session lưu Redis nếu có `REDIS_URL`, không có thì lùi về MemoryStore (chỉ an toàn 1 instance).
- **Chạy local:** cần MySQL + Redis (dùng `docker-compose.internal.yml` cho tiện: `docker compose -f docker-compose.internal.yml up -d mysql redis`), tạo `.env` từ `.env.example` (bắt buộc `SESSION_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `DB_*`), rồi `npm start` → http://localhost:3000. Frontend dev: `cd web && npm run dev` (Vite), hoặc `npm run build` trong `web/` để build ra `public-vue/` cho `server.js` phục vụ tĩnh.
- **Production/bản đang chạy — Google Cloud Run:** https://misa-event-checkin-test-784559735000.asia-southeast1.run.app (tên service vẫn là `misa-event-checkin-test` dù đã là bản chính thức — **bản `misa-event-checkin` cũ (SQLite/Litestream) đã XOÁ hẳn ngày 2026-07-28**, không còn tồn tại, không cần quan tâm nữa).
  - Project GCP `prapplication-479309` (number 784559735000), tài khoản `tuanbui88vn@gmail.com`, region `asia-southeast1`.
  - Database: Cloud SQL MySQL riêng, instance `misa-checkin-test-mysql` (db-f1-micro), kết nối qua Unix socket (`DB_SOCKET_PATH=/cloudsql/<connection-name>`, xem `knexfile.js`/`db.js`).
  - Build image bằng `Dockerfile.internal` (KHÔNG dùng `Dockerfile` gốc — đó là bản SQLite/Litestream cũ, để lại trong repo nhưng KHÔNG dùng để deploy nữa). Build+push+deploy:
    ```
    docker buildx build --platform linux/amd64 --provenance=false -f Dockerfile.internal -t gcr.io/prapplication-479309/misa-event-checkin-test:latest --push .
    gcloud run deploy misa-event-checkin-test --image gcr.io/prapplication-479309/misa-event-checkin-test:latest --region asia-southeast1
    ```
    **Lưu ý bắt buộc**: phải dùng `docker buildx build --platform linux/amd64 --provenance=false` — `docker build`/`docker push` thường tạo OCI image index kèm attestation khiến Cloud Run từ chối deploy ("manifest type ... must support amd64/linux").
  - `--min-instances=1 --max-instances=1 --no-cpu-throttling` (scheduler email cảm ơn cần CPU luôn bật + tránh nhiều instance cùng ghi DB nếu chưa cấu hình Redis session dùng chung).
  - Dữ liệu hiện tại chỉ là **dữ liệu demo/test**, không phải dữ liệu thật cần bảo toàn — chủ dự án đã xác nhận (2026-07-28) không cần di chuyển dữ liệu cũ nào sang.
  - Còn thiếu (chưa cấu hình cho bản Cloud Run này, cân nhắc thêm nếu dùng lâu dài): `ENCRYPTION_KEY` (mã hoá `smtp_pass`/`brevo_api_key` trong DB — thiếu vẫn chạy được, chỉ lưu dạng chưa mã hoá), `REDIS_URL` (session dùng chung + hàng đợi email — thiếu thì chỉ an toàn đúng 1 instance, hiện đang đúng 1 instance nên tạm ổn).
- Xem thêm: `HUONG-DAN.md` (hướng dẫn sử dụng), `DEPLOY.md` (thông tin deploy — một phần nội dung đã cũ, ưu tiên theo CLAUDE.md/MEMORYBANK.md).

## Cấu trúc file
- `server.js` — khởi động Express, session (Redis nếu có `REDIS_URL`), scheduler email cảm ơn, phục vụ `public-vue/` (build Vue) làm static.
- `db.js` — kết nối MySQL (pool `mysql2`) + gọi `knex.migrate.latest()` lúc khởi động + seed Super Admin từ `ADMIN_EMAIL`/`ADMIN_PASSWORD`.
- `knexfile.js` + `migrations/*.js` — quản lý schema có version (knex), KHÔNG viết `CREATE TABLE` tay trong `db.js` nữa.
- `routes/` — API chia theo nghiệp vụ: `auth.js`, `users.js`, `events.js`, `attendees.js`, `checkin.js`, `monitor.js`, `badges.js`, `email.js`, `reports.js`, `options.js`, `staff-roles.js`, `attendee-groups.js`, `print.js`; hằng số/middleware dùng chung ở `routes/lib/{helpers,permissions,badges}.js`. `routes/index.js` gộp lại, mount ở `server.js`. (File `routes/api.js` cũ — 1 file ~1100 dòng — đã XOÁ, thay bằng các file trên.)
- `web/src/` — frontend Vue 3: `App.vue` (App Shell MDS, tách shell mobile-first cho nhân viên hiện trường), `views/` (EventsView, EventDetailView, MembersView, SmtpView, LoginView), `views/tabs/` (từng tab trong 1 sự kiện: AttendeesTab, ScanTab, BoothsTab, BadgesTab, EmailTab, ReportTab, StaffTab, ReceptionTab, MonitorTab, DashboardTab, PairTab), `components/mds/` (bộ component MDS 2.0 tự viết: MButton/MInput/MSelect/MDialog/MDataTable/MDatePicker/MHeaderBar/MSidebar...), `lib/print.js` (in thẻ QR), `api.js` (helper gọi API + quyền `can()`).
- `email.js` — gửi email: Brevo HTTP API (ưu tiên nếu có key) hoặc Gmail SMTP (local); ảnh header/footer đọc từ bảng `email_images` (BLOB trong DB).
- `Dockerfile.internal` — dùng để build/deploy (xem mục Tổng quan kỹ thuật). `Dockerfile` gốc (SQLite/Litestream) còn trong repo nhưng KHÔNG dùng nữa.
- `print-agent/` — chương trình Node độc lập (đóng gói `.exe` bằng `pkg`) chạy trên máy tính tại sự kiện, nhận lệnh in từ server qua mã ghép nối, gửi lệnh TSPL tới máy in LAN/USB. Xem `print-agent/README.md`.

## Nghiệp vụ chính
- **Vai trò tài khoản (`users.role`):** `super_admin` (toàn quyền) / `admin` (giới hạn theo `unit` - đơn vị) / `checkin` (nhân viên hiện trường, chỉ vào được sự kiện được gán qua `event_staff`).
- **Quyền tick-chọn theo sự kiện (thay `staff_type` cứng cũ - đổi 2026-07-27):** mỗi người được gán 1 **nhóm chức năng** (`staff_roles`, tick sẵn tổ hợp quyền) + có thể tick thêm/bớt riêng (`event_staff.extra_permissions`). 8 quyền: `checkin`, `view_checkin_list` (có phạm vi all/checked_in/my_booth), `view_pii`, `note`, `mark_potential`, `view_report`, `print_badge`, `assign_badge`. 4 nhóm mẫu dựng sẵn: Nhân viên check-in, Lễ tân, Giám sát booth, Quản lý (xem số liệu) — tạo nhóm mới không cần sửa code (màn "Nhóm chức năng" trong tab Nhân viên). Chi tiết: MEMORYBANK mục 19-20.
- **QR:** mỗi khách 1 `qr_token` ngẫu nhiên, quét được NHIỀU lần — lần đầu tại cổng ghi `checked_in_at`, các lần sau chỉ hiển thị. Hết hạn sau ngày sự kiện.
- **Booth journey:** bảng `booths` + `booth_visits` (unique booth+attendee, có cột `note` cho giám sát). Quét ở booth cũng tự set `checked_in_at` nếu chưa có.
- **Phôi thẻ (badge):** bảng `badges` (mã số tuần tự/sự kiện, gán 1 khách, status active/stopped). Admin sinh phôi + xuất ZIP SVG gửi nhà in; lễ tân/nhân viên quét mã khách + mã phôi để gán + tự check-in.
- **In thẻ QR (`printQr()`):** khổ **100×75mm (A7)** — QR + họ tên + chức danh + công ty + mức độ quan trọng (chốt 2026-07-28). Gửi lệnh in qua **trạm in** (LAN trực tiếp hoặc Print Agent) nếu đã cấu hình, lùi về in qua trình duyệt (`@page`) nếu chưa. Có màn **"Tuỳ chỉnh mẫu thẻ"** (tab Phôi thẻ) chỉnh cỡ QR/tên + bật tắt thông tin hiển thị, lưu theo từng sự kiện ở `events.badge_layout`. Chi tiết: MEMORYBANK mục 22, 27, 28.
- **Tab Người tham dự:** tìm kiếm + lọc (mức độ/chức vụ/quy mô/trạng thái) + tick chọn nhiều người → gửi email hàng loạt.
- **Điều kiện tham dự:** `events.eligibility_field` + `eligibility_values` (JSON). Người không đạt: khoá nút gửi email, gửi hàng loạt bỏ qua, vẫn sửa được.
- **Email:** template có biến `{{xung_ho}} {{ho_ten}} {{ten_su_kien}} {{thoi_gian}} {{cong_ty}} {{qr_code}}`; hỗ trợ **nhóm khách** với mẫu email riêng theo nhóm (tự động chọn, không cần chọn tay); chọn tường minh nhà cung cấp Brevo/Gmail/Manual (`smtp_settings.provider`).
- **Mức độ quan trọng khách:** Bình thường/VIP/VVIP/Speaker/Ban lãnh đạo/Ban Tổ chức. Xưng hô: Anh/Chị/Ông/Bà.

## Trạng thái hiện tại (cập nhật 2026-07-28)
- GitHub: https://github.com/tuannhh/misa-event-checkin (private, tài khoản GitHub `tuannhh`). **Nhánh `main` đã merge fast-forward toàn bộ `backend-refactor-d1`** (Đợt 1-5 nâng cấp + rà soát UI) — `main` giờ là bản Vue3+MySQL đầy đủ, không còn nhánh nào "mới hơn" main. `rewrite-vue-mysql` và `backend-refactor-d1` vẫn còn tồn tại (lịch sử), coi `main` là nguồn chính từ giờ.
- **Bản Cloud Run cũ `misa-event-checkin` (SQLite/Litestream) đã bị XOÁ hẳn (2026-07-28)** theo yêu cầu chủ dự án (đỡ tốn kém, tránh nhầm lẫn 2 bản chạy song song) — chỉ còn 1 service `misa-event-checkin-test` là bản chính thức duy nhất. Bucket GCS cũ `gs://prapplication-479309-checkin-db/checkin.db` (Litestream backup của bản cũ) **vẫn còn tồn tại**, chưa xoá — hỏi chủ dự án nếu muốn dọn nốt (không tốn nhiều phí, nhưng cũng không còn dùng tới).
- Railway (bản cũ hơn nữa, đã ngừng dùng từ trước) — không còn liên quan, có thể bỏ qua.
- Việc còn treo: `print-agent/dist/misa-checkin-print-agent.exe` đã build thử nhưng CHƯA test với Windows/máy in vật lý thật (xem MEMORYBANK mục 10 + 28); rà soát UI 15 màn hình theo `data-table.md` đã xong (mục 29).

## Bẫy kỹ thuật cần nhớ
- **`docker build`/`docker push` thường KHÔNG deploy được lên Cloud Run** (lỗi manifest OCI image index) — phải dùng `docker buildx build --platform linux/amd64 --provenance=false ... --push`.
- **Sửa file backend (`lib/`, `routes/`) lúc server Node đang chạy KHÔNG tự nạp lại code** (khác Vite/FE có hot reload) — phải tắt hẳn tiến trình cũ, chạy lại `npm start` mới thấy thay đổi.
- knex `t.timestamp().defaultTo(knex.raw('UTC_TIMESTAMP()'))` lỗi cú pháp MySQL — phải bọc 2 lớp ngoặc: `knex.raw('(UTC_TIMESTAMP())')`.
- Migration tạo FK phải khớp CHÍNH XÁC kiểu cột đích (`unsigned` hay không) — không suy luận từ migration khác.
- Thời gian lưu UTC (`UTC_TIMESTAMP()` phía MySQL) — frontend hiển thị bằng `fmtDate(x, true)`, backend bằng `fmtVN()`.
- Brevo: nếu lỗi 401 "unrecognised IP" → tắt Authorized IPs trong cài đặt bảo mật Brevo.
- Cloud Run (Google Front End) bắt buộc POST có Content-Length → curl POST phải kèm body (`-d "{}"`), không thì lỗi 411. Trình duyệt thật tự thêm nên không sao.
- Click bằng toạ độ (`coordinate`) trong công cụ test trình duyệt tự động dễ sai không gian pixel — click theo `ref` (từ `read_page`/`find`) đáng tin cậy hơn; riêng `MCheckbox` đôi khi cần `form_input` thay vì click mới chắc chắn toggle đúng.
