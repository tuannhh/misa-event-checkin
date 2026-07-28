// Dựng lệnh TSPL (chuẩn phổ biến cho máy in tem nhiệt công nghiệp - TSC, Xprinter, Zebra
// tương thích TSPL...) cho thẻ QR khách, khổ 100x75mm (A7 - chốt với chủ dự án 2026-07-28,
// mẫu thiết kế "MẪU THẺ.pdf": QR giữa trên, tên IN HOA đậm, chức danh, công ty, mức độ quan
// trọng IN HOA đậm dưới cùng) - khớp khổ đang dùng ở lib/print.js (bản in qua trình duyệt).
// Tách riêng khỏi HTML vì gửi thẳng byte lệnh in qua mạng/USB, không qua trình duyệt/driver
// hệ điều hành (mục 5 kế hoạch nâng cấp).
function escTspl(s) {
  return String(s ?? '').replace(/["\\]/g, (c) => '\\' + c);
}

// Mặc định + 3 mốc cỡ (Nhỏ/Vừa/Lớn) khớp với màn "Tuỳ chỉnh mẫu thẻ" (BadgesTab.vue) và bản
// in qua trình duyệt (web/src/lib/print.js DEFAULT_BADGE_LAYOUT) - cùng 1 khái niệm cấu hình,
// chỉ khác đơn vị (TSPL dùng font token/cell size của máy in, HTML dùng px/mm).
const DEFAULT_LAYOUT = {
  qrSize: 'md', // sm | md | lg
  nameSize: 'md', // sm | md | lg
  showPosition: true,
  showCompany: true,
  showImportance: true,
};
// cell size TSPL (dot/module) - CHƯA test trên máy in vật lý thật, chỉ ước lượng theo tỉ lệ.
const QR_CELL = { sm: 6, md: 8, lg: 10 };
// font token TSPL cho tên khách (built-in font 1-8, kích thước tăng dần theo firmware máy in).
const NAME_FONT = { sm: '3', md: '4', lg: '5' };

// token: nội dung mã QR. name/position/company/importance: 4 dòng chữ theo đúng thứ tự mẫu
// thiết kế. Toạ độ tính theo dot, máy in phổ biến 203dpi (~8 dot/mm) - khổ 100x75mm = 800x600 dot.
function buildAttendeeLabel({ token, name, position, company, importance, layout }) {
  const L = { ...DEFAULT_LAYOUT, ...(layout || {}) };
  const nameLine = escTspl(name).toUpperCase().slice(0, 40);
  const posLine = L.showPosition ? escTspl(position).toUpperCase().slice(0, 40) : '';
  const companyLine = L.showCompany ? escTspl(company).toUpperCase().slice(0, 40) : '';
  const impLine = L.showImportance ? escTspl(importance).toUpperCase().slice(0, 30) : '';
  const cell = QR_CELL[L.qrSize] || QR_CELL.md;
  const nameFont = NAME_FONT[L.nameSize] || NAME_FONT.md;
  // QR căn giữa khổ 800 dot ngang theo cell size đã chọn (module QR ~25-33 tuỳ độ dài token,
  // ước lượng 29 module để căn - lệch vài dot không đáng kể ở khổ thẻ này).
  const qrX = Math.round(400 - (cell * 29) / 2);
  const qrY = 30;
  let y = qrY + cell * 29 + 20;
  const lines = [
    'SIZE 100 mm,75 mm',
    'GAP 2 mm,0 mm',
    'DIRECTION 1',
    'REFERENCE 0,0',
    'CLS',
    `QRCODE ${qrX},${qrY},H,${cell},A,0,"${escTspl(token)}"`,
    `TEXT 40,${y},"${nameFont}",0,1,1,"${nameLine}"`,
  ];
  y += 45;
  if (posLine) { lines.push(`TEXT 40,${y},"2",0,1,1,"${posLine}"`); y += 35; }
  if (companyLine) { lines.push(`TEXT 40,${y},"2",0,1,1,"${companyLine}"`); y += 35; }
  if (impLine) { y += 20; lines.push(`TEXT 40,${y},"5",0,1,1,"${impLine}"`); }
  lines.push('PRINT 1,1');
  return lines.join('\r\n') + '\r\n';
}

module.exports = { buildAttendeeLabel };
