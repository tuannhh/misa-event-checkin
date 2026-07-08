<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { api, auth, STAFF_TYPE_NAMES } from '../../api';
import { useToast } from '../../components/mds/toast.js';
import MButton from '../../components/mds/MButton.vue';
import MInput from '../../components/mds/MInput.vue';
import MSelect from '../../components/mds/MSelect.vue';
import MDialog from '../../components/mds/MDialog.vue';

const props = defineProps({ ev: Object });
const toast = useToast();
const all = ref([]);
const booths = ref([]);
const rowState = reactive({});   // uid -> { checked, staff_type, booth_id }
const fileInput = ref(null);

const typeOptions = Object.entries(STAFF_TYPE_NAMES).map(([value, label]) => ({ value, label }));
const boothOptions = computed(() => [{ value: '', label: '🚪 Cổng check-in (ghi nhận tham dự)' }, ...booths.value.map(b => ({ value: String(b.id), label: '🧭 Booth: ' + b.name }))]);

async function load() {
  const ev = await api('/events/' + props.ev.id);
  booths.value = ev.booths;
  all.value = await api(`/events/${props.ev.id}/available-staff`);
  const assigned = new Map(ev.staff.map(s => [s.id, { booth_id: s.booth_id ? String(s.booth_id) : '', staff_type: s.staff_type || 'checkin' }]));
  for (const u of all.value) {
    const a = assigned.get(u.id);
    rowState[u.id] = { checked: !!a, staff_type: a?.staff_type || 'checkin', booth_id: a?.booth_id || '' };
  }
}
onMounted(load);

function posDisabled(uid) {
  const s = rowState[uid];
  return !s.checked || s.staff_type === 'reception' || s.staff_type === 'manager';
}
function onTypeChange(uid) {
  const s = rowState[uid];
  if (s.staff_type === 'reception' || s.staff_type === 'manager') s.booth_id = '';
  else if (s.staff_type === 'supervisor' && !s.booth_id && booths.value.length) s.booth_id = String(booths.value[0].id);
}

async function save() {
  const assignments = [];
  for (const u of all.value) {
    const s = rowState[u.id];
    if (!s.checked) continue;
    if (s.staff_type === 'supervisor' && !s.booth_id) { toast.warning('Giám sát booth phải chọn 1 booth. Tạo booth ở tab Booth trước.'); return; }
    assignments.push({ user_id: u.id, booth_id: s.booth_id ? Number(s.booth_id) : null, staff_type: s.staff_type });
  }
  try { await api(`/events/${props.ev.id}/staff`, { method: 'PUT', body: { assignments } }); toast.success('Đã lưu danh sách nhân viên'); }
  catch (e) { toast.error(e.message); }
}

/* Tạo nhanh nhân viên */
const dlgOpen = ref(false);
const nf = reactive({ name: '', department: '', email: '', password: '' });
function openNew() { Object.assign(nf, { name: '', department: '', email: '', password: '' }); dlgOpen.value = true; }
async function createStaff() {
  if (!nf.name || !nf.email || !nf.password) { toast.warning('Cần nhập Họ tên, Email, Mật khẩu'); return; }
  try { await api(`/events/${props.ev.id}/staff/create`, { method: 'POST', body: { ...nf } }); dlgOpen.value = false; toast.success('Đã tạo và gán nhân viên'); load(); }
  catch (e) { toast.error(e.message); }
}
async function onImport(e) {
  const f = e.target.files[0]; if (!f) return;
  const fd = new FormData(); fd.append('file', f);
  try {
    const r = await api(`/events/${props.ev.id}/staff/import`, { method: 'POST', body: fd });
    let m = `Đã tạo ${r.added} nhân viên${r.assigned ? `, gán thêm ${r.assigned} người có sẵn` : ''}.`;
    if (r.errors.length) m += '\n' + r.errors.slice(0, 8).join('\n'); alert(m); load();
  } catch (err) { toast.error(err.message); }
  e.target.value = '';
}
</script>

<template>
  <div class="card">
    <div class="page-head" style="margin-bottom:6px">
      <h3>Nhân viên check-in của sự kiện</h3>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <a class="lnk-btn" :href="`/api/events/${ev.id}/staff/template`" download>⬇ Excel mẫu</a>
        <MButton variant="secondary" @click="fileInput.click()">⬆ Import Excel</MButton>
        <input ref="fileInput" type="file" accept=".xlsx,.xls" hidden @change="onImport" />
        <MButton variant="primary" @click="openNew">+ Tạo tài khoản nhân viên mới</MButton>
      </div>
    </div>
    <p class="muted" style="margin:6px 0 14px">Tích chọn nhân viên, chọn <b>vai trò</b> và <b>vị trí</b>. Lễ tân/Quản lý luôn ở Cổng; Giám sát bắt buộc chọn 1 booth.</p>

    <div v-if="all.length" class="card" style="padding:0;overflow-x:auto">
      <table class="tbl">
        <thead><tr><th style="width:40px"></th><th>Nhân viên</th><th>Vai trò tại sự kiện</th><th>Vị trí</th></tr></thead>
        <tbody>
          <tr v-for="u in all" :key="u.id">
            <td><input type="checkbox" v-model="rowState[u.id].checked" @change="onTypeChange(u.id)" /></td>
            <td><b>{{ u.name }}</b><br><span class="muted">{{ u.email }}<template v-if="u.unit"> · {{ u.unit }}</template></span></td>
            <td style="min-width:180px"><MSelect v-model="rowState[u.id].staff_type" :options="typeOptions" :disabled="!rowState[u.id].checked" @update:modelValue="onTypeChange(u.id)" /></td>
            <td style="min-width:220px"><MSelect v-model="rowState[u.id].booth_id" :options="boothOptions" :disabled="posDisabled(u.id)" /></td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else class="muted">Chưa có tài khoản nhân viên check-in nào. Bấm "+ Tạo tài khoản nhân viên mới".</p>

    <MButton variant="primary" style="margin-top:14px" @click="save">💾 Lưu danh sách</MButton>
  </div>

  <MDialog v-model="dlgOpen" type="confirm" confirm-text="Tạo & gán" title="Tạo tài khoản Nhân viên check-in" :width="520" @confirm="createStaff">
    <p class="muted">Tài khoản sẽ được gán ngay vào sự kiện này.</p>
    <div class="row2">
      <div><label class="fld">Họ và tên *</label><MInput v-model="nf.name" /></div>
      <div><label class="fld">Bộ phận</label><MInput v-model="nf.department" /></div>
    </div>
    <label class="fld">Email đăng nhập *</label><MInput v-model="nf.email" type="email" />
    <label class="fld">Mật khẩu *</label><MInput v-model="nf.password" type="text" />
  </MDialog>
</template>

<style scoped>
h3 { font-size: 16px; font-weight: 700; margin: 0; }
.tbl { width: 100%; border-collapse: collapse; }
.tbl th, .tbl td { padding: 9px 10px; text-align: left; border-bottom: 1px solid var(--app-border); font-size: 13px; vertical-align: middle; }
.tbl th { background: #f9fafb; font-weight: 600; white-space: nowrap; }
.lnk-btn { display: inline-flex; align-items: center; padding: 0 14px; height: 32px; border: 1px solid var(--app-border); border-radius: 8px; background: #fff; color: #374151; text-decoration: none; font-weight: 600; font-size: 13px; }
.lnk-btn:hover { background: var(--app-bg); }
</style>
