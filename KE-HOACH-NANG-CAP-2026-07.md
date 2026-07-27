# Kế hoạch nâng cấp MISA Event Check-in — 2026-07-27

Tài liệu này trả lời 8 yêu cầu cải tiến của chủ dự án. Mỗi mục gồm: **vấn đề thật trong code
hiện tại** (có dẫn chứng file:dòng) → **phương án đề xuất** → **việc phải làm** → **coi là xong khi nào**.

Hiện trạng nền: đang ở nhánh `rewrite-vue-mysql` — frontend **đã là Vue 3 + Vite + bộ MDS**
(`web/`), backend **đã là MySQL** (`db.js` dùng `mysql2`), khác hẳn mô tả cũ trong `CLAUDE.md`
(SQLite + HTML thuần). Nhánh `main` (đang chạy Cloud Run) vẫn là bản cũ.

---

## 0. Ba việc phải chốt trước khi code (chặn cả kế hoạch)

### 0.1 ⚠️ Bản đang chạy ở `misajsc.amis.vn/emt/event-checkin` KHÔNG có trong repo này — ĐÃ CHỐT
**Chủ dự án đã xác nhận (2026-07-27):** code của dev MISA đang chạy trong môi trường production
của họ nên không đưa ra ngoài được. Cách phối hợp đã chốt: **ta cứ làm tiếp trên repo này**, khi
xong dev MISA sẽ đưa vào môi trường của họ, tự dùng AI so sánh với bản đang chạy để chỉ áp dụng
đúng phần thay đổi. Nghĩa là: mọi thay đổi ở đây cần **rõ ràng, có ranh giới rành mạch theo
từng file/module** (dễ diff), tránh xáo trộn lan man không cần thiết ở những chỗ không liên quan
đến 8 yêu cầu — để bên họ so sánh và áp dụng được chính xác.

Đã grep toàn bộ repo + toàn bộ lịch sử git (`git log --all -S"amis.vn"`): **0 kết quả**. Bản đó
có tính năng repo này không có — ví dụ route `#/event/3/printstation` (trong file .bat) và
`#/event/3/discounts`. Nghĩa là dev MISA đang phát triển trên một bản code riêng đã rẽ nhánh.

**Rủi ro:** nếu ta nâng cấp trên repo này, sau đó dev MISA cũng sửa bản của họ → hai nhánh
càng lệch, hợp nhất về sau rất tốn kém và dễ mất tính năng.

**Phải chốt:** lấy code của dev MISA về hợp nhất trước, hay ta làm tiếp trên repo này rồi bàn
giao đè? (xem mục 10, câu hỏi Q1)

### 0.2 Ba tính năng lớn chưa có trên production
Phôi thẻ Vue, "giám sát bóng ma", lucky draw chỉ có trên `rewrite-vue-mysql`; `main` (Cloud Run)
không có. Cần chốt chiến lược nhánh: gộp `rewrite-vue-mysql` → `main` rồi từ đó đi tiếp.

### 0.3 Việc treo có rủi ro bảo mật, nên xử lý trong đợt đầu
- Mật khẩu super admin **hard-code trong source** (`db.js:195`) và lộ trong ≥5 file .md.
- `SESSION_SECRET` có giá trị mặc định hard-code (`server.js:18`).
- `smtp_pass` và `brevo_api_key` lưu **plaintext** trong DB (`smtp_settings`).
- GitHub PAT quyền write, không hết hạn, **chưa thu hồi** (MEMORYBANK mục 10).
- VM `misa-checkin-test` đang chạy 24/7 tốn phí GCP.

---

## 1. Tách Backend / Frontend — và có nên làm microservice không?

### Vấn đề thật
Nguyên nhân "nặng nề" **không phải** do BE và FE nằm chung (Express phục vụ file tĩnh gần như
không tốn gì). Nguyên nhân thật khiến hệ thống **không thể chạy nhiều máy chủ song song**:

| # | Vấn đề | Vị trí | Hậu quả khi nhiều người dùng |
|---|---|---|---|
| 1 | Session lưu trong RAM (MemoryStore) | `server.js:17-23` | Chạy 2 instance → user bị đăng xuất ngẫu nhiên |
| 2 | Scheduler email `setInterval` không có khoá | `email.js:163-186` | Chạy 2 instance → khách nhận email cảm ơn 2 lần |
| 3 | Không phân trang ở bất kỳ đâu | `ReportTab.vue:30-34`, `/report` | 3.000 khách → tải hết về máy, gõ 1 phím render lại 3.000 dòng |
| 4 | Toàn bộ API trong 1 file 1.128 dòng | `routes/api.js` | Nhiều người sửa cùng lúc là xung đột; khó test |
| 5 | Không có migration, chỉ `CREATE TABLE IF NOT EXISTS` | `db.js:36-190` | Thêm cột mới **không** áp được lên DB đang chạy → lỗi âm thầm |
| 6 | Cloud Run bị ép `--max-instances=1` | do Litestream + scheduler | Không tự co giãn được, đúng 1 máy phục vụ tất cả |

### Đề xuất: KHÔNG làm microservice
Microservice (tách user-service / event-service / attendee-service...) sẽ **làm hại** dự án này:
dữ liệu quan hệ dày (event ↔ attendee ↔ booth_visits ↔ badges ↔ email), báo cáo phải JOIN liên
tục; tách ra sẽ phải gọi chéo qua mạng, mất transaction, và cần cả một đội DevOps để vận hành.
Quy mô "nhiều sự kiện, nhiều người dùng" của MISA hoàn toàn nằm trong tầm của **một backend
đóng gói tốt chạy nhiều bản song song**.

**Kiến trúc đề xuất — "modular monolith + FE tách riêng + worker riêng":**

```
[ FE tĩnh (Vue build) ]  → nginx / CDN nội bộ, deploy độc lập, không cần Node
            │ gọi API
[ API service ]  ← chạy N bản song song, hoàn toàn stateless
            │
    ├── MySQL (managed / cụm riêng)
    ├── Redis (session + hàng đợi)
    └── [ Worker service ] ← gửi email, sinh QR/ZIP, lệnh in, nhắc lịch (BullMQ)
```

Chỉ **2 ranh giới** đáng tách thành service riêng, và đều có lý do thật:
1. **Worker** — việc nặng/chậm (gửi hàng nghìn email, tạo ZIP phôi thẻ) không được làm nghẽn
   API lúc đang check-in. Đây cũng là chỗ diệt lỗi "email gửi 2 lần".
2. **Public intake API** (nhận đăng ký từ landing page + webhook thanh toán) — mở ra Internet,
   cần rate-limit và cách ly để có bị spam cũng không ảnh hưởng quầy check-in.

Sau này nếu thật sự cần tách nhỏ hơn, cấu trúc module đã sẵn ranh giới để tách tiếp — không mất gì.

### Việc phải làm
1. Chia `routes/api.js` thành module theo nghiệp vụ: `auth, users, events, staff, attendees,
   scan, booths, badges, email, reports, integrations`. (Quyết định Express hay NestJS: xem Q2.)
2. Session → Redis (hoặc chuyển sang JWT access + refresh). Bỏ MemoryStore.
3. Redis + BullMQ; chuyển scheduler email và mọi việc nặng sang worker; job có khoá idempotent.
4. Bật migration bằng **knex** (đã có sẵn trong `package.json` nhưng chưa dùng) + seed tách riêng.
5. Phân trang + lọc **phía server** cho attendees và report (`?page&size&q&filters`).
6. Bỏ Litestream/SQLite còn sót (`Dockerfile`, `litestream.yml`, `docker-entrypoint.sh`, `data/`).
7. FE build ra artifact riêng, deploy bằng nginx; API và FE có thể lên phiên bản độc lập.
8. Thêm healthcheck `/healthz`, log có request-id, đo thời gian phản hồi.

### Xong khi
Chạy được **3 bản API song song** sau load balancer mà: đăng nhập không rớt, email cảm ơn không
gửi trùng, sự kiện 5.000 khách mở tab Báo cáo dưới 2 giây, deploy FE không cần restart API.

---

## 2. Làm lại UI đúng chuẩn MISA Design System

**Chủ dự án đã chốt: BẮT BUỘC tuân thủ đầy đủ, đặc biệt các mục bắt buộc trong MDS.** Không được
làm tắt hay "giống 70%". Áp dụng nguyên văn quy tắc bắt buộc của skill MDS 2.0, gồm cả phần
"BẮT BUỘC TUÂN THỦ khi project không dùng Vue 3 sạch" (không áp dụng ở đây vì `web/` đã là Vue 3
sạch, nhưng tinh thần "không tự chế token song song, không dùng control thô" là bắt buộc như nhau):
- Icon **chỉ** qua `MIcon`/Tabler stroke 1.5 — cấm tuyệt đối emoji và inline SVG path riêng.
- Token **chỉ** import từ `assets/tokens.css` + theme — cấm khai báo biến `--mds-*` song song.
- Nút Primary luôn ngoài cùng bên phải; form Thêm/Sửa có Lưu/Huỷ sticky; màn Chi tiết ghim nút
  thao tác góc trên phải; mỗi màn chỉ 1 nút Primary.
- Mọi box trắng trên nền xám dùng đúng `box-shadow: 0 0 2px 0 rgba(0,0,0,.10)` + radius 8px —
  không border đóng khung, không shadow nổi.
- Header 9 chấm mép trái, Sidebar item bo góc trong gutter (không tô tràn mép).
- Mọi thao tác phải có phản hồi (disable/busy sau click; >5s có progress bar); lỗi nhập liệu
  tiếng Việt dễ hiểu + tự focus trường lỗi đầu tiên; toast tự đóng sau 5s.
- **Bắt buộc tự bấm/hover/đổi theme/đổi density trên trình duyệt thật trước khi báo xong** —
  không được kết luận chỉ từ đọc code hay 1 ảnh chụp tĩnh (yêu cầu bắt buộc của skill, đúc kết
  từ vụ thực tế 1 app MISA khác báo "đã dùng đúng component" nhưng thực chất chỉ làm giống bằng mắt).
- Áp dụng đủ checklist bàn giao cuối skill MDS trước khi coi Đợt 5 là xong.

### Vấn đề thật (so với skill MDS 2.0)
- **Icon: đang dùng emoji** (📷 🎫 🖨 ✉️ 📊 🧭 ✅ 💾) nhúng thẳng vào nhãn tab và nút, ở toàn bộ
  các view. MDS bắt buộc **Tabler Icons stroke 1.5 qua component `MIcon`**, cấm emoji, cấm
  inline SVG map path riêng. Hiện `ICON_PATHS` còn bị copy cứng lặp ở 4 file
  (`MSidebar.vue:26`, `MDropdownMenu.vue:27`, `MContextMenu.vue:17`, …) và trỏ tới thư mục
  `src/assets/icons/` **không tồn tại**.
- **Token hỏng:** `web/src/tokens/blue.css` có 18 biến còn nguyên dạng Figma chưa resolve, ví dụ
  `--mds-text-brand: {Brand.600};` (dòng 17) → CSS không hợp lệ, trình duyệt bỏ qua. Và
  `style.css:17-31` phải **tự chế 11 token song song** để bù — đúng thứ MDS cấm tuyệt đối.
- **Bộ MDS trong repo đã cũ**: 25 control, thiếu `MIcon`, `MImageViewer`, `MSwitch`, `MUpload`,
  `MTree`, `MSettingsDialog`, `MHeaderIconAva/Chat`, `theme-state.js`, `useFormValidation.js`
  (bộ chuẩn hiện có 33 file).
- **Có sẵn mà không dùng:** `MDataTable`, `MChart`, `MSidebar`, `MHeaderBar` nằm không (~4.000
  dòng + `echarts` ~1MB), trong khi 6 màn hình tự viết `<table class="tbl">` copy-paste.
- Chưa đúng khung app MDS: header 48px, sub-nav 48px, page header 56px, nền content `#ECEDEF`,
  card `box-shadow: 0 0 2px 0 rgba(0,0,0,.10)` + radius 8px, sidebar 200/64px, density token.

### Việc phải làm
1. Đồng bộ lại bộ MDS từ skill: copy đủ 33 control + `assets/tokens/` (base-colors, font, number,
   space-*, themes/blue) **nguyên vẹn**; xoá sạch 11 token tự chế trong `style.css`.
2. Cài `@tabler/icons-vue`, thay **toàn bộ emoji** bằng `<MIcon name="…">`. Lập bảng icon dùng
   chung cho các chức năng: quét QR, in tem, thẻ, email, báo cáo, booth, ghi chú, khách tiềm năng.
   Icon nào MDS/Tabler không có thì ghi rõ ra để đối chiếu Figma trước khi dùng.
3. Dựng lại app shell theo `layout-patterns.md`: HeaderBar (9 chấm → logo → tiện ích) + Sidebar
   trắng item bo góc + page header 56px.
4. Màn danh sách (Người tham dự, Nhân viên, Phôi thẻ, Báo cáo, Thành viên) → dùng `MDataTable`
   (tick chọn, phân trang, sắp xếp, lọc) thay cho `<table>` tự viết.
5. Dashboard/Báo cáo dùng `MChart` (đã trả tiền cho `echarts` rồi thì dùng).
6. Áp dụng đúng quy tắc nút: Primary ngoài cùng phải, form có Lưu/Huỷ sticky, màn chi tiết ghim
   nút góc trên phải; toast tự đóng 5s; empty state phân biệt "chưa có dữ liệu" vs "lọc không ra".
7. **Bắt buộc tự thao tác thật trên trình duyệt** (click/hover/đổi theme/đổi density) trước khi
   báo xong — theo yêu cầu bắt buộc của skill MDS.

### Xong khi
Không còn emoji nào trong UI; grep toàn project không còn khai báo `--mds-*` ngoài `tokens/`;
đủ checklist bàn giao của skill MDS; ảnh chụp trước/sau từng màn.

---

## 3. Phân quyền nhân viên theo **tick chọn quyền** (bỏ vị trí cứng)

### Vấn đề thật
`staff_type` là enum cứng 4 giá trị (`api.js:86`) và hành vi được **viết tay rải ở 15 chỗ** trong
backend (`api.js:88, 113, 255, 282, 286, 357, 445-457, 648, 680, 721, 738, 758-769, 1044…`) cộng
**≥8 file** frontend (`EventDetailView.vue:31-55`, `EventsView.vue:39-45`, `StaffTab.vue:33-40`,
`BoothsTab.vue:17`, `api.js:56`, `router.js:22`, `App.vue:11`, `ScanTab.vue:18-27`). Muốn cho một
lễ tân kiêm thêm ghi chú booth thì **phải sửa code** — đúng như chủ dự án phản ánh.

### Phương án: quyền là dữ liệu, không phải code

**7 quyền theo yêu cầu** (mã dùng trong code):

| Mã quyền | Tên hiển thị | Cho phép làm gì |
|---|---|---|
| `checkin` | Check-in | Quét QR / check-in tay / thêm khách vãng lai |
| `view_checkin_list` | Xem danh sách check-in | Xem danh sách khách (kèm mức độ chi tiết, xem dưới) |
| `note` | Ghi chú | Ghi chú khách tại booth |
| `mark_potential` | Xác định khách hàng tiềm năng | Tick ⭐ tiềm năng + ghi chú tiềm năng |
| `view_report` | Xem báo cáo | Vào tab Báo cáo, xuất Excel |
| `print_badge` | In thẻ | In tem QR / gửi lệnh in |
| `assign_badge` | Gán thẻ | Gán phôi thẻ cho khách, ngừng thẻ |

**Bảng mới:**
```
permissions            (code, name, description, sort)              -- danh mục cố định, seed sẵn
staff_roles            (id, event_id NULL, name, is_template)       -- "nhóm chức năng": Lễ tân, Giám sát, Tư vấn…
staff_role_permissions (role_id, permission_code)                   -- tick chọn nằm ở đây
event_staff            (event_id, user_id, role_id, booth_id, extra_permissions JSON)
```
- `event_id NULL` + `is_template=1` = **mẫu dùng chung toàn hệ thống** (Lễ tân, Giám sát booth,
  Tư vấn, Quản lý…). Tạo sự kiện mới → chọn mẫu, muốn khác thì sửa riêng cho sự kiện đó.
- `extra_permissions` = tick thêm/bớt cho **một người cụ thể** mà không phải tạo nhóm mới —
  đúng tình huống "quản lý đổi việc cho một bạn ngay tại sự kiện".
- Quyền hiệu lực = quyền của nhóm ± điều chỉnh riêng, tính ở backend mỗi request.

**Hai tinh chỉnh cần chốt (Q4):**
1. `view_checkin_list` nên có **phạm vi**: `all` (thấy mọi khách — lễ tân) / `checked_in`
   (chỉ người đã check-in — nhân viên cổng) / `my_booth` (chỉ khách ghé booth mình — giám sát).
   Nếu chỉ 1 quyền phẳng thì giám sát sẽ thấy toàn bộ danh sách khách, mất ý nghĩa bảo mật PII.
2. Quyền xem **thông tin cá nhân** (tên/email/SĐT): hiện `manager` cố tình chỉ thấy số liệu ẩn
   danh. Đề xuất tách thêm quyền `view_pii` để giữ được điều đó.

**⚠️ Ràng buộc bắt buộc — chốt với chủ dự án (2026-07-27):** ghi chú booth (`note`) và tick/ghi
chú khách hàng tiềm năng (`mark_potential`) — **dù ai nhập, dù nhập từ đâu — đều phải luôn xuất
hiện đầy đủ trong Báo cáo** (2 cột đã có sẵn hiện nay: "Ghi chú giám sát" và "Khách hàng tiềm
năng"/"Ghi chú tiềm năng"). Khi tách quyền `note`/`mark_potential` ra khỏi vị trí cứng `supervisor`,
**không được** để việc này vô tình làm mất liên kết dữ liệu ghi chú ↔ báo cáo: bảng
`booth_visits.note` và `booth_potential_notes` giữ nguyên cấu trúc, chỉ đổi **ai được phép ghi**
(theo quyền `note`/`mark_potential` thay vì `staff_type==='supervisor'`); `attachBoothVisits()` và
`attachPotentialNotes()` ở `routes/api.js` (báo cáo) không đổi logic join, chỉ đổi nguồn quyền.
Test bắt buộc ở Đợt 2: một người có quyền `note`/`mark_potential` nhưng KHÔNG có quyền
`view_report` vẫn phải thấy ghi chú của chính mình xuất hiện đúng trong báo cáo khi người có
quyền `view_report` mở xem — tức 2 quyền này độc lập, không quyền nào che quyền nào.

**Đổi việc nhanh tại hiện trường:**
- Màn "Nhân viên" có chế độ thẻ (card) trên mobile: mỗi người 1 thẻ → bấm → bottom sheet tick
  quyền → Lưu. **≤ 3 chạm**.
- Đổi hàng loạt: tick nhiều người → "Đổi nhóm chức năng".
- Hiệu lực ngay: app của nhân viên nghe tín hiệu (poll 15s hoặc SSE) → đổi quyền là màn hình của
  họ tự cập nhật, **không cần đăng xuất/đăng nhập lại**.

### Việc phải làm
1. Tạo bảng + migration; **script chuyển đổi dữ liệu cũ**: `checkin→[checkin, view_checkin_list
   (checked_in)]`, `reception→[checkin, view_checkin_list(all), print_badge, assign_badge]`,
   `supervisor→[view_checkin_list(my_booth), note, mark_potential]`, `manager→[view_report(ẩn danh)]`.
   Không được làm hỏng dữ liệu đang chạy.
2. Backend: một middleware duy nhất `requirePerm('checkin')` + `requireBoothScope()`; **xoá 15
   nhánh if theo staff_type**. Giữ nguyên các quy tắc an toàn đã chốt (server luôn ép `booth_id`
   theo phân công, chặn theo ngày sự kiện).
3. `GET /events/:id` trả về `my_permissions[]` → FE chỉ dùng nó để ẩn/hiện (backend vẫn là nơi
   quyết định cuối).
4. FE: một helper `can('print_badge')` duy nhất; xoá hết magic string rải rác.
5. Màn quản lý nhóm chức năng (CRUD + ma trận tick quyền) cho admin.

### Xong khi
Tạo được nhóm "Tư vấn" mới **không cần sửa dòng code nào**; đổi quyền một nhân viên có hiệu lực
trên máy họ trong ≤ 20 giây; test tự động chứng minh không ai làm được việc ngoài quyền.

---

## 4. Giao diện mobile: làm như một app thật, không phải PWA thu nhỏ

### Vấn đề thật
- Bản Vue **không có PWA nào cả**: `manifest.webmanifest` + `sw.js` chỉ nằm trong `public/`
  (bản vanilla cũ). Khi `public-vue` được build, `server.js:30` phục vụ nó → PWA biến mất. Tệ
  hơn: service worker cũ đã cài trên máy nhân viên vẫn còn, cache trỏ tới `/app.js` không còn
  tồn tại → nguy cơ trang trắng.
- Không có hệ breakpoint: media query viết tay, mốc lộn xộn 640px và 820px.
- `MTabs` không cuộn ngang được (`MTabs.vue:53`) → 7 tab trên điện thoại là vỡ layout.
- Bảng Báo cáo 11 cột chỉ `overflow-x:auto` → trên điện thoại gần như không đọc được.
- `index.html:5` đặt `maximum-scale=1` (chặn phóng to — vi phạm accessibility).
- Vấn đề chủ dự án nêu ("người để giao diện desktop thì PWA không hoạt động") là do Chrome
  Android ở chế độ "Desktop site" **bỏ qua thẻ viewport** → app tưởng đang ở màn hình rộng.

### Phương án: tách hẳn **2 mặt tiền** từ cùng một codebase
| Mặt tiền | Cho ai | Thiết kế |
|---|---|---|
| `/admin` — Back office | super_admin, admin | Desktop MDS đầy đủ: sidebar, MDataTable, dashboard |
| `/app` — App hiện trường | nhân viên tại sự kiện | **Mobile-first ở MỌI độ rộng** (cột giữa tối đa ~480px) |

Điểm mấu chốt: `/app` mobile-first **bất kể viewport rộng bao nhiêu** → chế độ "Desktop site" của
Chrome không còn phá được layout nữa. Nhân viên đăng nhập là vào thẳng `/app`.

**Thiết kế `/app` theo `mobile-pwa.md` của MDS:**
- **Màn hình chính = lưới ô chức năng** (đúng ý "các khối tính năng riêng biệt"), mỗi ô là một
  quyền ở mục 3: Quét QR · Danh sách · Ghi chú booth · Khách tiềm năng · In thẻ · Gán thẻ · Báo cáo.
  Không có quyền thì ô không hiện — thay cho việc phải tính "vai trò nào thấy tab nào".
- **Bottom navigation tối đa 5 mục** có icon + nhãn (MDS cấm dãy icon không nhãn); chức năng thứ
  6 trở đi nằm ở màn hình chính hoặc More.
- Quét QR **toàn màn hình** (`100dvh`), nút bấm to, đèn flash, âm báo, giữ máy không tắt màn hình.
- Danh sách khách = **card**, không phải bảng; tìm kiếm ghim trên cùng; cuộn vô hạn.
- Form/bộ lọc mở bằng **bottom sheet**; nút hành động sticky đáy, chừa `env(safe-area-inset-bottom)`.
- Touch target ≥ 48×48px; ô nhập ≥ 16px để iOS không tự phóng to; bỏ `maximum-scale=1`;
  `viewport-fit=cover`.
- Trạng thái bắt buộc: offline / đang đồng bộ / phiên hết hạn / có bản mới (không tự reload).

**PWA vẫn giữ** (manifest + service worker chuẩn MDS, icon maskable, network-first, không cache
PII/token) — nhưng chỉ là **tùy chọn cài thêm**, app phải chạy đúng ngay cả khi mở bằng trình
duyệt thường. Kèm script gỡ service worker cũ đang kẹt trên máy nhân viên.

### Xong khi
Chạy qua đủ ma trận viewport của MDS (320×568 → 1440×900), cả chế độ "Desktop site"; check-in
một khách từ lúc mở app ≤ 3 chạm; không có cuộn ngang toàn trang.

---

## 5. In từ điện thoại — trả lời trực tiếp câu hỏi

### Cách dev MISA đang làm và vì sao vướng
File `EventCheckinPrinter.bat` mở Chrome với cờ `--kiosk-printing` trỏ vào trang `/printstation`.
Cờ này khiến Chrome **in thẳng không hiện hộp thoại**. Điện thoại đặt lệnh → trang trên máy tính
nhận → tự in. Ý tưởng đúng, nhưng phụ thuộc: phải có Chrome, phải chạy đúng file .bat, cửa sổ
không được đóng, và Windows/antivirus hay chặn file .bat lạ.

### Có, có cách tốt hơn — 3 hướng, nên làm **hướng A + B**

**A. Máy in nối mạng LAN → in thẳng từ máy chủ, KHÔNG cần máy tính nào (tốt nhất nếu dùng được)**
Máy in tem công nghiệp (PD304 theo tài liệu là bản có LAN) nhận lệnh in **trực tiếp qua cổng
TCP 9100** bằng lệnh TSPL/ESC-POS. Khi đó: điện thoại bấm In → gọi API → máy chủ mở socket tới
IP máy in → tem nhả ra. **Không Chrome, không .bat, không máy tính trung gian, không driver.**
Điều kiện: máy chủ phải "nhìn thấy" được IP máy in. Bản nội bộ `misajsc.amis.vn` nằm trong mạng
MISA nên với sự kiện tổ chức tại văn phòng MISA là chạy được ngay; sự kiện ở khách sạn/ngoài
thì mạng khác nhau → dùng hướng B.

**B. "Print Agent" — một chương trình nhỏ thay cho file .bat (làm cả 2 để phủ mọi tình huống)**
Một file `.exe` khoảng 15MB, **nháy đúp là chạy**, hiện cửa sổ có mã QR để ghép nối (giống cách
hiện tại nhưng không cần Chrome):
- Tự **gọi ra** máy chủ để nhận lệnh (không cần mở cổng vào, không vướng tường lửa công ty).
- In **im lặng** qua driver Windows (mọi loại máy in, kể cả USB) hoặc bắn thẳng TCP 9100 tới máy
  in LAN trong cùng phòng — tức là nó cũng làm được hướng A khi máy chủ không với tới máy in.
- Có hàng đợi, thử lại khi kẹt giấy, nút "In thử", nhớ máy in đã chọn, tự chạy khi mở máy.
- Nhược điểm duy nhất: là file .exe nên Windows SmartScreen có thể cảnh báo → cần MISA IT ký số
  hoặc cho vào danh sách tin cậy. Đây là việc làm một lần.

**C. Giữ cách trình duyệt (chỉ làm dự phòng)**
Thay `.bat` bằng shortcut `.lnk` có sẵn cờ kiosk-printing → bớt đáng sợ hơn, nhưng vẫn phụ thuộc
Chrome. Trên Android còn cách dùng app cầu nối RawBT/PrinterL; iPhone thì cần AirPrint mà máy in
tem hầu như không hỗ trợ. Không nên coi là hướng chính.

### Việc phải làm (thiết kế chung cho cả A và B — điện thoại thao tác y hệt nhau)
1. Bảng `print_stations` (trạm in: tên, mã ghép nối, loại `lan|agent`, IP/cổng hoặc tên máy in,
   trạng thái online, lần cuối còn sống) + `print_jobs` (sự kiện, khách/phôi thẻ, nội dung, trạng
   thái `pending/printing/done/failed`, số lần thử).
2. API: `POST /events/:id/print` (đặt lệnh), `GET /print-stations` (chọn trạm), SSE cho agent.
3. Sinh nội dung tem dạng lệnh máy in (TSPL) thay vì HTML — chuẩn, sắc nét, đúng khổ.
   **Chốt lại khổ tem**: `CLAUDE.md:53` ghi 50×30mm, còn code (`web/src/lib/print.js:9`) là 50×50mm.
4. Viết Print Agent (Node + `pkg`, hoặc .NET single-file nếu MISA IT thích ký số hơn).
5. UI mobile: chọn trạm in một lần rồi nhớ luôn; nút In hiện trạng thái "Đang in… / Đã in / Lỗi".
6. Sửa các lỗi in hiện tại: `print.js:6` không bắt trường hợp bị chặn popup (im lặng không báo),
   không đóng tab sau khi in, không in được hàng loạt.

### Cần chủ dự án cung cấp
Model máy in chính xác + có cổng LAN không + hỏi dev MISA xem `/printstation` hiện gửi gì
(HTML hay lệnh máy in). Không có thông tin này thì mặc định làm cả A và B.

---

## 6. Đa nội dung email theo nhóm khách + sửa trình soạn thảo

**Chủ dự án hỏi xác nhận, đã trả lời (2026-07-27): ĐÚNG, tự động hoàn toàn.** Luồng hoạt động:
soạn sẵn 1 nội dung/nhóm (VD Khách bình thường / VIP / Hiệp hội) → gán mỗi khách vào đúng 1 nhóm
(tay, import Excel, hoặc landing page gửi kèm mã nhóm) → mọi lần gửi email (tay/hàng loạt/tự động)
hệ thống tự tra nhóm của khách đó và lấy đúng nội dung + ảnh header/footer của nhóm — người dùng
không phải tự chọn mẫu ở bước gửi. Khách không thuộc nhóm nào dùng mẫu mặc định của sự kiện.

### 6a. Nhiều nhóm khách, mỗi nhóm một nội dung
Hiện `email_settings` là **một bản ghi duy nhất cho mỗi sự kiện** (`db.js:94`) — không thể có 2
nội dung khác nhau. Việc "phân nhóm" hiện chỉ làm gián tiếp bằng lọc + tick chọn thủ công.

**Bảng mới:**
```
attendee_groups   (id, event_id, code, name, description, sort)   -- VD: KHACH_VIP, DOI_TAC, BAO_CHI
attendees.group_id                                                -- thêm cột
email_templates   (id, event_id, group_id NULL, type, subject, body_html, header_image, footer_image, …)
```
- `group_id = NULL` → mẫu mặc định, dùng khi khách không thuộc nhóm nào.
- `type` = `confirm` | `thank` (mở đường thêm `reminder` sau này).
- Chọn mẫu khi gửi: theo nhóm của khách, không có thì lùi về mẫu mặc định.
- **Nối với landing page** (việc dev MISA vừa thông): form landing gửi kèm `group_code` → hệ
  thống tự gán nhóm → tự gửi đúng mẫu email. Đây chính là chỗ đang "lẫn lộn".
- Ảnh header/footer cho phép đặt riêng theo mẫu (vẫn lưu BLOB trong DB như hiện nay).
- Màn hình: danh sách mẫu email, nhân bản mẫu, xem trước theo một khách thật, gửi thử.

### 6b. Sửa dứt điểm lỗi mất nội dung khi chuyển tab
**Nguyên nhân (đã tìm ra chính xác, 4 lỗi chồng nhau):**
1. `BodyEditor.vue:22` — chuyển Văn bản → HTML **ghi đè HTML gốc không hỏi**:
   `html.value = plainToHtml(text.value)`. Mọi màu, căn giữa, `<h2>`, link biến mất vĩnh viễn.
2. `emailBody.js:6-13` — `htmlToPlain` xoá sạch mọi thẻ, **không thể khôi phục**.
3. `emailBody.js:16` — `plainToHtml('')` trả rỗng → text rỗng mà chuyển tab là xoá trắng HTML.
4. `EventDetailView.vue:107` — `:key="activeTab"` khiến đổi tab chính là **huỷ component và tải
   lại từ server**, mất hết chỉnh sửa chưa lưu, không cảnh báo.

**Cách sửa đúng — một nguồn sự thật duy nhất là HTML:**
- Tab "Văn bản thường" = **trình soạn thảo WYSIWYG thật** (dùng TipTap — thư viện không kèm giao
  diện, nên toolbar vẫn dựng bằng `MButton` + `MIcon` đúng chuẩn MDS): **Đậm, Nghiêng, Gạch chân,
  căn trái/giữa/phải/đều, chèn liên kết**, thêm danh sách + chèn biến `{{ho_ten}}`…
- Tab "HTML" = xem/sửa **chính chuỗi HTML đó**. Chuyển qua lại chỉ là đổi cách nhìn → **không có
  bước chuyển đổi nào, nên không thể mất dữ liệu**.
- Làm sạch HTML khi lưu (chống XSS) nhưng giữ nguyên các biến `{{…}}`.
- Cảnh báo khi rời tab/đóng trang lúc còn nội dung chưa lưu; bỏ `:key` gây remount.

### Xong khi
Tạo được ≥3 nhóm khách với 3 nội dung khác nhau, gửi đúng mẫu theo nhóm; soạn thảo có đủ 6 công
cụ định dạng; chuyển Văn bản ↔ HTML 20 lần liên tiếp nội dung không đổi một ký tự.

---

## 7. Báo cáo: tick chọn cột trước khi xuất

### Vấn đề thật
Xuất Excel cố định **20 cột** (`api.js:1078-1093`), không chọn được. Kèm một **lỗi thật**: nút
Xuất Excel là thẻ `<a href>` chỉ truyền `min_booths` (`ReportTab.vue:25-26`) → người dùng lọc
"VIP đã check-in" rồi bấm Xuất sẽ nhận **toàn bộ danh sách**, dễ gửi nhầm dữ liệu ra ngoài.

### Việc phải làm
1. Bảng chọn cột (tick, kéo đổi thứ tự, "Chọn tất cả"), nhớ lựa chọn theo từng người + sự kiện.
2. Xuất **đúng bộ lọc đang xem** — truyền toàn bộ điều kiện lọc sang server.
3. Cột nhạy cảm (email, SĐT) chỉ hiện với người có quyền `view_pii` (mục 3); ghi log ai xuất file
   gì lúc nào.
4. Sự kiện lớn: xuất chạy nền qua worker, xong thì báo và cho tải — không treo trình duyệt.
5. Sửa lỗi phụ: `<a download>` đang nuốt lỗi HTTP (403 vẫn tải về file .xlsx hỏng).

---

## 8. Cấu hình email: Brevo / Gmail / Manual

### Vấn đề thật
`smtp_settings` là **một dòng duy nhất dùng chung toàn hệ thống** (`db.js:175`), và cách chọn kênh
là ngầm định: có `brevo_api_key` thì dùng Brevo, không thì SMTP (`email.js:17`) — người dùng
không hiểu vì sao email đi đường nào. Khoá bí mật lưu **plaintext**.

### Việc phải làm
1. Thêm cột `provider` = `brevo` | `gmail` | `manual`, chọn tường minh bằng radio; mỗi lựa chọn
   hiện đúng nhóm trường của nó (Brevo: API key + email gửi; Gmail: email + App Password 16 ký
   tự; Manual: host/port/SSL-TLS/user/pass).
2. Nút **"Gửi thử"** cho từng cấu hình, trả lỗi dễ hiểu tiếng Việt (sai App Password, Brevo 401
   do bật Authorized IP, cloud chặn cổng 25/587…).
3. Mã hoá bí mật khi lưu (`ENCRYPTION_KEY` từ biến môi trường), API không bao giờ trả về giá trị thật.
4. Cho phép **cấu hình riêng theo sự kiện** (kế thừa cấu hình chung nếu không đặt) — sự kiện của
   đơn vị khác có thể cần địa chỉ gửi khác.
5. Cảnh báo sẵn: bản chạy cloud bị chặn SMTP ra ngoài → khuyến nghị Brevo; bản nội bộ dùng SMTP MISA.

---

## 9. Lộ trình đề xuất (5 đợt, mỗi đợt có bản chạy được + demo)

| Đợt | Nội dung | Vì sao thứ tự này |
|---|---|---|
| **Đ1 — Nền tảng** | Migration (knex), tách module BE, session Redis, worker + hàng đợi, phân trang server, xử lý 5 rủi ro bảo mật ở mục 0.3, dọn tàn dư SQLite | Mọi mục sau đều phải sửa DB/API; không có migration là không dám sửa |
| **Đ2 — Quyền + App hiện trường** | Mục 3 (quyền tick chọn) + mục 4 (`/app` mobile-first) | Hai mục này gắn chặt: màn hình chính của app = các ô theo quyền. Đây cũng là phần chủ dự án cần nhất tại sự kiện |
| **Đ3 — Email** | Mục 6 (nhóm khách + template + WYSIWYG) và mục 8 (chọn nhà cung cấp) | Gỡ đúng chỗ đang lẫn lộn khi mời khách, và ăn khớp với luồng landing page dev MISA vừa thông |
| **Đ4 — In ấn** | Mục 5 (trạm in + Print Agent + in LAN) | Cần Đ1 (worker/hàng đợi) và Đ2 (quyền `print_badge`) trước |
| **Đ5 — UI toàn hệ thống + Báo cáo** | Mục 2 (chuẩn hoá MDS toàn bộ back office) + mục 7 (chọn cột xuất) | Làm cuối để không phải sơn lại hai lần những màn hình đã đổi ở Đ2–Đ4 |

Ghi chú: mục 7 nhỏ và độc lập — nếu chủ dự án cần gấp có thể tách ra làm sớm trong Đ1.
Mỗi đợt xong: cập nhật `MEMORYBANK.md` + commit + push + demo (theo quy tắc mục 11 của MEMORYBANK).

---

## 10. Quyết định đã chốt (2026-07-27)

| # | Câu hỏi | **Chủ dự án đã chốt** |
|---|---|---|
| Q1 | Bản `misajsc.amis.vn` của dev MISA có code riêng đã rẽ nhánh | **Làm tiếp trên repo này.** Lý do đã xác nhận: code dev MISA chạy trong môi trường production của họ, không đưa ra ngoài được. Cách phối hợp: xong việc ở đây, dev MISA đưa vào môi trường của họ và **tự dùng AI so sánh diff với bản đang chạy** để chỉ áp dụng đúng phần thay đổi — nên mỗi thay đổi ở repo này cần gọn theo module/file, tránh xáo trộn lan man ngoài phạm vi 8 yêu cầu |
| Q2 | Backend Express hay NestJS | **Giữ Express**, chỉ chia `routes/api.js` thành module theo nghiệp vụ |
| Q3 | Hướng in từ điện thoại | **Làm cả hai**: in thẳng TCP 9100 qua LAN + Print Agent (.exe) |
| Q4 | Phạm vi quyền "Xem danh sách check-in" | Không hỏi — dùng mặc định khuyến nghị: **có phạm vi** (`all` / `checked_in` / `my_booth`) và **tách riêng quyền `view_pii`** |
| Q5 | Thứ tự triển khai | **Theo đề xuất**: Đ1 Nền tảng → Đ2 Quyền+Mobile → Đ3 Email → Đ4 In → Đ5 UI+Báo cáo |
| Q6 | Mục 2 (UI) làm "theo tinh thần MDS" hay bắt buộc đầy đủ? | **Bắt buộc tuân thủ đầy đủ**, đặc biệt các mục bắt buộc của MDS (icon, token, layout, box shadow, tự kiểm thử trên trình duyệt thật) — xem ràng buộc thêm ở đầu mục 2 |
| Q7 | Ghi chú booth + khách tiềm năng có bắt buộc phải vào báo cáo không khi đổi mô hình quyền ở mục 3? | **Bắt buộc, không được để mất liên kết** — xem ràng buộc thêm ở mục 3 |
| Q8 | Mục 6 (email nhóm) có tự động chọn đúng nội dung theo nhóm khách không? | **Có, tự động hoàn toàn** — người dùng chỉ soạn sẵn nội dung theo nhóm 1 lần, hệ thống tự chọn đúng mẫu khi gửi, không cần chọn tay ở bước gửi |

**Lưu ý:** tài khoản đăng nhập bản MISA nội bộ mà chủ dự án gửi — tôi không tự đăng nhập thay
người dùng vào hệ thống thật. Cần xem tính năng bản đó thì gửi giúp ảnh chụp màn hình.

---

## 11. Rủi ro chính

1. **Hai bản code song song** (repo này ↔ dev MISA) — rủi ro số một, xử lý ở Q1 trước khi code.
2. **Đổi mô hình phân quyền là đổi dữ liệu đang chạy** — bắt buộc có script chuyển đổi + kiểm thử
   trên bản sao DB, không sửa trực tiếp production.
3. **File .exe của Print Agent** cần MISA IT ký số/cho phép — xin trước, đừng đợi đến sát sự kiện.
4. **Làm lại UI dễ vỡ tính năng đang chạy tốt** — làm cuối (Đ5), từng màn một, có ảnh trước/sau.
5. **Chưa từng chạy thử tải thật** — trước sự kiện lớn đầu tiên phải diễn tập với dữ liệu vài
   nghìn khách và nhiều máy quét đồng thời.
