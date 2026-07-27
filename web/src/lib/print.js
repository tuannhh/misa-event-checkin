import { api } from '../api';

// In tem QR khách - mục 5 kế hoạch nâng cấp. Có trạm in đã chọn (tab Phôi thẻ > Trạm in) thì
// gửi lệnh in thẳng qua máy chủ (LAN/Agent, không cần Chrome); không có thì lùi về cách cũ
// (mở tab trình duyệt in qua @page 50x50mm, cần máy in USB nối trực tiếp máy đang mở web).
export async function printQr(r, eventId) {
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
  printQrViaBrowser(r);
}

function printQrViaBrowser(r) {
  const line = r.company ? `${r.name} - ${r.company}` : r.name;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const w = window.open('', '_blank');
  if (!w) { alert('Trình duyệt đã chặn cửa sổ in (popup). Cho phép popup cho trang này rồi thử lại.'); return; }
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Tem QR</title>
    <style>
      @page { size: 50mm 50mm; margin: 0; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 50mm; height: 50mm; }
      .label { width: 50mm; height: 50mm; padding: 2mm; text-align: center;
        display: flex; flex-direction: column; align-items: center; justify-content: center; font-family: Arial, sans-serif; }
      .label img { width: 34mm; height: 34mm; }
      .nm { font-size: 10px; font-weight: bold; line-height: 1.2; margin-top: 1.2mm;
        display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    </style></head>
    <body>
      <div class="label">
        <img src="/api/attendees/${r.id}/qr.png" onload="setTimeout(()=>{window.print();window.close();},250)">
        <div class="nm">${esc(line)}</div>
      </div>
    </body></html>`);
  w.document.close();
}
