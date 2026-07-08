// In tem QR dự phòng (máy in nhiệt USB) khổ vuông 50×50mm.
// Tem chứa mã QR của chính khách -> quét thẳng ở booth, không cần gán.
export function printQr(r) {
  const line = r.company ? `${r.name} - ${r.company}` : r.name;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const w = window.open('', '_blank');
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
        <img src="/api/attendees/${r.id}/qr.png" onload="setTimeout(()=>{window.print();},250)">
        <div class="nm">${esc(line)}</div>
      </div>
    </body></html>`);
  w.document.close();
}
