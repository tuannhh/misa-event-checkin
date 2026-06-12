# 🚀 Thông tin Deploy (Railway)

## Địa chỉ website chính thức
**https://misa-event-checkin-production.up.railway.app**

- Có HTTPS sẵn → camera điện thoại quét QR hoạt động bình thường.
- Dữ liệu lưu trên ổ cứng riêng (volume `/data`, 500 MB) — không mất khi cập nhật hay khởi động lại.
- Tài khoản Railway: tuanbui88vn@gmail.com (dự án `misa-event-checkin`).
- Bảng điều khiển: https://railway.com/project/c891bd0c-0ebf-4137-a672-88524c609694

## Cách cập nhật website khi sửa code

Mở PowerShell trong thư mục `event-checkin` và chạy:
```
railway up --detach
```
Chờ ~1-2 phút là bản mới lên sóng. (Lần đầu trên máy khác thì chạy `railway login` trước.)

## Gửi email trên bản cloud: bắt buộc dùng Brevo

Railway **chặn gửi email kiểu Gmail/SMTP** (chỉ gói Pro 20 USD/tháng mới mở). Vì vậy bản cloud dùng **Brevo** — gửi qua HTTPS, miễn phí 300 email/ngày:

1. Tạo tài khoản tại https://www.brevo.com (đăng ký bằng tuanbui88vn@gmail.com).
2. Góc phải trên → **SMTP & API** → tab **API Keys** → **Generate a new API key**.
3. Copy key (dạng `xkeysib-...`) → vào website → menu **Cấu hình Email** → dán vào ô *Brevo API Key*, điền *Email người gửi* = email đã đăng ký Brevo → **Lưu** → **Gửi email kiểm tra**.

Bản local (chạy trên máy tính) vẫn dùng Gmail như cũ, không cần Brevo.

## Lưu ý chi phí
- Tài khoản mới có **credit dùng thử miễn phí**. Khi hết, cần nâng lên gói **Hobby (~5 USD/tháng)** để web chạy liên tục.
- Xem mức dùng tại: https://railway.com/account/usage

## Khác biệt giữa bản local và bản cloud
- Hai bản dùng **2 cơ sở dữ liệu riêng**: làm gì trên local sẽ KHÔNG tự hiện trên cloud và ngược lại.
- Bản cloud là bản chính thức để dùng cho sự kiện thật; bản local (KHOI-DONG.bat) chỉ để thử nghiệm.
