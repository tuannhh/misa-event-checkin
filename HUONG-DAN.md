# 🎟️ MISA Event Check-in — Hướng dẫn sử dụng

## 1. Khởi động hệ thống

Cách 1 (dễ nhất): **nháy đúp file `KHOI-DONG.bat`** trong thư mục này.

Cách 2: mở PowerShell trong thư mục `event-checkin` và chạy:
```
npm start
```

Sau đó mở trình duyệt vào địa chỉ: **http://localhost:3000**

> Dữ liệu được lưu trong file `data/checkin.db`. Muốn sao lưu, chỉ cần copy file này.

## 2. Tài khoản Super Admin

- Email: `tuanbui88vn@gmail.com`
- Mật khẩu: `SocTho0607!9@@`

## 3. Quy trình sử dụng cho 1 sự kiện

1. **Cấu hình Email (làm 1 lần):** menu *Cấu hình Email* → nhập Gmail + App Password (xem mục 5) → bấm *Gửi email kiểm tra*.
2. **Tạo sự kiện:** menu *Sự kiện* → *+ Tạo sự kiện* (tên, thời gian, trưởng BTC, đơn vị).
3. **Soạn email:** mở sự kiện → tab *Cài đặt Email*:
   - Nội dung có thể là **văn bản thường hoặc mã HTML** (dán HTML vào là hệ thống tự nhận).
   - Đặt `{{qr_code}}` ở vị trí muốn hiện mã QR.
   - **Tải ảnh header/footer** của sự kiện lên, kéo thanh trượt chỉnh độ rộng — ảnh tự ghép vào đầu/cuối cả 2 email.
   - Bấm **👁 Xem trước** để xem email hoàn chỉnh đúng như khách sẽ nhận, trước khi gửi.
   - Email cảm ơn: chọn số phút gửi sau check-in. Tích *Tự động gửi* nếu muốn email xác nhận gửi ngay khi thêm khách.
4. **Nhập danh sách khách:** tab *Người tham dự* → *Tải file Excel mẫu* → điền thông tin → *Tải lên danh sách Excel*. Hoặc bấm *+ Thêm người* để nhập tay (hệ thống cảnh báo nếu trùng số điện thoại).
5. **Gửi mã QR:** bấm *✉️ Gửi email QR cho người chưa nhận* — chỉ gửi cho người **chưa được gửi**, không bao giờ gửi trùng. Muốn gửi lại cho riêng ai thì bấm nút *Gửi lại* ở cuối dòng của người đó.
6. **Tạo tài khoản nhân viên check-in:** mở sự kiện → tab *Nhân viên check-in* → *+ Tạo tài khoản nhân viên mới* (tự gán luôn vào sự kiện). Hoặc tạo ở menu *Thành viên* rồi vào tích chọn.
7. **Ngày sự kiện:** nhân viên đăng nhập trên điện thoại → mở sự kiện → tab *Quét QR* → quét mã của khách:
   - Mặc định bật **⚡ Tự động check-in khi quét**: quét xong là ra kết quả ngay — ✅ CHECK-IN THÀNH CÔNG hoặc ⛔ MÃ ĐÃ ĐƯỢC SỬ DỤNG.
   - Nếu tắt chế độ này: quét → xem thông tin khách → bấm *XÁC NHẬN CHECK-IN* thủ công.
   - ⛔ **Đỏ "MÃ ĐÃ ĐƯỢC SỬ DỤNG":** mã đã check-in trước đó (kèm giờ và tên nhân viên đã quét) — phát hiện trường hợp chuyển mã cho người khác.
   - ⚠️ **Hết hạn:** sự kiện đã qua ngày tổ chức.
   - Khách chưa đăng ký trước → bấm *+ Khách chưa đăng ký trước (vãng lai)*.
8. **Sau sự kiện:** tab *Báo cáo* → xem ai đến/không đến, giờ check-in, lọc theo chức vụ/quy mô công ty, *Xuất Excel*.

## 4. Các vai trò

| Vai trò | Quyền |
|---|---|
| **Super Admin** | Toàn quyền: mọi đơn vị, mọi sự kiện, tạo/xoá Admin và Nhân viên check-in |
| **Admin** | Chỉ trong **đơn vị của mình**: quản lý sự kiện, báo cáo, tạo Nhân viên check-in |
| **Nhân viên check-in** | Chỉ sự kiện **được gán**: quét QR, xem danh sách đã check-in, thêm khách vãng lai |

## 5. Lấy App Password của Gmail (để gửi email)

1. Vào https://myaccount.google.com → *Bảo mật* → bật **Xác minh 2 bước** (nếu chưa).
2. Vào https://myaccount.google.com/apppasswords → tạo mật khẩu ứng dụng mới.
3. Copy chuỗi 16 ký tự → dán vào ô *Mật khẩu* trong menu *Cấu hình Email* của hệ thống.

> Gmail thường cho phép gửi ~500 email/ngày. Sự kiện lớn hơn nên dùng dịch vụ như Brevo (miễn phí 300 email/ngày) — chỉ cần đổi Máy chủ SMTP/cổng/tài khoản trong cùng màn hình cấu hình.

## 6. Lưu ý quan trọng khi dùng tại sự kiện thật

- **Camera điện thoại chỉ hoạt động khi trang web chạy qua HTTPS** (hoặc localhost). Vì vậy khi tổ chức sự kiện thật, cần đưa hệ thống lên Internet:
  - Cách đơn giản nhất: deploy lên **Render.com** hoặc **Railway.app** (miễn phí/giá rẻ, tự có HTTPS). Khi cần, hãy nhờ Claude hướng dẫn từng bước.
  - Hoặc tạm thời dùng nút **nhập mã thủ công** (mã in dưới QR) nếu không có HTTPS.
- Email cảm ơn được gửi tự động khi hệ thống **đang chạy** — đừng tắt máy chủ ngay sau sự kiện nếu còn email chờ gửi.
