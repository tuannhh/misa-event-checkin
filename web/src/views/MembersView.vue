<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { api, auth, ROLE_NAMES } from '../api';
import { useToast } from '../components/mds/toast.js';
import MButton from '../components/mds/MButton.vue';
import MDialog from '../components/mds/MDialog.vue';
import MInput from '../components/mds/MInput.vue';
import MSelect from '../components/mds/MSelect.vue';
import MTag from '../components/mds/MTag.vue';

const toast = useToast();
const users = ref([]);
const fileInput = ref(null);

async function load() { users.value = await api('/users'); }
onMounted(load);

const roleOptions = computed(() => auth.user.role === 'super_admin'
  ? [{ value: 'admin', label: 'Admin' }, { value: 'checkin', label: 'Nhân viên check-in' }]
  : [{ value: 'checkin', label: 'Nhân viên check-in' }]);
const roleColor = (r) => r === 'super_admin' ? 'danger' : r === 'admin' ? 'info' : 'neutral';

const dlgOpen = ref(false);
const editing = ref(null);
const form = reactive({ name: '', email: '', department: '', unit: '', role: 'checkin', password: '' });

function openCreate() {
  editing.value = null;
  Object.assign(form, { name: '', email: '', department: '', unit: auth.user.role === 'admin' ? auth.user.unit : '', role: 'checkin', password: '' });
  dlgOpen.value = true;
}
function openEdit(u) {
  editing.value = u;
  Object.assign(form, { name: u.name, email: u.email, department: u.department || '', unit: u.unit || '', role: u.role, password: '' });
  dlgOpen.value = true;
}
async function save() {
  if (!form.name || !form.email || (!editing.value && !form.password)) { toast.warning('Cần nhập Họ tên, Email, Mật khẩu'); return; }
  try {
    const body = { name: form.name, email: form.email, department: form.department, unit: form.unit, role: form.role };
    if (form.password) body.password = form.password;
    if (editing.value) await api('/users/' + editing.value.id, { method: 'PUT', body });
    else await api('/users', { method: 'POST', body });
    dlgOpen.value = false; toast.success('Đã lưu thành viên'); load();
  } catch (e) { toast.error(e.message); }
}
async function del(u) {
  if (!confirm(`Xoá thành viên "${u.name}"?`)) return;
  try { await api('/users/' + u.id, { method: 'DELETE' }); load(); }
  catch (e) { toast.error(e.message); }
}
async function onImport(e) {
  const f = e.target.files[0]; if (!f) return;
  const fd = new FormData(); fd.append('file', f);
  try {
    const r = await api('/users/import', { method: 'POST', body: fd });
    let msg = `Đã thêm ${r.added} thành viên.`;
    if (r.errors.length) msg += '\nBỏ qua:\n' + r.errors.slice(0, 8).join('\n');
    alert(msg); load();
  } catch (err) { toast.error(err.message); }
  e.target.value = '';
}
</script>

<template>
  <div class="page-head">
    <h2>Thành viên</h2>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <a class="lnk-btn" href="/api/users/template" download>⬇ File Excel mẫu</a>
      <MButton variant="secondary" @click="fileInput.click()">⬆ Import Excel</MButton>
      <input ref="fileInput" type="file" accept=".xlsx,.xls" hidden @change="onImport" />
      <MButton variant="primary" @click="openCreate">+ Thêm thành viên</MButton>
    </div>
  </div>

  <div class="card" style="padding:0;overflow:hidden">
    <table class="tbl">
      <thead><tr><th>Họ và tên</th><th>Bộ phận</th><th>Đơn vị</th><th>Email</th><th>Vai trò</th><th></th></tr></thead>
      <tbody>
        <tr v-for="u in users" :key="u.id">
          <td><b>{{ u.name }}</b></td>
          <td>{{ u.department }}</td>
          <td>{{ u.unit }}</td>
          <td>{{ u.email }}</td>
          <td><MTag :color="roleColor(u.role)">{{ ROLE_NAMES[u.role] || u.role }}</MTag></td>
          <td style="white-space:nowrap;text-align:right">
            <MButton v-if="u.role !== 'super_admin' || auth.user.id === u.id" variant="secondary" size="md" @click="openEdit(u)">✏️</MButton>
            <MButton v-if="u.role !== 'super_admin'" variant="danger" size="md" @click="del(u)">✕</MButton>
          </td>
        </tr>
      </tbody>
    </table>
  </div>

  <MDialog v-model="dlgOpen" type="confirm" confirm-text="Lưu" :title="editing ? 'Sửa thành viên' : 'Thêm thành viên'" :width="520" @confirm="save">
    <div class="row2">
      <div><label class="fld">Họ và tên *</label><MInput v-model="form.name" /></div>
      <div><label class="fld">Email *</label><MInput v-model="form.email" type="email" /></div>
      <div><label class="fld">Bộ phận</label><MInput v-model="form.department" /></div>
      <div><label class="fld">Đơn vị</label><MInput v-model="form.unit" :disabled="auth.user.role === 'admin'" /></div>
    </div>
    <label class="fld">Vai trò</label>
    <MSelect v-model="form.role" :options="roleOptions" :disabled="editing && editing.role === 'super_admin'" />
    <label class="fld">Mật khẩu {{ editing ? '(để trống nếu không đổi)' : '*' }}</label>
    <MInput v-model="form.password" type="text" />
  </MDialog>
</template>

<style scoped>
.tbl { width: 100%; border-collapse: collapse; background: #fff; }
.tbl th, .tbl td { padding: 10px 12px; text-align: left; border-bottom: 1px solid var(--app-border); font-size: 13px; }
.tbl th { background: #f9fafb; font-weight: 600; color: #374151; white-space: nowrap; }
.lnk-btn { display: inline-flex; align-items: center; padding: 0 14px; height: 32px; border: 1px solid var(--app-border); border-radius: 8px; background: #fff; color: #374151; text-decoration: none; font-weight: 600; font-size: 13px; }
.lnk-btn:hover { background: var(--app-bg); }
</style>
