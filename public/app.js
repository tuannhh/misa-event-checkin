// Giao diện hệ thống Check-in sự kiện
let USER = null;
let OPTIONS = { positions: [], company_sizes: [], roles: [] };
let scanner = null; // máy quét QR đang chạy

const ROLE_NAMES = {
  super_admin: 'Super Admin', admin: 'Admin', checkin: 'Nhân viên check-in',
};
// Loại vị trí của nhân viên trong 1 sự kiện
const STAFF_TYPE_NAMES = {
  checkin: 'Quét QR / Check-in', reception: 'Lễ tân in QR', supervisor: 'Giám sát booth', manager: 'Quản lý (xem số liệu)',
};
// Màn hình mặc định khi nhân viên vào sự kiện, theo loại vị trí
function defaultStaffTab(staffType) {
  if (staffType === 'supervisor') return 'monitor';
  if (staffType === 'manager') return 'dashboard';
  return 'scan';
}

// ============ Tiện ích ============
async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    headers: opts.body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body instanceof FormData ? opts.body : (opts.body ? JSON.stringify(opts.body) : undefined),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error || 'Có lỗi xảy ra'); e.data = data; e.status = res.status; throw e; }
  return data;
}
function toast(msg, ms = 3500) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.style.display = 'block';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.style.display = 'none'; }, ms);
}
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function fmtDate(iso, isUtc) {
  if (!iso) return '';
  const d = new Date(isUtc ? iso + 'Z' : iso);
  return d.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
}
// Dùng <template> để tạo phần tử - bắt buộc với các dòng bảng <tr> (div sẽ làm hỏng cấu trúc bảng)
function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
// Ngày hôm nay theo giờ Việt Nam (YYYY-MM-DD) - để khoá sự kiện theo đúng ngày tổ chức
function todayYMD() { return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }); }
function eventDayStatus(ev) {
  const d = (ev.event_date || '').slice(0, 10);
  if (!d) return 'today';
  const t = todayYMD();
  return d < t ? 'past' : d > t ? 'future' : 'today';
}

// ===== Chuyển đổi giữa Văn bản thường và HTML cho trình soạn email =====
function isHtmlBody(v) { return /<[a-z][^>]*>/i.test(v || ''); }
function htmlToPlain(html) {
  return String(html || '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&#39;/gi, "'").replace(/&quot;/gi, '"')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
function plainToHtml(text) {
  const t = (text || '').trim();
  if (!t) return '';
  return t.split(/\n{2,}/).map(p => '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>').join('\n');
}
// Trình soạn nội dung email 2 chế độ: Văn bản (dễ dùng) và HTML (nâng cao)
function bodyEditorHtml(prefix, value) {
  const html = isHtmlBody(value);
  const textVal = html ? htmlToPlain(value) : (value || '');
  const htmlVal = html ? value : '';
  return `
  <label>Nội dung email</label>
  <div class="body-tabs" data-prefix="${prefix}">
    <button type="button" class="body-tab ${html ? '' : 'active'}" data-mode="text">📝 Văn bản (dễ dùng)</button>
    <button type="button" class="body-tab ${html ? 'active' : ''}" data-mode="html">&lt;/&gt; HTML (nâng cao)</button>
  </div>
  <textarea id="${prefix}-text" class="body-area" ${html ? 'style="display:none"' : ''} placeholder="Gõ nội dung như viết tin nhắn, xuống dòng để ngắt đoạn. Có thể dùng các biến {{ho_ten}}, {{ten_su_kien}}, {{qr_code}}...">${esc(textVal)}</textarea>
  <textarea id="${prefix}-html" class="body-area" ${html ? '' : 'style="display:none"'} placeholder="Dán mã HTML vào đây (dành cho người rành kỹ thuật).">${esc(htmlVal)}</textarea>
  <input type="hidden" id="${prefix}-mode" value="${html ? 'html' : 'text'}">`;
}
function readBody(prefix) {
  const mode = document.getElementById(`${prefix}-mode`).value;
  return document.getElementById(`${prefix}-${mode}`).value;
}
// Gắn xử lý chuyển tab Văn bản <-> HTML cho mọi trình soạn trong khung
function wireBodyEditors(box) {
  box.querySelectorAll('.body-tabs').forEach(tabs => {
    const prefix = tabs.dataset.prefix;
    const modeInput = document.getElementById(`${prefix}-mode`);
    const textArea = document.getElementById(`${prefix}-text`);
    const htmlArea = document.getElementById(`${prefix}-html`);
    tabs.querySelectorAll('.body-tab').forEach(btn => btn.onclick = () => {
      const to = btn.dataset.mode, from = modeInput.value;
      if (to === from) return;
      if (to === 'html') {
        htmlArea.value = plainToHtml(textArea.value); // văn bản -> HTML cơ bản
      } else {
        if (htmlArea.value.trim() && !confirm('Chuyển sang Văn bản? Định dạng HTML (màu sắc, cỡ chữ...) sẽ được giản lược thành văn bản thường.')) return;
        textArea.value = htmlToPlain(htmlArea.value); // HTML -> văn bản
      }
      modeInput.value = to;
      tabs.querySelectorAll('.body-tab').forEach(b => b.classList.toggle('active', b.dataset.mode === to));
      textArea.style.display = to === 'text' ? '' : 'none';
      htmlArea.style.display = to === 'html' ? '' : 'none';
    });
  });
}

function openModal(html) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="modal-bg"><div class="modal">${html}</div></div>`;
  root.querySelector('.modal-bg').addEventListener('click', e => { if (e.target.classList.contains('modal-bg')) closeModal(); });
  return root;
}
function closeModal() { document.getElementById('modal-root').innerHTML = ''; }

async function stopScanner() {
  if (scanner) { try { await scanner.stop(); scanner.clear(); } catch (e) {} scanner = null; }
}

// ============ Điều hướng ============
window.addEventListener('hashchange', route);

async function route() {
  await stopScanner();
  if (!USER) { renderLogin(); return; }
  const hash = location.hash || '#/events';
  const app = document.getElementById('app');
  app.innerHTML = shellHtml(hash);
  document.getElementById('btn-logout').onclick = async () => { await api('/logout', { method: 'POST' }); USER = null; location.hash = ''; route(); };
  const main = document.getElementById('main');
  const m = hash.match(/^#\/event\/(\d+)(?:\/(\w+))?/);
  if (m) return pageEventDetail(main, Number(m[1]), m[2]);
  if (hash.startsWith('#/members')) return pageMembers(main);
  if (hash.startsWith('#/smtp')) return pageSmtp(main);
  return pageEvents(main);
}

function shellHtml(hash) {
  const isManager = ['super_admin', 'admin'].includes(USER.role);
  return `
  <div class="topbar"><div class="topbar-inner">
    <div class="logo"><img src="misa-logo.jpg" alt="MISA"><span>MISA Event Check-in</span></div>
    <nav>
      <a href="#/events" class="${hash.startsWith('#/event') || hash === '' ? 'active' : ''}">Sự kiện</a>
      ${isManager ? `<a href="#/members" class="${hash.startsWith('#/members') ? 'active' : ''}">Thành viên</a>` : ''}
      ${isManager ? `<a href="#/smtp" class="${hash.startsWith('#/smtp') ? 'active' : ''}">Cấu hình Email</a>` : ''}
    </nav>
    <span class="user">${esc(USER.name)} · ${ROLE_NAMES[USER.role]}${USER.unit ? ' · ' + esc(USER.unit) : ''}</span>
    <button class="btn secondary small" id="btn-logout">Đăng xuất</button>
  </div></div>
  <div class="container" id="main"></div>`;
}

// ============ Đăng nhập ============
function renderLogin() {
  document.getElementById('app').innerHTML = `
  <div class="login-wrap"><div class="login-box">
    <img src="misa-logo.jpg" alt="MISA" style="width:130px;display:block;margin:0 auto 14px">
    <h1 style="text-align:center">MISA Event Check-in</h1>
    <p style="text-align:center">Đăng nhập để tiếp tục</p>
    <form id="login-form">
      <label>Email</label><input type="email" id="lg-email" required autocomplete="username">
      <label>Mật khẩu</label><input type="password" id="lg-pass" required autocomplete="current-password">
      <div class="error-msg" id="lg-err"></div>
      <button class="btn" style="width:100%;justify-content:center;margin-top:6px">Đăng nhập</button>
    </form>
  </div></div>`;
  document.getElementById('login-form').onsubmit = async (e) => {
    e.preventDefault();
    try {
      USER = await api('/login', { method: 'POST', body: { email: lgEmail(), password: document.getElementById('lg-pass').value } });
      OPTIONS = await api('/options');
      location.hash = '#/events'; route();
    } catch (err) { document.getElementById('lg-err').textContent = err.message; }
  };
  function lgEmail() { return document.getElementById('lg-email').value; }
}

// ============ Trang: Danh sách sự kiện ============
async function pageEvents(main) {
  const events = await api('/events');
  const canCreate = ['super_admin', 'admin'].includes(USER.role);
  const isStaff = USER.role === 'checkin';
  // Nhân viên: nếu CHỈ có đúng 1 sự kiện tổ chức HÔM NAY -> mở thẳng màn hình phù hợp vị trí
  if (isStaff) {
    const todays = events.filter(e => eventDayStatus(e) === 'today');
    if (todays.length === 1) { location.hash = '#/event/' + todays[0].id + '/' + defaultStaffTab(todays[0].my_staff_type); return; }
  }
  const emptyMsg = isStaff
    ? 'Bạn chưa được gán vào sự kiện nào. Hãy liên hệ quản trị viên để được thêm vào sự kiện (mở sự kiện → tab Nhân viên → tích chọn tên bạn → Lưu).'
    : 'Chưa có sự kiện nào.';
  main.innerHTML = `
  <div class="page-head"><h2>Sự kiện</h2>
    ${canCreate ? '<button class="btn" id="btn-new-event">+ Tạo sự kiện</button>' : ''}
  </div>
  ${isStaff && events.length ? '<div class="hint">📅 Bạn chỉ mở được sự kiện tổ chức <b>đúng ngày hôm nay</b>. Sự kiện chưa tới ngày hoặc đã kết thúc sẽ bị khoá.</div>' : ''}
  <div id="event-list">${events.length ? '' : `<div class="card muted">${emptyMsg}</div>`}</div>`;
  const list = document.getElementById('event-list');
  for (const ev of events) {
    const status = eventDayStatus(ev);
    // Quản lý (xem số liệu) không bị khoá theo ngày - xem được số đăng ký trước & sau sự kiện
    const locked = isStaff && status !== 'today' && ev.my_staff_type !== 'manager';
    const statusBadge = status === 'past' ? '<span class="badge gray">Đã kết thúc</span>'
      : status === 'future' ? '<span class="badge orange">Chưa tới ngày tổ chức</span>'
      : (isStaff ? '<span class="badge green">Đang diễn ra hôm nay</span>' : '');
    list.appendChild(el(`
    <div class="event-card" ${locked ? 'style="opacity:.6"' : ''}>
      <div>
        <div class="ev-name" ${locked ? '' : `data-id="${ev.id}"`}>${esc(ev.name)}</div>
        <div class="muted">🕒 ${fmtDate(ev.event_date)} · 👤 Trưởng BTC: ${esc(ev.organizer) || '—'}${ev.unit ? ' · 🏢 ' + esc(ev.unit) : ''}${isStaff ? '' : ' · Tạo bởi: ' + esc(ev.creator_name)}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        ${isStaff ? '' : `<span class="badge blue">${ev.total_attendees} đăng ký</span><span class="badge green">${ev.total_checkedin} đã check-in</span>`}
        ${statusBadge}
        ${locked ? '<button class="btn small secondary" disabled>🔒 Khoá</button>'
          : `<button class="btn small" data-open="${ev.id}">${isStaff ? (ev.my_staff_type === 'supervisor' ? '📝 Vào ghi chú' : ev.my_staff_type === 'reception' ? '🖨 Vào lễ tân' : ev.my_staff_type === 'manager' ? '📊 Xem số liệu' : '📷 Vào quét') : 'Mở'}</button>`}
      </div>
    </div>`));
  }
  list.querySelectorAll('[data-open],[data-id]').forEach(b => b.onclick = () => { location.hash = '#/event/' + (b.dataset.open || b.dataset.id); });
  const btnNew = document.getElementById('btn-new-event');
  if (btnNew) btnNew.onclick = () => eventFormModal(null, () => route());
}

function eventFormModal(ev, onSaved) {
  let curValues = [];
  try { curValues = JSON.parse(ev?.eligibility_values || '[]'); } catch (e) {}
  const fields = OPTIONS.eligibility_fields || {};
  openModal(`
    <h3>${ev ? 'Sửa sự kiện' : 'Tạo sự kiện mới'}</h3>
    <label>Tên sự kiện *</label><input id="ef-name" value="${esc(ev?.name || '')}">
    <label>Thời gian tổ chức *</label><input type="datetime-local" id="ef-date" value="${ev ? ev.event_date.slice(0, 16) : ''}">
    <label>Trưởng ban tổ chức</label><input id="ef-org" value="${esc(ev?.organizer || '')}">
    ${USER.role === 'super_admin' ? `<label>Đơn vị</label><input id="ef-unit" value="${esc(ev?.unit || '')}" placeholder="VD: Công ty X">` : ''}
    <div style="border:1px dashed var(--border);border-radius:10px;padding:12px;margin-top:14px">
      <b>🎯 Điều kiện đủ tham dự</b>
      <p class="muted" style="margin:4px 0 0">Người KHÔNG đạt điều kiện vẫn hiện trong danh sách nhưng bị khoá gửi email (gửi hàng loạt sẽ tự bỏ qua).</p>
      <label>Xét theo trường</label>
      <select id="ef-elig-field">
        <option value="">Không áp dụng - tất cả đều đủ điều kiện</option>
        ${Object.entries(fields).map(([k, f]) => `<option value="${k}" ${ev?.eligibility_field === k ? 'selected' : ''}>${f.label}</option>`).join('')}
      </select>
      <div id="ef-elig-values" style="margin-top:8px"></div>
    </div>
    <div class="error-msg" id="ef-err"></div>
    <div class="modal-actions">
      <button class="btn secondary" onclick="closeModal()">Huỷ</button>
      <button class="btn" id="ef-save">Lưu</button>
    </div>`);

  const valuesBox = document.getElementById('ef-elig-values');
  function renderValues() {
    const f = document.getElementById('ef-elig-field').value;
    if (!f || !fields[f]) { valuesBox.innerHTML = ''; return; }
    valuesBox.innerHTML = `<div class="muted" style="margin-bottom:4px">Tích các giá trị ĐƯỢC chấp nhận:</div>` +
      fields[f].options.map(o => `<label style="font-weight:normal;display:flex;align-items:center;gap:8px;margin:3px 0">
        <input type="checkbox" class="elig-cb" value="${esc(o)}" style="width:auto" ${curValues.includes(o) ? 'checked' : ''}>${esc(o)}</label>`).join('');
  }
  document.getElementById('ef-elig-field').onchange = renderValues;
  renderValues();

  document.getElementById('ef-save').onclick = async () => {
    try {
      const body = {
        name: document.getElementById('ef-name').value,
        event_date: document.getElementById('ef-date').value,
        organizer: document.getElementById('ef-org').value,
        eligibility_field: document.getElementById('ef-elig-field').value,
        eligibility_values: [...document.querySelectorAll('.elig-cb:checked')].map(c => c.value),
      };
      if (USER.role === 'super_admin') body.unit = document.getElementById('ef-unit').value;
      if (ev) await api('/events/' + ev.id, { method: 'PUT', body });
      else await api('/events', { method: 'POST', body });
      closeModal(); toast('Đã lưu sự kiện'); onSaved();
    } catch (e) { document.getElementById('ef-err').textContent = e.message; }
  };
}

// ============ Trang: Chi tiết sự kiện ============
async function pageEventDetail(main, id, tab) {
  let ev;
  try { ev = await api('/events/' + id); }
  catch (e) { main.innerHTML = `<div class="card">${esc(e.message)} <a href="#/events">← Quay lại</a></div>`; return; }

  const isCheckinStaff = USER.role === 'checkin';
  const staffType = isCheckinStaff ? (ev.my_position?.staff_type || 'checkin') : null;
  // Mục 3: nhân viên chỉ vào được sự kiện tổ chức ĐÚNG NGÀY hôm nay (Quản lý xem số liệu được miễn khoá)
  if (isCheckinStaff && staffType !== 'manager') {
    const st = eventDayStatus(ev);
    if (st !== 'today') {
      main.innerHTML = `
      <div class="page-head"><div>
        <a href="#/events" class="muted" style="text-decoration:none">← Tất cả sự kiện</a>
        <h2 style="margin-top:4px">${esc(ev.name)}</h2>
        <div class="muted">🕒 ${fmtDate(ev.event_date)}</div>
      </div></div>
      <div class="card" style="text-align:center;padding:40px 20px">
        <div style="font-size:42px">🔒</div>
        <h3 style="margin:10px 0">${st === 'future' ? 'Sự kiện chưa tới ngày tổ chức' : 'Sự kiện đã kết thúc'}</h3>
        <p class="muted">Chỉ có thể quét mã vào <b>đúng ngày tổ chức</b> sự kiện.${st === 'future' ? ' Vui lòng quay lại đúng ngày diễn ra.' : ''}</p>
        <a class="btn" href="#/events" style="margin-top:14px">← Về danh sách sự kiện</a>
      </div>`;
      return;
    }
  }
  let tabs;
  if (staffType === 'supervisor') {
    tab = tab || 'monitor';
    tabs = [['monitor', '📝 Ghi chú booth']];
  } else if (staffType === 'manager') {
    tab = tab || 'dashboard';
    tabs = [['dashboard', '📊 Số liệu']];
  } else if (staffType === 'reception') {
    tab = tab || 'scan';
    tabs = [['scan', '📷 Quét & Check-in'], ['reception', '🖨 Danh sách & In QR']];
  } else if (isCheckinStaff) {
    tab = tab || 'scan';
    tabs = [['scan', '📷 Quét QR'], ['attendees', '✅ Đã check-in']];
  } else {
    tab = tab || 'attendees';
    tabs = [['attendees', '👥 Người tham dự'], ['scan', '📷 Quét QR'], ['booths', '🧭 Booth'], ['email', '✉️ Email'], ['report', '📊 Báo cáo'], ['staff', '🧑‍💼 Nhân viên']];
  }

  main.innerHTML = `
  <div class="page-head">
    <div>
      <a href="#/events" class="muted" style="text-decoration:none">← Tất cả sự kiện</a>
      <h2 style="margin-top:4px">${esc(ev.name)}</h2>
      <div class="muted">🕒 ${fmtDate(ev.event_date)} · 👤 Trưởng BTC: ${esc(ev.organizer) || '—'}${ev.unit ? ' · 🏢 ' + esc(ev.unit) : ''}</div>
    </div>
    ${ev.can_manage ? `<div style="display:flex;gap:8px">
      <button class="btn secondary" id="btn-edit-ev">✏️ Sửa</button>
      <button class="btn danger" id="btn-del-ev">Xoá</button></div>` : ''}
  </div>
  <div class="tabs">${tabs.map(([k, label]) => `<button data-tab="${k}" class="${k === tab ? 'active' : ''}">${label}</button>`).join('')}</div>
  <div id="tab-content"></div>`;

  if (ev.can_manage) {
    document.getElementById('btn-edit-ev').onclick = () => eventFormModal(ev, () => pageEventDetail(main, id, tab));
    document.getElementById('btn-del-ev').onclick = async () => {
      if (!confirm(`Xoá sự kiện "${ev.name}" và toàn bộ danh sách tham dự?`)) return;
      await api('/events/' + id, { method: 'DELETE' });
      toast('Đã xoá sự kiện'); location.hash = '#/events';
    };
  }
  main.querySelectorAll('[data-tab]').forEach(b => b.onclick = async () => { await stopScanner(); location.hash = `#/event/${id}/${b.dataset.tab}`; });

  const content = document.getElementById('tab-content');
  if (tab === 'attendees') tabAttendees(content, ev);
  else if (tab === 'scan') tabScan(content, ev);
  else if (tab === 'reception') tabReception(content, ev);
  else if (tab === 'monitor') tabMonitor(content, ev);
  else if (tab === 'dashboard') tabManager(content, ev);
  else if (tab === 'booths') tabBooths(content, ev);
  else if (tab === 'email') tabEmail(content, ev);
  else if (tab === 'report') tabReport(content, ev);
  else if (tab === 'staff') tabStaff(content, ev);
}

// ----- Tab: Booth (hành trình quét QR) -----
async function tabBooths(box, ev) {
  ev = await api('/events/' + ev.id);
  // Nhóm nhân viên theo vị trí được gán
  const staffByBooth = {};
  const typeTag = t => t === 'reception' ? ' (Lễ tân in QR)' : t === 'supervisor' ? ' (Giám sát)' : t === 'manager' ? ' (Quản lý)' : '';
  for (const s of (ev.staff || [])) { const k = s.booth_id || 0; (staffByBooth[k] = staffByBooth[k] || []).push(s.name + typeTag(s.staff_type)); }
  const gateStaff = staffByBooth[0] || [];
  box.innerHTML = `
  <div class="card" style="max-width:680px">
    <h3>🧭 Hành trình booth của sự kiện</h3>
    <p class="muted" style="margin:6px 0 14px">Tạo danh sách các booth/gian hàng. Mỗi nhân viên được gán đứng tại 1 vị trí ở tab <b>Nhân viên</b> — khi họ mở tab <b>Quét QR</b>, hệ thống tự khoá đúng vị trí. Chỉ nhân viên được gán đúng booth quét mới ghi nhận lượt ghé vào <b>Báo cáo</b>.</p>
    <div style="padding:8px 10px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;margin-bottom:10px">
      🚪 <b>Cổng check-in</b> — Nhân viên: ${gateStaff.length ? gateStaff.map(esc).join(', ') : '<span class="muted">chưa gán ai</span>'}
    </div>
    <div id="booth-list">
      ${ev.booths.length ? ev.booths.map((b, i) => `
        <div style="display:flex;align-items:center;gap:10px;padding:10px 8px;border-bottom:1px solid var(--border)">
          <span class="badge blue">${i + 1}</span>
          <div style="flex:1"><b>${esc(b.name)}</b><br>
            <span class="muted">👤 Nhân viên: ${(staffByBooth[b.id] || []).length ? (staffByBooth[b.id]).map(esc).join(', ') : 'chưa gán ai'}</span>
          </div>
          ${ev.can_manage ? `<button class="btn small danger" data-delbooth="${b.id}">✕</button>` : ''}
        </div>`).join('') : '<p class="muted">Chưa có booth nào.</p>'}
    </div>
    ${ev.can_manage ? `
    <div style="display:flex;gap:8px;margin-top:14px">
      <input id="booth-name" placeholder="Tên booth mới, VD: Booth AI - MISA AMIS">
      <button class="btn" id="booth-add">+ Thêm</button>
    </div>` : ''}
  </div>`;
  if (!ev.can_manage) return;
  document.getElementById('booth-add').onclick = async () => {
    const name = document.getElementById('booth-name').value.trim();
    if (!name) return;
    try { await api(`/events/${ev.id}/booths`, { method: 'POST', body: { name } }); tabBooths(box, ev); }
    catch (e) { toast('Lỗi: ' + e.message); }
  };
  document.getElementById('booth-name').onkeydown = e => { if (e.key === 'Enter') document.getElementById('booth-add').click(); };
  box.querySelectorAll('[data-delbooth]').forEach(b => b.onclick = async () => {
    if (!confirm('Xoá booth này? Lịch sử quét tại booth cũng sẽ bị xoá.')) return;
    await api('/booths/' + b.dataset.delbooth, { method: 'DELETE' });
    tabBooths(box, ev);
  });
}

// ----- Tab: Người tham dự -----
async function tabAttendees(box, ev) {
  const allRows = await api(`/events/${ev.id}/attendees`);
  const isCheckinStaff = USER.role === 'checkin';
  const unsent = allRows.filter(r => !r.confirm_email_sent_at && r.email && r.eligible).length;
  const ineligible = allRows.filter(r => !r.eligible).length;
  const selected = new Set(); // id những người được tick chọn

  const impBadge = (imp) => {
    const cls = { 'VIP': 'orange', 'VVIP': 'red', 'Speaker': 'blue', 'Ban lãnh đạo': 'red', 'Ban Tổ chức': 'blue' }[imp] || 'gray';
    return `<span class="badge ${cls}">${esc(imp || 'Bình thường')}</span>`;
  };

  box.innerHTML = `
  ${ev.can_manage ? `<div class="toolbar">
    <button class="btn" id="btn-add-att">+ Thêm người</button>
    <a class="btn secondary" href="/api/attendees/template" download>⬇ Tải file Excel mẫu</a>
    <button class="btn secondary" id="btn-import-att">⬆ Tải lên danh sách Excel</button>
    <input type="file" id="file-att" accept=".xlsx,.xls" style="display:none">
    <button class="btn green" id="btn-send-all" ${unsent ? '' : 'disabled'}>✉️ Gửi email QR cho người chưa nhận (${unsent})</button>
  </div>` : ''}
  <div class="toolbar">
    <input id="at-search" placeholder="🔍 Tìm theo tên, công ty, SĐT, email...">
    <select id="at-imp"><option value="">Tất cả mức độ</option>${OPTIONS.importances.map(i => `<option>${i}</option>`).join('')}</select>
    <select id="at-pos"><option value="">Tất cả chức vụ</option>${OPTIONS.positions.map(p => `<option>${p}</option>`).join('')}</select>
    <select id="at-size"><option value="">Tất cả quy mô</option>${OPTIONS.company_sizes.map(s => `<option>${s}</option>`).join('')}</select>
    <select id="at-status"><option value="">Tất cả trạng thái</option><option value="in">Đã check-in</option><option value="out">Chưa check-in</option></select>
  </div>
  ${ev.can_manage ? `<div id="at-bulk" style="display:none;align-items:center;gap:10px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:10px 14px;margin-bottom:12px">
    <span>Đã chọn <b id="at-selcount">0</b> người</span>
    <button class="btn green small" id="at-bulk-send">✉️ Gửi email cho người đã chọn</button>
    <button class="btn secondary small" id="at-bulk-clear">Bỏ chọn</button>
  </div>` : ''}
  <div class="muted" id="at-count" style="margin-bottom:10px"></div>
  <div class="table-wrap"><table><thead><tr>
    ${ev.can_manage ? '<th style="width:34px"><input type="checkbox" id="at-all" style="width:auto" title="Chọn tất cả đang hiển thị"></th>' : ''}
    <th>Họ và tên</th><th>Mức độ</th><th>Email</th><th>SĐT</th><th>Chức vụ</th><th>Công ty</th><th>Quy mô</th><th>Check-in</th><th>Email xác nhận</th><th></th>
  </tr></thead><tbody id="att-body"></tbody></table></div>`;

  const colspan = ev.can_manage ? 11 : 10;
  const body = document.getElementById('att-body');

  function filtered() {
    const q = document.getElementById('at-search').value.trim().toLowerCase();
    const imp = document.getElementById('at-imp').value;
    const pos = document.getElementById('at-pos').value;
    const size = document.getElementById('at-size').value;
    const st = document.getElementById('at-status').value;
    return allRows.filter(r =>
      (!q || (r.name + ' ' + r.company + ' ' + r.phone + ' ' + r.email).toLowerCase().includes(q)) &&
      (!imp || r.importance === imp) && (!pos || r.position === pos) && (!size || r.company_size === size) &&
      (!st || (st === 'in' ? r.checked_in_at : !r.checked_in_at)));
  }

  function updateBulkBar() {
    if (!ev.can_manage) return;
    const bar = document.getElementById('at-bulk');
    document.getElementById('at-selcount').textContent = selected.size;
    bar.style.display = selected.size ? 'flex' : 'none';
  }

  function renderRows() {
    const rows = filtered();
    document.getElementById('at-count').innerHTML =
      `Hiển thị <b>${rows.length}</b> / tổng <b>${allRows.length}</b> người${ineligible ? ` · <span style="color:var(--red)"><b>${ineligible}</b> người không đủ điều kiện</span>` : ''}`;
    if (!rows.length) { body.innerHTML = `<tr><td colspan="${colspan}" class="muted">Không có ai phù hợp.</td></tr>`; updateBulkBar(); return; }
    body.innerHTML = rows.map(r => `<tr ${r.eligible ? '' : 'style="background:#fef2f2"'}>
      ${ev.can_manage ? `<td><input type="checkbox" class="at-cb" value="${r.id}" style="width:auto" ${selected.has(r.id) ? 'checked' : ''} ${r.email && r.eligible ? '' : 'disabled title="Không có email hoặc không đủ điều kiện"'}></td>` : ''}
      <td><b>${esc((r.salutation ? r.salutation + ' ' : '') + r.name)}</b>${r.is_walkin ? ' <span class="badge orange">Vãng lai</span>' : ''}${r.eligible ? '' : ' <span class="badge red">Không đủ ĐK</span>'}</td>
      <td>${impBadge(r.importance)}</td>
      <td>${esc(r.email)}</td><td>${esc(r.phone)}</td><td>${esc(r.position)}</td><td>${esc(r.company)}</td>
      <td>${esc(r.company_size)}</td>
      <td>${r.checked_in_at ? `<span class="badge green">✓ ${fmtDate(r.checked_in_at, true)}</span>` : '<span class="badge gray">Chưa</span>'}</td>
      <td style="white-space:nowrap">${r.confirm_email_sent_at ? '<span class="badge green">Đã gửi</span>' : '<span class="badge gray">Chưa gửi</span>'}
        ${ev.can_manage && r.email ? `<button class="btn small ${r.confirm_email_sent_at ? 'secondary' : 'green'}" data-mail="${r.id}" ${r.eligible ? '' : 'disabled title="Không đủ điều kiện tham dự"'}>${r.confirm_email_sent_at ? 'Gửi lại' : 'Gửi email'}</button>` : ''}</td>
      <td style="white-space:nowrap">${ev.can_manage ? `
        <button class="btn small secondary" data-edit="${r.id}" title="Sửa thông tin">✏️</button>
        <button class="btn small secondary" data-qr="${r.id}" title="Xem mã QR">QR</button>
        <button class="btn small danger" data-del="${r.id}" title="Xoá">✕</button>` : ''}</td>
    </tr>`).join('');

    body.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => attendeeFormModal(ev, () => tabAttendees(box, ev), allRows.find(x => x.id == b.dataset.edit)));
    body.querySelectorAll('[data-qr]').forEach(b => b.onclick = () => {
      const r = allRows.find(x => x.id == b.dataset.qr);
      openModal(`<h3>Mã QR của ${esc(r.name)}</h3>
        <div style="text-align:center"><img src="/api/attendees/${r.id}/qr.png" style="width:240px"><br><code>${esc(r.qr_token)}</code></div>
        <div class="modal-actions"><button class="btn" onclick="closeModal()">Đóng</button></div>`);
    });
    body.querySelectorAll('[data-mail]').forEach(b => b.onclick = async () => {
      b.disabled = true;
      try { await api(`/attendees/${b.dataset.mail}/send-email`, { method: 'POST' }); toast('Đã gửi email kèm mã QR'); tabAttendees(box, ev); }
      catch (e) { toast('Lỗi: ' + e.message); b.disabled = false; }
    });
    body.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      if (!confirm('Xoá người này khỏi danh sách?')) return;
      await api('/attendees/' + b.dataset.del, { method: 'DELETE' });
      tabAttendees(box, ev);
    });
    if (ev.can_manage) {
      body.querySelectorAll('.at-cb').forEach(cb => cb.onchange = () => {
        if (cb.checked) selected.add(Number(cb.value)); else selected.delete(Number(cb.value));
        updateBulkBar();
        const boxes = [...body.querySelectorAll('.at-cb:not(:disabled)')];
        document.getElementById('at-all').checked = boxes.length && boxes.every(c => c.checked);
      });
    }
    updateBulkBar();
    if (ev.can_manage) document.getElementById('at-all').checked = false;
  }

  ['at-search', 'at-imp', 'at-pos', 'at-size', 'at-status'].forEach(id => document.getElementById(id).oninput = renderRows);
  renderRows();

  if (!ev.can_manage) return;

  document.getElementById('at-all').onchange = (e) => {
    body.querySelectorAll('.at-cb:not(:disabled)').forEach(cb => {
      cb.checked = e.target.checked;
      if (e.target.checked) selected.add(Number(cb.value)); else selected.delete(Number(cb.value));
    });
    updateBulkBar();
  };
  document.getElementById('at-bulk-clear').onclick = () => { selected.clear(); renderRows(); };
  document.getElementById('at-bulk-send').onclick = async (e) => {
    const ids = [...selected];
    if (!ids.length) return;
    if (!confirm(`Gửi email QR cho ${ids.length} người đã chọn?`)) return;
    e.target.disabled = true; e.target.textContent = 'Đang gửi...';
    try {
      const r = await api(`/events/${ev.id}/send-emails`, { method: 'POST', body: { ids } });
      let msg = `Đã gửi ${r.sent} email.`;
      if (r.skipped) msg += `\nBỏ qua ${r.skipped} người (không email/không đủ điều kiện).`;
      if (r.errors.length) msg += '\nLỗi:\n' + r.errors.slice(0, 5).join('\n');
      alert(msg);
    } catch (err) { alert('Lỗi: ' + err.message); }
    tabAttendees(box, ev);
  };

  document.getElementById('btn-add-att').onclick = () => attendeeFormModal(ev, () => tabAttendees(box, ev));
  const fileInput = document.getElementById('file-att');
  document.getElementById('btn-import-att').onclick = () => fileInput.click();
  fileInput.onchange = async () => {
    if (!fileInput.files[0]) return;
    const fd = new FormData(); fd.append('file', fileInput.files[0]);
    try {
      const r = await api(`/events/${ev.id}/attendees/import`, { method: 'POST', body: fd });
      let msg = `Đã thêm ${r.added} người.`;
      if (r.auto_email) msg += ' Đang tự động gửi email QR...';
      if (r.errors.length) msg += `\n${r.errors.length} dòng bị bỏ qua:\n` + r.errors.slice(0, 8).join('\n');
      alert(msg);
      tabAttendees(box, ev);
    } catch (e) { toast('Lỗi: ' + e.message); }
    fileInput.value = '';
  };
  document.getElementById('btn-send-all').onclick = async (e) => {
    e.target.disabled = true; e.target.textContent = 'Đang gửi...';
    try {
      const r = await api(`/events/${ev.id}/send-all-emails`, { method: 'POST' });
      let msg = `Đã gửi ${r.sent}/${r.total} email.`;
      if (r.skipped) msg += `\nĐã bỏ qua ${r.skipped} người không đủ điều kiện tham dự.`;
      if (r.errors.length) msg += '\nLỗi:\n' + r.errors.slice(0, 5).join('\n');
      alert(msg); tabAttendees(box, ev);
    } catch (err) { alert('Lỗi: ' + err.message); tabAttendees(box, ev); }
  };
}

function attendeeFields(prefix, data = {}) {
  return `
  <div class="row2">
    <div><label>Xưng hô</label><select id="${prefix}-salu"><option value="">-- Chọn --</option>
      ${OPTIONS.salutations.map(s => `<option ${data.salutation === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
    <div><label>Họ và tên *</label><input id="${prefix}-name" value="${esc(data.name || '')}"></div>
    <div><label>Email</label><input id="${prefix}-email" value="${esc(data.email || '')}"></div>
    <div><label>Số điện thoại</label><input id="${prefix}-phone" value="${esc(data.phone || '')}"></div>
    <div><label>Chức vụ</label><select id="${prefix}-pos"><option value="">-- Chọn --</option>
      ${OPTIONS.positions.map(p => `<option ${data.position === p ? 'selected' : ''}>${p}</option>`).join('')}</select></div>
    <div><label>Mức độ quan trọng</label><select id="${prefix}-imp">
      ${OPTIONS.importances.map(i => `<option ${(data.importance || 'Bình thường') === i ? 'selected' : ''}>${i}</option>`).join('')}</select></div>
    <div><label>Nơi công tác/Tên công ty</label><input id="${prefix}-company" value="${esc(data.company || '')}"></div>
    <div><label>MST công ty</label><input id="${prefix}-tax" value="${esc(data.tax_code || '')}"></div>
  </div>
  <label>Quy mô nhân sự công ty</label><select id="${prefix}-size"><option value="">-- Chọn --</option>
    ${OPTIONS.company_sizes.map(s => `<option ${data.company_size === s ? 'selected' : ''}>${s}</option>`).join('')}</select>`;
}
function readAttendeeFields(prefix) {
  const g = id => document.getElementById(`${prefix}-${id}`).value;
  return { name: g('name'), email: g('email'), phone: g('phone'), position: g('pos'), company: g('company'),
    tax_code: g('tax'), company_size: g('size'), salutation: g('salu'), importance: g('imp') };
}

// Form thêm mới HOẶC chỉnh sửa người tham dự (truyền attendee để sửa)
function attendeeFormModal(ev, onSaved, attendee = null) {
  openModal(`<h3>${attendee ? 'Sửa thông tin: ' + esc(attendee.name) : 'Thêm người tham dự'}</h3>${attendeeFields('af', attendee || {})}
    <div class="error-msg" id="af-err"></div>
    <div class="modal-actions"><button class="btn secondary" onclick="closeModal()">Huỷ</button>
    <button class="btn" id="af-save">${attendee ? 'Lưu thay đổi' : 'Thêm'}</button></div>`);
  document.getElementById('af-save').onclick = async () => {
    const body = readAttendeeFields('af');
    const send = (extra = {}) => attendee
      ? api(`/attendees/${attendee.id}`, { method: 'PUT', body: { ...body, ...extra } })
      : api(`/events/${ev.id}/attendees`, { method: 'POST', body: { ...body, ...extra } });
    try {
      await send();
      closeModal(); toast(attendee ? 'Đã lưu thay đổi' : 'Đã thêm người tham dự'); onSaved();
    } catch (e) {
      if (e.data && e.data.duplicate) {
        if (confirm(e.message)) {
          await send({ force: true });
          closeModal(); toast('Đã lưu (trùng SĐT)'); onSaved();
        }
      } else document.getElementById('af-err').textContent = e.message;
    }
  };
}

// In tem QR khổ nhỏ (máy in nhiệt PD304) - chỉ gồm QR + danh xưng + họ tên + nơi công tác
// Khổ tem mặc định 50×30mm; đổi LABEL_W/LABEL_H nếu dùng khổ khác.
function printQr(r, evName) {
  const LABEL_W = '50mm', LABEL_H = '30mm';
  const fullName = (r.salutation ? r.salutation + ' ' : '') + r.name;
  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Tem QR</title>
    <style>
      @page { size: ${LABEL_W} ${LABEL_H}; margin: 0; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: ${LABEL_W}; }
      .label { width: ${LABEL_W}; height: ${LABEL_H}; padding: 1mm 1.5mm; text-align: center;
        display: flex; flex-direction: column; align-items: center; justify-content: center; font-family: Arial, sans-serif; }
      .label img { width: 18mm; height: 18mm; }
      .nm { font-size: 9px; font-weight: bold; line-height: 1.1; margin-top: 0.6mm; }
      .co { font-size: 7.5px; color: #222; line-height: 1.05; margin-top: 0.3mm; }
    </style></head>
    <body>
      <div class="label">
        <img src="/api/attendees/${r.id}/qr.png" onload="setTimeout(()=>{window.print();},250)">
        <div class="nm">${esc(fullName)}</div>
        ${r.company ? `<div class="co">${esc(r.company)}</div>` : ''}
      </div>
    </body></html>`);
  w.document.close();
}

// ----- Tab: Lễ tân in QR (xem toàn bộ khách, tra cứu & in tem QR) -----
async function tabReception(box, ev) {
  const allRows = await api(`/events/${ev.id}/attendees`); // lễ tân nhận TOÀN BỘ danh sách
  box.innerHTML = `
  <div class="hint">🖨 Máy tính này nối với máy in tem. Tìm khách trong danh sách rồi bấm <b>In QR</b> để in đúng mã của khách. Khách chưa đăng ký trước: bấm <b>+ Khách vãng lai</b> để thêm nhanh và in luôn.</div>
  <div class="toolbar">
    <input id="rc-search" placeholder="🔍 Tìm theo tên, công ty, SĐT, email..." style="flex:1;min-width:220px">
    <button class="btn green" id="rc-walkin">+ Khách vãng lai</button>
  </div>
  <div class="muted" id="rc-count" style="margin-bottom:10px"></div>
  <div class="table-wrap"><table><thead><tr>
    <th>Họ và tên</th><th>Công ty</th><th>Chức vụ</th><th>Check-in</th><th></th>
  </tr></thead><tbody id="rc-body"></tbody></table></div>`;

  const body = document.getElementById('rc-body');
  function filtered() {
    const q = document.getElementById('rc-search').value.trim().toLowerCase();
    return allRows.filter(r => !q || (r.name + ' ' + r.company + ' ' + r.phone + ' ' + r.email).toLowerCase().includes(q));
  }
  function render() {
    const rows = filtered();
    document.getElementById('rc-count').innerHTML = `Hiển thị <b>${rows.length}</b> / tổng <b>${allRows.length}</b> khách`;
    body.innerHTML = rows.length ? rows.map(r => `<tr>
      <td><b>${esc((r.salutation ? r.salutation + ' ' : '') + r.name)}</b>${r.is_walkin ? ' <span class="badge orange">Vãng lai</span>' : ''}</td>
      <td>${esc(r.company)}</td><td>${esc(r.position)}</td>
      <td>${r.checked_in_at ? `<span class="badge green">✓ ${fmtDate(r.checked_in_at, true)}</span>` : '<span class="badge gray">Chưa</span>'}</td>
      <td style="white-space:nowrap">
        ${r.checked_in_at ? '' : `<button class="btn small green" data-checkin="${r.id}" title="Xác nhận khách đã đến">Check-in</button>`}
        <button class="btn small secondary" data-print="${r.id}" title="In tem QR cho khách">🖨 In QR</button>
      </td></tr>`).join('') : `<tr><td colspan="5" class="muted">Không có khách phù hợp.</td></tr>`;
    body.querySelectorAll('[data-print]').forEach(b => b.onclick = () => printQr(allRows.find(x => x.id == b.dataset.print), ev.name));
    body.querySelectorAll('[data-checkin]').forEach(b => b.onclick = async () => {
      b.disabled = true;
      try { await api(`/events/${ev.id}/checkin/${b.dataset.checkin}`, { method: 'POST' }); toast('Đã check-in'); tabReception(box, ev); }
      catch (e) { toast('Lỗi: ' + e.message); b.disabled = false; }
    });
  }
  document.getElementById('rc-search').oninput = render;
  render();

  document.getElementById('rc-walkin').onclick = () => {
    openModal(`<h3>Thêm khách vãng lai</h3>
      <p class="muted">Khách chưa đăng ký trước - sẽ được check-in ngay. Sau khi thêm sẽ tự mở cửa sổ in tem QR.</p>
      ${attendeeFields('rcwi')}
      <div class="error-msg" id="rcwi-err"></div>
      <div class="modal-actions"><button class="btn secondary" onclick="closeModal()">Huỷ</button>
      <button class="btn green" id="rcwi-save">Thêm & In QR</button></div>`);
    document.getElementById('rcwi-save').onclick = async () => {
      try {
        const fields = readAttendeeFields('rcwi');
        const r = await api(`/events/${ev.id}/walkin`, { method: 'POST', body: { ...fields, booth_id: null } });
        closeModal(); toast('Đã thêm khách vãng lai & check-in');
        printQr({ id: r.id, ...fields }, ev.name); // in luôn tem QR của khách mới
        tabReception(box, ev);
      } catch (e) { document.getElementById('rcwi-err').textContent = e.message; }
    };
  };
}

// ----- Tab: Giám sát booth (xem khách đã ghé + ghi chú nhu cầu đặc biệt) -----
async function tabMonitor(box, ev) {
  let data;
  try { data = await api(`/events/${ev.id}/booth-monitor`); }
  catch (e) { box.innerHTML = `<div class="card muted">${esc(e.message)}</div>`; return; }
  if (!data.booth) { box.innerHTML = '<div class="card muted">Bạn chưa được gán vào booth nào để giám sát. Hãy liên hệ quản trị viên.</div>'; return; }

  box.innerHTML = `
  <div class="card" style="background:#eff6ff;border:1px solid #bfdbfe">
    <b>🧭 Booth phụ trách: ${esc(data.booth.name)}</b>
    <p class="muted" style="margin:4px 0 0">Danh sách khách đã ghé booth này. Ghi chú nhu cầu/quan tâm đặc biệt của từng khách rồi bấm <b>Lưu</b>. Ghi chú sẽ tổng hợp về Báo cáo chung.</p>
  </div>
  <div class="toolbar"><input id="mo-search" placeholder="🔍 Tìm khách theo tên, công ty..." style="flex:1;min-width:220px">
    <button class="btn secondary" id="mo-refresh">🔄 Tải lại</button></div>
  <div class="muted" id="mo-count" style="margin-bottom:10px"></div>
  <div id="mo-list"></div>`;

  const list = document.getElementById('mo-list');
  function filtered() {
    const q = document.getElementById('mo-search').value.trim().toLowerCase();
    return data.rows.filter(r => !q || (r.name + ' ' + (r.company || '') + ' ' + (r.position || '')).toLowerCase().includes(q));
  }
  function render() {
    const rows = filtered();
    document.getElementById('mo-count').innerHTML = `Có <b>${rows.length}</b> / ${data.rows.length} khách đã ghé booth`;
    if (!rows.length) { list.innerHTML = '<div class="card muted">Chưa có khách nào ghé booth này (khách xuất hiện sau khi được quét QR tại booth).</div>'; return; }
    list.innerHTML = rows.map(r => `
      <div class="card" style="padding:14px" data-card="${r.id}">
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap">
          <b style="font-size:16px">${esc((r.salutation ? r.salutation + ' ' : '') + r.name)}</b>
          <span class="muted" style="font-size:13px">🕒 ${fmtDate(r.visited_at, true)}</span>
        </div>
        <div class="muted" style="margin:2px 0 8px">${esc(r.position) || '—'}${r.company ? ' · ' + esc(r.company) : ''}</div>
        <textarea class="mo-note" data-id="${r.id}" rows="2" placeholder="Ghi chú nhu cầu / quan tâm đặc biệt của khách..." style="width:100%">${esc(r.note || '')}</textarea>
        <div style="display:flex;gap:8px;margin-top:8px;align-items:center">
          <button class="btn small green" data-save="${r.id}">💾 Lưu ghi chú</button>
          <span class="muted mo-status" data-status="${r.id}"></span>
        </div>
      </div>`).join('');
    list.querySelectorAll('[data-save]').forEach(b => b.onclick = async () => {
      const id = b.dataset.save;
      const note = list.querySelector(`.mo-note[data-id="${id}"]`).value;
      const status = list.querySelector(`.mo-status[data-status="${id}"]`);
      b.disabled = true; status.textContent = 'Đang lưu...';
      try {
        await api(`/events/${ev.id}/booth-note`, { method: 'PUT', body: { attendee_id: Number(id), note } });
        const row = data.rows.find(x => x.id == id); if (row) row.note = note.trim();
        status.textContent = '✓ Đã lưu'; status.style.color = 'var(--green)';
      } catch (e) { status.textContent = 'Lỗi: ' + e.message; status.style.color = 'var(--red)'; }
      b.disabled = false;
    });
  }
  document.getElementById('mo-search').oninput = render;
  document.getElementById('mo-refresh').onclick = () => tabMonitor(box, ev);
  render();
}

// ----- Tab: Quản lý (bảng số liệu tổng hợp, chỉ xem) -----
async function tabManager(box, ev) {
  const st = await api(`/events/${ev.id}/stats`);
  const data = st.data;
  const pct = (n, d) => d ? Math.round(n / d * 100) : 0;

  // Nhóm điều kiện lọc, mỗi giá trị là 1 "chip" bấm để bật/tắt (dễ chạm trên điện thoại)
  const chipGroup = (dim, label, options) => `
    <div class="mg-group-title">${label}</div>
    <div class="mg-chips">
      ${options.map(o => `<span class="mg-chip" data-dim="${dim}" data-val="${esc(String(o.value))}">${esc(o.label)}</span>`).join('')}
    </div>`;

  box.innerHTML = `
  <div class="card mg-hero">
    <div id="mg-scope"></div>
    <div class="big" id="mg-rate">0%</div>
    <div class="sub" id="mg-headline"></div>
    <div class="mg-bar"><span id="mg-progress" style="width:0%"></span></div>
    <div class="mini" id="mg-mini"></div>
  </div>

  <div class="card">
    <button class="mg-acc-toggle" id="mg-acc-toggle">
      <span>🔎 Bộ lọc<span class="mg-filter-count" id="mg-fcount" style="display:none">0</span></span>
      <span class="chev">▾</span>
    </button>
    <div class="mg-acc-body" id="mg-acc-body">
      ${chipGroup('importance', 'Mức độ', st.importances.map(v => ({ value: v, label: v })))}
      ${chipGroup('position', 'Chức vụ', st.positions.map(v => ({ value: v, label: v })))}
      ${chipGroup('company_size', 'Quy mô nhân sự', st.company_sizes.map(v => ({ value: v, label: v })))}
      ${st.booths.length ? chipGroup('booth', 'Đã ghé booth', st.booths.map(b => ({ value: b.id, label: b.name }))) : ''}
      <button class="btn secondary small" id="mg-clear" style="margin-top:16px">✕ Xoá tất cả lọc</button>
    </div>
  </div>

  <div class="card">
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px">
      <b style="font-size:15px">📋 Tỷ trọng theo</b>
      <select id="mg-dim" style="width:auto;min-width:150px;flex:1">
        <option value="importance">Mức độ</option>
        <option value="position">Chức vụ</option>
        <option value="company_size">Quy mô nhân sự</option>
        ${st.booths.length ? '<option value="booth">Từng booth</option>' : ''}
      </select>
    </div>
    <div id="mg-breakdown"></div>
  </div>`;

  function readFilters() {
    const f = { importance: new Set(), position: new Set(), company_size: new Set(), booth: new Set() };
    box.querySelectorAll('.mg-chip.on').forEach(c => {
      const dim = c.dataset.dim;
      f[dim].add(dim === 'booth' ? Number(c.dataset.val) : c.dataset.val);
    });
    return f;
  }
  function matches(d, f) {
    if (f.importance.size && !f.importance.has(d.importance)) return false;
    if (f.position.size && !f.position.has(d.position)) return false;
    if (f.company_size.size && !f.company_size.has(d.company_size)) return false;
    if (f.booth.size && !d.booths.some(id => f.booth.has(id))) return false;
    return true;
  }
  // Mô tả bộ lọc đang chọn thành chữ ngắn (VD: "VIP · Booth AMIS HRM")
  function filterSummary(f) {
    const parts = [];
    for (const dim of ['importance', 'position', 'company_size']) if (f[dim].size) parts.push([...f[dim]].join(', '));
    if (f.booth.size) parts.push([...f.booth].map(id => (st.booths.find(b => b.id === id) || {}).name).filter(Boolean).join(', '));
    return parts.join(' · ');
  }

  function render() {
    const f = readFilters();
    const anyFilter = f.importance.size || f.position.size || f.company_size.size || f.booth.size;
    const regAll = data.length, attAll = data.filter(d => d.checked_in).length;
    const scope = anyFilter ? data.filter(d => matches(d, f)) : data;
    const reg = scope.length, att = scope.filter(d => d.checked_in).length, walk = scope.filter(d => d.is_walkin).length;

    // Ô chính (hero): tỷ lệ đến của phạm vi đang xem (toàn bộ hoặc theo lọc)
    document.getElementById('mg-scope').innerHTML = anyFilter
      ? `<span class="mg-scope">Đang lọc: ${esc(filterSummary(f))}</span>`
      : `<span class="mg-scope">Toàn sự kiện</span>`;
    document.getElementById('mg-rate').textContent = pct(att, reg) + '%';
    document.getElementById('mg-progress').style.width = pct(att, reg) + '%';
    document.getElementById('mg-headline').innerHTML = `Đã đến <b>${att}</b> / <b>${reg}</b> khách${anyFilter ? ' (khớp lọc)' : ' đăng ký'}`;
    document.getElementById('mg-mini').textContent = anyFilter
      ? `Chưa đến: ${reg - att} · Vãng lai: ${walk} · Chiếm ${pct(reg, regAll)}% tổng ĐK, ${pct(att, attAll)}% tổng đã đến`
      : `Chưa đến: ${reg - att} · Khách vãng lai: ${walk}`;

    // Số điều kiện đang chọn (hiện trên nút Bộ lọc)
    const nSel = f.importance.size + f.position.size + f.company_size.size + f.booth.size;
    const fcount = document.getElementById('mg-fcount');
    fcount.textContent = nSel; fcount.style.display = nSel ? 'inline-block' : 'none';

    // Tỷ trọng theo chiều được chọn (tôn trọng bộ lọc) - thanh ngang dễ đọc trên điện thoại
    const dim = document.getElementById('mg-dim').value;
    let groups;
    if (dim === 'booth') {
      groups = st.booths.map(b => ({ label: b.name, test: d => d.booths.includes(b.id) }));
    } else {
      const opts = dim === 'position' ? st.positions : dim === 'company_size' ? st.company_sizes : st.importances;
      groups = opts.map(o => ({ label: o, test: d => d[dim] === o }));
      groups.push({ label: '(Chưa nhập)', test: d => !d[dim] });
    }
    const rows = groups.map(g => {
      const sub = scope.filter(g.test);
      return { label: g.label, reg: sub.length, att: sub.filter(d => d.checked_in).length };
    }).filter(r => r.reg > 0).sort((a, b) => b.reg - a.reg);
    document.getElementById('mg-breakdown').innerHTML = rows.length
      ? rows.map(r => `<div class="mg-brow">
          <div class="mg-brow-top"><b>${esc(r.label)}</b><span class="n">ĐK <b>${r.reg}</b> · Đến <b>${r.att}</b> (${pct(r.att, r.reg)}%)</span></div>
          <div class="mg-bar"><span style="width:${pct(r.att, r.reg)}%"></span></div>
        </div>`).join('')
      : '<div class="muted" style="padding:8px 2px">Không có dữ liệu phù hợp bộ lọc.</div>';
  }

  // Bấm chip để bật/tắt điều kiện
  box.querySelectorAll('.mg-chip').forEach(c => c.onclick = () => { c.classList.toggle('on'); render(); });
  document.getElementById('mg-dim').onchange = render;
  document.getElementById('mg-clear').onclick = () => { box.querySelectorAll('.mg-chip.on').forEach(c => c.classList.remove('on')); render(); };

  // Bộ lọc thu gọn: mặc định MỞ trên máy tính, ĐÓNG trên điện thoại (tiết kiệm màn hình)
  const accBody = document.getElementById('mg-acc-body');
  const accToggle = document.getElementById('mg-acc-toggle');
  let open = window.innerWidth > 640;
  const applyAcc = () => { accBody.classList.toggle('hide', !open); accToggle.classList.toggle('open', open); };
  accToggle.onclick = () => { open = !open; applyAcc(); };
  applyAcc();

  render();
}

// ----- Tab: Quét QR -----
async function tabScan(box, ev) {
  const autoConfirm = localStorage.getItem('autoConfirm') !== '0'; // mặc định BẬT
  ev = await api('/events/' + ev.id); // lấy danh sách booth + vị trí được gán mới nhất
  const savedLoc = localStorage.getItem('scanLocation-' + ev.id) || '';
  const isStaff = USER.role === 'checkin';
  const myBooth = ev.my_position && ev.my_position.booth_id ? ev.my_position.booth_id : '';
  // Nhân viên: khoá cứng vị trí được gán (ô ẩn). Quản lý: chọn tự do.
  const locationHtml = isStaff
    ? `<label style="margin-top:0">📍 Vị trí của bạn</label>
       <div style="font-weight:700;padding:11px 13px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;color:#1e40af">
         ${myBooth ? '🧭 Booth: ' + esc(ev.my_position.name) : '🚪 Cổng check-in (ghi nhận tham dự)'}
       </div>
       <input type="hidden" id="scan-location" value="${myBooth}">`
    : `<label style="margin-top:0">📍 Vị trí quét</label>
       <select id="scan-location" style="font-weight:600">
         <option value="">🚪 Cổng check-in (ghi nhận tham dự)</option>
         ${ev.booths.map(b => `<option value="${b.id}" ${String(b.id) === savedLoc ? 'selected' : ''}>🧭 Booth: ${esc(b.name)}</option>`).join('')}
       </select>`;
  box.innerHTML = `
  <div class="scan-layout">
    <div class="card">
      ${locationHtml}
      <h3 style="margin:12px 0 10px">📷 Camera quét mã</h3>
      <div id="qr-reader"></div>
      <label class="auto-toggle" id="auto-wrap" style="font-weight:normal;display:flex;align-items:center;gap:8px;margin-top:10px">
        <input type="checkbox" id="auto-confirm" style="width:auto" ${autoConfirm ? 'checked' : ''}>
        <span>⚡ <b>Tự động check-in khi quét</b> — quét xong là biết kết quả ngay, không cần bấm xác nhận</span>
      </label>
      <div class="muted" style="margin-top:8px">Camera không hoạt động? Nhập mã thủ công:</div>
      <div style="display:flex;gap:8px;margin-top:6px">
        <input id="manual-token" placeholder="Nhập mã in dưới QR...">
        <button class="btn" id="btn-manual">Kiểm tra</button>
      </div>
      <button class="btn secondary" id="btn-walkin" style="margin-top:12px;width:100%;justify-content:center">+ Khách chưa đăng ký trước (vãng lai)</button>
    </div>
    <div>
      <div class="scan-result idle" id="scan-result">Kết quả quét sẽ hiển thị ở đây</div>
    </div>
  </div>`;

  const resultBox = document.getElementById('scan-result');
  const locSelect = document.getElementById('scan-location');
  const atBooth = () => !!locSelect.value; // đang quét tại booth (true) hay cổng (false)
  // Tại booth thì luôn ghi nhận ngay -> ẩn nút tự xác nhận và nút thêm khách vãng lai (vãng lai chỉ ở cổng)
  function applyLocUI() {
    const wrap = document.getElementById('auto-wrap');
    if (wrap) wrap.style.display = atBooth() ? 'none' : 'flex'; // tại booth luôn ghi nhận ngay
    const wi = document.getElementById('btn-walkin');
    if (wi) wi.textContent = atBooth() ? '+ Thêm khách vãng lai tại booth này' : '+ Khách chưa đăng ký trước (vãng lai)';
  }
  if (locSelect.tagName === 'SELECT') {
    locSelect.onchange = () => {
      localStorage.setItem('scanLocation-' + ev.id, locSelect.value);
      applyLocUI();
      resultBox.className = 'scan-result idle';
      resultBox.textContent = atBooth() ? 'Đang quét tại booth: ' + locSelect.options[locSelect.selectedIndex].text.replace('🧭 Booth: ', '') : 'Kết quả quét sẽ hiển thị ở đây';
    };
  }
  applyLocUI();
  document.getElementById('auto-confirm').onchange = (e) => localStorage.setItem('autoConfirm', e.target.checked ? '1' : '0');
  let busy = false;

  async function handleToken(token) {
    if (busy) return; busy = true;
    try {
      const r = await api(`/events/${ev.id}/scan`, { method: 'POST', body: {
        token,
        booth_id: locSelect.value || null,
        auto_confirm: document.getElementById('auto-confirm').checked,
      } });
      showResult(r);
      const good = ['checked_in', 'valid', 'booth_recorded'].includes(r.status);
      if (navigator.vibrate) navigator.vibrate(good ? 100 : [80, 60, 80, 60, 80]);
    } catch (e) { toast('Lỗi: ' + e.message); }
    setTimeout(() => { busy = false; }, 1500); // tránh quét trùng liên tục
  }

  function showResult(r) {
    const a = r.attendee;
    const infoHtml = a ? `
      <div class="info-line"><b>Họ tên:</b><span>${esc((a.salutation ? a.salutation + ' ' : '') + a.name)}</span></div>
      <div class="info-line"><b>Mức độ:</b><span><b style="color:${['VIP', 'VVIP', 'Ban lãnh đạo'].includes(a.importance) ? 'var(--red)' : 'inherit'}">${esc(a.importance || 'Bình thường')}</b></span></div>
      <div class="info-line"><b>Chức vụ:</b><span>${esc(a.position) || '—'}</span></div>
      <div class="info-line"><b>Công ty:</b><span>${esc(a.company) || '—'}</span></div>
      <div class="info-line"><b>Quy mô:</b><span>${esc(a.company_size) || '—'}</span></div>
      <div class="info-line"><b>SĐT:</b><span>${esc(a.phone) || '—'}</span></div>
      <div class="info-line"><b>Email:</b><span>${esc(a.email) || '—'}</span></div>` : '';
    // Nút in thẻ QR (chỉ ở cổng check-in) - đưa cho khách để quét tại các booth
    const printBtn = a ? `<button class="btn secondary" id="btn-print-badge" style="margin-top:12px;width:100%;justify-content:center">🖨 In thẻ QR cho khách</button>` : '';
    const wirePrint = () => { const b = resultBox.querySelector('#btn-print-badge'); if (b) b.onclick = () => printQr(a, ev.name); };
    if (r.status === 'checked_in') {
      resultBox.className = 'scan-result valid';
      resultBox.innerHTML = `<h3 style="color:var(--green);font-size:24px">✅ CHECK-IN THÀNH CÔNG</h3>${infoHtml}${printBtn}`;
    } else if (r.status === 'booth_recorded') {
      resultBox.className = 'scan-result valid';
      resultBox.innerHTML = `<h3 style="color:var(--green);font-size:22px">🧭 ĐÃ GHI NHẬN BOOTH</h3>
        <p style="margin-bottom:8px">${esc(r.message)}${r.just_checked_in ? ' <span class="badge green">Đồng thời ghi nhận check-in</span>' : ''}</p>${infoHtml}`;
    } else if (r.status === 'booth_already') {
      resultBox.className = 'scan-result warn';
      resultBox.innerHTML = `<h3 style="color:var(--orange)">🔁 Đã ghi nhận trước đó</h3><p style="margin-bottom:8px">${esc(r.message)}</p>${infoHtml}`;
    } else if (r.status === 'already_checked') {
      resultBox.className = 'scan-result warn';
      resultBox.innerHTML = `<h3 style="color:var(--orange)">ℹ️ KHÁCH ĐÃ CHECK-IN RỒI</h3>
        <p style="margin-bottom:8px">${esc(r.message)}</p>${infoHtml}${printBtn}`;
    } else if (r.status === 'valid') {
      resultBox.className = 'scan-result valid';
      resultBox.innerHTML = `<h3 style="color:var(--green)">✅ ${esc(r.message)}</h3>${infoHtml}
        <button class="btn green" id="btn-confirm" style="margin-top:14px;width:100%;justify-content:center;font-size:16px">XÁC NHẬN CHECK-IN</button>`;
      document.getElementById('btn-confirm').onclick = async () => {
        try {
          await api(`/events/${ev.id}/checkin/${a.id}`, { method: 'POST' });
          resultBox.className = 'scan-result valid';
          resultBox.innerHTML = `<h3 style="color:var(--green)">🎉 Check-in thành công!</h3>${infoHtml}${printBtn}`;
          wirePrint();
        } catch (e) { toast('Lỗi: ' + e.message); }
      };
    } else if (r.status === 'expired') {
      resultBox.className = 'scan-result warn';
      resultBox.innerHTML = `<h3 style="color:var(--orange)">⚠️ Mã đã hết hạn</h3><p>${esc(r.message)}</p>${infoHtml}`;
    } else if (r.status === 'wrong_event') {
      resultBox.className = 'scan-result warn';
      resultBox.innerHTML = `<h3 style="color:var(--orange)">⚠️ Sai sự kiện</h3><p>${esc(r.message)}</p>${infoHtml}`;
    } else {
      resultBox.className = 'scan-result bad';
      resultBox.innerHTML = `<h3 style="color:var(--red)">❌ Mã không hợp lệ</h3><p>${esc(r.message)}</p>`;
    }
    wirePrint();
  }

  // Khởi động camera
  try {
    scanner = new Html5Qrcode('qr-reader');
    await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 220, height: 220 } },
      (text) => handleToken(text.trim()), () => {});
  } catch (e) {
    document.getElementById('qr-reader').innerHTML =
      `<div style="padding:18px" class="muted">Không mở được camera (${esc(e.message || e)}).<br>
       Lưu ý: camera chỉ hoạt động trên <b>localhost</b> hoặc trang web có <b>HTTPS</b>. Bạn vẫn có thể nhập mã thủ công bên dưới.</div>`;
  }

  document.getElementById('btn-manual').onclick = () => {
    const v = document.getElementById('manual-token').value.trim();
    if (v) handleToken(v);
  };
  document.getElementById('manual-token').onkeydown = e => { if (e.key === 'Enter') document.getElementById('btn-manual').click(); };

  document.getElementById('btn-walkin').onclick = () => {
    const boothName = atBooth()
      ? (locSelect.tagName === 'SELECT' ? locSelect.options[locSelect.selectedIndex].text.replace(/^🧭 Booth: /, '') : (ev.my_position ? ev.my_position.name : ''))
      : '';
    openModal(`<h3>Thêm khách vãng lai</h3>
      <p class="muted">${atBooth() ? 'Khách sẽ được check-in và ghi nhận ghé <b>booth: ' + esc(boothName) + '</b>.' : 'Khách chưa đăng ký trước - sẽ được check-in ngay sau khi thêm.'}</p>
      ${attendeeFields('wi')}
      <div class="error-msg" id="wi-err"></div>
      <div class="modal-actions"><button class="btn secondary" onclick="closeModal()">Huỷ</button>
      <button class="btn green" id="wi-save">${atBooth() ? 'Thêm & ghi nhận booth' : 'Thêm & Check-in'}</button></div>`);
    document.getElementById('wi-save').onclick = async () => {
      try {
        const r = await api(`/events/${ev.id}/walkin`, { method: 'POST', body: { ...readAttendeeFields('wi'), booth_id: locSelect.value || null } });
        closeModal();
        toast(r.booth_name ? 'Đã thêm khách vãng lai & ghi nhận ghé booth ' + r.booth_name : 'Đã thêm khách vãng lai và check-in thành công');
      } catch (e) { document.getElementById('wi-err').textContent = e.message; }
    };
  };
}

// ----- Tab: Cài đặt Email -----
async function tabEmail(box, ev) {
  const s = await api(`/events/${ev.id}/email-settings`);

  function imageBlock(type, image, width) {
    const label = type === 'header' ? 'Ảnh đầu email (header)' : 'Ảnh cuối email (footer)';
    return `
    <div style="border:1px dashed var(--border);border-radius:10px;padding:12px;margin-top:12px">
      <b>${label}</b>
      ${image ? `<div style="margin:8px 0"><img src="/api/events/${ev.id}/email-image/${type}.img?t=${Math.floor(performance.now())}" style="max-width:100%;max-height:120px;border-radius:6px"></div>
        <label>Độ rộng ảnh: <span id="${type}-width-val">${width}</span>% (so với khung email)</label>
        <input type="range" min="10" max="100" value="${width}" id="em-${type}-width">
        <button class="btn small danger" data-delimg="${type}" style="margin-top:6px">Xoá ảnh</button>`
      : `<p class="muted" style="margin:6px 0">Chưa có ảnh. Nên dùng ảnh ngang (VD 1200×300) cho đẹp.</p>`}
      <div style="margin-top:8px">
        <input type="file" id="file-${type}" accept="image/*" style="display:none">
        <button class="btn small secondary" data-upimg="${type}">⬆ ${image ? 'Đổi ảnh khác' : 'Tải ảnh lên'}</button>
      </div>
    </div>`;
  }

  box.innerHTML = `
  <div class="hint">💡 Biến tự thay bằng thông tin thật: <code>{{xung_ho}}</code> Anh/Chị/Ông/Bà · <code>{{ho_ten}}</code> tên khách · <code>{{ten_su_kien}}</code> tên sự kiện ·
    <code>{{thoi_gian}}</code> thời gian · <code>{{cong_ty}}</code> công ty khách · <code>{{qr_code}}</code> vị trí ảnh mã QR (không đặt thì QR nằm cuối email).<br>
    ✨ Mỗi email có 2 chế độ soạn: <b>📝 Văn bản</b> (gõ như viết tin nhắn, không cần biết kỹ thuật) và <b>&lt;/&gt; HTML</b> (nâng cao). Chưa biết viết gì? Bấm <b>✨ Chèn nội dung gợi ý</b> rồi sửa theo ý. Ảnh header/footer áp dụng cho <b>cả 2 email</b> (xác nhận + cảm ơn). Bấm <b>👁 Xem trước</b> để xem email hoàn chỉnh trước khi gửi.</div>
  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
      <h3>✉️ Email xác nhận đăng ký (kèm mã QR)</h3>
      <div style="display:flex;gap:6px">
        <button class="btn secondary small" data-suggest="confirm">✨ Chèn nội dung gợi ý</button>
        <button class="btn secondary small" data-preview="confirm">👁 Xem trước</button>
      </div>
    </div>
    <label><input type="checkbox" id="em-auto" style="width:auto;margin-right:8px" ${s.auto_send_confirm ? 'checked' : ''}>Tự động gửi ngay khi thêm người vào danh sách</label>
    <label>Tiêu đề email</label><input id="em-csub" value="${esc(s.confirm_subject)}" placeholder="Xác nhận đăng ký tham dự {{ten_su_kien}}">
    ${bodyEditorHtml('em-cbody', s.confirm_body)}
  </div>
  <div class="card">
    <h3>🖼️ Ảnh header / footer (dùng chung cho cả 2 email)</h3>
    ${imageBlock('header', s.header_image, s.header_width)}
    ${imageBlock('footer', s.footer_image, s.footer_width)}
  </div>
  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
      <h3>💚 Email cảm ơn sau check-in</h3>
      <div style="display:flex;gap:6px">
        <button class="btn secondary small" data-suggest="thank">✨ Chèn nội dung gợi ý</button>
        <button class="btn secondary small" data-preview="thank">👁 Xem trước</button>
      </div>
    </div>
    <label><input type="checkbox" id="em-ten" style="width:auto;margin-right:8px" ${s.thank_enabled ? 'checked' : ''}>Bật tự động gửi email cảm ơn</label>
    <label>Gửi sau khi check-in (phút)</label><input type="number" id="em-delay" value="${s.thank_delay_minutes}" min="1" style="max-width:160px">
    <label>Tiêu đề email</label><input id="em-tsub" value="${esc(s.thank_subject)}" placeholder="Cảm ơn bạn đã tham dự {{ten_su_kien}}">
    ${bodyEditorHtml('em-tbody', s.thank_body)}
  </div>
  <button class="btn" id="em-save">💾 Lưu cài đặt</button>`;

  wireBodyEditors(box); // bật chuyển tab Văn bản <-> HTML

  async function saveSettings() {
    await api(`/events/${ev.id}/email-settings`, { method: 'PUT', body: {
      confirm_subject: document.getElementById('em-csub').value,
      confirm_body: readBody('em-cbody'),
      auto_send_confirm: document.getElementById('em-auto').checked,
      thank_subject: document.getElementById('em-tsub').value,
      thank_body: readBody('em-tbody'),
      thank_delay_minutes: document.getElementById('em-delay').value,
      thank_enabled: document.getElementById('em-ten').checked,
      header_width: document.getElementById('em-header-width')?.value,
      footer_width: document.getElementById('em-footer-width')?.value,
    } });
  }
  document.getElementById('em-save').onclick = async () => { await saveSettings(); toast('Đã lưu cài đặt email'); };

  // Thanh kéo chỉnh độ rộng ảnh
  for (const type of ['header', 'footer']) {
    const slider = document.getElementById(`em-${type}-width`);
    if (slider) slider.oninput = () => { document.getElementById(`${type}-width-val`).textContent = slider.value; };
  }
  // Upload / xoá ảnh
  box.querySelectorAll('[data-upimg]').forEach(b => b.onclick = () => {
    const type = b.dataset.upimg;
    const fi = document.getElementById('file-' + type);
    fi.onchange = async () => {
      if (!fi.files[0]) return;
      const fd = new FormData(); fd.append('file', fi.files[0]);
      try {
        await saveSettings(); // giữ nội dung đang soạn
        await api(`/events/${ev.id}/email-image/${type}`, { method: 'POST', body: fd });
        toast('Đã tải ảnh lên'); tabEmail(box, ev);
      } catch (e) { toast('Lỗi: ' + e.message); }
    };
    fi.click();
  });
  box.querySelectorAll('[data-delimg]').forEach(b => b.onclick = async () => {
    if (!confirm('Xoá ảnh này?')) return;
    await saveSettings();
    await api(`/events/${ev.id}/email-image/${b.dataset.delimg}`, { method: 'DELETE' });
    tabEmail(box, ev);
  });
  // Nội dung email gợi ý sẵn (HTML căn chỉnh đẹp, có thể sửa thoải mái)
  const SUGGEST = {
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
  box.querySelectorAll('[data-suggest]').forEach(b => b.onclick = () => {
    const t = b.dataset.suggest;
    const prefix = t === 'confirm' ? 'em-cbody' : 'em-tbody';
    const subEl = document.getElementById(t === 'confirm' ? 'em-csub' : 'em-tsub');
    const mode = document.getElementById(`${prefix}-mode`).value; // chèn đúng theo tab đang mở
    const area = document.getElementById(`${prefix}-${mode}`);
    if (area.value.trim() && !confirm('Nội dung hiện tại sẽ bị thay bằng nội dung gợi ý. Tiếp tục?')) return;
    subEl.value = SUGGEST[t].subject;
    area.value = mode === 'html' ? SUGGEST[t].body : SUGGEST[t].text;
    toast('Đã chèn nội dung gợi ý - bạn sửa lại hotline/link rồi bấm Lưu nhé');
  });

  // Xem trước email
  box.querySelectorAll('[data-preview]').forEach(b => b.onclick = async () => {
    await saveSettings(); // xem trước đúng nội dung đang soạn
    const p = await api(`/events/${ev.id}/email-preview?type=${b.dataset.preview}`);
    openModal(`<h3>👁 Xem trước email</h3>
      <p class="muted" style="margin-bottom:8px"><b>Tiêu đề:</b> ${esc(p.subject)}</p>
      <iframe id="email-preview-frame" style="width:100%;height:60vh;border:1px solid var(--border);border-radius:8px;background:#f3f4f6"></iframe>
      <div class="modal-actions"><button class="btn" onclick="closeModal()">Đóng</button></div>`);
    document.getElementById('email-preview-frame').srcdoc = p.html;
  });
}

// ----- Tab: Báo cáo -----
async function tabReport(box, ev) {
  const rp = await api(`/events/${ev.id}/report`);
  box.innerHTML = `
  <div class="stats">
    <div class="stat"><div class="num">${rp.total}</div><div class="lbl">Tổng đăng ký</div></div>
    <div class="stat green"><div class="num">${rp.checkedin}</div><div class="lbl">Đã check-in</div></div>
    <div class="stat"><div class="num">${rp.not_checkedin}</div><div class="lbl">Chưa check-in</div></div>
    <div class="stat orange"><div class="num">${rp.walkin}</div><div class="lbl">Khách vãng lai</div></div>
    <div class="stat green"><div class="num">${rp.total ? Math.round(rp.checkedin / rp.total * 100) : 0}%</div><div class="lbl">Tỷ lệ tham dự</div></div>
  </div>
  ${rp.booths.length ? `<div class="card"><b>🧭 Lượt ghé booth:</b>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:8px">
      ${rp.booths.map(b => `<span class="badge blue" style="font-size:13px;padding:6px 14px">${esc(b.name)}: <b>${b.visit_count}</b> lượt</span>`).join('')}
    </div></div>` : ''}
  <div class="toolbar">
    <input id="rp-search" placeholder="🔍 Tìm tên, SĐT, công ty...">
    <select id="rp-status"><option value="">Tất cả trạng thái</option><option value="in">Đã check-in</option><option value="out">Chưa check-in</option></select>
    <select id="rp-imp"><option value="">Tất cả mức độ</option>${rp.importances.map(i => `<option>${i}</option>`).join('')}</select>
    <select id="rp-pos"><option value="">Tất cả chức vụ</option>${rp.positions.map(p => `<option>${p}</option>`).join('')}</select>
    <select id="rp-size"><option value="">Tất cả quy mô</option>${rp.company_sizes.map(s => `<option>${s}</option>`).join('')}</select>
    <a class="btn green" href="/api/events/${ev.id}/report/export" download>⬇ Xuất Excel</a>
  </div>
  <div class="table-wrap"><table><thead><tr>
    <th>Họ và tên</th><th>Mức độ</th><th>SĐT</th><th>Công ty</th><th>Check-in</th><th>Thời gian check-in</th><th>Booth đã ghé (${rp.booths.length})</th><th>📝 Ghi chú giám sát</th><th>NV check-in</th>${ev.can_manage ? '<th></th>' : ''}
  </tr></thead><tbody id="rp-body"></tbody></table></div>`;

  function renderRows() {
    const q = document.getElementById('rp-search').value.toLowerCase();
    const st = document.getElementById('rp-status').value;
    const imp = document.getElementById('rp-imp').value;
    const pos = document.getElementById('rp-pos').value;
    const size = document.getElementById('rp-size').value;
    const rows = rp.rows.filter(r =>
      (!q || (r.name + r.phone + r.company + r.email).toLowerCase().includes(q)) &&
      (!st || (st === 'in' ? r.checked_in_at : !r.checked_in_at)) &&
      (!imp || r.importance === imp) &&
      (!pos || r.position === pos) && (!size || r.company_size === size));
    document.getElementById('rp-body').innerHTML = rows.length ? rows.map(r => `<tr>
      <td><b>${esc((r.salutation ? r.salutation + ' ' : '') + r.name)}</b>${r.is_walkin ? ' <span class="badge orange">Vãng lai</span>' : ''}${r.eligible ? '' : ' <span class="badge red">Không đủ ĐK</span>'}</td>
      <td>${esc(r.importance || 'Bình thường')}</td>
      <td>${esc(r.phone)}</td><td>${esc(r.company)}</td>
      <td>${r.checked_in_at ? '<span class="badge green">Có</span>' : '<span class="badge gray">Không</span>'}</td>
      <td>${r.checked_in_at ? fmtDate(r.checked_in_at, true) : ''}</td>
      <td>${r.booth_visits.length
        ? `<b>${r.booth_visits.length}</b> booth: ` + r.booth_visits.map(v => `<span class="badge blue" title="${fmtDate(v.visited_at, true)}">${esc(v.name)}</span>`).join(' ')
        : '<span class="muted">—</span>'}</td>
      <td>${r.booth_visits.filter(v => v.note).length
        ? r.booth_visits.filter(v => v.note).map(v => `<div style="margin-bottom:2px"><b>${esc(v.name)}:</b> ${esc(v.note)}</div>`).join('')
        : '<span class="muted">—</span>'}</td>
      <td>${esc(r.checked_in_by_name || '')}</td>
      ${ev.can_manage ? `<td style="white-space:nowrap"><button class="btn small secondary" data-edit="${r.id}" title="Sửa thông tin">✏️</button>${r.checked_in_at ? `<button class="btn small secondary" data-print="${r.id}" title="In tem QR cho khách">🖨</button>` : ''}</td>` : ''}</tr>`).join('')
      : `<tr><td colspan="${ev.can_manage ? 10 : 9}" class="muted">Không có dữ liệu phù hợp.</td></tr>`;
    if (ev.can_manage) {
      document.getElementById('rp-body').querySelectorAll('[data-edit]').forEach(b => b.onclick = () =>
        attendeeFormModal(ev, () => tabReport(box, ev), rp.rows.find(x => x.id == b.dataset.edit)));
      document.getElementById('rp-body').querySelectorAll('[data-print]').forEach(b => b.onclick = () =>
        printQr(rp.rows.find(x => x.id == b.dataset.print), ev.name));
    }
  }
  ['rp-search', 'rp-status', 'rp-imp', 'rp-pos', 'rp-size'].forEach(id => document.getElementById(id).oninput = renderRows);
  renderRows();
}

// ----- Tab: Gán nhân viên check-in -----
async function tabStaff(box, ev) {
  if (!ev.can_manage) { box.innerHTML = '<div class="card muted">Bạn không có quyền quản lý mục này.</div>'; return; }
  ev = await api('/events/' + ev.id); // tải lại danh sách đã gán mới nhất
  const all = await api(`/events/${ev.id}/available-staff`);
  const assignedMap = new Map(ev.staff.map(s => [s.id, { booth_id: s.booth_id || '', staff_type: s.staff_type || 'checkin' }]));
  const boothOpts = ev.booths.map(b => `<option value="${b.id}">🧭 Booth: ${esc(b.name)}</option>`).join('');
  const typeOpts = Object.entries(STAFF_TYPE_NAMES).map(([v, n]) => `<option value="${v}">${n}</option>`).join('');
  box.innerHTML = `
  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
      <h3>Nhân viên check-in của sự kiện này</h3>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <a class="btn secondary" href="/api/events/${ev.id}/staff/template" download>⬇ File Excel mẫu</a>
        <button class="btn secondary" id="staff-import">⬆ Import Excel</button>
        <input type="file" id="staff-file" accept=".xlsx,.xls" style="display:none">
        <button class="btn green" id="staff-new">+ Tạo tài khoản nhân viên mới</button>
      </div>
    </div>
    <p class="muted" style="margin:6px 0 14px">Tích chọn nhân viên, chọn <b>vai trò tại sự kiện</b> và <b>vị trí</b>:
      <br>• <b>Quét QR / Check-in</b>: quét mã tại Cổng hoặc 1 booth.
      <br>• <b>Lễ tân in QR</b>: đứng ở Cổng, xem toàn bộ khách để tra cứu & in tem QR (máy tính nối máy in).
      <br>• <b>Giám sát booth</b>: chỉ xem khách đã ghé <b>1 booth</b> được gán và ghi chú (bắt buộc chọn booth).
      <br>• <b>Quản lý (xem số liệu)</b>: chỉ xem bảng số liệu tổng hợp toàn sự kiện (đăng ký/đến dự, lọc theo chức vụ/quy mô/mức độ/booth). Không quét, không xem thông tin cá nhân.</p>
    ${all.length ? `<div class="table-wrap"><table><thead><tr><th style="width:40px"></th><th>Nhân viên</th><th>Vai trò tại sự kiện</th><th>Vị trí</th></tr></thead><tbody>` +
      all.map(u => `<tr>
        <td><input type="checkbox" style="width:auto" value="${u.id}" ${assignedMap.has(u.id) ? 'checked' : ''} class="staff-cb"></td>
        <td><b>${esc(u.name)}</b><br><span class="muted">${esc(u.email)}${u.unit ? ' · ' + esc(u.unit) : ''}</span></td>
        <td><select class="staff-type" data-uid="${u.id}" style="min-width:170px" ${assignedMap.has(u.id) ? '' : 'disabled'}>${typeOpts}</select></td>
        <td><select class="staff-pos" data-uid="${u.id}" style="min-width:200px" ${assignedMap.has(u.id) ? '' : 'disabled'}>
          <option value="">🚪 Cổng check-in (ghi nhận tham dự)</option>${boothOpts}
        </select></td>
      </tr>`).join('') + `</tbody></table></div>`
      : '<p class="muted">Chưa có tài khoản nhân viên check-in nào.</p>'}
    <button class="btn" id="staff-save" style="margin-top:14px">💾 Lưu danh sách</button>
  </div>`;
  // Đặt sẵn vai trò + vị trí đã gán cho từng nhân viên
  box.querySelectorAll('.staff-type').forEach(sel => {
    const a = assignedMap.get(Number(sel.dataset.uid));
    if (a) sel.value = a.staff_type;
  });
  box.querySelectorAll('.staff-pos').forEach(sel => {
    const a = assignedMap.get(Number(sel.dataset.uid));
    if (a) sel.value = a.booth_id || '';
  });
  // Khi đổi vai trò: Lễ tân -> khoá vị trí ở Cổng; Giám sát -> bắt buộc chọn booth
  function applyTypeUI(uid) {
    const type = box.querySelector(`.staff-type[data-uid="${uid}"]`).value;
    const pos = box.querySelector(`.staff-pos[data-uid="${uid}"]`);
    const cb = box.querySelector(`.staff-cb[value="${uid}"]`);
    if (!pos) return;
    if (!cb.checked) { pos.disabled = true; return; }
    if (type === 'reception' || type === 'manager') { pos.value = ''; pos.disabled = true; } // lễ tân=cổng; quản lý xem toàn sự kiện
    else { pos.disabled = false; if (type === 'supervisor' && !pos.value && ev.booths.length) pos.value = ev.booths[0].id; }
  }
  box.querySelectorAll('.staff-type').forEach(sel => sel.onchange = () => applyTypeUI(sel.dataset.uid));
  // Tích/bỏ tích là bật/tắt ô chọn vai trò + vị trí
  box.querySelectorAll('.staff-cb').forEach(cb => cb.onchange = () => {
    const type = box.querySelector(`.staff-type[data-uid="${cb.value}"]`);
    if (type) type.disabled = !cb.checked;
    if (!cb.checked) { const pos = box.querySelector(`.staff-pos[data-uid="${cb.value}"]`); if (pos) { pos.disabled = true; pos.value = ''; } }
    else applyTypeUI(cb.value);
  });
  box.querySelectorAll('.staff-cb:checked').forEach(cb => applyTypeUI(cb.value));
  document.getElementById('staff-save').onclick = async () => {
    const assignments = [];
    for (const cb of box.querySelectorAll('.staff-cb:checked')) {
      const type = box.querySelector(`.staff-type[data-uid="${cb.value}"]`).value;
      const sel = box.querySelector(`.staff-pos[data-uid="${cb.value}"]`);
      const booth = sel && sel.value ? Number(sel.value) : null;
      if (type === 'supervisor' && !booth) {
        return toast('Giám sát booth phải chọn 1 booth. Hãy tạo booth ở tab Booth trước nếu chưa có.');
      }
      assignments.push({ user_id: Number(cb.value), booth_id: booth, staff_type: type });
    }
    await api(`/events/${ev.id}/staff`, { method: 'PUT', body: { assignments } });
    toast('Đã lưu danh sách nhân viên');
  };
  // Import nhân viên từ Excel
  const staffFile = document.getElementById('staff-file');
  document.getElementById('staff-import').onclick = () => staffFile.click();
  staffFile.onchange = async () => {
    if (!staffFile.files[0]) return;
    const fd = new FormData(); fd.append('file', staffFile.files[0]);
    try {
      const r = await api(`/events/${ev.id}/staff/import`, { method: 'POST', body: fd });
      let msg = `Đã tạo mới ${r.added} nhân viên${r.assigned ? `, gán thêm ${r.assigned} người đã có sẵn` : ''}.`;
      if (r.errors.length) msg += `\n${r.errors.length} dòng cần lưu ý:\n` + r.errors.slice(0, 8).join('\n');
      alert(msg); tabStaff(box, ev);
    } catch (e) { toast('Lỗi: ' + e.message); }
    staffFile.value = '';
  };
  document.getElementById('staff-new').onclick = () => {
    openModal(`<h3>Tạo tài khoản Nhân viên check-in</h3>
      <p class="muted">Tài khoản sẽ được gán ngay vào sự kiện này. Nhân viên dùng email + mật khẩu để đăng nhập trên điện thoại.</p>
      <div class="row2">
        <div><label>Họ và tên *</label><input id="ns-name"></div>
        <div><label>Bộ phận</label><input id="ns-dept"></div>
      </div>
      <label>Email đăng nhập *</label><input id="ns-email" type="email">
      <label>Mật khẩu *</label><input id="ns-pass" type="text">
      <div class="error-msg" id="ns-err"></div>
      <div class="modal-actions"><button class="btn secondary" onclick="closeModal()">Huỷ</button>
      <button class="btn green" id="ns-save">Tạo & gán vào sự kiện</button></div>`);
    document.getElementById('ns-save').onclick = async () => {
      try {
        await api(`/events/${ev.id}/staff/create`, { method: 'POST', body: {
          name: document.getElementById('ns-name').value,
          department: document.getElementById('ns-dept').value,
          email: document.getElementById('ns-email').value,
          password: document.getElementById('ns-pass').value,
        } });
        closeModal(); toast('Đã tạo và gán nhân viên vào sự kiện'); tabStaff(box, ev);
      } catch (e) { document.getElementById('ns-err').textContent = e.message; }
    };
  };
}

// ============ Trang: Thành viên ============
async function pageMembers(main) {
  const users = await api('/users');
  main.innerHTML = `
  <div class="page-head"><h2>Thành viên</h2>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <a class="btn secondary" href="/api/users/template" download>⬇ File Excel mẫu</a>
      <button class="btn secondary" id="btn-import-users">⬆ Import Excel</button>
      <input type="file" id="file-users" accept=".xlsx,.xls" style="display:none">
      <button class="btn" id="btn-add-user">+ Thêm thành viên</button>
    </div>
  </div>
  <div class="table-wrap"><table><thead><tr>
    <th>Họ và tên</th><th>Bộ phận</th><th>Đơn vị</th><th>Email</th><th>Vai trò</th><th></th>
  </tr></thead><tbody id="user-body"></tbody></table></div>`;

  const body = document.getElementById('user-body');
  for (const u of users) {
    body.appendChild(el(`<tr>
      <td><b>${esc(u.name)}</b></td><td>${esc(u.department)}</td><td>${esc(u.unit)}</td><td>${esc(u.email)}</td>
      <td><span class="badge ${u.role === 'super_admin' ? 'red' : u.role === 'admin' ? 'blue' : 'gray'}">${ROLE_NAMES[u.role] || u.role}</span></td>
      <td style="white-space:nowrap">
        ${u.role !== 'super_admin' || USER.id === u.id ? `<button class="btn small secondary" data-edit="${u.id}">✏️</button>` : ''}
        ${u.role !== 'super_admin' ? `<button class="btn small danger" data-del="${u.id}">✕</button>` : ''}
      </td></tr>`));
  }
  body.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => userFormModal(users.find(u => u.id == b.dataset.edit), () => pageMembers(main)));
  body.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    const u = users.find(x => x.id == b.dataset.del);
    if (!confirm(`Xoá thành viên "${u.name}"?`)) return;
    try { await api('/users/' + u.id, { method: 'DELETE' }); pageMembers(main); }
    catch (e) { toast('Lỗi: ' + e.message); }
  });
  document.getElementById('btn-add-user').onclick = () => userFormModal(null, () => pageMembers(main));
  const fi = document.getElementById('file-users');
  document.getElementById('btn-import-users').onclick = () => fi.click();
  fi.onchange = async () => {
    if (!fi.files[0]) return;
    const fd = new FormData(); fd.append('file', fi.files[0]);
    try {
      const r = await api('/users/import', { method: 'POST', body: fd });
      let msg = `Đã thêm ${r.added} thành viên.`;
      if (r.errors.length) msg += '\nBỏ qua:\n' + r.errors.slice(0, 8).join('\n');
      alert(msg); pageMembers(main);
    } catch (e) { toast('Lỗi: ' + e.message); }
    fi.value = '';
  };
}

function userFormModal(u, onSaved) {
  const roleOpts = USER.role === 'super_admin'
    ? [['admin', 'Admin'], ['checkin', 'Nhân viên check-in']]
    : [['checkin', 'Nhân viên check-in']];
  openModal(`<h3>${u ? 'Sửa thành viên' : 'Thêm thành viên'}</h3>
    <div class="row2">
      <div><label>Họ và tên *</label><input id="uf-name" value="${esc(u?.name || '')}"></div>
      <div><label>Email *</label><input id="uf-email" value="${esc(u?.email || '')}"></div>
      <div><label>Bộ phận</label><input id="uf-dept" value="${esc(u?.department || '')}"></div>
      <div><label>Đơn vị</label><input id="uf-unit" value="${esc(USER.role === 'admin' ? USER.unit : (u?.unit || ''))}" ${USER.role === 'admin' ? 'disabled' : ''}></div>
    </div>
    <label>Vai trò</label>
    <select id="uf-role" ${u?.role === 'super_admin' ? 'disabled' : ''}>
      ${u?.role === 'super_admin' ? '<option value="super_admin" selected>Super Admin</option>' : ''}
      ${roleOpts.map(([v, n]) => `<option value="${v}" ${u?.role === v ? 'selected' : ''}>${n}</option>`).join('')}
    </select>
    <label>Mật khẩu ${u ? '(để trống nếu không đổi)' : '*'}</label><input type="text" id="uf-pass" autocomplete="new-password">
    <div class="error-msg" id="uf-err"></div>
    <div class="modal-actions"><button class="btn secondary" onclick="closeModal()">Huỷ</button>
    <button class="btn" id="uf-save">Lưu</button></div>`);
  document.getElementById('uf-save').onclick = async () => {
    const body = {
      name: document.getElementById('uf-name').value,
      email: document.getElementById('uf-email').value,
      department: document.getElementById('uf-dept').value,
      unit: document.getElementById('uf-unit').value,
      role: document.getElementById('uf-role').value,
    };
    const pass = document.getElementById('uf-pass').value;
    if (pass) body.password = pass;
    try {
      if (u) await api('/users/' + u.id, { method: 'PUT', body });
      else await api('/users', { method: 'POST', body });
      closeModal(); toast('Đã lưu thành viên'); onSaved();
    } catch (e) { document.getElementById('uf-err').textContent = e.message; }
  };
}

// ============ Trang: Cấu hình SMTP ============
async function pageSmtp(main) {
  const s = await api('/smtp');
  main.innerHTML = `
  <div class="page-head"><h2>Cấu hình gửi Email</h2></div>
  <div class="card" style="max-width:560px">
    <h3>⚡ Kênh 1: Brevo (khuyên dùng cho bản website online)</h3>
    <div class="hint" style="margin-top:10px">Nền tảng cloud (Railway) chặn gửi email kiểu Gmail/SMTP, nên bản online cần dùng <b>Brevo</b> — miễn phí 300 email/ngày:<br>
      1. Tạo tài khoản tại <a href="https://www.brevo.com" target="_blank">brevo.com</a> (đăng ký bằng email của bạn)<br>
      2. Vào góc phải trên → <b>SMTP &amp; API</b> → tab <b>API Keys</b> → <b>Generate a new API key</b><br>
      3. Copy key (bắt đầu bằng <code>xkeysib-</code>) dán vào ô dưới. Nếu điền key, hệ thống sẽ ưu tiên gửi qua Brevo.</div>
    <label>Brevo API Key</label><input id="sm-brevo" value="${esc(s.brevo_api_key)}" placeholder="xkeysib-...">
    <label>Email người gửi (đúng email đã đăng ký Brevo)</label><input id="sm-sender" value="${esc(s.sender_email)}" placeholder="bạn@gmail.com">
  </div>
  <div class="card" style="max-width:560px">
    <h3>📮 Kênh 2: Gmail/SMTP (dùng khi chạy trên máy tính)</h3>
    <div class="hint" style="margin-top:10px">Vào <a href="https://myaccount.google.com/apppasswords" target="_blank">myaccount.google.com/apppasswords</a>
    (cần bật xác minh 2 bước) → tạo <b>Mật khẩu ứng dụng</b> 16 ký tự → dán vào ô "Mật khẩu".</div>
    <div class="row2">
      <div><label>Máy chủ SMTP</label><input id="sm-host" value="${esc(s.host)}"></div>
      <div><label>Cổng</label><input id="sm-port" type="number" value="${s.port}"></div>
    </div>
    <label><input type="checkbox" id="sm-secure" style="width:auto;margin-right:8px" ${s.secure ? 'checked' : ''}>Kết nối bảo mật SSL (cổng 465)</label>
    <label>Email gửi đi (tài khoản Gmail)</label><input id="sm-user" value="${esc(s.smtp_user)}" placeholder="bạn@gmail.com">
    <label>Mật khẩu (App Password 16 ký tự)</label><input id="sm-pass" value="${esc(s.smtp_pass)}" placeholder="abcd efgh ijkl mnop">
  </div>
  <div class="card" style="max-width:560px">
    <label style="margin-top:0">Tên người gửi hiển thị (chung cho cả 2 kênh)</label><input id="sm-from" value="${esc(s.from_name)}">
    <div class="modal-actions" style="justify-content:flex-start">
      <button class="btn" id="sm-save">💾 Lưu</button>
      <button class="btn secondary" id="sm-test">📨 Gửi email kiểm tra</button>
    </div>
  </div>`;
  document.getElementById('sm-save').onclick = async () => {
    await api('/smtp', { method: 'PUT', body: {
      host: document.getElementById('sm-host').value,
      port: document.getElementById('sm-port').value,
      secure: document.getElementById('sm-secure').checked,
      smtp_user: document.getElementById('sm-user').value,
      smtp_pass: document.getElementById('sm-pass').value.replace(/\s/g, ''),
      from_name: document.getElementById('sm-from').value,
      brevo_api_key: document.getElementById('sm-brevo').value.trim(),
      sender_email: document.getElementById('sm-sender').value.trim(),
    } });
    toast('Đã lưu cấu hình email');
  };
  document.getElementById('sm-test').onclick = async (e) => {
    e.target.disabled = true; e.target.textContent = 'Đang gửi...';
    try { const r = await api('/smtp/test', { method: 'POST' }); alert(r.message); }
    catch (err) { alert(err.message); }
    e.target.disabled = false; e.target.textContent = '📨 Gửi email kiểm tra';
  };
}

// ============ Khởi động ============
(async () => {
  try {
    USER = await api('/me');
    OPTIONS = await api('/options');
  } catch (e) { USER = null; }
  route();
})();
