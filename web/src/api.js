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

// Quyền tick-chọn (Đợt 2) - thay cho staff_type cứng. `ev.my_permissions` do backend trả theo
// nhóm chức năng đã gán (xem routes/lib/permissions.js). Dùng can(ev, 'checkin') thay vì so
// sánh staff_type ở khắp nơi.
export function can(ev, code) { return !!(ev && ev.my_permissions && ev.my_permissions.includes(code)); }

// Quyền cần có mặt tại sự kiện (khoá theo ngày tổ chức) - khớp quy tắc backend (isEventToday
// áp cho scan/walkin/badge). Ai chỉ có view_report/không quyền nào (VD "Quản lý") không bị khoá.
const NEEDS_ONSITE_PERMS = ['checkin', 'note', 'mark_potential', 'assign_badge'];
export function needsOnsite(ev) { return NEEDS_ONSITE_PERMS.some(p => can(ev, p)); }

// Danh sách tab hiển thị cho nhân viên check-in, suy ra TỪ QUYỀN thực tế thay vì staff_type cứng
// - dùng chung giữa EventsView (nút mở nhanh) và EventDetailView (thanh tab đầy đủ).
export function staffTabsFor(ev) {
  const t = [];
  if (can(ev, 'checkin')) t.push({ key: 'scan', label: '📷 Quét QR' });
  if (can(ev, 'assign_badge') && ev.badge_count) t.push({ key: 'pair', label: '🎫 Gán thẻ' });
  if (can(ev, 'view_checkin_list')) {
    if (ev.my_position?.staff_type === 'reception') t.push({ key: 'reception', label: '🖨 Danh sách & In QR' });
    else t.push({ key: 'attendees', label: '✅ Đã check-in' });
  }
  if (can(ev, 'note') || can(ev, 'mark_potential')) t.push({ key: 'monitor', label: '📝 Ghi chú booth' });
  if (can(ev, 'view_report')) t.push({ key: 'report', label: '📊 Báo cáo' });
  if (!t.length) t.push({ key: 'dashboard', label: '📊 Số liệu' }); // không quyền nào -> chỉ xem số liệu ẩn danh
  return t;
}
