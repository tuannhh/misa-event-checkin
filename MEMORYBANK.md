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

> **Frontend đang dùng thật (từ nhánh `rewrite-vue-mysql`/`backend-refactor-d1`) là
> `web/src` (Vue 3 + Vite + Tailwind + MDS)**, KHÔNG phải `public/app.js` mô tả ngay
> dưới đây — phần đó là bản vanilla JS cũ, giữ lại làm fallback/tham khảo, chưa xoá.
> Sửa UI thật thì sửa trong `web/src/` (routing qua `vue-router` hash mode: `router.js`
> có `/events`, `/event/:id/:tab`, `/members`, `/smtp`; component MDS ở
> `web/src/components/mds/`, icon dùng chung ở `icons.js` qua `MIcon.vue`). App Shell
> (header `MHeaderBar` + sidebar `MSidebar` + dialog Thiết lập `MSettingsDialog`) nằm ở
> `App.vue` — xem chi tiết mục 9 entry 25 (Đợt 5 phần 2).

### Routing & hàm nền tảng (public/app.js — bản cũ, xem ghi chú trên)
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
16. **Deploy bản Vue+MySQL lên GCE VM để test môi trường thật** (2026-07-08/09) — thực hiện phương án đã chốt ở mục 15.4: tạo VM `misa-checkin-test` (project `prapplication-479309`), cài Docker + `gh` CLI, clone `rewrite-vue-mysql` qua `gh auth login` (không dùng PAT), thêm Caddy + domain tạm **sslip.io** để có HTTPS thật (Let's Encrypt) mà không cần mua domain. Chạy bằng `docker-compose.internal.yml` (đã có sẵn, không sửa) + `docker-compose.override.yml` riêng trên VM (SESSION_SECRET thật, BASE_URL, service Caddy — không commit vào repo vì gắn IP VM cụ thể). Đã verify đăng nhập + HTTPS hợp lệ qua https://34-87-20-119.sslip.io. Xem chi tiết vận hành (lệnh SSH, dừng/xoá VM) ở mục 15.4.
17. **Kế hoạch nâng cấp lớn (2026-07-27, tư vấn, chưa code)** — chủ dự án yêu cầu 8 cải tiến lớn: tách BE/FE, UI theo MDS 2.0, phân quyền nhân viên tick-chọn (bỏ `staff_type` cứng), mobile app thật (bỏ hướng PWA thu nhỏ), in từ điện thoại không qua Chrome kiosk-printing, đa nội dung email theo nhóm khách + sửa lỗi mất nội dung khi chuyển tab soạn thảo, báo cáo chọn cột xuất, chọn tường minh nhà cung cấp email (Brevo/Gmail/Manual). Đã khảo sát kỹ code hiện tại (BE `routes/api.js` 1128 dòng, FE `web/src` Vue3+MDS) và viết kế hoạch đầy đủ ở [KE-HOACH-NANG-CAP-2026-07.md](KE-HOACH-NANG-CAP-2026-07.md).
    - **Phát hiện quan trọng:** bản đang chạy thật tại `misajsc.amis.vn/emt/event-checkin` (dev MISA vận hành) **hoàn toàn không có trong repo này** — đã grep toàn bộ lịch sử git, 0 kết quả. Bản đó có tính năng riêng (`#/event/3/printstation`, `#/event/3/discounts`) không tồn tại ở đây → hai bản code đã rẽ nhánh từ trước. **Lý do đã xác nhận:** code dev MISA chạy trong môi trường production của họ, không đưa ra ngoài được — nên phối hợp bằng cách ta làm xong ở repo này, dev MISA đưa vào môi trường của họ rồi **tự dùng AI so sánh diff** với bản đang chạy để chỉ áp dụng đúng phần thay đổi. Hệ quả: mỗi thay đổi ở repo này nên gọn theo module/file, tránh xáo trộn lan man ngoài phạm vi 8 yêu cầu, để bên họ diff được chính xác.
    - **Quyết định đã chốt (2026-07-27):** (1) làm tiếp trên repo này, phối hợp bằng diff như trên; (2) giữ Express, chỉ chia `routes/api.js` thành module theo nghiệp vụ (không chuyển NestJS); (3) làm cả 2 hướng in — TCP 9100 thẳng qua LAN + Print Agent (.exe) cho máy in USB/sự kiện ngoài văn phòng; (4) quyền "Xem danh sách check-in" có phân phạm vi (all/checked_in/my_booth) và tách riêng quyền `view_pii`; (5) thứ tự triển khai: **Đ1 Nền tảng (migration+module+Redis/worker+phân trang+bảo mật) → Đ2 Quyền tick-chọn+App mobile → Đ3 Email nhóm+sửa editor → Đ4 In LAN+Agent → Đ5 UI MDS+Báo cáo chọn cột**; (6) UI **bắt buộc tuân thủ đầy đủ** quy tắc bắt buộc của MDS 2.0 (icon/token/layout/box-shadow/tự kiểm thử trên trình duyệt thật), không làm tắt; (7) ghi chú booth + khách hàng tiềm năng **bắt buộc luôn xuất hiện trong báo cáo** dù đổi mô hình quyền ở Đ2 — không được làm mất liên kết `booth_visits.note`/`booth_potential_notes` ↔ báo cáo; (8) email theo nhóm khách là **tự động hoàn toàn** — soạn sẵn nội dung theo nhóm 1 lần, hệ thống tự chọn đúng mẫu khi gửi (tay/hàng loạt/tự động), không cần chọn tay ở bước gửi.
    - Kiến trúc chốt: **KHÔNG làm microservice** (dữ liệu quan hệ dày, tách nhỏ sẽ hại) — dùng modular monolith + FE deploy tách riêng + 1 worker riêng (BullMQ) cho việc nặng (email hàng loạt, ZIP badge, in).
    - 5 task đã tạo trong TaskCreate theo đúng 5 đợt trên để theo dõi qua nhiều phiên. Chi tiết đầy đủ + bảng câu hỏi/quyết định (Q1-Q8) ở mục 10 file kế hoạch.
18. **Đợt 1 (Nền tảng backend) HOÀN THÀNH (2026-07-27)** — nhánh `backend-refactor-d1` (tách
    từ `rewrite-vue-mysql`, **CHƯA merge**), 5 commit, mỗi phần đều verify bằng Docker thật
    (không chỉ đọc code):
    - **Bảo mật** (`df608c3`): bỏ mật khẩu Super Admin hard-code trong `db.js` → đọc từ
      `ADMIN_EMAIL`/`ADMIN_PASSWORD` (bắt buộc, fail-fast nếu thiếu lúc DB rỗng); `SESSION_SECRET`
      bắt buộc, bỏ fallback hard-code từng lộ trong git; `lib/secret.js` (mới) mã hoá
      AES-256-GCM `smtp_pass`/`brevo_api_key` bằng `ENCRYPTION_KEY` (tương thích ngược dữ liệu
      cũ chưa mã hoá). Thêm `.env.example`, cập nhật `docker-compose.internal.yml`.
    - **Migration** (`ad9612b`): bật `knex` (đã có sẵn trong deps nhưng chưa dùng) quản lý
      schema qua `knexfile.js` + `migrations/20250101000000_baseline_schema.js` (baseline, giữ
      `IF NOT EXISTS` để an toàn cả DB cũ lẫn DB mới). `db.js` không còn tự chạy CREATE TABLE,
      chỉ gọi `knex.migrate.latest()`. Query nghiệp vụ trong `routes/` KHÔNG đổi (vẫn dùng
      `db.prepare()` qua pool mysql2 thuần, không viết lại bằng knex query builder).
    - **Module hoá** (`eebb011`): chia `routes/api.js` (1128 dòng) thành `routes/{auth,users,
      events,attendees,checkin,monitor,badges,email,reports,options}.js` + `routes/lib/
      {helpers,badges}.js` (hằng số + middleware phân quyền dùng chung). Không đổi path/hành
      vi API nào. `routes/index.js` gộp lại, mount ở `server.js` qua `require('./routes')`.
    - **Redis/BullMQ** (`cfce573`): session chuyển sang Redis (`connect-redis` + gói `redis`,
      **không phải ioredis** — 2 package khác nhau, đã tự phát hiện lỗi "ERR syntax error" qua
      log thật khi thử ioredis rồi sửa đúng). `lib/redis.js` dùng ioredis riêng cho BullMQ.
      Scheduler email cảm ơn (`email.js`) chuyển từ `setInterval` sang BullMQ repeatable job khi
      có `REDIS_URL` — sửa đúng bug "gửi email cảm ơn trùng khi chạy >1 instance". Không có
      `REDIS_URL` vẫn chạy được (dev/demo 1 instance) kèm cảnh báo rõ. Thêm service `redis` vào
      `docker-compose.internal.yml`. **Đã verify chạy 2 container app riêng biệt cùng 1 Redis,
      đăng nhập ở container 1 dùng được ngay ở container 2** — xác nhận đúng bug đã sửa.
    - **Phân trang** (`8a6269f`): `GET /events/:id/attendees` và `GET /events/:id/report` nhận
      `?page&page_size&q(&status&importance&position&company_size)` chạy LIMIT/OFFSET thật
      trong SQL. Không truyền `page` → giữ NGUYÊN 100% hành vi/response cũ (tương thích ngược
      với frontend hiện tại, chưa đổi gì ở FE) — FE sẽ chuyển sang dùng phân trang ở Đợt 5.
    - **Việc treo mới phát sinh**: (a) nhánh `backend-refactor-d1` cần merge về `rewrite-vue-mysql`
      sau khi chủ dự án duyệt; (b) mật khẩu Super Admin/session/encryption cũ trên các bản đang
      chạy (Cloud Run `main`, VM `misa-checkin-test`) KHÔNG bị ảnh hưởng — chỉ nhánh này thay đổi,
      cần kế hoạch chuyển đổi riêng khi lên production thật; (c) `docker-compose.internal.yml` giờ
      cần thêm service Redis khi deploy — cập nhật `DEPLOY-NOI-BO.md` sau (đang lỗi thời từ trước).
    - Đợt 1 KHÔNG đổi bất kỳ dòng frontend nào (`web/`) — toàn bộ thay đổi chỉ ở backend, đúng
      tinh thần "gọn theo module, dễ diff" đã chốt với chủ dự án (mục 0.1 file kế hoạch).
19. **Đợt 2 (Phân quyền tick-chọn) — PHẦN BACKEND HOÀN THÀNH (2026-07-27)** — vẫn nhánh
    `backend-refactor-d1`, commit `6244e96`, verify bằng docker-compose.internal.yml + MySQL
    thật (không chỉ đọc code) qua curl: đăng nhập, tạo sự kiện/booth/nhân viên, gán quyền, quét
    bị chặn đúng, ghi chú độc lập giữa 2 quyền, tạo nhóm chức năng tuỳ chỉnh hoạt động ngay.
    - **Thay `event_staff.staff_type`** (enum cứng 4 giá trị, hành vi rải ~15 chỗ trong code)
      bằng **8 quyền tick-chọn**: `checkin`, `view_checkin_list` (có phạm vi
      all/checked_in/my_booth), `view_pii` (tách riêng theo Q4 - xem báo cáo/danh sách được
      nhưng ẩn email/SĐT nếu không có), `note`, `mark_potential`, `view_report`, `print_badge`
      (mới chỉ là dữ liệu/cờ hiển thị FE - CHƯA có endpoint gate riêng, sẽ gate thật ở Đợt 4 khi
      làm print job), `assign_badge`.
    - Bảng mới: `permissions` (danh mục), `staff_roles` (nhóm chức năng - mẫu dùng chung
      `event_id=NULL` hoặc riêng theo sự kiện), `staff_role_permissions` (ma trận tick),
      `event_staff.role_id` + `extra_permissions` (JSON `{add:[],remove:[]}` - tick thêm/bớt
      riêng 1 người không cần tạo nhóm mới). Migration
      `migrations/20260727010000_staff_permissions.js` seed sẵn 4 nhóm mẫu tương đương 4
      staff_type cũ và **backfill toàn bộ `event_staff` hiện có** sang đúng nhóm - không đổi
      quyền ai đang được gán khi migration chạy.
    - **Bẫy kỹ thuật mới**: knex `t.timestamp().defaultTo(knex.raw('UTC_TIMESTAMP()'))` KHÔNG
      chạy được trên MySQL ("You have an error in your SQL syntax... near 'UTC_TIMESTAMP())'")
      - MySQL bắt buộc bọc ngoặc cho default là biểu thức: phải viết
      `knex.raw('(UTC_TIMESTAMP())')` (2 lớp ngoặc). Lỗi này khiến migration fail giữa chừng
      → bảng đầu đã tạo nhưng `knex_migrations` chưa ghi nhận → chạy lại báo "Table already
      exists". Nếu gặp lỗi này: `docker compose down -v` xoá sạch volume rồi chạy lại từ đầu,
      đừng cố sửa DB đang dở.
    - `routes/lib/permissions.js` (mới): `getAssignment/hasPerm/requirePerm` dùng chung +
      `legacyStaffType()` suy ngược tên 4 nhóm mẫu về `staff_type` cũ (`checkin`/`reception`/
      `supervisor`/`manager`) để **FE cũ (`web/`) chưa sửa vẫn chạy được tạm** trong lúc chờ
      làm app mobile (Đợt 2 phần FE) - nhóm chức năng tự tạo mới (VD "Tư vấn") map về mặc định
      `checkin` phía FE (không sập, nhưng FE cũ chưa vẽ đúng tab riêng cho nhóm đó).
    - `routes/staff-roles.js` (mới): `GET /permissions`, `GET/POST/PUT/DELETE /staff-roles` -
      tạo/sửa nhóm chức năng bằng API, không cần sửa code. `PUT /events/:id/staff/:userId`
      (mới) đổi quyền/vị trí 1 người mà không cần gửi lại toàn bộ danh sách nhân viên.
    - **Tightening có chủ đích** (khác 1:1 với hành vi cũ, đã cân nhắc): không nhóm mẫu nào
      mặc định có `view_report` (kể cả "Nhân viên check-in"/"Lễ tân") - backend CŨ cho phép họ
      gọi thẳng `/report` API dù FE luôn ẩn tab Báo cáo với 2 vai trò này; nay chặn đúng ở
      backend luôn, không dựa vào FE ẩn để "coi như an toàn" nữa.
    - **Việc CHƯA làm lúc đó**: FE admin StaffTab, màn quản lý nhóm chức năng, app mobile,
      `print_badge` chưa gate thật - xem tiếp mục 20 (đã làm xong phần FE cùng ngày).
20. **Đợt 2 (Phân quyền tick-chọn) — PHẦN FRONTEND HOÀN THÀNH (2026-07-27)** - vẫn nhánh
    `backend-refactor-d1`, commit `7399ad4`, verify TRÊN TRÌNH DUYỆT THẬT qua Vite dev server +
    backend + MySQL/Redis thật (Playwright-style qua Browser tool, không chỉ đọc code).
    - `api.js`: bỏ `STAFF_TYPE_NAMES`/`defaultStaffTab` (dựa staff_type cứng), thêm
      `can(ev,code)`, `needsOnsite(ev)`, `staffTabsFor(ev)` - suy danh sách tab từ
      `ev.my_permissions` (mảng quyền BE trả, xem mục 19) thay vì so sánh chuỗi staff_type ở
      nhiều file như trước.
    - **`StaffTab.vue` viết lại**: dropdown 4 staff_type cứng → chọn **nhóm chức năng**
      (`role_id`, load qua `GET /staff-roles?event_id=`) + dialog "🧩 Nhóm chức năng" (CRUD đầy
      đủ qua `GET /permissions` + `POST/PUT/DELETE /staff-roles`) - **tạo nhóm mới ngay trên UI,
      không cần sửa code**. Đã test qua UI thật: tạo nhóm "Tu van" (tick Ghi chú + Xem báo cáo)
      → gán cho nhân viên → login thấy đúng 2 mục.
    - **App mobile-first cho nhân viên hiện trường** (mục 4 kế hoạch nâng cấp): `App.vue` dùng
      shell riêng cho `role==='checkin'` - cột nội dung **cố định 480px, CĂN GIỮA BẤT KỂ viewport
      thật rộng bao nhiêu** (đã verify: viewport 1280px nhưng `.field-shell` đo được đúng 480px)
      → chế độ "Desktop site" của Chrome Android (bỏ qua `<meta viewport>`) không còn phá được
      layout - đúng nguyên nhân gốc của việc chủ dự án phản ánh "để giao diện desktop thì PWA
      không hoạt động". `EventDetailView.vue` thay `MTabs` ngang bằng **bottom nav cố định tối đa
      5 mục** (MTabs không cuộn ngang được, vỡ khi nhiều tab/màn hẹp).
    - **Bẫy công cụ test đáng nhớ**: click theo `ref` (từ `read_page`/`find`) luôn đúng toạ độ
      thật; nhưng **click bằng `coordinate` thủ công lấy từ ảnh zoom hoặc từ toạ độ báo lại của
      1 lần click ref trước đó sẽ SAI** vì `coordinate` phải theo không gian pixel của
      `screenshot` (800x450 ở đây), không phải theo viewport thật (1280x720) hay ảnh zoom. Cũng
      phát hiện: click vào checkbox `MCheckbox` (input `sr-only` ẩn dưới label) qua `computer
      left_click` với `ref` không luôn kích hoạt được (click "trúng" toạ độ nhưng không toggle) -
      dùng `form_input` (set value trực tiếp) mới đáng tin cậy cho loại control này.
    - **Bug tìm thấy + đã sửa qua test thật**: tải lại trang khi URL đang trỏ 1 tab không còn hợp
      lệ với quyền hiện tại (VD đổi nhóm chức năng rồi F5 lại đúng tab cũ, hoặc mở từ bookmark/PWA
      icon cũ) → màn hình trắng (`activeComponent` null vì lấy tab từ URL không kiểm tra còn hợp
      lệ không). Sửa: `activeTab` getter validate `props.tab` có nằm trong `tabs.value` hiện tại
      không, không hợp lệ thì tự về tab đầu tiên hợp lệ.
    - **Việc CHƯA làm (còn lại của Đợt 2 + hoãn có chủ đích sang Đợt 5)**: icon vẫn là emoji
      (chuẩn hoá MDS toàn bộ - icon/token/box-shadow - thuộc Đợt 5, không làm ở đây để tránh sơn
      lại 2 lần); `ScanTab`/`ReportTab` chưa tối ưu riêng mobile (bảng nhiều cột - cũng Đợt 5);
      PWA (manifest + service worker) cho app mobile chưa làm; `print_badge` vẫn chưa có endpoint
      gate thật ở backend (chỉ là quyền hiển thị nút, sẽ gate thật ở Đợt 4 khi làm print job).
    - **Đợt 2 coi như xong** theo "Xong khi" của kế hoạch: tạo nhóm mới không sửa code (✅ đã
      test), đổi quyền 1 người có hiệu lực ngay lần load tiếp theo (✅, qua `PUT .../staff/:userId`
      + F5), ghi chú/tiềm năng luôn vào báo cáo bất kể quyền view_report (✅ đã test ở mục 19).
21. **Đợt 3 (Email nhóm khách + sửa trình soạn thảo + chọn nhà cung cấp) HOÀN THÀNH
    (2026-07-27)** - vẫn nhánh `backend-refactor-d1`, commit `ab81bf7`, verify qua
    `email-preview` thật (không chỉ đọc code) + build Vite sạch.
    - **Nhóm khách** (mục 6): bảng `attendee_groups`, `attendees.group_id`,
      `email_group_templates`/`email_group_images` (mẫu email RIÊNG theo nhóm+loại
      confirm/thank) - thiết kế CỘNG THÊM, không đổi `email_settings`/`email_images` cũ:
      nhóm không soạn mẫu riêng thì tự lùi về mặc định của sự kiện, hành vi cũ giữ
      nguyên 100% khi chưa tạo nhóm nào. `email.js: resolveGroupOverride()` - `buildEmail()`
      tự tra `attendee.group_id` và chọn đúng mẫu, **người dùng không cần chọn tay ở
      bước gửi** (đã xác nhận với chủ dự án: tự động hoàn toàn). Đã test qua
      `/email-preview` thật: khách không nhóm ra đúng mặc định, khách nhóm VIP ra đúng
      nội dung+tiêu đề riêng.
    - `routes/attendee-groups.js` (mới): CRUD nhóm + mẫu email riêng + ảnh riêng.
      Import Excel có cột "Nhóm khách" (tự tạo nhóm nếu chưa có). Báo cáo thêm cột
      "Nhóm khách". UI: card "👥 Nhóm khách" trong `EmailTab.vue` + dialog soạn mẫu
      riêng (đổi tab Xác nhận/Cảm ơn bằng `MTabs`).
    - **Bẫy kỹ thuật mới**: migration lỗi "Referencing column ... incompatible" khi
      tạo FK `attendee_groups.event_id -> events.id` vì viết `.unsigned()` theo thói
      quen copy từ migration Đợt 2 (nơi FK trỏ bảng tự tạo bằng `increments()` - vốn
      unsigned) - nhưng `events.id` là `INT` **signed** (tạo bằng SQL thô ở baseline).
      Quy tắc: FK phải khớp CHÍNH XÁC kiểu cột đích, không suy luận từ migration khác.
    - **Mục 8 (chọn nhà cung cấp email)**: `smtp_settings.provider` (`brevo`/`gmail`/
      `manual`) chọn TƯỜNG MINH bằng radio ở `SmtpView.vue`, không còn suy đoán ngầm
      "có brevo_api_key thì dùng Brevo" như cũ. Migration tự backfill provider theo
      dữ liệu cấu hình sẵn có để KHÔNG đổi hành vi gửi email đang chạy.
    - **`BodyEditor.vue` viết lại hoàn toàn** (mục 6b) - sửa dứt điểm 4 lỗi mất nội dung
      khi chuyển tab Văn bản↔HTML: giờ chỉ có **1 nguồn sự thật là chuỗi HTML**, tab
      "Văn bản" là WYSIWYG thật (`contenteditable` + toolbar Đậm/Nghiêng/Gạch chân/
      căn trái-giữa-phải-đều/danh sách/liên kết dùng `document.execCommand`), tab HTML
      xem thẳng đúng chuỗi đó - **không còn bước chuyển đổi nào nên không thể mất định
      dạng**. Đã verify trên trình duyệt thật: gõ + in đậm ở tab Văn bản → tab HTML
      hiện đúng `<b>...</b>`, chuyển qua lại nhiều lần không đổi. `lib/emailBody.js` xoá
      các hàm `isHtmlBody/htmlToPlain/plainToHtml` cũ (nguồn gây lỗi), chỉ giữ `SUGGEST`.
    - **Chưa làm**: cảnh báo "rời trang khi có thay đổi chưa lưu" ở `EmailTab.vue`
      (`EventDetailView.vue` vẫn remount component khi đổi tab chính, mất bản nháp
      chưa lưu - biết là còn thiếu, ưu tiên thấp hơn lỗi chuyển tab con đã sửa dứt điểm).
22. **Đợt 4 (In từ điện thoại - trạm LAN + Print Agent) HOÀN THÀNH (2026-07-27)** - vẫn
    nhánh `backend-refactor-d1`, commit `cc6363e`. Đã chốt làm cả 2 hướng in (Q3).
    - `print_stations` (LAN có IP máy in trực tiếp, hoặc Agent ghép nối bằng
      `pairing_code`) + `print_jobs` (hàng đợi, trạng thái pending/done/failed).
    - `lib/tspl.js` dựng lệnh TSPL (chuẩn phổ biến máy in tem nhiệt) cho tem QR 50x50mm;
      `lib/printSender.js` gửi thẳng qua TCP cổng 9100 (RAW/JetDirect) - **đã test THẬT**
      bằng 1 TCP server giả lập đóng vai máy in: bấm nút in trên UI thật → server nhận
      đúng lệnh TSPL (QR token+tên+công ty). `routes/print.js`: CRUD trạm in + API
      ghép nối/poll/báo kết quả cho Agent (không cần đăng nhập - xác thực bằng
      pairing_code vì agent chạy trên máy riêng). Quyền `print_badge` (chỉ là cờ hiển
      thị từ Đợt 2) **lần đầu có gate thật ở backend**.
    - `print-agent/` - chương trình Node độc lập, đóng gói `.exe` bằng `pkg` (xem
      `print-agent/README.md`): hỏi địa chỉ máy chủ + mã ghép nối + máy in (LAN hoặc
      USB đã Sharing trong Windows) lúc chạy lần đầu, sau đó tự poll việc in mỗi 3s.
      Đã test API ghép nối/poll/báo kết quả qua curl (đúng hợp đồng dữ liệu).
      **CHƯA test được với máy in vật lý thật hay build .exe thật** (môi trường không
      có phần cứng/máy Windows) - cần chủ dự án tự thử với máy in PD304 thật + báo lại.
    - FE: `BadgesTab.vue` thêm card "🖨 Trạm in" (thêm/xoá, chọn trạm mặc định theo
      sự kiện, xem mã ghép nối). `lib/print.js`: `printQr()` tự gửi qua trạm đã chọn
      (localStorage `printStation-<eventId>`) nếu có, lùi về in qua trình duyệt như
      cũ nếu chưa cấu hình - đã cập nhật 4 nơi gọi (Reception/Scan/Report/Attendees).
      Tiện sửa luôn 2 lỗi nhỏ đã biết ở bản in qua trình duyệt (không bắt popup bị
      chặn, không tự đóng tab sau in).
    - ~~Còn treo: khổ tem thật 50x30 hay 50x50~~ → **đã chốt 100×75mm (A7)**, xem mục 27.
    - **Chưa làm**: in phôi thẻ (badge) qua trạm - hiện chỉ hỗ trợ tem QR khách, phôi
      thẻ vẫn theo luồng ZIP gửi nhà in như cũ (không đổi, không cần đổi).
23. **Đợt 5 (phần 1/2 - Báo cáo chọn cột) HOÀN THÀNH (2026-07-27)** - nhánh
    `backend-refactor-d1`, commit `306c6c5`. Mục 7 kế hoạch nâng cấp:
    - `routes/reports.js`: `REPORT_COLUMNS` (20 cột, dùng chung cho danh mục + xuất),
      `GET /events/:id/report/columns` tự ẩn cột PII (email/SĐT) nếu không có quyền
      `view_pii`. `GET /report/export` nhận `?columns=a,b,c` (không truyền = xuất đủ,
      tương thích ngược) + **sửa đúng bug cũ**: link xuất giờ áp đúng bộ lọc
      q/trạng thái/mức độ/chức vụ/quy mô đang xem trên màn hình (trước đây chỉ
      truyền `min_booths`, bỏ qua mọi filter khác - dễ xuất nhầm cả danh sách).
    - FE: dialog "☑ Chọn cột" ở `ReportTab.vue`, nhớ theo từng sự kiện (localStorage).
      Đã verify trên trình duyệt thật: bỏ tick Email+SĐT → link xuất đúng còn 19 cột.
    - **PHẦN CÒN LẠI CỦA ĐỢT 5 (2/2) - "Chuẩn hoá UI theo MDS 2.0" - CHƯA LÀM**,
      cố ý dừng lại ở đây thay vì làm ẩu: đây là việc thay TOÀN BỘ icon emoji bằng
      `MIcon`/Tabler, đồng bộ lại bộ 33 component + token MDS mới nhất, làm lại
      khung layout (header 48px/sidebar/box-shadow chuẩn...) cho khoảng 15 màn hình -
      quy mô lớn, mang tính thiết kế trực quan cần con người xem bằng mắt để duyệt,
      khác hẳn bản chất kỹ thuật thuần của Đợt 1-4. Skill `misa-design-system` cũng
      yêu cầu tự bấm/hover/đổi theme thật trên trình duyệt trước khi báo xong, không
      cho phép làm tắt. Cần thảo luận phạm vi cụ thể với chủ dự án trước khi bắt tay
      (làm toàn bộ 1 lượt hay ưu tiên vài màn hình nhiều người dùng nhất - app mobile
      hiện trường - trước).
24. **Deploy thử nghiệm lên Cloud Run - HOÀN THÀNH (2026-07-27)** - chủ dự án chọn tạo
    service MỚI riêng để không đụng production. Đã tạo:
    - Cloud SQL MySQL riêng: instance `misa-checkin-test-mysql` (db-f1-micro,
      region asia-southeast1, project `prapplication-479309`), database `checkin`.
    - Cloud Run service **`misa-event-checkin-test`**:
      https://misa-event-checkin-test-784559735000.asia-southeast1.run.app
      - Build từ `Dockerfile.internal` (KHÔNG phải `Dockerfile` gốc - đó là bản
        SQLite/Litestream cũ của nhánh `main`), qua `docker build` + `docker push`
        thủ công (không dùng `gcloud builds submit -f` vì lệnh không có cờ `-f`).
      - Kết nối Cloud SQL qua Unix socket (`--add-cloudsql-instances` +
        `DB_SOCKET_PATH=/cloudsql/<connection-name>`) - xem commit `73f682f` (thêm
        hỗ trợ `DB_SOCKET_PATH` vào `db.js`/`knexfile.js`, tương thích ngược).
      - `--min-instances=1 --max-instances=1 --no-cpu-throttling` (chưa cấu hình Redis
        cho bản test này - MemoryStore/setInterval đủ dùng vì luôn đúng 1 instance).
      - Tài khoản Super Admin: `admin@test.com` - mật khẩu random đã đưa vào biến môi
        trường lúc deploy, KHÔNG lưu trong repo/memory (xem trực tiếp bằng
        `gcloud run services describe misa-event-checkin-test --region asia-southeast1`
        rồi giải mã biến `ADMIN_PASSWORD`, hoặc đơn giản hơn là deploy revision mới
        với mật khẩu mới nếu quên).
    - Đã verify TRÊN CLOUD RUN THẬT (không phải giả lập local): đăng nhập, tạo sự
      kiện, đủ 7 tab, BodyEditor mới (Đợt 3) hoạt động đúng.
    - **⚠️ Đây là service test, KHÔNG phải production `misa-event-checkin` (vẫn nguyên
      trên nhánh `main`, không bị đụng tới).** Cloud SQL `misa-checkin-test-mysql`
      **tốn phí liên tục theo giờ cho tới khi xoá/tắt** - nếu không dùng nữa:
      `gcloud sql instances delete misa-checkin-test-mysql` và
      `gcloud run services delete misa-event-checkin-test --region asia-southeast1`.
    - **Việc còn lại trước khi cân nhắc thay production**: merge `backend-refactor-d1`
      vào `rewrite-vue-mysql` (chưa merge); xong Đợt 5 phần 2 (chuẩn hoá UI MDS); có
      kế hoạch di chuyển dữ liệu thật từ bản Cloud Run production cũ (SQLite) sang
      MySQL nếu quyết định thay hẳn kiến trúc; cấu hình `ENCRYPTION_KEY`/`REDIS_URL`
      thật nếu lên production chính thức (bản test hiện chưa cấu hình 2 biến này).

25. **Đợt 5 (phần 2/2 - Chuẩn hoá UI theo MDS 2.0) HOÀN THÀNH (2026-07-28)** - nhánh
    `backend-refactor-d1`. Làm sau khi chủ dự án phản hồi trực tiếp bằng ảnh chụp UI
    thật (không phải chỉ đọc yêu cầu ban đầu) - 2 vòng góp ý:
    - **Xoá toàn bộ emoji trong `web/src`** (~150 chỗ, 20 file: mọi view/tab + toolbar
      rich-text `BodyEditor.vue`), thay bằng icon Tabler qua `MIcon.vue` + `icons.js`
      (bảng icon dùng chung, tách ra từ `MSidebar.vue` để không khai báo trùng). Đổi
      luôn vài checkbox/input thô (`<input type="checkbox">`) sang `MCheckbox` ở bảng
      Người tham dự/Nhân viên/Quét QR.
    - **App Shell chuẩn MDS (header 48px + sidebar 200/64px)**: trước đây `App.vue` tự
      chế `<header>` (logo + vài link ngang), không dùng `MHeaderBar`/`MSidebar` sẵn có.
      Nay `MHeaderBar` full cụm tiện ích đúng thứ tự **Thiết lập → AVA → Chat → Thông
      báo → Hỗ trợ → More → avatar** + app switcher 9 chấm bắt buộc. Icon AVA/Chat copy
      **nguyên bản** từ `misa-design-system` skill (`MHeaderIconAva.vue`/
      `MHeaderIconChat.vue` - gradient mascot + bong bóng chat khoét lỗ evenodd), không
      tự vẽ lại (đúng cảnh báo trong `header-bar.md` mục 3c).
    - **Sidebar trái DUY NHẤT** của app hiển thị đúng 7 tab tính năng của sự kiện đang
      mở (Người tham dự/Quét QR/Booth/Phôi thẻ/Email/Báo cáo/Nhân viên) làm nội dung
      chính - trước đó các tab này bị lồng thành 1 sidebar phụ (`MVerticalTabs`, đã
      xoá) bên trong `EventDetailView.vue`, khiến sidebar chính chỉ còn 3 mục
      Sự kiện/Thành viên/Cấu hình Email tách biệt (chủ dự án phản hồi là "giấu tính
      năng đi"). Cầu nối 2 chiều qua `eventSidebar` (reactive, `api.js`):
      `EventDetailView.vue` đẩy `items/activeKey/onSelect` lên khi mount, `App.vue`
      đọc để render `MSidebar`; tắt (`active=false`) khi rời trang.
    - **Thành viên + Cấu hình Email gộp vào dialog "Thiết lập chung"** (nút bánh răng
      header) theo đúng yêu cầu - `MSettingsDialog.vue` (copy từ skill, giữ 3 tab gốc
      Màu sắc/Hiển thị/Hình nền) được thêm 2 tab quản trị nhúng lại `MembersView.vue`/
      `SmtpView.vue` (tự lưu theo hành động, không qua nút Lưu chung của dialog).
    - **Nạp đủ 10 theme màu + Gradient** (`web/src/tokens/themes/*.css`, trước chỉ có
      1 theme `blue`) + `space-compact.css`/`space-comfortable.css`. Tiện thể sửa 2 bug
      phát hiện khi đối chiếu file token cũ với bản gốc trong skill: (1) các biến alias
      `--mds-text-brand`/`--mds-icon-brand`/`--mds-bg-brand-brand*`... trong
      `tokens/blue.css` cũ để nguyên placeholder chưa resolve `{Brand.600}` (giờ dùng
      bản token đúng từ skill); (2) `theme-state.js` gốc trong skill set sai thuộc
      tính `data-density` khi CSS thật dùng selector `[data-mds-space="..."]` - đã sửa
      lại đúng khi copy vào project.
    - Gọn lại `page-head` của `EventDetailView.vue`: bỏ breadcrumb "← Tất cả sự kiện" +
      tên sự kiện lặp lại (đã có sẵn ở header dạng company-name, bấm vào quay lại danh
      sách) - chỉ giữ dòng meta thời gian/đơn vị, tránh cảm giác "lơ lửng" chủ dự án
      phản hồi khi phần này không nằm trong card mà cũng không khớp cụm thông tin nào.
    - Đã tự bấm/hover/tạo sự kiện/chuyển tab/mở dialog Thiết lập trên trình duyệt thật
      (đăng nhập, tạo sự kiện, chuyển đủ 7 tab qua sidebar chính, mở đủ 5 tab dialog
      Thiết lập, đổi theme) - không chỉ đọc code, đúng yêu cầu bắt buộc của skill.
    - **CHƯA LÀM / hạn chế còn biết** (đã xử lý mục (1)/(2) ở mục 26 bên dưới,
      2026-07-28): (3) chưa rà lại từng màn hình theo `data-table.md` (mật độ dòng
      bảng, resize cột...) - chỉ sửa những gì thấy sai khi chủ dự án chỉ ra qua ảnh
      chụp, không phải rà toàn bộ 15 màn hình theo checklist đầy đủ. Vẫn còn treo.

26. **Sửa 3 lỗi UI tồn đọng từ mục 25 (2026-07-28)** - nhánh `backend-refactor-d1`:
    - **Nút "Đăng xuất" đặt sai vị trí** (trước nằm ở cụm tiện ích header, trước nút
      Thiết lập, dạng text - sai chuẩn MDS vì identity phải nằm ở avatar ngoài cùng
      bên phải): chuyển vào dropdown menu mở từ avatar (`App.vue` dùng slot `#user`
      của `MHeaderBar` + `MDropdownMenu.vue` có sẵn nhưng trước đó chưa ai dùng tới).
      Thêm icon `logout` vào bảng icon của `MDropdownMenu.vue`.
    - **2 lớp `MDialog` chồng nhau khi mở "+ Thêm thành viên" trong tab Thành viên
      của dialog Thiết lập**: nguyên nhân là dialog con (`MembersView.vue`) nằm LỒNG
      bên trong slot nội dung của dialog cha (`MSettingsDialog.vue`) - cả 2 dùng
      chung `MDialog.vue`, mỗi cái tự vẽ 1 lớp backdrop z-index 1000 độc lập, code
      cũ chỉ `console.warn` chứ không xử lý. Sửa: thêm stack toàn cục các dialog
      đang mở (`components/mds/dialog-stack.js` - PHẢI để ở module `.js` thường,
      **không khai báo `reactive([])` ngay trong `<script setup>` của `MDialog.vue`
      vì `<script setup>` chạy lại cho MỖI instance nên không dùng chung được giữa
      các dialog** - đã tự vấp lỗi này khi làm, mất khá nhiều vòng debug mới lòi
      ra). Dialog không phải trên cùng bị ẩn qua `:style="{ display: 'none' }"`
      (không phải unmount qua `v-if`/`v-show`) - vì dialog con nằm lồng trong DOM
      của dialog cha, unmount cha sẽ unmount luôn con (mất state, đóng nhầm con);
      cũng KHÔNG dùng directive `v-show` kết hợp `v-if` trên cùng 1 thẻ vì Vue
      compiler âm thầm bỏ qua tổ hợp này lúc build (không warning, không lỗi - chỉ
      phát hiện được khi kiểm tra `getAttribute('style')` sau build thực tế). Phím
      Esc cũng chỉ xử lý ở dialog trên cùng (`isTop`), tránh đóng nhầm cả 2 lớp.
    - **Input "Thời gian tổ chức" ở dialog tạo/sửa sự kiện (`EventsView.vue`) là
      `<input type="datetime-local">` gốc trình duyệt**: thay bằng `MDatePicker.vue`
      (component MDS có sẵn nhưng trước đó CHƯA từng được dùng ở đâu trong dự án),
      thêm prop mới `show-time` cho nó (MDS gốc chưa có control ngày+giờ kết hợp -
      xem ghi chú cũ ở mục 25) - thêm 2 ô giờ/phút + nút "Xong" trong popover lịch,
      giữ nguyên `modelValue` kiểu `Date`. Bẫy đã vấp: hàm `setValue()` gốc chỉ so
      sánh NGÀY (`isSameDay`) để quyết định có emit `update:modelValue` không - khi
      `showTime=true` mà người dùng chỉ đổi giờ (ngày không đổi), so sánh này luôn
      trả về "không đổi" nên giờ mới bị âm thầm rớt mất, phải so cả `getTime()` khi
      `showTime`. `EventsView.vue` giữ nguyên kiểu dữ liệu gửi API là chuỗi
      `"yyyy-MM-ddTHH:mm"` (không đổi sang ISO/UTC) qua 1 `computed` chuyển đổi
      2 chiều Date↔chuỗi, để không phá hành vi cũ ở `routes/events.js`.
    - Đã tự dựng MySQL+Redis bằng `docker-compose.internal.yml` +
      `docker-compose.override.yml` (cổng 3311/6391) để chạy `npm start` local thật
      và test 3 việc trên bằng cả tương tác UI lẫn gọi DOM/API trực tiếp (không chỉ
      đọc code) - container + `.env` test đã dọn (`docker compose down -v` + xoá
      `.env`) sau khi xong, không ảnh hưởng production.

27. **Chốt khổ thẻ in + thiết kế lại theo mẫu chủ dự án + nút "In thẻ" ở Báo cáo
    (2026-07-28)** - nhánh `backend-refactor-d1`. Chủ dự án gửi file mẫu thiết kế
    ("MẪU THẺ.pdf": QR giữa trên, Họ tên IN HOA đậm, Chức danh, Tên công ty, Mức độ
    quan trọng IN HOA đậm dưới cùng, khổ **100×75mm (A7)**) - **chốt luôn việc treo
    từ mục 22/26** (trước phân vân 50×30 hay 50×50mm theo `CLAUDE.md` cũ/code cũ).
    - `lib/tspl.js` (`buildAttendeeLabel`): đổi `SIZE 50 mm,50 mm` → `SIZE 100 mm,75
      mm`, thêm tham số `position`/`importance` (trước chỉ có `name`/`company`), sắp
      lại toạ độ dot đúng thứ tự mẫu (QR căn giữa trên → tên → chức danh → công ty →
      mức độ, chữ hoa toàn bộ qua `.toUpperCase()`). `routes/print.js` (gửi lệnh in
      qua trạm LAN/Agent) truyền thêm `a.position`/`a.importance` từ hàng DB có sẵn
      (không cần đổi schema, 2 cột này đã có sẵn ở `attendees`).
    - `web/src/lib/print.js` (`printQrViaBrowser` - bản in qua trình duyệt/USB dự
      phòng): viết lại HTML/CSS `@page{size:100mm 75mm}`, hiển thị đủ 4 dòng tên/chức
      danh/công ty/mức độ đúng thứ tự mẫu; ẩn dòng mức độ nếu là "Bình thường" (mặc
      định, không phải khách đặc biệt) để đỡ rối mắt - chỉ hiện khi có giá trị khác.
    - Cập nhật 2 điểm gọi `printQr()`: `AttendeesTab.vue` đổi nhãn nút "50×50mm" →
      "100×75mm"; `ReceptionTab.vue` (in ngay khi thêm khách vãng lai) truyền thêm
      `position`/`importance` từ form (trước chỉ gửi `name`/`company`, thiếu 2
      trường mới nên khách vãng lai in ra thẻ cụt).
    - **Thêm nút "In thẻ" có nhãn chữ ở tab Báo cáo** (`ReportTab.vue` dòng nút hành
      động mỗi người) - trước đó CHỈ có icon máy in không chữ, dễ bị bỏ sót; theo
      đúng yêu cầu "khi khách check-in xong, không tự in được từ điện thoại thì in
      thủ công từ Báo cáo trên máy tính" (luồng dự phòng này đã có sẵn từ Đợt 4, chỉ
      thiếu nhãn rõ ràng).
    - **Bẫy môi trường dev đã vấp khi test**: sửa `lib/tspl.js` xong nhưng gọi lệnh
      in qua trạm vẫn ra payload CŨ (50×50mm) - vì `npm start` (Node, không phải
      Vite) KHÔNG tự nạp lại code khi sửa file `require()` thường (không có hot
      reload như phía Vite/FE) - phải tắt hẳn tiến trình Node cũ và chạy lại mới
      thấy code mới. Nhớ quy tắc này cho mọi lần sửa file phía backend (`lib/`,
      `routes/`) trong lúc server đang chạy.
    - **Đã verify bằng dữ liệu thật, không chỉ đọc code**: tạo khách vãng lai qua API
      (tên/chức danh/công ty/mức độ "Speaker" giống mẫu) → bấm "In thẻ" ở Báo cáo
      trên UI thật → chặn `window.open` để đọc đúng HTML sinh ra → render lại xem
      bằng mắt, bố cục khớp mẫu. Dựng thêm 1 TCP server giả lập máy in ở cổng 9100 →
      gọi thật `POST /events/:id/print` qua trạm LAN → nhận đúng byte lệnh TSPL khổ
      100×75mm kèm đủ 4 dòng. Môi trường test (Docker MySQL/Redis + `.env`) đã dọn
      sau khi xong.

28. **Bố cục thẻ đẹp hơn + màn "Tuỳ chỉnh mẫu thẻ" + build thử Print Agent .exe
    (2026-07-28)** - nhánh `backend-refactor-d1`. Chủ dự án phản hồi bố cục ở mục 27
    "xấu, thừa nhiều khoảng trắng" sau khi xem ảnh chụp thật, kèm 2 yêu cầu mới.
    - **Sửa bố cục `web/src/lib/print.js`**: QR 26mm→34mm, tên 15px→20px; bỏ
      `margin-top:auto` (đẩy mức độ quan trọng dồn cứng xuống đáy thẻ, tạo 1 khoảng
      trắng lớn liền mạch ở giữa) → đổi thành margin cố định nhỏ giữa các dòng, phần
      dư (nếu có) rơi xuống mép dưới tự nhiên hơn - khớp đúng tỉ lệ mẫu PDF hơn hẳn
      (đã tự chụp ảnh so sánh trước/sau). Thêm `onerror` cho ảnh QR để vẫn tự in/đóng
      cửa sổ nếu QR lỗi tải (trước đó treo popup mãi mãi nếu ảnh lỗi).
    - **Màn "Tuỳ chỉnh mẫu thẻ" mới** (thẻ "Mẫu thẻ in" cuối tab Phôi thẻ,
      `BadgesTab.vue`) - đáp ứng yêu cầu "thiết lập từng thành phần trong tem", chủ dự
      án chọn mức **đơn giản** (không phải canvas kéo-thả): `MRadioGroup` 3 mốc
      Nhỏ/Vừa/Lớn cho cỡ QR + cỡ chữ tên khách, `MCheckbox` bật/tắt Chức danh/Công
      ty/Mức độ quan trọng, có **preview trực quan cập nhật ngay khi tick/chọn**
      (không phải xem sau khi lưu). Lưu theo TỪNG SỰ KIỆN ở cột mới
      `events.badge_layout` (JSON, migration
      `20260728010000_badge_layout.js`) qua `PUT /events/:id/badge-layout` (mới).
    - **1 cấu hình dùng chung cho CẢ 2 đường in** (đúng yêu cầu "chỉnh 1 chỗ áp dụng
      hết", tránh lệch giữa in qua trạm và in qua trình duyệt): cùng khái niệm mốc
      `sm/md/lg`, `lib/tspl.js` map sang cell-size/font-token TSPL (`QR_CELL`/
      `NAME_FONT` - **ước lượng, CHƯA test trên máy in vật lý thật**), `web/src/lib/
      print.js` map sang mm/px (`QR_MM`/`NAME_PX`). `routes/print.js` đọc
      `ev.badge_layout` khi build lệnh in qua trạm; 4 nơi gọi `printQr()` (Quét QR/Lễ
      tân/Người tham dự/Báo cáo) đọc qua helper `badgeLayout(ev)` mới trong `api.js`.
    - **Build thử `print-agent/dist/misa-checkin-print-agent.exe`** lần đầu (source
      code có sẵn từ Đợt 4 nhưng trước đó CHƯA ai từng chạy `npm run build`) - `pkg`
      cross-compile `node18-win-x64` chạy được từ máy Mac, không cần máy Windows để
      build. Đã gửi file cho chủ dự án. **Vẫn CHƯA test được với Windows/máy in vật
      lý thật** (môi trường không có) - cần chủ dự án tự chạy thử + báo lại.
    - **Đã verify qua UI thật + gọi API/TCP trực tiếp**: mở dialog Tuỳ chỉnh mẫu thẻ,
      đổi cỡ Lớn + tắt "Công ty" → xem preview đổi ngay → Lưu → gọi lại
      `GET /events/:id` xác nhận `badge_layout` lưu đúng JSON → gọi thật
      `POST /events/:id/print` qua trạm giả lập (TCP cổng 9100) → nhận đúng lệnh
      TSPL cell size 10 (Lớn), font "5" (Lớn), **thiếu đúng dòng công ty** (đã tắt).
      Môi trường test đã dọn sau khi xong.

29. **Rà soát UI 15 màn hình theo `data-table.md` - HOÀN THÀNH (2026-07-28)** - việc
    treo cuối cùng của Đợt 5 (mục 25/26). Dùng 3 agent song song đọc + đối chiếu
    checklist RÚT GỌN phù hợp quy mô app (bỏ các mục doanh nghiệp phức tạp không cần
    thiết - resize/pin/filter-theo-cột/split-button; xem `KE-HOACH-NANG-CAP-2026-07.md`
    triết lý "không vẽ rắn thêm chân"). Đã tự verify lại bằng UI thật (đăng nhập
    nhiều vai trò khác nhau, tạo dữ liệu qua API, chụp ảnh trước/sau) trước khi coi
    là xong, không chỉ dựa báo cáo của agent.
    - **Bug thật đã sửa** (không chỉ polish): `MonitorTab.vue` - điều kiện empty-state
      kiểm tra `data.rows.length` (tổng chưa lọc) thay vì `filtered.length` → gõ tìm
      kiếm không khớp thì **cả empty-state lẫn danh sách đều không hiện gì**, màn
      hình trắng trơn giữa toolbar và cuối trang. Sửa: thêm nhánh `else-if
      !filtered.length` riêng.
    - **`MembersView.vue`**: bảng bọc `overflow:hidden` (chặn cuộn) thay vì
      `overflow-x:auto` → trên màn hẹp bị **cắt cụt cột**, không cuộn được. Đổi lại
      đúng như các bảng khác. Thêm dòng "Chưa có thành viên nào" khi rỗng (trước đó
      không có empty-state).
    - **Toolbar gộp lại đúng chuẩn "tìm kiếm trái - action phải" trong CÙNG 1 hàng**
      (trước tách 2 hàng riêng, action không đẩy sang phải): `AttendeesTab.vue` (gộp
      Thêm/Import/Export/Gửi QR vào chung hàng search+filter, nút Primary "+ Thêm
      người" đẩy về ngoài cùng bên phải theo đúng quy tắc MDS); `BadgesTab.vue` (bỏ
      card "Sinh & xuất phôi thẻ" riêng, gộp nút xuất ZIP + sinh phôi vào hàng
      search+filter của chính bảng phôi thẻ đó).
    - **Phân biệt empty-state "chưa có dữ liệu" khác "lọc/tìm kiếm ra rỗng"** (trước
      dùng chung 1 câu gây hiểu nhầm) ở `AttendeesTab.vue`, `ReportTab.vue`,
      `ReceptionTab.vue`, `BadgesTab.vue`.
    - **Thêm `title` (tooltip) cho nút icon-only và tiêu đề cột viết tắt** (trước
      thiếu, vi phạm quy tắc MDS "icon/tiêu đề viết tắt phải có tooltip"): nút xoá ở
      `AttendeesTab.vue`/`BoothsTab.vue`/`MembersView.vue`, cột "SĐT"/"NV check-in" ở
      `AttendeesTab.vue`/`ReportTab.vue`.
    - **Cân nhắc nhưng KHÔNG đổi** (ghi lại lý do để khỏi hỏi lại): agent đề xuất
      right-align cột "Booth đã ghé" ở `ReportTab.vue` (số liệu cần so sánh) - bỏ qua
      vì cell này không thuần số (số đếm + danh sách tag ghé booth wrap bên dưới),
      right-align sẽ làm hỏng bố cục tag; agent đề xuất gom bớt nút hành động dòng ở
      `AttendeesTab.vue` cho "quá 3 icon" - kiểm tra lại thấy đang đúng đủ 3 (Sửa/QR/
      Xoá) ở 1 cụm, nút "Gửi"/"Gửi lại" nằm ở CỘT khác (trạng thái email + hành động
      theo ngữ cảnh cột đó), không tính chung 1 cụm action dòng.
    - **`EventDetailView.vue`**: agent ghi nhận tab tính năng nằm ở sidebar trái thay
      vì sub-nav ngang 48px theo `layout-patterns.md` - đây là quyết định thiết kế
      CHỦ ĐÍCH đã ghi ở mục 25 (tránh sidebar lồng sidebar), không phải lỗi, giữ
      nguyên.

---

## 10. Công việc đang mở / cần theo dõi

- [ ] **Tích hợp thanh toán vé** (misaamis → store.misa.vn → check-in): đã soạn yêu cầu kỹ thuật ở [YEU-CAU-TICH-HOP-THANH-TOAN.md](YEU-CAU-TICH-HOP-THANH-TOAN.md), đang chờ team Store xác nhận có webhook thanh toán không. Khi có: thêm cột `payment_status` cho attendees + API đăng ký công khai + endpoint nhận webhook (xác thực HMAC).
- [ ] Nhà in xác nhận dùng in dữ liệu biến đổi (VDP) hay cần PDF ghép sẵn — hiện xuất bộ SVG riêng (phù hợp VDP).
- [ ] Xoá/thu hồi GitHub Personal Access Token đã dùng để đồng bộ code trong quá khứ (nếu chưa làm) — token có quyền write, không có ngày hết hạn.
- [ ] `print-agent/dist/misa-checkin-print-agent.exe` đã build thử (2026-07-28, mục 28) nhưng CHƯA test với Windows/máy in vật lý thật — chờ chủ dự án tự chạy + báo lại. Cỡ chữ/QR trong `lib/tspl.js` (font token/cell size) cũng mới là ước lượng, có thể cần chỉnh lại theo máy in thật.
- [x] ~~Chốt phương án in tem QR tại hiện trường~~ → đã chuyển sang phôi thẻ in sẵn + in tem USB dự phòng (mục 9.13).
- [x] ~~Giám sát "bóng ma" + Lucky draw~~ → đã code + test xong (2026-07-08, commit `ddaf920`), xem mục 9.15 và 15.2/15.3.
- [x] ~~Deploy GCE VM~~ → đã triển khai (2026-07-08/09), https://34-87-20-119.sslip.io, xem mục 15.4. Đang chạy 24/7 — nhớ dừng VM (`gcloud compute instances stop`) khi ngừng test để khỏi tốn phí.

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
- **Không đụng bản Cloud Run cũ** (SQLite/vanilla) — đây là service hoàn toàn tách biệt, phục vụ mục đích test bản mới song song.

**✅ Đã triển khai (2026-07-08/09):**
- **Địa chỉ:** https://34-87-20-119.sslip.io — VM `misa-checkin-test`, zone `asia-southeast1-a`, machine type `e2-medium`, disk 30GB, image `ubuntu-2404-lts-amd64`, project `prapplication-479309`. IP ngoài (tĩnh theo VM, mất nếu xoá VM): `34.87.20.119`.
- **HTTPS:** dùng domain tạm miễn phí **sslip.io** (`34-87-20-119.sslip.io` map thẳng ra IP) — **Caddy** (`caddy:2-alpine`, service `caddy` trong `docker-compose.override.yml` trên VM, KHÔNG commit vào repo vì gắn với IP VM cụ thể) tự xin chứng chỉ Let's Encrypt thật (HTTP-01 challenge qua port 80) và reverse-proxy vào `app:3000`. Đã xác nhận HTTP/2 + TLS hợp lệ, không cảnh báo trình duyệt.
- **Firewall:** rule `allow-http-https` (ingress tcp:80,443, tag `http-server`/`https-server`) — tạo mới vì project trước đó chỉ có rule mặc định (ssh/rdp/icmp/internal).
- **Git trên VM:** cài `gh` CLI, đăng nhập bằng tài khoản GitHub `tuannhh` qua browser-based device flow (`gh auth login --web`), sau đó `gh repo clone tuannhh/misa-event-checkin` (không dùng PAT cũ — giải quyết luôn việc treo ở mục 10 cho phần deploy này, PAT cũ vẫn cần soát lại riêng nếu còn dùng ở nơi khác).
- **Lệnh chạy:** `sudo docker compose -f docker-compose.internal.yml -f docker-compose.override.yml up -d --build` (2 file compose gộp: file gốc trong repo + file override chứa `SESSION_SECRET` ngẫu nhiên thật, `BASE_URL=https://34-87-20-119.sslip.io`, và service `caddy`). Docker đã `systemctl enable`, tất cả service có `restart: unless-stopped` → tự phục hồi khi VM khởi động lại.
- **Quản lý VM:**
  ```bash
  # SSH vào VM (từ máy đã cài gcloud + đăng nhập đúng project):
  ~/google-cloud-sdk/bin/gcloud compute ssh misa-checkin-test --zone=asia-southeast1-a
  # Trên VM, thư mục misa-event-checkin/:
  sudo docker compose -f docker-compose.internal.yml -f docker-compose.override.yml ps
  sudo docker compose -f docker-compose.internal.yml -f docker-compose.override.yml logs -f app
  sudo docker compose -f docker-compose.internal.yml -f docker-compose.override.yml down        # dừng, giữ dữ liệu
  # Cập nhật code mới: git pull rồi chạy lại lệnh "up -d --build" ở trên.
  # Dừng hẳn VM để khỏi tốn phí (khi không cần test nữa):
  ~/google-cloud-sdk/bin/gcloud compute instances stop misa-checkin-test --zone=asia-southeast1-a
  # Chạy lại (IP ngoài có thể đổi sau khi stop/start → phải sửa lại sslip.io domain trong Caddyfile + BASE_URL nếu IP đổi):
  ~/google-cloud-sdk/bin/gcloud compute instances start misa-checkin-test --zone=asia-southeast1-a
  ```
- **Lưu ý chi phí:** VM `e2-medium` chạy 24/7 sẽ phát sinh phí GCP liên tục. Muốn ngừng tốn phí mà vẫn giữ dữ liệu → dùng `gcloud compute instances stop` (đĩa vẫn tính phí lưu trữ nhưng rẻ hơn nhiều so với instance chạy). Muốn xoá hẳn (mất dữ liệu MySQL/uploads trong VM) → `gcloud compute instances delete misa-checkin-test --zone=asia-southeast1-a`.
- Super admin mặc định vẫn là `tuanbui88vn@gmail.com` (mật khẩu seed sẵn trong code) — **nên đổi mật khẩu** sau khi bắt đầu dùng thật trên VM này.

### 15.5 Trạng thái
- ✅ 15.2 (Giám sát bóng ma) và 15.3 (Lucky draw filter/export) **đã code + test xong** (2026-07-08, commit `ddaf920`, xem chi tiết ở mục 9.15).
- ✅ 15.4 (Deploy GCE VM) **đã triển khai xong** (2026-07-08/09) — https://34-87-20-119.sslip.io, xem chi tiết vận hành ở mục 15.4. VM đang chạy 24/7 (phát sinh phí) — nhớ `gcloud compute instances stop` khi không cần test nữa.
- Toàn bộ mục 15 đã hoàn tất phần "chưa code" ghi nhận ngày 2026-07-08.

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
App ở http://localhost:3000 (hoặc cổng đã map trong compose). Từ Đợt 1 (2026-07-27), tài khoản
Super Admin KHÔNG còn hard-code - đọc từ biến môi trường `ADMIN_EMAIL`/`ADMIN_PASSWORD` (bắt
buộc khai báo trong `docker-compose.internal.yml`/`.env` trước khi chạy lần đầu, xem
`.env.example`). `SESSION_SECRET` cũng bắt buộc, không còn giá trị mặc định.

## 11. Quy tắc cập nhật file này

Áp dụng cho mọi AI (Claude hoặc khác) làm việc trên dự án này:

1. **Sau khi hoàn thành một tính năng/thay đổi kiến trúc** (đã code xong, đã test/deploy) → thêm 1 mục mới vào **mục 9. Lịch sử phát triển**, ghi rõ *cái gì thay đổi* và *why* (quyết định nghiệp vụ, không chỉ mô tả code).
2. **Nếu thay đổi schema DB** → cập nhật **mục 3**. **Nếu thêm/sửa API** → cập nhật **mục 4**. **Nếu thay đổi luồng nghiệp vụ** → cập nhật **mục 5**. **Nếu thay đổi UI/tab/trang** → cập nhật **mục 6**.
3. **Nếu phát hiện bẫy kỹ thuật mới** (lỗi khó hiểu, workaround đặc biệt) → thêm vào **mục 8**, không chỉ sửa và bỏ qua.
4. **Nếu có quyết định nghiệp vụ quan trọng qua trao đổi** (dù chưa code, ví dụ advisory/tư vấn) → vẫn ghi vào mục 9 hoặc mục 10 (nếu còn đang mở), để AI/dev sau không hỏi lại câu đã có câu trả lời.
5. Giữ file này bằng **tiếng Việt**, ngắn gọn, có cấu trúc bảng/heading rõ ràng — đây là tài liệu bàn giao, không phải log chi tiết.
6. Không cần hỏi chủ dự án trước khi cập nhật file này — đây là việc kỹ thuật nội bộ, tự làm sau mỗi lần hoàn thành việc.
