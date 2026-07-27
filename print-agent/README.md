# Print Agent - MISA Event Check-in

Chương trình nhỏ chạy trên **1 máy tính tại sự kiện**, thay cho cách cũ (file `.bat` mở Chrome
`--kiosk-printing`). Nhân viên bấm "In" trên **điện thoại** → máy chủ đưa lệnh in vào hàng đợi
→ Agent này (đang chạy sẵn trên máy tính, không cần mở Chrome) tự lấy về và in ngay.

## Cách dùng (người không rành kỹ thuật)

1. Trên trình duyệt, vào **Cấu hình > Trạm in**, bấm "+ Thêm trạm in", chọn kiểu **Agent**, đặt
   tên rồi lưu — hệ thống sẽ hiện một **mã ghép nối** (VD `A1B2C3D4`). Ghi lại mã này.
2. Mở file `misa-checkin-print-agent.exe` (nháy đúp). Lần đầu chạy sẽ hỏi:
   - Địa chỉ máy chủ (VD `https://checkin.congty.com`)
   - Mã ghép nối (mã ở bước 1)
   - Máy in kết nối kiểu gì: **mạng LAN** (có IP riêng) hay **USB cắm vào máy tính này**
3. Nếu chọn USB: máy in phải được **Chia sẻ (Sharing)** trong Windows trước
   (Panel điều khiển > Thiết bị và máy in > chuột phải máy in > Thuộc tính máy in > tab
   Chia sẻ > tick "Chia sẻ máy in này").
4. Để cửa sổ chương trình **mở suốt sự kiện**. Đóng cửa sổ = ngừng nhận lệnh in.
5. Từ lần sau, chỉ cần mở lại file `.exe` — không cần nhập lại thông tin (đã lưu vào
   `print-agent-config.json` cùng thư mục).

## Đóng gói thành file `.exe` (việc của người triển khai, làm 1 lần)

```bash
cd print-agent
npm install
npm run build
```

Kết quả: `dist/misa-checkin-print-agent.exe` — gửi file này cho máy tính tại sự kiện, không cần
cài Node.js trên máy đó.

**Lưu ý Windows SmartScreen**: vì đây là file `.exe` mới, lần đầu chạy Windows có thể cảnh báo
"Windows protected your PC". Bấm "More info" → "Run anyway". Nếu triển khai cho nhiều sự kiện,
nên nhờ bộ phận IT MISA **ký số (code signing)** file này để không bị cảnh báo — đây là bước
làm một lần, ngoài phạm vi mã nguồn của dự án này.

## Hai cách in agent hỗ trợ

| Cách | Khi nào dùng | Ghi chú |
|---|---|---|
| Máy in mạng (LAN) | Máy in có cổng LAN, cùng mạng với máy tính chạy agent | Agent gửi thẳng lệnh qua TCP, không cần driver |
| Máy in USB chia sẻ | Máy in cắm USB vào chính máy tính chạy agent | Cần bật "Sharing" trong Windows trước |

## Khắc phục sự cố

- **"Ghép nối thất bại"**: kiểm tra lại địa chỉ máy chủ (phải có `https://`) và mã ghép nối có
  đúng chưa (xem lại ở trang Cấu hình > Trạm in).
- **"Không kết nối được máy in"**: kiểm tra máy in có bật nguồn, đúng IP, cùng mạng với máy
  tính chạy agent không (thử `ping <IP máy in>` từ Command Prompt).
- **"Lỗi in ... Sharing"**: máy in chưa được chia sẻ đúng cách trong Windows, hoặc gõ sai tên
  máy in đã chia sẻ.
- Muốn đổi máy chủ/mã ghép nối/máy in: xoá file `print-agent-config.json` rồi mở lại `.exe`.
