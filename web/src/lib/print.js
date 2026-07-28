import { api } from '../api';

// In thẻ QR khách - mục 5 kế hoạch nâng cấp. Khổ 100x75mm (A7), thiết kế theo mẫu chủ dự án
// cung cấp 2026-07-28 ("MẪU THẺ.pdf"): QR giữa trên, Họ tên IN HOA đậm, Chức danh, Công ty,
// Mức độ quan trọng IN HOA đậm dưới cùng. Có trạm in đã chọn (tab Phôi thẻ > Trạm in) thì gửi
// lệnh in thẳng qua máy chủ (LAN/Agent, không cần Chrome); không có thì lùi về cách cũ (mở tab
// trình duyệt in qua @page 100x75mm, cần máy in USB nối trực tiếp máy đang mở web) - dùng làm
// phương án dự phòng khi không tự in được từ điện thoại (in thủ công từ Báo cáo trên máy tính).
export async function printQr(r, eventId, layout) {
  const stationId = eventId ? localStorage.getItem('printStation-' + eventId) : null;
  if (eventId && stationId) {
    try {
      const res = await api(`/events/${eventId}/print`, { method: 'POST', body: { station_id: Number(stationId), attendee_id: r.id } });
      if (res.status === 'pending') alert('Đã gửi lệnh in - trạm Agent sẽ in trong giây lát.');
      return;
    } catch (e) {
      alert('In qua trạm thất bại (' + e.message + ') - chuyển sang in qua trình duyệt.');
    }
  }
  printQrViaBrowser(r, layout);
}

// Layout mặc định của thẻ - dùng chung 1 khái niệm cấu hình (mốc sm/md/lg) với lib/tspl.js
// phía backend (xem QR_CELL/NAME_FONT ở đó), để 1 JSON cấu hình lưu ở events.badge_layout dùng
// được cho cả 2 đường in (trạm LAN/Agent lẫn qua trình duyệt) - màn cấu hình xem BadgesTab.vue.
export const DEFAULT_BADGE_LAYOUT = {
  qrSize: 'md', // sm | md | lg
  nameSize: 'md', // sm | md | lg
  showPosition: true,
  showCompany: true,
  showImportance: true,
};
const QR_MM = { sm: 26, md: 34, lg: 42 };
const NAME_PX = { sm: 16, md: 20, lg: 24 };
const SUB_PX = 12;
const IMP_PX = 19;

function printQrViaBrowser(r, layout) {
  const L = { ...DEFAULT_BADGE_LAYOUT, ...(layout || {}) };
  const qrMm = QR_MM[L.qrSize] || QR_MM.md;
  const namePx = NAME_PX[L.nameSize] || NAME_PX.md;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const name = esc((r.salutation ? r.salutation + ' ' : '') + (r.name || ''));
  const w = window.open('', '_blank');
  if (!w) { alert('Trình duyệt đã chặn cửa sổ in (popup). Cho phép popup cho trang này rồi thử lại.'); return; }
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Thẻ QR</title>
    <style>
      @page { size: 100mm 75mm; margin: 0; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 100mm; height: 75mm; }
      .label { width: 100mm; height: 75mm; padding: 3mm 6mm; text-align: center; font-family: Arial, sans-serif; }
      .label img { width: ${qrMm}mm; height: ${qrMm}mm; display: block; margin: 0 auto 2mm; }
      .nm { font-size: ${namePx}px; font-weight: 800; text-transform: uppercase; line-height: 1.15; margin-top: 1mm;
        display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
      .pos { font-size: ${SUB_PX}px; margin-top: 1.5mm; text-transform: uppercase; }
      .co { font-size: ${SUB_PX}px; text-transform: uppercase; }
      .imp { font-size: ${IMP_PX}px; font-weight: 800; text-transform: uppercase; margin-top: 5mm; }
    </style></head>
    <body>
      <div class="label">
        <img src="/api/attendees/${r.id}/qr.png" onerror="this.style.display='none';setTimeout(()=>{window.print();window.close();},250)" onload="setTimeout(()=>{window.print();window.close();},250)">
        <div class="nm">${name}</div>
        ${L.showPosition && r.position ? `<div class="pos">${esc(r.position)}</div>` : ''}
        ${L.showCompany && r.company ? `<div class="co">${esc(r.company)}</div>` : ''}
        ${L.showImportance && r.importance && r.importance !== 'Bình thường' ? `<div class="imp">${esc(r.importance)}</div>` : ''}
      </div>
    </body></html>`);
  w.document.close();
}
