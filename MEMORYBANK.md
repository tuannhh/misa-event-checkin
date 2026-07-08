# 🧠 MEMORYBANK — MISA Event Check-in

Tài liệu tổng hợp toàn bộ kiến trúc, nghiệp vụ, API, và lịch sử phát triển của dự án.
Mục đích: bất kỳ AI hoặc dev nào đọc file này đều có thể tiếp tục làm việc đúng mà không cần hỏi lại từ đầu.

**Quy tắc bắt buộc:** Mỗi khi hoàn thành một tính năng mới, sửa kiến trúc, hoặc có quyết định nghiệp vụ quan trọng trong lúc trao đổi với chủ dự án — PHẢI cập nhật file này (mục tương ứng + mục 9. Lịch sử phát triển). Xem quy tắc chi tiết ở cuối file.

---

## 1. Tổng quan dự án

- **Tên:** MISA Event Check-in — hệ thống quản lý check-in sự kiện bằng QR code.
- **Chủ dự án:** tuanbui (tuanbui88vn@gmail.com / tkmedia@misa.com.vn) — **không biết code**, luôn cần giải thích bằng tiếng Việt, đơn giản, và người làm kỹ thuật (Claude) thực hiện thay toàn bộ thao tác (git, deploy, v.v.).
- **GitHub:** https://github.com/tuannhh/misa-event-checkin (private, tài khoản `tuannhh` / didierlee.fr@gmail.com).
- **Production (chính thức hiện tại):** Google Cloud Run — https://misa-event-checkin-784559735000.asia-southeast1.run.app
- **Production cũ (Railway, đang ngừng dùng dần):** https://misa-event-checkin-production.up.railway.app
- **Local:** `npm start` → http://localhost:3000 (hoặc double-click `KHOI-DONG.bat`).
- **Tài liệu khác trong repo:** `CLAUDE.md` (bộ nhớ ngắn cho AI, luôn đọc trước), `HUONG-DAN.md` (hướng dẫn sử dụng cho người dùng cuối), `DEPLOY.md` (thông tin deploy — hơi cũ, ưu tiên tin file này).

### Đối tượng sử dụng & vai trò hệ thống
| Vai trò | Phạm vi | Mô tả |
|---|---|---|
| `super_admin` | Toàn hệ thống | Seed sẵn tuanbui88vn@gmail.com. Toàn quyền mọi đơn vị/sự kiện. |
| `admin` | 1 đơn vị (`unit`) | Quản lý sự kiện, nhân sự, báo cáo trong đơn vị mình. |
| `checkin` | 1+ sự kiện được gán | Nhân viên hiện trường; hành vi cụ thể phụ thuộc `staff_type` được gán trong từng sự kiện (xem mục 3.4). |

---

## 2. Kiến trúc & Công nghệ

```
┌─────────────────────────────────────────────┐
│ Frontend: public/app.js (SPA thuần JS,       │
│ hash routing, ~1580 dòng, không framework)   │
└───────────────────┬───────────────────────────┘
                     │ REST API (JSON)
┌───────────────────▼───────────────────────────┐
│ Express 5 (server.js) + session (12h)         │
│ routes/api.js — toàn bộ API                   │
│ email.js — gửi email + scheduler cảm ơn (60s) │
└───────────────────┬───────────────────────────┘
                     │ better-sqlite3 (WAL mode)
┌───────────────────▼───────────────────────────┐
│ SQLite: data/checkin.db (local) hoặc          │
│ /data/checkin.db (cloud, qua Litestream)      │
└─────────────────────────────────────────────────┘
```

- **Backend:** Node.js ≥20, Express 5, better-sqlite3, bcryptjs, express-session, multer, nodemailer, qrcode, xlsx.
- **Frontend:** vanilla HTML/CSS/JS, không framework, SPA qua hash routing (`#/...`), thư viện quét QR `html5-qrcode`.
- **DB:** SQLite, WAL mode, migration bằng `PRAGMA table_info` + `ALTER TABLE` khi khởi động (xem `db.js`).
- **Email:** Brevo HTTP API (ưu tiên, dùng cho cloud vì Cloud Run/Railway chặn SMTP) hoặc Gmail SMTP (local).
- **PWA:** manifest + service worker (`public/manifest.webmanifest`, `public/sw.js`) — cài lên màn hình chính điện thoại, hoạt động như app.
- **Deploy:** Docker + Litestream (sao lưu SQLite liên tục ra Google Cloud Storage) → Google Cloud Run.

### Cấu trúc file
```
server.js          Khởi động Express, session, scheduler email
db.js               Schema SQLite + toàn bộ migration + seed super admin
config.js           DATA_DIR / UPLOAD_DIR (đổi theo env cloud/local)
routes/api.js       TOÀN BỘ API (~1000+ dòng)
email.js            Gửi email (Brevo/SMTP) + buildEmail() + scheduler cảm ơn
public/app.js       Toàn bộ SPA frontend (~1580 dòng)
public/index.html   Khung HTML gốc + PWA meta tags
public/style.css    Toàn bộ style
public/manifest.webmanifest, public/sw.js, public/icon.svg   PWA
Dockerfile, docker-entrypoint.sh, litestream.yml   Deploy Cloud Run
CLAUDE.md           Bộ nhớ ngắn cho AI (đọc mỗi session)
HUONG-DAN.md        Hướng dẫn dùng cho chủ dự án
DEPLOY.md           Thông tin deploy (hơi cũ)
```

### Biến môi trường
| Biến | Ý nghĩa | Local | Cloud Run |
|---|---|---|---|
| `PORT` | Cổng Express | 3000 | 8080 |
| `DATA_DIR` | Nơi lưu DB + uploads | `./data` | `/data` |
| `SESSION_SECRET` | Ký session cookie | mặc định cứng | nên set riêng |
| `BASE_URL` | URL công khai (Brevo lấy ảnh) | không cần | URL Cloud Run |
| `REPLICA_URL` | Bucket Litestream | không dùng | `gcs://prapplication-479309-checkin-db/checkin.db` |
| `RAILWAY_ENVIRONMENT` / `RENDER` | Phát hiện chạy cloud (cookie secure, trust proxy) | không có | tự set bởi platform |

---

## 3. Database Schema đầy đủ

> Toàn bộ migration nằm ở `db.js` dòng ~104-157, theo pattern an toàn:
> ```js
> const cols = db.prepare("PRAGMA table_info(TABLE)").all().map(c => c.name);
> if (!cols.includes('col')) db.exec("ALTER TABLE TABLE ADD COLUMN col TYPE");
> ```

### `users`
| Cột | Kiểu/ràng buộc | Ý nghĩa |
|---|---|---|
| id | PK autoincrement | |
| name | NOT NULL | Họ tên |
| department | TEXT | Bộ phận |
| unit | TEXT | Đơn vị (admin bị giới hạn theo cột này) |
| email | UNIQUE COLLATE NOCASE | Đăng nhập |
| password_hash | bcryptjs (10 rounds) | |
| role | `checkin`\|`admin`\|`super_admin` | Role cũ `moderator` đã migrate thành `checkin` |
| created_at | UTC | |

### `events`
| Cột | Ý nghĩa |
|---|---|
| id, name, event_date (YYYY-MM-DD), organizer, unit, created_by, created_at | Cơ bản |
| eligibility_field | Trường dùng làm điều kiện tham dự: `importance`\|`position`\|`company_size`\|`salutation` (rỗng = không áp điều kiện) |
| eligibility_values | JSON array giá trị hợp lệ, VD `["VIP","VVIP","Speaker"]` |

### `event_staff` — gán nhân viên vào sự kiện + vị trí + vai trò tại sự kiện
| Cột | Ý nghĩa |
|---|---|
| event_id, user_id | PK kép, CASCADE khi xoá event/user |
| booth_id | NULL = cổng; số = booth cụ thể |
| staff_type | `checkin` (mặc định, quét QR) \| `reception` (lễ tân in QR, luôn ở cổng, xem toàn danh sách) \| `supervisor` (giám sát 1 booth, BẮT BUỘC có booth_id, ghi chú, không quét) \| `manager` (xem dashboard số liệu ẩn danh, không quét, không xem PII, không bị khoá theo ngày) |

### `attendees`
| Cột | Ý nghĩa |
|---|---|
| id, event_id, name, email, phone, position, company, tax_code, company_size | Thông tin cơ bản |
| qr_token | UNIQUE, `crypto.randomBytes(10).toString('hex')` — 20 ký tự ngẫu nhiên |
| checked_in_at, checked_in_by | Check-in lần đầu (quét lại không đổi) |
| is_walkin | 1 = khách vãng lai (không hiện trong danh sách đăng ký của admin, chỉ hiện ở Báo cáo) |
| confirm_email_sent_at, thankyou_email_sent_at | Chống gửi trùng |
| salutation | Anh\|Chị\|Ông\|Bà |
| importance | Bình thường (mặc định)\|VIP\|VVIP\|Speaker\|Ban lãnh đạo\|Ban Tổ chức |

### `email_settings` (1-1 với event)
`confirm_subject/body`, `auto_send_confirm`, `thank_subject/body`, `thank_delay_minutes`, `thank_enabled`, `header_image`/`footer_image` (lưu **MIME type làm cờ**, không lưu path), `header_width`/`footer_width` (10-100%).

### `email_images` — ảnh header/footer lưu **trong DB** (BLOB)
`event_id, kind ('header'|'footer'), mime, data (BLOB)` — PK kép `(event_id, kind)`. Lý do lưu BLOB thay vì file: Litestream chỉ sao lưu file DB, không sao lưu `uploads/` → ảnh phải nằm trong DB mới không mất khi container restart.

### `badges` — kho phôi thẻ in sẵn (badge pairing)
| Cột | Ý nghĩa |
|---|---|
| id, event_id | PK, thuộc sự kiện (CASCADE) |
| code | Mã in trên phôi thẻ — số tuần tự trong 1 sự kiện, pad 4 chữ số (`0001`, `0002`...). UNIQUE `(event_id, code)` |
| attendee_id | Khách được gán (NULL = phôi trắng chưa gán); ON DELETE SET NULL |
| status | `active` (đang dùng) \| `stopped` (đã ngừng — xử lý mất thẻ/chống gian lận) |
| paired_at, paired_by | Thời điểm + người gán |
Quan hệ **1 khách ↔ nhiều thẻ** (khách mất thẻ được gán thêm thẻ mới). Mã QR in trên phôi mã hoá chuỗi `{eventId}-{code}` (chống nhầm chéo sự kiện); số in bên dưới chỉ là `{code}` để gõ tay khi camera lỗi.

### `booths`
`id, event_id, name, sort`.

### `booth_visits` — hành trình khách ghé từng booth
`id, event_id, booth_id, attendee_id, visited_at, visited_by, note` — UNIQUE `(booth_id, attendee_id)`. `note` do `supervisor` ghi (nhu cầu đặc biệt của khách tại booth đó).

### `booth_potential_notes` — ghi chú "giám sát bóng ma" (bản `rewrite-vue-mysql`, chỉ có ở nhánh này)
`id, event_id, booth_id, attendee_id, note, is_potential, updated_by` — UNIQUE `(booth_id, attendee_id)`. **Tách hoàn toàn khỏi `booth_visits`** — giám sát viên tra khách bằng mã thẻ (không quét) nên dòng ở đây KHÔNG được tính vào số booth đã ghé (lucky draw). Xem mục 9.15, 15.2.

### `smtp_settings` (singleton, `id=1`)
`host, port, secure, smtp_user, smtp_pass, from_name, brevo_api_key, sender_email`. Brevo ưu tiên nếu có key.

---

## 4. Danh sách API (routes/api.js)

### Xác thực
- `POST /api/login` `{email,password}` → session
- `POST /api/logout`
- `GET /api/me`

### Thành viên hệ thống (`super_admin`, `admin`)
- `GET/POST /api/users`, `PUT/DELETE /api/users/:id`
- `GET /api/users/template` (Excel mẫu) · `POST /api/users/import`

### Sự kiện
- `GET/POST /api/events`, `GET/PUT/DELETE /api/events/:id`
- `PUT /api/events/:id/staff` `{assignments:[{user_id,booth_id?,staff_type?}]}` — xoá hết gán cũ, gán lại toàn bộ
- `POST /api/events/:id/staff/create` — tạo nhanh 1 tài khoản + gán luôn
- `GET /api/events/:id/staff/template` · `POST /api/events/:id/staff/import`
- `GET /api/events/:id/available-staff`

### Người tham dự
- `GET /api/events/:id/attendees` — **hành vi khác nhau theo role/staff_type** (reception thấy hết; supervisor/manager trả rỗng; checkin thường chỉ thấy người đã check-in trừ khi `?all=1`; admin thấy hết trừ walk-in)
- `POST /api/events/:id/attendees`, `PUT /api/attendees/:id`, `DELETE /api/attendees/:id` — validate trùng SĐT (409 kèm `duplicate:true`, ghi đè bằng `force:true`)
- `GET /api/attendees/template` · `POST /api/events/:id/attendees/import`

### QR & Check-in
- `GET /api/qr/:token.png` (công khai, dùng cho Brevo) · `GET /api/attendees/:id/qr.png` (nội bộ)
- `POST /api/events/:id/scan` `{token, booth_id?, auto_confirm?}` — **logic trung tâm**, xem mục 5.2
- `POST /api/events/:id/checkin/:attendeeId` — xác nhận tay sau khi xem info
- `POST /api/events/:id/walkin` — thêm khách vãng lai + tự check-in (+ booth_visit nếu có booth)

### Booth & giám sát
- `POST /api/events/:id/booths`, `DELETE /api/booths/:id` (xoá kèm clear `booth_id` liên quan)
- `GET /api/events/:id/booth-monitor` (supervisor xem khách ghé booth mình) · `PUT /api/events/:id/booth-note`
- **(bản `rewrite-vue-mysql`)** `GET /api/events/:id/booth-monitor/lookup?code=` — "giám sát bóng ma": tra khách bằng mã thẻ (không cần đã ghé booth mình), chỉ dùng được khi sự kiện có phôi thẻ · `PUT .../booth-monitor/potential-note` `{attendee_id, note, is_potential}` — lưu vào `booth_potential_notes`, TÁCH biệt `booth_visits`

### Email
- `GET/PUT /api/events/:id/email-settings`
- `POST/DELETE /api/events/:id/email-image/:type` (header|footer) · `GET .../:type.img` (công khai)
- `GET /api/events/:id/email-preview?type=confirm|thank`
- `POST /api/attendees/:id/send-email`, `POST /api/events/:id/send-emails` `{ids:[]}`, `POST /api/events/:id/send-all-emails`
- `GET/PUT /api/smtp`, `POST /api/smtp/test`

### Phôi thẻ (badge)
- `POST /api/events/:id/badges/generate` `{count}` — sinh thêm phôi số tuần tự tiếp theo (admin)
- `GET /api/events/:id/badges` — danh sách phôi + thống kê (total/paired/unpaired/stopped) (admin)
- `GET /api/events/:id/badges/export` — tải **ZIP** chứa các file SVG (QR + mã ID) + CSV danh sách + hướng dẫn, để gửi nhà in (admin)
- `GET /api/events/:id/badges/lookup?token=` — tra khách theo mã QR email HOẶC mã phôi, kèm các thẻ đang gán (lễ tân/nhân viên/admin)
- `POST /api/events/:id/badges/pair` `{attendee_token, badge_code, force?}` — gán phôi cho khách + tự check-in; 409 `duplicate` nếu phôi đã có chủ (gán lại bằng `force:true`)
- `PUT /api/events/:id/badges/:badgeId/status` `{status:'stopped'|'active'}` — ngừng/dùng lại 1 thẻ
- Quét (`POST .../scan`) nay nhận diện cả mã phôi thẻ: trả thêm status `badge_stopped` (đã ngừng) / `badge_unassigned` (phôi trắng chưa gán) ngoài các status cũ

### Báo cáo & số liệu
- `GET /api/events/:id/report` / `GET /api/events/:id/report/export` (Excel) — **chặn** `supervisor`/`manager` (có PII)
- **(bản `rewrite-vue-mysql`)** `report/export` nhận thêm query `?min_booths=N` — lọc xuất riêng danh sách đủ điều kiện lucky draw (không lưu ngưỡng, gõ lại mỗi lần)
- `GET /api/events/:id/stats` — vector ẩn danh (không tên/email/SĐT), dùng cho dashboard `manager`

### Khác
- `GET /api/options` — danh sách lựa chọn cố định (positions, company_sizes, roles, salutations, importances, eligibility_fields)

---

## 5. Luồng nghiệp vụ chính

### 5.1 Đăng nhập
Session-based, cookie 12h, `bcryptjs.compareSync`. Nhân viên `checkin` chỉ có đúng 1 sự kiện hôm nay → tự động nhảy thẳng vào tab phù hợp (`scan`/`monitor`/`dashboard`/`reception` theo `staff_type`), bỏ qua trang danh sách sự kiện.

### 5.2 Quét QR / Check-in — logic trung tâm (`POST /events/:id/scan`)
```
Guard quyền: nhân viên checkin/reception → chỉ ngày hôm nay (isEventToday); supervisor/manager bị chặn hẳn (403)
Nhân viên (không phải admin) → booth_id LUÔN lấy từ vị trí được gán, bỏ qua giá trị client gửi lên
Tìm attendee theo qr_token:
  không có           → invalid
  event_id khác      → wrong_event
  quá ngày sự kiện + chưa check-in → expired
  [Có booth_id] (quét tại booth):
    chưa check-in → set checked_in_at=now (tự động!)
    đã ghé booth này trước → booth_already
    ghi booth_visits mới → booth_recorded (kèm just_checked_in nếu vừa check-in)
  [Không booth_id] (quét tại cổng):
    đã check-in     → already_checked (vẫn hiện info + cho in QR)
    auto_confirm=true → check-in ngay → checked_in
    auto_confirm=false → valid (chờ bấm nút xác nhận tay)
```
**Điểm mấu chốt:** quét tại booth luôn ngầm tính là "đã đến sự kiện" — không cần qua cổng trước.

### 5.3 Booth journey
`booths` (danh sách vị trí) + `event_staff.booth_id` (gán nhân viên) + `booth_visits` (log khách ghé, unique theo booth+khách) → Báo cáo tổng hợp lượt ghé mỗi booth + ghi chú giám sát.

### 5.4 Vai trò nhân viên tại sự kiện (`staff_type`) — mở rộng quan trọng
| staff_type | Vị trí | Được làm gì | Bị chặn |
|---|---|---|---|
| `checkin` | cổng hoặc 1 booth | Quét QR / check-in tại đúng vị trí gán | — |
| `reception` | luôn cổng | Xem TOÀN bộ danh sách khách, check-in nhanh, in tem QR | — |
| `supervisor` | BẮT BUỘC 1 booth | Xem khách đã ghé booth mình, ghi chú nhu cầu đặc biệt | Không quét, không xem Báo cáo (PII) |
| `manager` | luôn cổng (không cần booth) | Xem dashboard số liệu tổng/lọc theo mức độ/chức vụ/quy mô/booth (ẩn danh), KHÔNG bị khoá theo ngày sự kiện | Không quét, không xem tên/email/SĐT |

### 5.5 Điều kiện tham dự (eligibility)
`events.eligibility_field` + `eligibility_values` (JSON). Rỗng field hoặc rỗng values → ai cũng đủ điều kiện. Không đủ điều kiện: khoá nút gửi email (không xoá được khách, vẫn sửa được), gửi hàng loạt tự bỏ qua, báo cáo có cột "Đủ điều kiện".

### 5.7 Phôi thẻ in sẵn + gán thẻ (badge pairing)
Giải pháp phát thẻ cứng cho khách tại quầy **không cần máy in tại chỗ** — thay cho việc in tem trực tiếp (né hẳn vướng mắc máy in Bluetooth/iPhone).
1. **Chuẩn bị:** admin vào tab **Phôi thẻ** → nhập số lượng → sinh mã số tuần tự → **Xuất ZIP** các file SVG (QR mã hoá `{eventId}-{code}` + số ID) → gửi nhà in in số nhảy lên thẻ màu thiết kế riêng của sự kiện.
2. **Tại quầy (ngày sự kiện):** lễ tân vào tab **Gán thẻ** → quét mã QR email của khách → quét mã trên phôi thẻ → hệ thống gán 2 mã + **tự check-in**. Cảnh báo nếu phôi đã có chủ (chống nhầm).
3. **Tại booth:** nhân viên quét mã trên thẻ (phôi) → resolve về khách → ghi nhận hành trình như thường. Quét (`scan`) hiểu cả mã QR email lẫn mã phôi.
4. **Mất thẻ / chống gian lận:** quét lại mã QR email của khách → bấm **Ngừng** thẻ cũ (status `stopped`) → quét thẻ mới. Thẻ đã ngừng nếu bị quét sẽ báo đỏ "đã ngừng sử dụng". 1 khách có thể có nhiều thẻ đang dùng.
- **Dự phòng khi hết phôi:** vẫn in tem tại chỗ bằng máy in nhiệt **USB** (nút 🖨 in tem khổ **50×50mm** vuông, dưới QR in "Tên - Công ty"). Tem này chứa chính mã QR của khách → quét thẳng ở booth, **không cần gán**.
- Chế độ phôi thẻ **bật/tắt theo sự kiện**: chỉ hiện tab "Gán thẻ" cho lễ tân/nhân viên khi sự kiện đã có phôi (`badge_count > 0`); sự kiện không dùng thẻ vẫn quét mã email trực tiếp như cũ.

### 5.6 Gửi email
3 loại: xác nhận (kèm QR, lúc thêm khách/import/bấm gửi), cảm ơn (tự động N phút sau check-in, scheduler quét mỗi 60s, tối đa 20/lần), test SMTP. Kênh: Brevo API (ưu tiên, bắt buộc trên cloud vì SMTP outbound bị chặn) hoặc Gmail SMTP (chỉ local). `buildEmail()` có 3 mode ảnh: `cid` (SMTP, đính kèm), `web` (xem trước, relative path), `remote` (Brevo, URL tuyệt đối qua `BASE_URL`).

---

## 6. Frontend — kiến trúc & UI

### Routing & hàm nền tảng (public/app.js)
- Hash-based: `#/events`, `#/event/:id/:tab`, `#/members`, `#/smtp`.
- `api()` — gọi backend, tự parse JSON + throw lỗi. `esc()` — **bắt buộc** escape khi nội dung user/DB gắn vào innerHTML (chống XSS). `el(html)` — dựng DOM từ HTML string qua `<template>`, **bắt buộc dùng cho `<tr>`** vì `innerHTML` trực tiếp lên table sẽ phá cấu trúc bảng. `fmtDate(iso, isUtc)` / `todayYMD()` / `eventDayStatus(ev)` — xử lý ngày giờ (DB lưu UTC, hiển thị giờ Việt Nam `Asia/Ho_Chi_Minh`).
- Email 2 chế độ soạn: `isHtmlBody()`, `htmlToPlain()`, `plainToHtml()`, `wireBodyEditors()` — tab 📝 Văn bản ↔ `</>` HTML, tự convert 2 chiều.

### Danh sách trang/tab theo role
| Trang/tab | Ai thấy |
|---|---|
| Danh sách sự kiện, Người tham dự, Quét QR (đủ quyền), Booth, **Phôi thẻ**, Email, Báo cáo, Nhân viên, Thành viên, Cấu hình SMTP | admin/super_admin |
| Quét QR, Đã check-in, **Gán thẻ** (nếu SK có phôi) | `checkin` |
| Lễ tân & in QR, **Gán thẻ** (nếu SK có phôi) | `reception` |
| Ghi chú booth (giám sát) | `supervisor` |
| Số liệu (dashboard ẩn danh) | `manager` |

Hàm mới: `tabBadges()` (admin: sinh/xuất/quản lý phôi), `tabPair()` (lễ tân: quét kép gán thẻ, xử lý mất thẻ; camera + nhập tay).

### Tính năng UI đặc biệt
- **In tem QR nhiệt (dự phòng):** `printQr()` khổ **50×50mm vuông**, `@page{size:50mm 50mm}` + `window.print()` khi ảnh QR load xong; QR 34mm, dưới in "Tên - Công ty". Chỉ hiện nút in ở Báo cáo (người đã check-in) và ở Lễ tân. Dùng máy in nhiệt USB, in từ Chrome.
- **Import Excel:** mẫu tải sẵn (nút "Tải Excel mẫu"), validate trùng SĐT/email, báo lỗi theo dòng, tối đa hiện 8 lỗi.
- **PWA:** `manifest.webmanifest` (standalone, theme `#2563eb`) + `sw.js` (cache-first cho asset tĩnh, network-only cho `/api/` và `/uploads/`, fallback `index.html` cho SPA routing khi 404). `overscroll-behavior:none` chặn pull-to-refresh khi quét QR trên di động.
- **Khoá theo ngày:** nhân viên (trừ `manager`) không mở được sự kiện khác ngày hôm nay — chặn cả UI và server.
- **Khoá theo vị trí:** nhân viên `checkin` thấy vị trí quét là input readonly (server luôn override, không tin client); admin/super_admin chọn tự do qua dropdown (nhớ trong `localStorage`).
- **Dashboard Quản lý (`manager`):** hero % tham dự, bộ lọc chip (mức độ/chức vụ/quy mô/booth, OR trong nhóm — AND giữa nhóm), bảng tỷ trọng theo tiêu chí chọn. Đã tối ưu responsive cho điện thoại (commit `76189e3`).

### Style
Màu chính `--primary:#2563eb`; breakpoint mobile `≤640px`. Class quan trọng: `.card`, `.btn`, `.badge`, `.modal-bg/.modal`, `.tabs`, `.body-tab/.body-area`, `.scan-result.valid/.warn/.bad/.idle`, `.mg-*` (dashboard manager).

---

## 7. Deploy (Google Cloud Run — chính thức)

- **Địa chỉ:** https://misa-event-checkin-784559735000.asia-southeast1.run.app
- **Project GCP:** `prapplication-479309` (số 784559735000), region `asia-southeast1`, tài khoản tuanbui88vn@gmail.com.
- **Cơ chế dữ liệu:** SQLite chạy local trong container (`/data/checkin.db`) + **Litestream** sao lưu liên tục xuống bucket `gs://prapplication-479309-checkin-db/checkin.db`. Container khởi động lại → `docker-entrypoint.sh` tự `litestream restore` từ bucket → không mất dữ liệu.
- **BẮT BUỘC 1 instance:** `--min-instances=1 --max-instances=1 --no-cpu-throttling`. Lý do: Litestream là single-writer (nhiều instance ghi cùng lúc → hỏng DB); scheduler email cảm ơn (setInterval 60s) cần CPU luôn bật.
- **Deploy lại:**
  ```bash
  gcloud run deploy misa-event-checkin --source . --region asia-southeast1
  ```
  Deploy giữ nguyên env vars + scaling (min/max=1) của service cũ. gcloud: máy Windows tại `%LOCALAPPDATA%\Google\Cloud SDK\...\gcloud.cmd`; **máy Mac (arm64) tại `~/google-cloud-sdk/bin/gcloud`** — đã cài (SDK 575) + login `tuanbui88vn@gmail.com`, project `prapplication-479309`. Railway đã **hết credit** → Cloud Run là nơi deploy chính.
- **Ảnh header/footer email:** lưu trong bảng `email_images` (BLOB), KHÔNG lưu file — vì Litestream chỉ sao lưu file DB.
- **Dockerfile:** `node:20-slim` + `ca-certificates` (Litestream/Go cần CA store riêng, thiếu → lỗi x509 âm thầm) + `python3 make g++` (better-sqlite3 cần compile lại trên Linux x86_64, khác ARM Mac).
- **Local, Railway (cũ), Cloud Run là 3 database HOÀN TOÀN riêng biệt** — làm gì ở local không tự hiện ở cloud.

### Bản deploy nội bộ (bàn giao dev MISA)
- `Dockerfile.internal` + `docker-compose.internal.yml` + [DEPLOY-NOI-BO.md](DEPLOY-NOI-BO.md): chạy **không cần Google Cloud/Litestream**, SQLite lưu trong volume `/data`. Đã build + test trên Docker máy Mac (trang chủ 200, route badges 401 OK).
- Khoảng cách với chuẩn stack MISA (Vue+Tailwind / Node hoặc .NET / MySQL): backend Node ✅ khớp; **frontend đang vanilla JS (chưa Vue)**; **DB đang SQLite (chưa MySQL)**. Nếu MISA yêu cầu MySQL tập trung → cần đợt chuyển tầng dữ liệu (`db.js` + query trong `routes/api.js`, `email.js`). Session hiện dùng MemoryStore (in-memory) → nếu chạy >1 instance cần chuyển sang store bền (Redis/MySQL).

---

## 8. Bẫy kỹ thuật cần nhớ (tổng hợp)

1. Tạo `<tr>` bằng JS PHẢI dùng `el()` (qua `<template>`) — gán `innerHTML` thẳng lên bảng phá cấu trúc (browser tự chèn `<tbody>`).
2. Luôn `esc()` giá trị user/DB trước khi nhúng vào chuỗi HTML — chống XSS.
3. Thời gian lưu UTC (`datetime('now')`); hiển thị dùng `fmtDate(x, true)` (frontend) / `fmtVN()` (backend); so sánh "hôm nay" dùng `todayYMD()` theo múi giờ `Asia/Ho_Chi_Minh` — không dùng giờ máy chủ trực tiếp.
4. Cloud Run/Railway chặn outbound SMTP ở gói free/hobby → email cloud bắt buộc qua Brevo API (`smtp_settings.brevo_api_key`).
5. Brevo lỗi 401 "unrecognised IP" → tắt Authorized IPs trong cài đặt bảo mật Brevo.
6. Litestream cần `ca-certificates` trong Docker image — thiếu sẽ lỗi x509 và sao lưu thất bại **âm thầm** (không crash app).
7. Cloud Run bắt buộc 1 instance — tăng instance sẽ hỏng dữ liệu do Litestream single-writer.
8. `better-sqlite3` phải compile lại trong Docker (không copy `node_modules` từ máy Mac ARM sang container Linux x86_64).
9. Server luôn override `booth_id` gửi từ client nếu người gọi là nhân viên `checkin`/`reception`/`supervisor` — không tin client cho vị trí quét.
10. `staff_type` mới (`reception`, `supervisor`, `manager`) được thêm sau `checkin` gốc — khi sửa logic quét/báo cáo/danh sách khách, luôn kiểm tra đủ 4 loại, đặc biệt 2 loại `VIEW_ONLY_TYPES` (supervisor/manager) bị chặn hẳn khỏi Báo cáo (có PII) và khỏi quét QR.
11. PowerShell 5.1 gửi JSON tiếng Việt qua `curl` phải ghi file UTF-8 không BOM rồi `-d "@file"`.
12. Web Bluetooth API không hỗ trợ trên Safari/iOS — máy in nhiệt Bluetooth kiểu CLab 221B (dùng app riêng, không ESC/POS công khai) không thể in trực tiếp từ web trên iPhone; xem quyết định ở mục 9 (2026-07-06). Đã thay bằng mô hình phôi thẻ in sẵn (mục 5.7) + in tem USB dự phòng.
13. Mã QR trên phôi thẻ mã hoá `{eventId}-{code}` (không chỉ `{code}`) để chống nhầm chéo sự kiện khi 2 sự kiện có cùng số phôi. `findBadge()` trong api.js xử lý cả 2 dạng (QR có prefix eventId, và số gõ tay không prefix). Thứ tự resolve khi quét: thử `qr_token` của khách (hex 20 ký tự) trước, không thấy mới thử mã phôi.
14. Cần `jszip` (dependency mới) để xuất ZIP bộ SVG phôi thẻ — dev chạy `npm install` là có.
15. **UI Toolbar select bị vỡ dòng:** class `w-full` của MDS khiến MSelect tự vỡ xuống 1 dòng riêng trong `.toolbar` (flex) → dùng `.toolbar-select { width: 180px; flex: 0 0 auto; }` bọc quanh từng MSelect để cố định độ rộng và nằm cùng hàng. Thêm `.name-tags { gap: 6px; }` cho tên + MTag (Vãng lai/Không đủ ĐK) để chữ không dính khối màu.

---

## 9. Lịch sử phát triển (changelog theo tính năng)

> Nguồn: git log + trao đổi trực tiếp với chủ dự án. Mỗi mục ghi **quyết định nghiệp vụ** (why), không chỉ "đã sửa gì".

1. **Phiên bản đầu tiên** (`3d5c8c0`) — CRUD sự kiện/khách, QR check-in cơ bản, email xác nhận + cảm ơn qua Gmail SMTP.
2. **Brevo cho bản cloud** (`b3d2dc0`) — Railway chặn outbound SMTP → thêm kênh gửi email qua Brevo HTTP API.
3. **Booth journey, xưng hô, mức độ quan trọng, điều kiện tham dự, sửa khách, in QR, mobile checkin** (`0111d3d`) — mở rộng nghiệp vụ lớn: hành trình booth (`booths`/`booth_visits`), `salutation`/`importance`, `eligibility_field`, giao diện mobile cho nhân viên quét.
4. **Nâng cấp lớn** (`ca53fd2`) — gán nhân viên vào booth cụ thể (`event_staff.booth_id`), PWA cho mobile (manifest + service worker, chặn pull-to-refresh), soạn email 2 chế độ (văn bản/HTML), in tem QR khổ nhiệt 50×30mm.
   - Quyết định: staff được **khoá cứng vào 1 vị trí** (gate hoặc 1 booth) — phương án được chủ dự án chọn thay vì cho tự chọn vị trí mỗi lần quét, để tránh nhầm lẫn hiện trường.
5. **Chuyển nút in tem QR** (`e1dd4b5`) — từ tab Người tham dự (danh sách đăng ký) sang tab Báo cáo (chỉ người **đã đến**). Why: chỉ in tem cho khách đã check-in thật, không in trước cho người chưa chắc đến.
6. **Chuẩn bị & Deploy Google Cloud Run** (`f4ca08f`, `e24f76c`) — thêm Dockerfile + Litestream, chuyển ảnh header/footer email từ file sang lưu BLOB trong DB (để Litestream sao lưu được cùng dữ liệu). Why: Railway free tier không đủ ổn định cho sự kiện thật cần HTTPS + volume bền; Cloud Run + Litestream cho phép SQLite chạy nhẹ mà vẫn không mất dữ liệu khi container restart.
7. **Tìm kiếm + lọc + tick chọn gửi email hàng loạt; quét tại booth tự tính check-in** (`1b8aeb9`) — tab Người tham dự có search/filter/bulk-select gửi email; quét QR tại booth giờ **tự động** ghi nhận check-in luôn (không cần qua cổng trước). Why: nhiều khách đi thẳng vào booth mà không qua cổng chính.
8. **Thêm vị trí Lễ tân in QR + Giám sát booth** (`2f4658e`) — mở rộng `event_staff.staff_type` từ chỉ có `checkin` thành 4 loại. `reception`: đứng cổng, xem toàn bộ khách, tra cứu & in tem nhanh (không cần đợi khách tự đưa QR). `supervisor`: gắn cứng 1 booth, xem ai đã ghé + ghi chú nhu cầu đặc biệt, không có quyền quét (tránh nhầm vai trò với nhân viên check-in).
9. **Thêm vị trí Quản lý (xem số liệu)** (`d4ee095`) — `staff_type='manager'`: dashboard ẩn danh (không PII), lọc theo mức độ/chức vụ/quy mô/booth, không bị khoá theo ngày sự kiện (khác các staff_type khác). Why: quản lý cấp trên cần xem tiến độ đăng ký/tham dự cả trước và sau sự kiện, nhưng không cần và không nên thấy thông tin cá nhân khách.
10. **Tối ưu UI dashboard Quản lý cho điện thoại** (`76189e3`) — bộ lọc dạng accordion đóng mặc định trên mobile, chip filter, bảng tỷ trọng responsive.
11. **Di chuyển hạ tầng:** Railway (ban đầu) → Google Cloud Run + Litestream (chính thức, ổn định lâu dài hơn cho sự kiện thật).
12. **Tư vấn máy in nhiệt CLab 221B** (2026-07-06, trao đổi không có commit code) — chủ dự án hỏi có thể in QR trực tiếp từ mobile browser sau khi quét, không qua app "Clabel Trade" của hãng. Kết luận: **không khả thi trực tiếp** — CLab 221B dùng giao thức Bluetooth riêng (không công khai ESC/POS), và Safari/iOS không hỗ trợ Web Bluetooth API. Dẫn tới quyết định chuyển sang mô hình phôi thẻ in sẵn (mục 13).
13. **Phôi thẻ in sẵn + gán thẻ (badge pairing)** (2026-07-08) — thay cho việc in tem tại chỗ. Xem chi tiết luồng ở mục 5.7. Các quyết định nghiệp vụ đã chốt với chủ dự án:
    - Phôi **dùng 1 lần** (in màu theo từng sự kiện) → mã chỉ cần duy nhất trong 1 sự kiện.
    - Mất thẻ: gán thêm thẻ mới, **có nút Ngừng thẻ cũ** (chống gian lận lấy quà — 1 người báo mất để làm nhiều thẻ cho người khác).
    - Mã ID **số tuần tự dễ gõ** (0001...), QR trên + số dưới, khung vuông 1:1.
    - Xuất **SVG** (vector, in nét mọi kích thước), đóng gói **ZIP** để gửi nhà in in số nhảy; nhà in tự ghép QR vào thiết kế thẻ màu (phương án đã chốt sau khi tư vấn: nhà in dùng in dữ liệu biến đổi/VDP).
    - **Giữ song song** cách cũ (quét mã email trực tiếp) cho sự kiện không dùng thẻ.
    - **Dự phòng khi hết phôi:** in tem QR của khách bằng máy in nhiệt **USB**, khổ **50×50mm**, dưới QR in "Tên - Công ty". Tem chứa mã khách → quét thẳng, không cần gán.
    - UI màn hình mới theo tinh thần MISA Design System nhưng **giữ tông màu #2563eb** hiện có (không viết lại app cũ) — theo lựa chọn của chủ dự án để an toàn trước khi bàn giao dev.
    - Đã test 14 kịch bản backend + kiểm tra UI qua preview (sinh phôi, gán thẻ, ngừng thẻ, xuất ZIP, quét resolve badge) — tất cả pass.
14. **Sửa lỗi UI (2026-07-08)** — 6 lỗi hiển thị giao diện (bàn giao sau khi hoàn thành GĐ3-5):
    1. **Logo**: thay chữ "🎟️ MISA Event Check-in" bằng logo SVG → 42px ở navbar, 64px ở màn hình đăng nhập (dễ đọc). **Lần 2 sửa (c4f992a)**: giảm viewBox từ 1909→900, tăng kích thước icon để icon + text cân đối nhau.
    2. **Nút biểu tượng bút → nút "Sửa"**: thay `✏️` bằng chữ "Sửa" rõ ràng ở Events/Members/Report/Attendees.
    3. **Nhãn filter mơ hồ**: thay "Tất cả" chung chung → "Tất cả trạng thái", "Tất cả mức độ", "Tất cả chức vụ", "Tất cả quy mô" để biết đang lọc theo gì mà không cần mở dropdown. Thêm luôn lọc "Quy mô nhân sự" ở ReportTab (trước đó có biến nhưng thiếu UI).
    4. **Bộ lọc select vỡ dòng**: `.toolbar-select { width: 180px; flex: 0 0 auto; }` để các ô lọc nằm cùng hàng, đều kích thước. Thêm `.name-tags { gap: 6px; }` cho tên + tag đi kèm (Vãng lai/Không đủ ĐK).
    5. **Cột "Mức độ" (importance) bị wrap**: thêm `white-space:nowrap` vào `<td>` để tag VIP/VVIP/... giữ trên 1 dòng.
    - **Verify:** preview (Vite) + Docker, chụp màn hình: logo cân đối, tile/select đều hàng, mức độ 1 dòng, 0 lỗi console. Commit `10e0e35` (ui polish) → `0eb8c9f` (memorybank) → `c4f992a` (logo+report fix) + push `rewrite-vue-mysql`.
15. **Giám sát "bóng ma" + Lucky draw filter/export** (2026-07-08, commit `ddaf920`) — triển khai 2 quyết định nghiệp vụ đã chốt cùng ngày (mục 15.2, 15.3):
    - Bảng mới `booth_potential_notes` (tách hoàn toàn khỏi `booth_visits`) lưu ghi chú + tick "khách hàng tiềm năng" của giám sát viên khi tra khách bằng mã thẻ in sẵn — không làm sai lệch số booth đã ghé dùng cho lucky draw.
    - API `GET/PUT .../booth-monitor/lookup` và `.../booth-monitor/potential-note`, guard bằng `resolveMonitorBooth` (không phải `badgeOpGuard`) để giám sát viên (`VIEW_ONLY_TYPES`) vẫn tra được dù bị chặn thao tác thẻ ở nơi khác. Chỉ bật cho sự kiện có phôi thẻ (`badge_count>0`).
    - `GET /report/export` nhận thêm `min_booths` để xuất riêng danh sách đủ điều kiện quay số; ngưỡng không lưu cấu hình, gõ lại mỗi lần trên UI Báo cáo — vì mỗi sự kiện có số booth khác nhau.
    - **Verify:** Docker (MySQL) + preview, dựng dữ liệu demo (booth, phôi thẻ, gán thẻ, quét booth), test tra mã thẻ → đúng khách, lưu ghi chú không tạo dòng `booth_visits` mới, lọc + xuất Excel đúng người/đúng cột, 0 lỗi console.

---

## 10. Công việc đang mở / cần theo dõi

- [ ] **Tích hợp thanh toán vé** (misaamis → store.misa.vn → check-in): đã soạn yêu cầu kỹ thuật ở [YEU-CAU-TICH-HOP-THANH-TOAN.md](YEU-CAU-TICH-HOP-THANH-TOAN.md), đang chờ team Store xác nhận có webhook thanh toán không. Khi có: thêm cột `payment_status` cho attendees + API đăng ký công khai + endpoint nhận webhook (xác thực HMAC).
- [ ] Nhà in xác nhận dùng in dữ liệu biến đổi (VDP) hay cần PDF ghép sẵn — hiện xuất bộ SVG riêng (phù hợp VDP).
- [ ] Xoá/thu hồi GitHub Personal Access Token đã dùng để đồng bộ code trong quá khứ (nếu chưa làm) — token có quyền write, không có ngày hết hạn.
- [x] ~~Chốt phương án in tem QR tại hiện trường~~ → đã chuyển sang phôi thẻ in sẵn + in tem USB dự phòng (mục 9.13).
- [x] ~~Giám sát "bóng ma" + Lucky draw~~ → đã code + test xong (2026-07-08, commit `ddaf920`), xem mục 9.15 và 15.2/15.3.
- [ ] **Deploy GCE VM** (bản Vue+MySQL, để test môi trường thật) — phương án đã chốt ở mục 15.4, CHƯA triển khai. Làm trên nhánh `rewrite-vue-mysql`, không đụng bản Cloud Run cũ (SQLite/vanilla).

---

## 15. QUYẾT ĐỊNH NGHIỆP VỤ ĐÃ CHỐT (2026-07-08) — chưa code, làm tiếp trên `rewrite-vue-mysql`

> Nguồn: trao đổi trực tiếp với chủ dự án sau khi seed demo data + làm presentation giới thiệu sản phẩm. Ghi đầy đủ để AI/dev sau không phải hỏi lại.

### 15.1 Làm rõ hiểu lầm "thiếu vai trò"
Chủ dự án tưởng thiếu 4 vai trò (Lễ tân/Giám sát/Quản lý/Quét QR) vì nhìn nhầm ở form **"Thêm thành viên"** (tạo tài khoản hệ thống, chỉ có role gốc `super_admin`/`admin`/`checkin`). Thực ra 4 vai trò đó là **"Vai trò tại sự kiện"** (`event_staff.staff_type`), gán ở **tab Nhân viên bên trong từng sự kiện** — **đã có đủ** ở cả 2 bản (xem mục 5.4). Không cần sửa gì, chỉ cần hướng dẫn lại đúng chỗ bấm.

### 15.2 Giám sát "bóng ma" (mở rộng `supervisor`) — tra cứu theo mã thẻ, tách khỏi hành trình lucky draw
**Mô hình nghiệp vụ đúng** (khác giả định ban đầu của AI — đã sửa sau khi hỏi lại):
- **Lễ tân tại booth**: vẫn quét QR/mã phôi của khách như cũ để **ghi nhận hành trình** (`booth_visits`) — **giữ nguyên, không đổi**.
- **Giám sát viên** ("bóng ma"): KHÔNG giao tiếp khách, KHÔNG quét, chỉ **liếc thấy mã số in trên thẻ** (VD `0005`) khi khách đang trao đổi với sales → gõ mã vào ứng dụng → tra ra tên khách (VD "Bùi Minh Tuấn – CEO ABC") → ghi chú nhanh (VD "quan tâm phần mềm kế toán") + tick **"Khách hàng tiềm năng"** để sau sự kiện có nhân viên kinh doanh liên hệ lại.

**Vì sao tra được mã thẻ dù khách chưa được lễ tân booth này quét:** mã thẻ (0005) được **gán cho khách ngay từ CỔNG** lúc khách vừa đến sự kiện (luồng phôi thẻ ở mục 5.7 — lễ tân cổng quét QR email + quét mã phôi → hệ thống map `0005 ↔ Bùi Minh Tuấn` cho **toàn sự kiện**, không phải riêng 1 booth). Nên giám sát viên ở bất kỳ booth nào gõ `0005` đều tra ra đúng khách ngay, không phụ thuộc việc lễ tân booth đó đã quét hay chưa.

**Quyết định quan trọng — TÁCH 2 khái niệm:**
1. **Hành trình ghé booth** (`booth_visits`, do lễ tân quét) → dùng để tính **số booth đã ghé cho lucky draw**.
2. **Ghi chú + tick tiềm năng của giám sát viên** → lưu **tách biệt**, KHÔNG tự cộng vào số booth hành trình, KHÔNG ảnh hưởng điều kiện quay số.
- Lý do: nếu gộp chung, giám sát note khách ở booth 3 sẽ vô tình làm khách "đủ điều kiện ghé booth 3" dù lễ tân chưa quét — sai lệch số liệu lucky draw.
- Hệ quả thiết kế: cần bảng/cơ chế lưu riêng cho "ghi chú giám sát tiềm năng" (không tái dùng thẳng `booth_visits.note` như hiện tại — cần tách cột `is_potential` + note khỏi luồng hành trình, hoặc thêm bảng mới `booth_potential_notes` độc lập, quyết định cụ thể khi thiết kế).
- Phạm vi áp dụng: tính năng gõ-mã-thẻ chỉ dùng được cho **sự kiện có in phôi thẻ** (cần số in trên thẻ). Sự kiện không dùng phôi → giám sát viên vẫn tra cứu bằng cách tìm tên như hiện tại (không có mã thẻ để gõ).

**✅ Đã code (2026-07-08, commit `ddaf920`):** bảng `booth_potential_notes` (event_id, booth_id, attendee_id, note, is_potential — khoá `(booth_id, attendee_id)`, tách hoàn toàn khỏi `booth_visits`). API `GET /events/:id/booth-monitor/lookup?code=` (tái dùng `resolveAttendee`/`findBadge`, guard bằng `resolveMonitorBooth` để supervisor tra được — không dùng `badgeOpGuard` vì hàm đó chặn `VIEW_ONLY_TYPES`) + `PUT /events/:id/booth-monitor/potential-note` (upsert `ON DUPLICATE KEY UPDATE`). Chỉ bật khi `badge_count>0`. UI: khối "🕵️ Tra cứu bóng ma" trong `MonitorTab.vue` (ô nhập mã + kết quả + ghi chú + tick tiềm năng). Report/export có thêm 2 cột "Khách hàng tiềm năng" + "Ghi chú tiềm năng (giám sát)" qua `attachPotentialNotes()`.

### 15.3 Lucky Draw — lọc khách đủ điều kiện quay số
- **Yêu cầu gốc:** sự kiện có N booth, khách phải ghé tối thiểu X booth mới đủ điều kiện quay số (VD 10 booth, cần ≥8).
- **Đã có sẵn ~90%:** `booth_visits` đã ghi khách nào ghé booth nào; báo cáo + Excel export đã có cột "Số booth đã ghé" (mục 4, endpoint `/report`, `attachBoothVisits()`).
- **Cần bổ sung:** UI lọc trên tab Báo cáo theo **số booth tối thiểu đã ghé** (VD gõ "≥8") + xuất Excel riêng danh sách đủ điều kiện.
- **Chốt quan trọng:** ngưỡng số booth **KHÔNG lưu cấu hình cố định theo sự kiện** — để người dùng **tự gõ ngưỡng mỗi lần lọc** trên UI báo cáo, vì mỗi sự kiện có số booth/tiêu chí khác nhau, không nên fix cứng.
- **Đầu ra:** chỉ cần **xuất Excel danh sách đủ điều kiện** — chủ dự án tự đưa sang ứng dụng quay số bên ngoài. KHÔNG cần làm tính năng bốc số ngẫu nhiên trong app này.

**✅ Đã code (2026-07-08, commit `ddaf920`):** `GET /events/:id/report/export` nhận thêm query `min_booths` — lọc `rows` theo `booth_visits.length >= min_booths` trước khi build Excel, đổi tên file tải về thành `du-dieu-kien-quay-so-su-kien-{id}.xlsx` khi có lọc (phân biệt với file báo cáo đầy đủ). UI ở `ReportTab.vue`: ô nhập số "khách ghé tối thiểu" (không lưu, gõ lại mỗi lần — đúng chốt) + nút xuất riêng. Lọc hiển thị trên màn hình là 100% frontend (đã có `booth_visits` sẵn trong `/report`).

### 15.4 Deploy bản Vue+MySQL lên môi trường thật để test — dùng GCE VM
- **Đã chốt phương án:** dựng **1 Google Compute Engine (GCE) VM**, chạy đúng `docker-compose.internal.yml` đã test kỹ trên Docker local (app + MySQL trong cùng VM). KHÔNG dùng Cloud Run cho bản này (Cloud Run stateless, cần tách MySQL ra dịch vụ ngoài — phức tạp/tốn hơn cho nhu cầu "chỉ để test").
- **Project GCP dùng chung:** `prapplication-479309` (cùng project với Cloud Run bản cũ — công ty đã trả phí, có thể dùng cấu hình trả phí nếu cần, không cần tối ưu về 0 đồng).
- **Quan trọng — đã giải thích rõ với chủ dự án:** GCE VM là máy chủ chạy **trên hạ tầng Google 24/7**, KHÔNG phải máy tính vật lý của chủ dự án — tắt máy cá nhân không ảnh hưởng, mọi người vẫn truy cập được qua internet.
- **Việc cần làm khi triển khai:** tạo VM (Ubuntu, kích thước đủ chạy Node+MySQL, ví dụ e2-small/medium tuỳ tải), cài Docker + docker-compose, clone nhánh `rewrite-vue-mysql`, chạy `docker compose -f docker-compose.internal.yml up -d --build`, cấu hình HTTPS (Caddy hoặc reverse proxy + domain/subdomain riêng — chưa chốt tên miền, cần hỏi lại khi tới bước này), mở firewall port 80/443 trên GCP.
- **Không đụng bản Cloud Run cũ** (SQLite/vanilla) — đây là service hoàn toàn tách biệt, phục vụ mục đích test bản mới song song.

### 15.5 Trạng thái
- ✅ 15.2 (Giám sát bóng ma) và 15.3 (Lucky draw filter/export) **đã code + test xong** (2026-07-08, commit `ddaf920`, xem chi tiết ở mục 9.15).
- ⏳ 15.4 (Deploy GCE VM) **CHƯA triển khai** — phương án hạ tầng đã chốt (sslip.io cho HTTPS, `gh` CLI đăng nhập trên VM để clone code), việc còn lại thuần tạo tài nguyên GCP thật (có phát sinh phí liên tục) nên cần xác nhận lại với chủ dự án trước khi tạo VM.

---

## 12. ĐANG THỰC HIỆN: Viết lại Vue 3 + Tailwind + MySQL (nhánh `rewrite-vue-mysql`)

Mục tiêu: đưa app về đúng chuẩn stack MISA. **Giữ backend Node/Express** (tái dùng logic), đổi 2 tầng: giao diện → Vue 3, dữ liệu → MySQL. Làm **song song trên nhánh `rewrite-vue-mysql`**, KHÔNG đụng `main` (bản SQLite + vanilla vẫn chạy Cloud Run).

### Kiến trúc bản mới
- **Backend:** Node.js + Express (giữ nguyên cấu trúc file gốc), tầng DB = **MySQL** (`mysql2`).
  - `db.js`: pool mysql2 + wrapper **`db.prepare(sql).get/all/run(...)` BẤT ĐỒNG BỘ** (giữ cú pháp cũ, chỉ thêm `await`). `db.init()` tạo 10 bảng khi khởi động + seed. Biến env: `DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME` (mặc định 127.0.0.1:3307 / checkin / checkinpw / checkin).
  - `server.js`: `await db.init()` trước `listen`; phục vụ `public-vue/` (build Vue) nếu có, else `public/`.
  - `routes/api.js`, `email.js`: đã async hóa toàn bộ + sửa SQL SQLite→MySQL (`datetime('now')`→`UTC_TIMESTAMP()`, `INSERT OR IGNORE`→`INSERT IGNORE`, `ON CONFLICT..DO UPDATE`→`ON DUPLICATE KEY UPDATE ..VALUES()`, scheduler dùng `DATE_ADD(.. INTERVAL .. MINUTE)`). Cột datetime `DEFAULT (UTC_TIMESTAMP())`; mysql2 `dateStrings:true` để trả chuỗi UTC (frontend `fmtDate(x,true)` thêm 'Z').
- **Frontend:** thư mục `web/` = Vite + Vue 3 + Tailwind + **bộ component MDS** copy từ skill (`web/src/components/mds/M*.vue` + `toast.js`), tokens ở `web/src/tokens/` (theme blue). Router hash (`web/src/router.js`). API client + auth state ở `web/src/api.js` (session cookie same-origin). Dev: Vite 5173 proxy `/api`,`/uploads`→backend 3000. Build: `outDir ../public-vue`.

### Tiến độ (tính đến lần cập nhật này)
- ✅ **GĐ0 Backend MySQL** — xong, đã commit `ffd4c53`. Test 14 + 14 kịch bản pass trên MySQL (script ở `/tmp/checkintest/test.mjs`, `test2.mjs`).
- ✅ **GĐ1 Frontend nền** — xong, đã commit. Gồm: `LoginView`, `App.vue` (shell topbar+nav), `EventsView` (CRUD sự kiện + điều kiện tham dự), `MembersView`, `SmtpView`, `EventDetailView` (khung tabs + placeholder). Verify qua preview: đăng nhập + tạo sự kiện → MySQL OK.
- ✅ **GĐ2 xong** (2026-07-08) — 3 tab quản trị đã nối vào `EventDetailView.vue` qua `tabComponents` (dynamic `defineAsyncComponent` map: `attendees`/`booths`/`staff`), render bằng `<component :is="activeComponent" :key="activeTab" :ev="ev" @reload="load" />`; tab chưa làm giữ placeholder. File: `web/src/lib/print.js` (in tem 50×50), `web/src/components/AttendeeFields.vue`, `web/src/views/tabs/{BoothsTab,AttendeesTab,StaffTab}.vue`. Các tab **tự load dữ liệu** trong `onMounted` (không cần `@reload`; vẫn để `@reload` phòng sau này). Verify qua preview: 3 tab render OK, tạo booth "Booth AI - MISA AMIS" → ghi MySQL + re-render OK, 0 lỗi console.
- ✅ **GĐ3–4 xong** (2026-07-08) — đã port toàn bộ 8 tab còn lại sang Vue, nối vào `EventDetailView.tabComponents`:
  - `scan` (`ScanTab.vue`) + `pair` (`PairTab.vue`): camera html5-qrcode qua composable dùng chung `web/src/lib/scanner.js` (`useScanner` tự start onMounted / stop onBeforeUnmount + `vibrate`). ScanTab xử lý đủ 11 status của `/scan`, chọn vị trí cổng/booth (localStorage), auto-confirm, khách vãng lai. PairTab: lookup → pair (xử lý `duplicate` 409 → confirm → force), ngừng/dùng lại thẻ.
  - `reception` (`ReceptionTab.vue`): danh sách toàn bộ khách + tìm kiếm + check-in tay + in tem + vãng lai (tự in tem).
  - `badges` (`BadgesTab.vue`): sinh phôi, tải ZIP SVG (thẻ `<a download>`), 4 tile thống kê, lọc, ngừng/dùng lại.
  - `email` (`EmailTab.vue`): dùng `BodyEditor.vue` (2 chế độ text/HTML, helper ở `web/src/lib/emailBody.js` gồm `SUGGEST`), upload ảnh header/footer (multipart), slider độ rộng, xem trước (`<iframe srcdoc>`).
  - `report` (`ReportTab.vue`): 5 tile, lượt ghé booth, lọc, ghi chú giám sát theo booth, xuất Excel (`<a download>`), sửa nhanh.
  - `monitor` (`MonitorTab.vue`): ghi chú booth cho supervisor.
  - `dashboard` (`DashboardTab.vue`): số liệu ẩn danh từ `/stats`, chip lọc (trong chiều OR / giữa chiều AND), hero tỷ lệ, tỷ trọng drill-down. **Không dùng MChart/echarts** — tự vẽ thanh bar bằng CSS (nên echarts không bị bundle).
  - Verify qua preview + Docker: tất cả tab render, tạo booth/khách/check-in → MySQL, Email save + suggest, Dashboard lọc VIP → 100% đúng, 0 lỗi console.
- ✅ **GĐ5 xong** (2026-07-08) — Docker hóa nội bộ (MySQL):
  - `Dockerfile.internal` viết lại **đa tầng**: tầng 1 `node:20-slim` build Vue (`web/` → `/public-vue`), tầng 2 chạy Node — **bỏ python/make/g++** (mysql2 thuần JS). Ảnh tự chứa, không phụ thuộc bản build sẵn trên máy.
  - `docker-compose.internal.yml`: thêm service **`mysql` (pin `mysql:8.0`)** + healthcheck + `app` `depends_on: service_healthy`, truyền `DB_HOST=mysql DB_PORT=3306 ...`. 2 volume `checkin-mysql` (DB) + `checkin-data` (uploads).
  - Gỡ `better-sqlite3` khỏi `package.json` (chỉ còn trong comment). `.dockerignore` loại `web/node_modules`, `public-vue`.
  - Test thật: `docker compose -f docker-compose.internal.yml up -d --build` → MySQL healthy, app seed super admin, đăng nhập UI qua HTTP OK, tạo sự kiện + khách + check-in + Dashboard đều chạy trên container. 0 lỗi console.

### Môi trường dev (cách chạy lại sau khi clear/khởi động lại máy)
```bash
# 1. MySQL (nếu container đã xoá):
docker run -d --name checkin-mysql -e MYSQL_ROOT_PASSWORD=rootpw -e MYSQL_DATABASE=checkin \
  -e MYSQL_USER=checkin -e MYSQL_PASSWORD=checkinpw -p 3307:3306 mysql:8
# 2. Backend (nhánh rewrite-vue-mysql):
cd misa-event-checkin && PORT=3000 DB_PORT=3307 node server.js
# 3. Frontend dev:
cd misa-event-checkin/web && npm run dev   # http://localhost:5173
```
Preview (Claude Code): launch config `misa-checkin-web` (port 5173) đã có trong `~/.claude/launch.json`. Đăng nhập super admin: tuanbui88vn@gmail.com / SocTho0607!9@@.

### Lưu ý kỹ thuật đã gặp
- `MDialog` (MDS): mặc định `type='default'` chỉ 1 nút và nút đó CHÍNH là `@confirm`. Muốn nút "Lưu" + có "Hủy" → đặt `type="confirm" confirm-text="Lưu"`.
- MDS components dùng Tailwind → `web/tailwind.config.js` phải quét cả `src/components/mds`.
- ✅ Đã gỡ `better-sqlite3` khỏi package.json ở GĐ5.
- **Trình biên dịch Vue KHÔNG cho phép `{{` lồng trong biểu thức nội suy** (VD hiển thị chữ `{{ho_ten}}` bằng `{{ '{{ho_ten}}' }}` → lỗi "Unterminated string constant"). Cách làm: đưa các chuỗi biến vào `script` (mảng) rồi render `<code v-for>`.
- **Session cookie**: đổi từ `secure: IS_CLOUD` → `secure: 'auto'` (server.js). 'auto' + `trust proxy` = tự bật secure khi HTTPS, tắt khi HTTP → chạy được cả sau proxy HTTPS lẫn HTTP trực tiếp (Docker nội bộ). Trước đây `NODE_ENV=production` ép secure=true làm hỏng đăng nhập khi truy cập qua HTTP.
- **Docker MySQL**: `mysql:8` giờ trỏ 8.4 đã **bỏ** tuỳ chọn `--default-authentication-plugin` → container chết. Phải pin `mysql:8.0`.
- **Thiếu alias token MDS**: bộ component MDS tham chiếu các biến ngữ nghĩa (`--mds-bg`, `--mds-border`, `--mds-text`, `--mds-text-placeholder`, `--mds-bg-hover-soft`, `--mds-bg-disabled`, `--mds-danger/info/success/warning`) nhưng bộ token `blue.css` KHÔNG định nghĩa (chỉ có `--mds-bg-white`, `--mds-stroke-neutral`...). Hậu quả: nền dropdown/input **trong suốt**, đè chữ bên dưới. Đã map alias ở `:root` trong `web/src/style.css`. Nếu thêm component MDS mới mà thấy nền/viền/màu chữ sai → kiểm tra alias còn thiếu.

### Chạy bằng Docker (hạ tầng nội bộ, đã test)
```bash
docker compose -f docker-compose.internal.yml up -d --build   # dựng cả MySQL + app
docker compose -f docker-compose.internal.yml logs -f app
docker compose -f docker-compose.internal.yml down             # giữ dữ liệu
docker compose -f docker-compose.internal.yml down -v          # xoá luôn dữ liệu
```
App ở http://localhost:3000. Super admin seed sẵn: tuanbui88vn@gmail.com / SocTho0607!9@@.

## 11. Quy tắc cập nhật file này

Áp dụng cho mọi AI (Claude hoặc khác) làm việc trên dự án này:

1. **Sau khi hoàn thành một tính năng/thay đổi kiến trúc** (đã code xong, đã test/deploy) → thêm 1 mục mới vào **mục 9. Lịch sử phát triển**, ghi rõ *cái gì thay đổi* và *why* (quyết định nghiệp vụ, không chỉ mô tả code).
2. **Nếu thay đổi schema DB** → cập nhật **mục 3**. **Nếu thêm/sửa API** → cập nhật **mục 4**. **Nếu thay đổi luồng nghiệp vụ** → cập nhật **mục 5**. **Nếu thay đổi UI/tab/trang** → cập nhật **mục 6**.
3. **Nếu phát hiện bẫy kỹ thuật mới** (lỗi khó hiểu, workaround đặc biệt) → thêm vào **mục 8**, không chỉ sửa và bỏ qua.
4. **Nếu có quyết định nghiệp vụ quan trọng qua trao đổi** (dù chưa code, ví dụ advisory/tư vấn) → vẫn ghi vào mục 9 hoặc mục 10 (nếu còn đang mở), để AI/dev sau không hỏi lại câu đã có câu trả lời.
5. Giữ file này bằng **tiếng Việt**, ngắn gọn, có cấu trúc bảng/heading rõ ràng — đây là tài liệu bàn giao, không phải log chi tiết.
6. Không cần hỏi chủ dự án trước khi cập nhật file này — đây là việc kỹ thuật nội bộ, tự làm sau mỗi lần hoàn thành việc.
