# Yêu cầu kỹ thuật: Tích hợp thanh toán vé sự kiện (misaamis → store.misa.vn → hệ thống Check-in)

**Người soạn:** Bên vận hành hệ thống MISA Event Check-in
**Gửi tới:** Team phụ trách store.misa.vn / MISA aiMarketing (misaamis.misa.vn)
**Mục tiêu:** Sau khi khách điền form đăng ký trên landing page → thanh toán vé qua store.misa.vn → hệ thống tự động gửi email kèm mã QR check-in, không cần thao tác tay.

---

## 1. Bối cảnh

Hiện có 3 hệ thống độc lập cần phối hợp cho 1 luồng nghiệp vụ:

| Hệ thống | Vai trò | Đơn vị quản lý |
|---|---|---|
| Landing page (misaamis.misa.vn) | Form đăng ký tham dự sự kiện | Team aiMarketing |
| Cổng thanh toán (store.misa.vn) | Thu tiền vé | Team Store |
| Hệ thống Check-in sự kiện (misa-event-checkin) | Sinh mã QR, gửi email xác nhận, quét check-in tại sự kiện | Bên vận hành sự kiện |

**Vấn đề cần giải quyết:** hệ thống Check-in cần biết **chính xác và tự động** khi nào một khách đã thanh toán thành công, để gửi email QR cho đúng người, đúng lúc — không gửi nhầm cho người chưa trả tiền, không bỏ sót người đã trả tiền.

---

## 2. Luồng nghiệp vụ mong muốn

```
1. Khách điền form trên landing page (misaamis)
        │
        ▼
2. Landing page gọi API "Đăng ký chờ thanh toán" của hệ thống Check-in
   → nhận về 1 mã tham chiếu (registration_id)
        │
        ▼
3. Landing page chuyển khách sang store.misa.vn/quote?...&ref=<registration_id>
        │
        ▼
4. Khách thanh toán trên store.misa.vn
        │
        ▼
5. store.misa.vn báo kết quả thanh toán cho hệ thống Check-in (qua Webhook)
        │
        ▼
6. Hệ thống Check-in xác nhận đăng ký + tự động gửi email kèm mã QR
```

**Nguyên tắc quan trọng:** store.misa.vn là nơi biết chắc chắn nhất "ai đã trả tiền" → **store.misa.vn cần chủ động báo sang** hệ thống Check-in (đẩy dữ liệu qua webhook), thay vì để hệ thống Check-in phải tự dò hỏi ngược lại (chậm, phức tạp, dễ sai).

---

## 3. Việc bên Check-in sẽ tự làm (không cần team khác hỗ trợ)

- Xây API công khai để landing page gọi khi khách điền form xong (bước 2).
- Xây API nhận webhook báo kết quả thanh toán từ store.misa.vn (bước 5).
- Tự động gửi email kèm mã QR khi nhận được xác nhận thanh toán thành công (bước 6) — cơ chế gửi email đã có sẵn, chỉ cần nối vào.

---

## 4. Câu hỏi cần team Store / aiMarketing xác nhận

### 4.1 Về webhook thanh toán (quan trọng nhất)
1. **store.misa.vn hiện có cơ chế gọi webhook ra hệ thống bên thứ 3 khi 1 đơn hàng thanh toán thành công/thất bại/hoàn tiền không?**
2. Nếu có: xin tài liệu API (payload mẫu, cách xác thực — API key, HMAC signature, hay IP whitelist?).
3. Nếu chưa có: đây có phải là hạng mục cần đăng ký để team Store phát triển thêm không? Thời gian dự kiến?

### 4.2 Về truyền mã tham chiếu qua trang thanh toán
4. Khi redirect khách từ landing page sang `store.misa.vn/quote?pid=...`, có tham số nào (`ref`, `note`, `metadata`, `custom_field`...) để gắn kèm **mã tham chiếu đăng ký** (registration_id) của bên Check-in không? Mã này cần được giữ lại và trả về nguyên vẹn trong webhook ở bước 5 để bên Check-in biết đơn hàng này thuộc về khách nào.
5. Nếu không hỗ trợ tham số tuỳ biến, có cách nào khác để map 1 đơn hàng store.misa.vn với 1 người đăng ký cụ thể (ví dụ: dùng số điện thoại/email làm khoá đối chiếu)?

### 4.3 Về sản phẩm/gói vé
6. Mỗi sự kiện sẽ tương ứng với 1 `pid` (product id) riêng trên store.misa.vn, đúng không? Ai là người tạo/cấu hình sản phẩm này cho từng sự kiện?
7. Có hỗ trợ nhiều loại vé (giá khác nhau) trong cùng 1 sự kiện không? Nếu có, cần trả về loại vé đã mua trong webhook.

### 4.4 Về trường hợp đặc biệt
8. Khách thanh toán rồi **hoàn tiền/hủy** → có webhook báo riêng không? (Bên Check-in cần vô hiệu hoá mã QR đã gửi trong trường hợp này.)
9. Khách bỏ giữa đường (điền form nhưng không thanh toán) → có cần dọn dữ liệu định kỳ bên nào không, hay cứ để "pending" mãi cũng không ảnh hưởng gì bên Store?
10. Thời gian webhook được gọi sau khi thanh toán thành công là ngay lập tức hay có độ trễ? Có cơ chế retry nếu bên Check-in nhận lỗi/timeout không?

---

## 5. Đề xuất cấu trúc dữ liệu webhook (để team Store tham khảo, có thể điều chỉnh theo hệ thống thực tế của Store)

```json
{
  "event": "payment.success",
  "order_id": "SO123456",
  "ref": "<registration_id do bên Check-in cấp ở bước 2>",
  "pid": "701",
  "amount": 500000,
  "paid_at": "2026-07-10T09:15:00+07:00",
  "customer": {
    "name": "Nguyễn Văn A",
    "email": "a@example.com",
    "phone": "0901234567"
  }
}
```

Kèm 1 trong các cơ chế xác thực (chọn 1, ưu tiên theo thứ tự):
- **HMAC signature** ở header (ví dụ `X-Signature`, ký bằng secret key 2 bên thống nhất trước) — an toàn nhất.
- **API key cố định** ở header.
- Whitelist IP gọi webhook.

---

## 6. Việc cần làm tiếp sau khi có câu trả lời

- [ ] Chốt cơ chế webhook (có sẵn hay cần Store phát triển thêm, thời gian dự kiến).
- [ ] Chốt cách truyền mã tham chiếu qua trang thanh toán.
- [ ] Thống nhất bảo mật webhook (secret key/HMAC).
- [ ] Thống nhất `pid` cho từng sự kiện cụ thể.
- [ ] Xác nhận cách xử lý hoàn tiền/hủy đơn.

Sau khi có câu trả lời, bên Check-in sẽ triển khai API đăng ký công khai + endpoint nhận webhook tương ứng, và test end-to-end với 1 đơn hàng thật (số tiền nhỏ) trước khi áp dụng cho sự kiện thật.
