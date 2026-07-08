<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { api, auth, fmtDate } from '../../api';
import { useToast } from '../../components/mds/toast.js';
import { printQr } from '../../lib/print';
import MButton from '../../components/mds/MButton.vue';
import MInput from '../../components/mds/MInput.vue';
import MSelect from '../../components/mds/MSelect.vue';
import MTag from '../../components/mds/MTag.vue';
import MDialog from '../../components/mds/MDialog.vue';
import MCheckbox from '../../components/mds/MCheckbox.vue';
import AttendeeFields from '../../components/AttendeeFields.vue';

const props = defineProps({ ev: Object });
const toast = useToast();
const rows = ref([]);
const canManage = computed(() => props.ev.can_manage);

const q = ref(''); const fImp = ref(''); const fPos = ref(''); const fSize = ref(''); const fStatus = ref('');
const selected = ref([]);
const fileInput = ref(null);

async function load() { rows.value = await api(`/events/${props.ev.id}/attendees`); selected.value = []; }
onMounted(load);

const ineligible = computed(() => rows.value.filter(r => !r.eligible).length);
const unsent = computed(() => rows.value.filter(r => !r.confirm_email_sent_at && r.email && r.eligible).length);
const opt = (arr) => [{ value: '', label: 'Tất cả' }, ...arr.map(v => ({ value: v, label: v }))];

const filtered = computed(() => rows.value.filter(r =>
  (!q.value || (r.name + ' ' + r.company + ' ' + r.phone + ' ' + r.email).toLowerCase().includes(q.value.toLowerCase())) &&
  (!fImp.value || r.importance === fImp.value) && (!fPos.value || r.position === fPos.value) &&
  (!fSize.value || r.company_size === fSize.value) &&
  (!fStatus.value || (fStatus.value === 'in' ? r.checked_in_at : !r.checked_in_at))));

const impColor = (i) => ({ VIP: 'warning', VVIP: 'danger', Speaker: 'info', 'Ban lãnh đạo': 'danger', 'Ban Tổ chức': 'info' }[i] || 'neutral');
function toggleSel(id) { const i = selected.value.indexOf(id); i >= 0 ? selected.value.splice(i, 1) : selected.value.push(id); }

/* form thêm/sửa */
const dlgOpen = ref(false); const editing = ref(null);
const form = reactive({});
function emptyForm() { return { salutation: '', name: '', email: '', phone: '', position: '', importance: 'Bình thường', company: '', tax_code: '', company_size: '' }; }
function openAdd() { editing.value = null; Object.assign(form, emptyForm()); dlgOpen.value = true; }
function openEdit(r) { editing.value = r; Object.assign(form, { ...emptyForm(), ...r }); dlgOpen.value = true; }
async function save() {
  if (!form.name) { toast.warning('Cần nhập Họ và tên'); return; }
  const doSave = (extra = {}) => editing.value
    ? api(`/attendees/${editing.value.id}`, { method: 'PUT', body: { ...form, ...extra } })
    : api(`/events/${props.ev.id}/attendees`, { method: 'POST', body: { ...form, ...extra } });
  try { await doSave(); dlgOpen.value = false; toast.success('Đã lưu'); load(); }
  catch (e) {
    if (e.data && e.data.duplicate && confirm(e.message)) { await doSave({ force: true }); dlgOpen.value = false; toast.success('Đã lưu'); load(); }
    else toast.error(e.message);
  }
}
async function del(r) {
  if (!confirm('Xoá người này khỏi danh sách?')) return;
  await api('/attendees/' + r.id, { method: 'DELETE' }); load();
}
async function sendOne(r) {
  try { await api(`/attendees/${r.id}/send-email`, { method: 'POST' }); toast.success('Đã gửi email kèm QR'); load(); }
  catch (e) { toast.error(e.message); }
}
async function sendSelected() {
  if (!selected.value.length || !confirm(`Gửi email QR cho ${selected.value.length} người đã chọn?`)) return;
  try {
    const r = await api(`/events/${props.ev.id}/send-emails`, { method: 'POST', body: { ids: selected.value } });
    let m = `Đã gửi ${r.sent} email.`; if (r.skipped) m += `\nBỏ qua ${r.skipped} (không email/không đủ ĐK).`;
    if (r.errors.length) m += '\nLỗi:\n' + r.errors.slice(0, 5).join('\n'); alert(m); load();
  } catch (e) { toast.error(e.message); }
}
async function sendAll() {
  try {
    const r = await api(`/events/${props.ev.id}/send-all-emails`, { method: 'POST' });
    let m = `Đã gửi ${r.sent}/${r.total} email.`; if (r.skipped) m += `\nBỏ qua ${r.skipped} người không đủ ĐK.`;
    if (r.errors.length) m += '\nLỗi:\n' + r.errors.slice(0, 5).join('\n'); alert(m); load();
  } catch (e) { toast.error(e.message); }
}
async function onImport(e) {
  const f = e.target.files[0]; if (!f) return;
  const fd = new FormData(); fd.append('file', f);
  try {
    const r = await api(`/events/${props.ev.id}/attendees/import`, { method: 'POST', body: fd });
    let m = `Đã thêm ${r.added} người.`; if (r.auto_email) m += ' Đang tự động gửi email QR...';
    if (r.errors.length) m += `\n${r.errors.length} dòng bỏ qua:\n` + r.errors.slice(0, 8).join('\n'); alert(m); load();
  } catch (err) { toast.error(err.message); }
  e.target.value = '';
}
const qrDlg = ref(false); const qrRow = ref(null);
function showQr(r) { qrRow.value = r; qrDlg.value = true; }
</script>

<template>
  <div v-if="canManage" class="toolbar">
    <MButton variant="primary" @click="openAdd">+ Thêm người</MButton>
    <a class="lnk-btn" href="/api/attendees/template" download>⬇ Excel mẫu</a>
    <MButton variant="secondary" @click="fileInput.click()">⬆ Tải lên Excel</MButton>
    <input ref="fileInput" type="file" accept=".xlsx,.xls" hidden @change="onImport" />
    <MButton variant="secondary" :disabled="!unsent" @click="sendAll">✉️ Gửi QR cho người chưa nhận ({{ unsent }})</MButton>
  </div>

  <div class="toolbar">
    <div style="flex:1;min-width:220px"><MInput v-model="q" placeholder="🔍 Tìm theo tên, công ty, SĐT, email..." clearable /></div>
    <MSelect v-model="fImp" :options="opt(auth.options.importances)" />
    <MSelect v-model="fPos" :options="opt(auth.options.positions)" />
    <MSelect v-model="fStatus" :options="[{ value: '', label: 'Tất cả trạng thái' }, { value: 'in', label: 'Đã check-in' }, { value: 'out', label: 'Chưa check-in' }]" />
  </div>

  <div v-if="canManage && selected.length" class="bulk">
    <span>Đã chọn <b>{{ selected.length }}</b> người</span>
    <MButton variant="secondary" size="md" @click="sendSelected">✉️ Gửi email cho người đã chọn</MButton>
    <MButton variant="link" size="md" @click="selected = []">Bỏ chọn</MButton>
  </div>

  <div class="muted" style="margin-bottom:10px">
    Hiển thị <b>{{ filtered.length }}</b> / tổng <b>{{ rows.length }}</b> người
    <span v-if="ineligible" style="color:#dc2626"> · <b>{{ ineligible }}</b> người không đủ điều kiện</span>
  </div>

  <div class="card" style="padding:0;overflow-x:auto">
    <table class="tbl">
      <thead><tr>
        <th v-if="canManage" style="width:34px"></th>
        <th>Họ và tên</th><th>Mức độ</th><th>Email</th><th>SĐT</th><th>Công ty</th><th>Check-in</th><th>Email</th><th></th>
      </tr></thead>
      <tbody>
        <tr v-for="r in filtered" :key="r.id" :style="r.eligible ? '' : 'background:#fef2f2'">
          <td v-if="canManage"><input type="checkbox" :checked="selected.includes(r.id)" :disabled="!(r.email && r.eligible)" @change="toggleSel(r.id)" /></td>
          <td>
            <b>{{ (r.salutation ? r.salutation + ' ' : '') + r.name }}</b>
            <MTag v-if="r.is_walkin" color="warning" size="sm">Vãng lai</MTag>
            <MTag v-if="!r.eligible" color="danger" size="sm">Không đủ ĐK</MTag>
          </td>
          <td><MTag :color="impColor(r.importance)" size="sm">{{ r.importance || 'Bình thường' }}</MTag></td>
          <td>{{ r.email }}</td><td>{{ r.phone }}</td><td>{{ r.company }}</td>
          <td><MTag v-if="r.checked_in_at" color="success" size="sm">✓ {{ fmtDate(r.checked_in_at, true) }}</MTag><MTag v-else color="neutral" size="sm">Chưa</MTag></td>
          <td style="white-space:nowrap">
            <MTag :color="r.confirm_email_sent_at ? 'success' : 'neutral'" size="sm">{{ r.confirm_email_sent_at ? 'Đã gửi' : 'Chưa' }}</MTag>
            <MButton v-if="canManage && r.email" variant="secondary" size="md" :disabled="!r.eligible" @click="sendOne(r)">{{ r.confirm_email_sent_at ? 'Gửi lại' : 'Gửi' }}</MButton>
          </td>
          <td style="white-space:nowrap;text-align:right">
            <template v-if="canManage">
              <MButton variant="secondary" size="md" @click="openEdit(r)">✏️</MButton>
              <MButton variant="secondary" size="md" @click="showQr(r)">QR</MButton>
              <MButton variant="danger" size="md" @click="del(r)">✕</MButton>
            </template>
          </td>
        </tr>
        <tr v-if="!filtered.length"><td :colspan="canManage ? 9 : 8" class="muted" style="padding:20px;text-align:center">Không có ai phù hợp.</td></tr>
      </tbody>
    </table>
  </div>

  <MDialog v-model="dlgOpen" type="confirm" confirm-text="Lưu" :title="editing ? 'Sửa: ' + editing.name : 'Thêm người tham dự'" :width="560" @confirm="save">
    <AttendeeFields :form="form" />
  </MDialog>

  <MDialog v-model="qrDlg" :title="qrRow ? 'Mã QR: ' + qrRow.name : 'Mã QR'" :width="320">
    <div v-if="qrRow" style="text-align:center">
      <img :src="`/api/attendees/${qrRow.id}/qr.png`" style="width:240px" />
      <div style="font-family:monospace;font-size:12px;color:#6b7280;margin-top:6px">{{ qrRow.qr_token }}</div>
      <MButton variant="secondary" style="margin-top:10px" @click="printQr(qrRow)">🖨 In tem QR (50×50mm)</MButton>
    </div>
  </MDialog>
</template>

<style scoped>
.tbl { width: 100%; border-collapse: collapse; }
.tbl th, .tbl td { padding: 9px 10px; text-align: left; border-bottom: 1px solid var(--app-border); font-size: 13px; vertical-align: middle; }
.tbl th { background: #f9fafb; font-weight: 600; white-space: nowrap; }
.bulk { display: flex; align-items: center; gap: 10px; background: var(--mds-brand-50, #eff6ff); border: 1px solid var(--mds-brand-200, #bfdbfe); border-radius: 10px; padding: 8px 14px; margin-bottom: 12px; }
.lnk-btn { display: inline-flex; align-items: center; padding: 0 14px; height: 32px; border: 1px solid var(--app-border); border-radius: 8px; background: #fff; color: #374151; text-decoration: none; font-weight: 600; font-size: 13px; }
.lnk-btn:hover { background: var(--app-bg); }
</style>
