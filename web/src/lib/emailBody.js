// Chuyển đổi giữa Văn bản thường và HTML cho trình soạn email + nội dung gợi ý.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function isHtmlBody(v) { return /<[a-z][^>]*>/i.test(v || ''); }

export function htmlToPlain(html) {
  return String(html || '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&#39;/gi, "'").replace(/&quot;/gi, '"')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function plainToHtml(text) {
  const t = (text || '').trim();
  if (!t) return '';
  return t.split(/\n{2,}/).map(p => '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>').join('\n');
}

// Nội dung email gợi ý sẵn (khớp bản cũ) — người dùng sửa hotline/link rồi lưu.
export const SUGGEST = {
  confirm: {
    subject: 'Xác nhận đăng ký tham dự {{ten_su_kien}}',
    text: `XÁC NHẬN ĐĂNG KÝ THÀNH CÔNG

Xin chào {{xung_ho}} {{ho_ten}},

Ban Tổ Chức trân trọng cảm ơn {{xung_ho}} đã đăng ký tham dự {{ten_su_kien}}, diễn ra vào {{thoi_gian}}.

Để được tiếp đón chu đáo, {{xung_ho}} vui lòng xuất trình mã QR dưới đây cho nhân viên lễ tân khi đến check-in:

{{qr_code}}

Mã QR này cũng dùng để ghi nhận hành trình tham quan tại các booth trong sự kiện.

Hotline hỗ trợ: 0948 217 721

Xin trân trọng cảm ơn và hẹn gặp {{xung_ho}} tại {{ten_su_kien}}!`,
    body: `<div style="text-align:center;padding:8px 0">
  <h2 style="color:#1d4ed8;margin:0">XÁC NHẬN ĐĂNG KÝ THÀNH CÔNG</h2>
</div>
<p>Xin chào <b>{{xung_ho}} {{ho_ten}}</b>,</p>
<p>Ban Tổ Chức trân trọng cảm ơn {{xung_ho}} đã đăng ký tham dự <b>{{ten_su_kien}}</b>, diễn ra vào <b>{{thoi_gian}}</b>.</p>
<p>Để được tiếp đón chu đáo, {{xung_ho}} vui lòng xuất trình mã QR dưới đây cho nhân viên lễ tân khi đến check-in:</p>
{{qr_code}}
<p style="text-align:center;color:#6b7280;font-size:13px">Mã QR này cũng dùng để ghi nhận hành trình tham quan tại các booth trong sự kiện.</p>
<p>Hotline hỗ trợ: <b>0948 217 721</b></p>
<p>Xin trân trọng cảm ơn và hẹn gặp {{xung_ho}} tại <b>{{ten_su_kien}}</b>!</p>`,
  },
  thank: {
    subject: 'Cảm ơn {{xung_ho}} đã tham dự {{ten_su_kien}}',
    text: `CẢM ƠN {{xung_ho}} ĐÃ THAM DỰ!

Thân gửi {{xung_ho}} {{ho_ten}},

Ban Tổ Chức trân trọng cảm ơn {{xung_ho}} đã dành thời gian tham dự {{ten_su_kien}}. Sự hiện diện của {{xung_ho}} là niềm vinh hạnh của chúng tôi.

Tài liệu của sự kiện, {{xung_ho}} vui lòng xem tại: https://example.com/tai-lieu (nhớ thay link tài liệu thật).

Hi vọng được gặp lại {{xung_ho}} trong các sự kiện tiếp theo!

Trân trọng,
Ban Tổ Chức`,
    body: `<div style="text-align:center;padding:8px 0">
  <h2 style="color:#16a34a;margin:0">CẢM ƠN {{xung_ho}} ĐÃ THAM DỰ!</h2>
</div>
<p>Thân gửi <b>{{xung_ho}} {{ho_ten}}</b>,</p>
<p>Ban Tổ Chức trân trọng cảm ơn {{xung_ho}} đã dành thời gian tham dự <b>{{ten_su_kien}}</b>. Sự hiện diện của {{xung_ho}} là niềm vinh hạnh của chúng tôi.</p>
<p>Tài liệu của sự kiện, {{xung_ho}} vui lòng xem tại: <a href="https://example.com/tai-lieu">bấm vào đây</a> <i>(nhớ thay link tài liệu thật)</i>.</p>
<p>Hi vọng được gặp lại {{xung_ho}} trong các sự kiện tiếp theo!</p>
<p>Trân trọng,<br><b>Ban Tổ Chức</b></p>`,
  },
};
