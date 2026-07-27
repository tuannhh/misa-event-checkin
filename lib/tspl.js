// Dựng lệnh TSPL (chuẩn phổ biến cho máy in tem nhiệt công nghiệp - TSC, Xprinter, Zebra
// tương thích TSPL...) cho tem QR khách, khổ 50x50mm - khớp khổ đang dùng ở lib/print.js
// (bản in qua trình duyệt). Tách riêng khỏi HTML vì gửi thẳng byte lệnh in qua mạng/USB,
// không qua trình duyệt/driver hệ điều hành (mục 5 kế hoạch nâng cấp).
function escTspl(s) {
  return String(s ?? '').replace(/["\\]/g, (c) => '\\' + c);
}

// token: nội dung mã QR (qr_token của khách). name/company: 2 dòng chữ dưới mã QR.
// Toạ độ tính theo dot, máy in phổ biến 203dpi (~8 dot/mm) - khổ 50mm = 400 dot.
function buildAttendeeLabel({ token, name, company }) {
  const line1 = escTspl(name).slice(0, 40);
  const line2 = escTspl(company).slice(0, 40);
  const lines = [
    'SIZE 50 mm,50 mm',
    'GAP 2 mm,0 mm',
    'DIRECTION 1',
    'REFERENCE 0,0',
    'CLS',
    `QRCODE 80,20,H,7,A,0,"${escTspl(token)}"`,
    `TEXT 20,300,"3",0,1,1,"${line1}"`,
  ];
  if (line2) lines.push(`TEXT 20,330,"2",0,1,1,"${line2}"`);
  lines.push('PRINT 1,1');
  return lines.join('\r\n') + '\r\n';
}

module.exports = { buildAttendeeLabel };
