// Giao diện hệ thống Check-in sự kiện
let USER = null;
let OPTIONS = { positions: [], company_sizes: [], roles: [] };
let scanner = null; // máy quét QR đang chạy

const ROLE_NAMES = {
  super_admin: 'Super Admin', admin: 'Admin', checkin: 'Nhân viên check-in',
};

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
  <div class="topbar">
    <div class="logo"><img src="misa-logo.jpg" alt="MISA"><span>MISA Event Check-in</span></div>
    <nav>
      <a href="#/events" class="${hash.startsWith('#/event') || hash === '' ? 'active' : ''}">Sự kiện</a>
      ${isManager ? `<a href="#/members" class="${hash.startsWith('#/members') ? 'active' : ''}">Thành viên</a>` : ''}
      ${isManager ? `<a href="#/smtp" class="${hash.startsWith('#/smtp') ? 'active' : ''}">Cấu hình Email</a>` : ''}
    </nav>
    <span class="user">${esc(USER.name)} · ${ROLE_NAMES[USER.role]}${USER.unit ? ' · ' + esc(USER.unit) : ''}</span>
    <button class="btn secondary small" id="btn-logout">Đăng xuất</button>
  </div>
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
  main.innerHTML = `
  <div class="page-head"><h2>Sự kiện</h2>
    ${canCreate ? '<button class="btn" id="btn-new-event">+ Tạo sự kiện</button>' : ''}
  </div>
  <div id="event-list">${events.length ? '' : '<div class="card muted">Chưa có sự kiện nào.</div>'}</div>`;
  const list = document.getElementById('event-list');
  for (const ev of events) {
    const past = new Date(ev.event_date) < new Date(new Date().toDateString());
    list.appendChild(el(`
    <div class="event-card">
      <div>
        <div class="ev-name" data-id="${ev.id}">${esc(ev.name)}</div>
        <div class="muted">🕒 ${fmtDate(ev.event_date)} · 👤 Trưởng BTC: ${esc(ev.organizer) || '—'}${ev.unit ? ' · 🏢 ' + esc(ev.unit) : ''} · Tạo bởi: ${esc(ev.creator_name)}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <span class="badge blue">${ev.total_attendees} đăng ký</span>
        <span class="badge green">${ev.total_checkedin} đã check-in</span>
        ${past ? '<span class="badge gray">Đã diễn ra</span>' : ''}
        <button class="btn small" data-open="${ev.id}">Mở</button>
      </div>
    </div>`));
  }
  list.querySelectorAll('[data-open],[data-id]').forEach(b => b.onclick = () => { location.hash = '#/event/' + (b.dataset.open || b.dataset.id); });
  const btnNew = document.getElementById('btn-new-event');
  if (btnNew) btnNew.onclick = () => eventFormModal(null, () => route());
}

function eventFormModal(ev, onSaved) {
  openModal(`
    <h3>${ev ? 'Sửa sự kiện' : 'Tạo sự kiện mới'}</h3>
    <label>Tên sự kiện *</label><input id="ef-name" value="${esc(ev?.name || '')}">
    <label>Thời gian tổ chức *</label><input type="datetime-local" id="ef-date" value="${ev ? ev.event_date.slice(0, 16) : ''}">
    <label>Trưởng ban tổ chức</label><input id="ef-org" value="${esc(ev?.organizer || '')}">
    ${USER.role === 'super_admin' ? `<label>Đơn vị</label><input id="ef-unit" value="${esc(ev?.unit || '')}" placeholder="VD: Công ty X">` : ''}
    <div class="error-msg" id="ef-err"></div>
    <div class="modal-actions">
      <button class="btn secondary" onclick="closeModal()">Huỷ</button>
      <button class="btn" id="ef-save">Lưu</button>
    </div>`);
  document.getElementById('ef-save').onclick = async () => {
    try {
      const body = {
        name: document.getElementById('ef-name').value,
        event_date: document.getElementById('ef-date').value,
        organizer: document.getElementById('ef-org').value,
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
  tab = tab || (isCheckinStaff ? 'scan' : 'attendees');
  const tabs = isCheckinStaff
    ? [['scan', '📷 Quét QR'], ['attendees', '✅ Đã check-in']]
    : [['attendees', '👥 Người tham dự'], ['scan', '📷 Quét QR check-in'], ['email', '✉️ Cài đặt Email'], ['report', '📊 Báo cáo'], ['staff', '🧑‍💼 Nhân viên check-in']];

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
  else if (tab === 'email') tabEmail(content, ev);
  else if (tab === 'report') tabReport(content, ev);
  else if (tab === 'staff') tabStaff(content, ev);
}

// ----- Tab: Người tham dự -----
async function tabAttendees(box, ev) {
  const rows = await api(`/events/${ev.id}/attendees`);
  const isCheckinStaff = USER.role === 'checkin';
  const unsent = rows.filter(r => !r.confirm_email_sent_at && r.email).length;
  box.innerHTML = `
  ${ev.can_manage ? `<div class="toolbar">
    <button class="btn" id="btn-add-att">+ Thêm người</button>
    <a class="btn secondary" href="/api/attendees/template" download>⬇ Tải file Excel mẫu</a>
    <button class="btn secondary" id="btn-import-att">⬆ Tải lên danh sách Excel</button>
    <input type="file" id="file-att" accept=".xlsx,.xls" style="display:none">
    <button class="btn green" id="btn-send-all" ${unsent ? '' : 'disabled'}>✉️ Gửi email QR cho người chưa nhận (${unsent})</button>
  </div>` : ''}
  <div class="muted" style="margin-bottom:10px">${isCheckinStaff ? 'Danh sách khách ĐÃ check-in' : `Tổng: <b>${rows.length}</b> người đăng ký · Nút gửi email chỉ gửi cho người <b>chưa nhận</b>, không gửi trùng.`}</div>
  <div class="table-wrap"><table><thead><tr>
    <th>Họ và tên</th><th>Email</th><th>SĐT</th><th>Chức vụ</th><th>Công ty</th><th>MST</th><th>Quy mô</th><th>Check-in</th><th>Email xác nhận</th>${ev.can_manage ? '<th></th>' : ''}
  </tr></thead><tbody id="att-body"></tbody></table></div>`;

  const body = document.getElementById('att-body');
  if (!rows.length) body.innerHTML = `<tr><td colspan="10" class="muted">Chưa có ai trong danh sách.</td></tr>`;
  for (const r of rows) {
    const tr = el(`<tr>
      <td><b>${esc(r.name)}</b>${r.is_walkin ? ' <span class="badge orange">Vãng lai</span>' : ''}</td>
      <td>${esc(r.email)}</td><td>${esc(r.phone)}</td><td>${esc(r.position)}</td><td>${esc(r.company)}</td>
      <td>${esc(r.tax_code)}</td><td>${esc(r.company_size)}</td>
      <td>${r.checked_in_at ? `<span class="badge green">✓ ${fmtDate(r.checked_in_at, true)}</span>` : '<span class="badge gray">Chưa</span>'}</td>
      <td style="white-space:nowrap">${r.confirm_email_sent_at ? '<span class="badge green">Đã gửi</span>' : '<span class="badge gray">Chưa gửi</span>'}
        ${ev.can_manage && r.email ? `<button class="btn small ${r.confirm_email_sent_at ? 'secondary' : 'green'}" data-mail="${r.id}">${r.confirm_email_sent_at ? 'Gửi lại' : 'Gửi email'}</button>` : ''}</td>
      ${ev.can_manage ? `<td style="white-space:nowrap">
        <button class="btn small secondary" data-qr="${r.id}" title="Xem mã QR">QR</button>
        <button class="btn small danger" data-del="${r.id}" title="Xoá">✕</button></td>` : ''}
    </tr>`);
    body.appendChild(tr);
  }

  body.querySelectorAll('[data-qr]').forEach(b => b.onclick = () => {
    const r = rows.find(x => x.id == b.dataset.qr);
    openModal(`<h3>Mã QR của ${esc(r.name)}</h3>
      <div style="text-align:center"><img src="/api/attendees/${r.id}/qr.png" style="width:240px"><br>
      <code>${esc(r.qr_token)}</code></div>
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

  if (!ev.can_manage) return;
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
      if (r.errors.length) msg += '\nLỗi:\n' + r.errors.slice(0, 5).join('\n');
      alert(msg); tabAttendees(box, ev);
    } catch (err) { alert('Lỗi: ' + err.message); tabAttendees(box, ev); }
  };
}

function attendeeFields(prefix, data = {}) {
  return `
  <div class="row2">
    <div><label>Họ và tên *</label><input id="${prefix}-name" value="${esc(data.name || '')}"></div>
    <div><label>Email</label><input id="${prefix}-email" value="${esc(data.email || '')}"></div>
    <div><label>Số điện thoại</label><input id="${prefix}-phone" value="${esc(data.phone || '')}"></div>
    <div><label>Chức vụ</label><select id="${prefix}-pos"><option value="">-- Chọn --</option>
      ${OPTIONS.positions.map(p => `<option ${data.position === p ? 'selected' : ''}>${p}</option>`).join('')}</select></div>
    <div><label>Nơi công tác/Tên công ty</label><input id="${prefix}-company" value="${esc(data.company || '')}"></div>
    <div><label>MST công ty</label><input id="${prefix}-tax" value="${esc(data.tax_code || '')}"></div>
  </div>
  <label>Quy mô nhân sự công ty</label><select id="${prefix}-size"><option value="">-- Chọn --</option>
    ${OPTIONS.company_sizes.map(s => `<option ${data.company_size === s ? 'selected' : ''}>${s}</option>`).join('')}</select>`;
}
function readAttendeeFields(prefix) {
  const g = id => document.getElementById(`${prefix}-${id}`).value;
  return { name: g('name'), email: g('email'), phone: g('phone'), position: g('pos'), company: g('company'), tax_code: g('tax'), company_size: g('size') };
}

function attendeeFormModal(ev, onSaved) {
  openModal(`<h3>Thêm người tham dự</h3>${attendeeFields('af')}
    <div class="error-msg" id="af-err"></div>
    <div class="modal-actions"><button class="btn secondary" onclick="closeModal()">Huỷ</button>
    <button class="btn" id="af-save">Thêm</button></div>`);
  document.getElementById('af-save').onclick = async () => {
    const body = readAttendeeFields('af');
    try {
      await api(`/events/${ev.id}/attendees`, { method: 'POST', body });
      closeModal(); toast('Đã thêm người tham dự'); onSaved();
    } catch (e) {
      if (e.data && e.data.duplicate) {
        if (confirm(e.message)) {
          await api(`/events/${ev.id}/attendees`, { method: 'POST', body: { ...body, force: true } });
          closeModal(); toast('Đã thêm (trùng SĐT)'); onSaved();
        }
      } else document.getElementById('af-err').textContent = e.message;
    }
  };
}

// ----- Tab: Quét QR -----
async function tabScan(box, ev) {
  const autoConfirm = localStorage.getItem('autoConfirm') !== '0'; // mặc định BẬT
  box.innerHTML = `
  <div class="scan-layout">
    <div class="card">
      <h3 style="margin-bottom:10px">📷 Camera quét mã</h3>
      <div id="qr-reader"></div>
      <label class="auto-toggle" style="font-weight:normal;display:flex;align-items:center;gap:8px;margin-top:10px">
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
  document.getElementById('auto-confirm').onchange = (e) => localStorage.setItem('autoConfirm', e.target.checked ? '1' : '0');
  let busy = false;

  async function handleToken(token) {
    if (busy) return; busy = true;
    try {
      const r = await api(`/events/${ev.id}/scan`, { method: 'POST', body: { token, auto_confirm: document.getElementById('auto-confirm').checked } });
      showResult(r);
      if (navigator.vibrate) navigator.vibrate(r.status === 'checked_in' || r.status === 'valid' ? 100 : [80, 60, 80, 60, 80]);
    } catch (e) { toast('Lỗi: ' + e.message); }
    setTimeout(() => { busy = false; }, 1500); // tránh quét trùng liên tục
  }

  function showResult(r) {
    const a = r.attendee;
    const infoHtml = a ? `
      <div class="info-line"><b>Họ tên:</b><span>${esc(a.name)}</span></div>
      <div class="info-line"><b>Chức vụ:</b><span>${esc(a.position) || '—'}</span></div>
      <div class="info-line"><b>Công ty:</b><span>${esc(a.company) || '—'}</span></div>
      <div class="info-line"><b>Quy mô:</b><span>${esc(a.company_size) || '—'}</span></div>
      <div class="info-line"><b>SĐT:</b><span>${esc(a.phone) || '—'}</span></div>
      <div class="info-line"><b>Email:</b><span>${esc(a.email) || '—'}</span></div>` : '';
    if (r.status === 'checked_in') {
      resultBox.className = 'scan-result valid';
      resultBox.innerHTML = `<h3 style="color:var(--green);font-size:24px">✅ CHECK-IN THÀNH CÔNG</h3>${infoHtml}
        <div class="muted" style="margin-top:10px">Mã QR này đã hết hiệu lực, không thể dùng lại.</div>`;
    } else if (r.status === 'valid') {
      resultBox.className = 'scan-result valid';
      resultBox.innerHTML = `<h3 style="color:var(--green)">✅ ${esc(r.message)}</h3>${infoHtml}
        <button class="btn green" id="btn-confirm" style="margin-top:14px;width:100%;justify-content:center;font-size:16px">XÁC NHẬN CHECK-IN</button>`;
      document.getElementById('btn-confirm').onclick = async () => {
        try {
          await api(`/events/${ev.id}/checkin/${a.id}`, { method: 'POST' });
          resultBox.className = 'scan-result valid';
          resultBox.innerHTML = `<h3 style="color:var(--green)">🎉 Check-in thành công!</h3>${infoHtml}
            <div class="muted" style="margin-top:10px">Mã QR này đã hết hiệu lực, không thể dùng lại.</div>`;
        } catch (e) { toast('Lỗi: ' + e.message); }
      };
    } else if (r.status === 'already_used') {
      resultBox.className = 'scan-result bad';
      resultBox.innerHTML = `<h3 style="color:var(--red)">⛔ MÃ ĐÃ ĐƯỢC SỬ DỤNG</h3>
        <p style="margin-bottom:10px">${esc(r.message)}</p>${infoHtml}`;
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
    openModal(`<h3>Thêm khách vãng lai</h3>
      <p class="muted">Khách chưa đăng ký trước - sẽ được check-in ngay sau khi thêm.</p>
      ${attendeeFields('wi')}
      <div class="error-msg" id="wi-err"></div>
      <div class="modal-actions"><button class="btn secondary" onclick="closeModal()">Huỷ</button>
      <button class="btn green" id="wi-save">Thêm & Check-in</button></div>`);
    document.getElementById('wi-save').onclick = async () => {
      try {
        await api(`/events/${ev.id}/walkin`, { method: 'POST', body: readAttendeeFields('wi') });
        closeModal(); toast('Đã thêm khách vãng lai và check-in thành công');
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
      ${image ? `<div style="margin:8px 0"><img src="/uploads/${esc(image)}?t=${Math.floor(performance.now())}" style="max-width:100%;max-height:120px;border-radius:6px"></div>
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
  <div class="hint">💡 Biến tự thay bằng thông tin thật: <code>{{ho_ten}}</code> tên khách · <code>{{ten_su_kien}}</code> tên sự kiện ·
    <code>{{thoi_gian}}</code> thời gian · <code>{{cong_ty}}</code> công ty khách · <code>{{qr_code}}</code> vị trí ảnh mã QR (không đặt thì QR nằm cuối email).<br>
    ✨ Nội dung có thể là <b>văn bản thường</b> hoặc <b>mã HTML</b> (dán HTML vào là hệ thống tự nhận). Ảnh header/footer tải lên bên dưới sẽ tự ghép vào đầu/cuối email. Bấm <b>Xem trước</b> để xem email hoàn chỉnh trước khi gửi.</div>
  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
      <h3>✉️ Email xác nhận đăng ký (kèm mã QR)</h3>
      <button class="btn secondary small" data-preview="confirm">👁 Xem trước</button>
    </div>
    <label><input type="checkbox" id="em-auto" style="width:auto;margin-right:8px" ${s.auto_send_confirm ? 'checked' : ''}>Tự động gửi ngay khi thêm người vào danh sách</label>
    <label>Tiêu đề email</label><input id="em-csub" value="${esc(s.confirm_subject)}" placeholder="Xác nhận đăng ký tham dự {{ten_su_kien}}">
    <label>Nội dung email (văn bản hoặc HTML)</label><textarea id="em-cbody" placeholder="Xin chào {{ho_ten}},&#10;&#10;Cảm ơn bạn đã đăng ký tham dự {{ten_su_kien}} diễn ra lúc {{thoi_gian}}.&#10;Vui lòng đưa mã QR dưới đây cho nhân viên khi đến check-in:&#10;&#10;{{qr_code}}&#10;&#10;Trân trọng!">${esc(s.confirm_body)}</textarea>
  </div>
  <div class="card">
    <h3>🖼️ Ảnh header / footer (dùng chung cho cả 2 email)</h3>
    ${imageBlock('header', s.header_image, s.header_width)}
    ${imageBlock('footer', s.footer_image, s.footer_width)}
  </div>
  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
      <h3>💚 Email cảm ơn sau check-in</h3>
      <button class="btn secondary small" data-preview="thank">👁 Xem trước</button>
    </div>
    <label><input type="checkbox" id="em-ten" style="width:auto;margin-right:8px" ${s.thank_enabled ? 'checked' : ''}>Bật tự động gửi email cảm ơn</label>
    <label>Gửi sau khi check-in (phút)</label><input type="number" id="em-delay" value="${s.thank_delay_minutes}" min="1" style="max-width:160px">
    <label>Tiêu đề email</label><input id="em-tsub" value="${esc(s.thank_subject)}" placeholder="Cảm ơn bạn đã tham dự {{ten_su_kien}}">
    <label>Nội dung email (văn bản hoặc HTML)</label><textarea id="em-tbody" placeholder="Xin chào {{ho_ten}},&#10;&#10;Cảm ơn bạn đã dành thời gian tham dự {{ten_su_kien}}. Hẹn gặp lại bạn ở các sự kiện tiếp theo!">${esc(s.thank_body)}</textarea>
  </div>
  <button class="btn" id="em-save">💾 Lưu cài đặt</button>`;

  async function saveSettings() {
    await api(`/events/${ev.id}/email-settings`, { method: 'PUT', body: {
      confirm_subject: document.getElementById('em-csub').value,
      confirm_body: document.getElementById('em-cbody').value,
      auto_send_confirm: document.getElementById('em-auto').checked,
      thank_subject: document.getElementById('em-tsub').value,
      thank_body: document.getElementById('em-tbody').value,
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
  <div class="toolbar">
    <input id="rp-search" placeholder="🔍 Tìm tên, SĐT, công ty...">
    <select id="rp-status"><option value="">Tất cả trạng thái</option><option value="in">Đã check-in</option><option value="out">Chưa check-in</option></select>
    <select id="rp-pos"><option value="">Tất cả chức vụ</option>${rp.positions.map(p => `<option>${p}</option>`).join('')}</select>
    <select id="rp-size"><option value="">Tất cả quy mô</option>${rp.company_sizes.map(s => `<option>${s}</option>`).join('')}</select>
    <a class="btn green" href="/api/events/${ev.id}/report/export" download>⬇ Xuất Excel</a>
  </div>
  <div class="table-wrap"><table><thead><tr>
    <th>Họ và tên</th><th>SĐT</th><th>Email</th><th>Chức vụ</th><th>Công ty</th><th>Quy mô</th><th>Check-in</th><th>Thời gian check-in</th><th>NV check-in</th>
  </tr></thead><tbody id="rp-body"></tbody></table></div>`;

  function renderRows() {
    const q = document.getElementById('rp-search').value.toLowerCase();
    const st = document.getElementById('rp-status').value;
    const pos = document.getElementById('rp-pos').value;
    const size = document.getElementById('rp-size').value;
    const rows = rp.rows.filter(r =>
      (!q || (r.name + r.phone + r.company + r.email).toLowerCase().includes(q)) &&
      (!st || (st === 'in' ? r.checked_in_at : !r.checked_in_at)) &&
      (!pos || r.position === pos) && (!size || r.company_size === size));
    document.getElementById('rp-body').innerHTML = rows.length ? rows.map(r => `<tr>
      <td><b>${esc(r.name)}</b>${r.is_walkin ? ' <span class="badge orange">Vãng lai</span>' : ''}</td>
      <td>${esc(r.phone)}</td><td>${esc(r.email)}</td><td>${esc(r.position)}</td><td>${esc(r.company)}</td><td>${esc(r.company_size)}</td>
      <td>${r.checked_in_at ? '<span class="badge green">Có</span>' : '<span class="badge gray">Không</span>'}</td>
      <td>${r.checked_in_at ? fmtDate(r.checked_in_at, true) : ''}</td>
      <td>${esc(r.checked_in_by_name || '')}</td></tr>`).join('')
      : '<tr><td colspan="9" class="muted">Không có dữ liệu phù hợp.</td></tr>';
  }
  ['rp-search', 'rp-status', 'rp-pos', 'rp-size'].forEach(id => document.getElementById(id).oninput = renderRows);
  renderRows();
}

// ----- Tab: Gán nhân viên check-in -----
async function tabStaff(box, ev) {
  if (!ev.can_manage) { box.innerHTML = '<div class="card muted">Bạn không có quyền quản lý mục này.</div>'; return; }
  ev = await api('/events/' + ev.id); // tải lại danh sách đã gán mới nhất
  const all = await api(`/events/${ev.id}/available-staff`);
  const assigned = new Set(ev.staff.map(s => s.id));
  box.innerHTML = `
  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
      <h3>Nhân viên check-in của sự kiện này</h3>
      <button class="btn green" id="staff-new">+ Tạo tài khoản nhân viên mới</button>
    </div>
    <p class="muted" style="margin:6px 0 14px">Tích chọn nhân viên được phép quét QR tại sự kiện này, hoặc bấm nút trên để tạo tài khoản mới (tài khoản mới sẽ tự động được gán vào sự kiện).</p>
    ${all.length ? all.map(u => `
      <label style="font-weight:normal;display:flex;align-items:center;gap:10px;padding:8px;border-bottom:1px solid var(--border);margin:0">
        <input type="checkbox" style="width:auto" value="${u.id}" ${assigned.has(u.id) ? 'checked' : ''} class="staff-cb">
        <span><b>${esc(u.name)}</b> · ${esc(u.email)}${u.unit ? ' · ' + esc(u.unit) : ''}</span>
      </label>`).join('') : '<p class="muted">Chưa có tài khoản nhân viên check-in nào.</p>'}
    <button class="btn" id="staff-save" style="margin-top:14px">💾 Lưu danh sách</button>
  </div>`;
  document.getElementById('staff-save').onclick = async () => {
    const ids = [...box.querySelectorAll('.staff-cb:checked')].map(c => Number(c.value));
    await api(`/events/${ev.id}/staff`, { method: 'PUT', body: { user_ids: ids } });
    toast('Đã lưu danh sách nhân viên check-in');
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
  <div class="page-head"><h2>Cấu hình Email (SMTP)</h2></div>
  <div class="hint">💡 <b>Dùng Gmail:</b> vào <a href="https://myaccount.google.com/apppasswords" target="_blank">myaccount.google.com/apppasswords</a>
    (cần bật xác minh 2 bước trước) → tạo <b>Mật khẩu ứng dụng</b> 16 ký tự → dán vào ô "Mật khẩu" bên dưới.
    Máy chủ: <code>smtp.gmail.com</code>, cổng <code>465</code>.</div>
  <div class="card" style="max-width:560px">
    <div class="row2">
      <div><label>Máy chủ SMTP</label><input id="sm-host" value="${esc(s.host)}"></div>
      <div><label>Cổng</label><input id="sm-port" type="number" value="${s.port}"></div>
    </div>
    <label><input type="checkbox" id="sm-secure" style="width:auto;margin-right:8px" ${s.secure ? 'checked' : ''}>Kết nối bảo mật SSL (cổng 465)</label>
    <label>Email gửi đi (tài khoản Gmail)</label><input id="sm-user" value="${esc(s.smtp_user)}" placeholder="bạn@gmail.com">
    <label>Mật khẩu (App Password 16 ký tự)</label><input id="sm-pass" value="${esc(s.smtp_pass)}" placeholder="abcd efgh ijkl mnop">
    <label>Tên người gửi hiển thị</label><input id="sm-from" value="${esc(s.from_name)}">
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
    } });
    toast('Đã lưu cấu hình SMTP');
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
