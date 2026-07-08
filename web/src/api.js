import { reactive } from 'vue';

// Trạng thái phiên đăng nhập + danh sách lựa chọn dùng chung
export const auth = reactive({
  user: null,
  options: { positions: [], company_sizes: [], roles: [], salutations: [], importances: [], eligibility_fields: {} },
});

// Gọi API backend (giữ contract y như bản cũ). Session qua cookie same-origin.
export async function api(path, opts = {}) {
  const isForm = opts.body instanceof FormData;
  const res = await fetch('/api' + path, {
    method: opts.method || 'GET',
    credentials: 'same-origin',
    headers: isForm ? {} : { 'Content-Type': 'application/json' },
    body: isForm ? opts.body : (opts.body ? JSON.stringify(opts.body) : undefined),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error || 'Có lỗi xảy ra'); e.data = data; e.status = res.status; throw e; }
  return data;
}

export async function loadSession() {
  try {
    auth.user = await api('/me');
    auth.options = await api('/options');
  } catch { auth.user = null; }
}

export async function login(email, password) {
  auth.user = await api('/login', { method: 'POST', body: { email, password } });
  auth.options = await api('/options');
}

export async function logout() {
  try { await api('/logout', { method: 'POST' }); } catch {}
  auth.user = null;
}

// Định dạng ngày giờ. isUtc=true khi giá trị lấy từ DB (lưu UTC) -> thêm 'Z'.
export function fmtDate(iso, isUtc) {
  if (!iso) return '';
  const d = new Date(isUtc ? iso.replace(' ', 'T') + 'Z' : iso);
  return d.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
}
export function todayYMD() { return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }); }
export function eventDayStatus(ev) {
  const d = (ev.event_date || '').slice(0, 10);
  if (!d) return 'today';
  const t = todayYMD();
  return d < t ? 'past' : d > t ? 'future' : 'today';
}

export const ROLE_NAMES = { super_admin: 'Super Admin', admin: 'Admin', checkin: 'Nhân viên check-in' };
export const STAFF_TYPE_NAMES = { checkin: 'Quét QR / Check-in', reception: 'Lễ tân in QR', supervisor: 'Giám sát booth', manager: 'Quản lý (xem số liệu)' };
export function defaultStaffTab(t) { return t === 'supervisor' ? 'monitor' : t === 'manager' ? 'dashboard' : 'scan'; }
