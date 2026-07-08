<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { api, fmtDate } from '../../api';
import { useToast } from '../../components/mds/toast.js';
import { printQr } from '../../lib/print';
import MButton from '../../components/mds/MButton.vue';
import MInput from '../../components/mds/MInput.vue';
import MSelect from '../../components/mds/MSelect.vue';
import MTag from '../../components/mds/MTag.vue';
import MDialog from '../../components/mds/MDialog.vue';
import AttendeeFields from '../../components/AttendeeFields.vue';

const props = defineProps({ ev: Object });
const toast = useToast();
const d = ref(null);
const q = ref(''); const fStatus = ref(''); const fImp = ref(''); const fPos = ref(''); const fSize = ref('');
const canManage = computed(() => props.ev.can_manage);

async function load() { d.value = await api(`/events/${props.ev.id}/report`); }
onMounted(load);

const exportUrl = computed(() => `/api/events/${props.ev.id}/report/export`);
const opt = (arr, allLabel) => [{ value: '', label: allLabel }, ...(arr || []).map(v => ({ value: v, label: v }))];
const pct = (n, dd) => (dd ? Math.round(n / dd * 100) : 0);

const filtered = computed(() => (d.value?.rows || []).filter(r =>
  (!q.value || (r.name + ' ' + r.phone + ' ' + r.company + ' ' + r.email).toLowerCase().includes(q.value.toLowerCase())) &&
  (!fStatus.value || (fStatus.value === 'in' ? r.checked_in_at : !r.checked_in_at)) &&
  (!fImp.value || r.importance === fImp.value) && (!fPos.value || r.position === fPos.value) && (!fSize.value || r.company_size === fSize.value)));

const impColor = (i) => ({ VIP: 'warning', VVIP: 'danger', Speaker: 'info', 'Ban lãnh đạo': 'danger', 'Ban Tổ chức': 'info' }[i] || 'neutral');

/* Sửa nhanh */
const dlgOpen = ref(false); const editing = ref(null);
const form = reactive({});
function openEdit(r) { editing.value = r; Object.assign(form, { salutation: '', name: '', email: '', phone: '', position: '', importance: 'Bình thường', company: '', tax_code: '', company_size: '', ...r }); dlgOpen.value = true; }
async function save() {
  if (!form.name) { toast.warning('Cần nhập Họ và tên'); return; }
  const doSave = (extra = {}) => api(`/attendees/${editing.value.id}`, { method: 'PUT', body: { ...form, ...extra } });
  try { await doSave(); dlgOpen.value = false; toast.success('Đã lưu'); load(); }
  catch (e) {
    if (e.data && e.data.duplicate && confirm(e.message)) { await doSave({ force: true }); dlgOpen.value = false; toast.success('Đã lưu'); load(); }
    else toast.error(e.message);
  }
}
</script>

<template>
  <div v-if="d">
    <div class="stats">
      <div class="tile"><div class="n">{{ d.total }}</div><div class="l">Tổng đăng ký</div></div>
      <div class="tile ok"><div class="n">{{ d.checkedin }}</div><div class="l">Đã check-in</div></div>
      <div class="tile"><div class="n">{{ d.not_checkedin }}</div><div class="l">Chưa check-in</div></div>
      <div class="tile warn"><div class="n">{{ d.walkin }}</div><div class="l">Khách vãng lai</div></div>
      <div class="tile ok"><div class="n">{{ pct(d.checkedin, d.total) }}%</div><div class="l">Tỷ lệ tham dự</div></div>
    </div>

    <div v-if="d.booths.length" class="card">
      <h3>🧭 Lượt ghé booth</h3>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px">
        <MTag v-for="b in d.booths" :key="b.id" color="info">{{ b.name }}: {{ b.visit_count }} lượt</MTag>
      </div>
    </div>

    <div class="toolbar">
      <div style="flex:1;min-width:200px"><MInput v-model="q" placeholder="🔍 Tìm theo tên, SĐT, công ty, email..." clearable /></div>
      <div class="toolbar-select"><MSelect v-model="fStatus" :options="[{ value: '', label: 'Tất cả trạng thái' }, { value: 'in', label: 'Đã check-in' }, { value: 'out', label: 'Chưa check-in' }]" /></div>
      <div class="toolbar-select"><MSelect v-model="fImp" :options="opt(d.importances, 'Tất cả mức độ')" /></div>
      <div class="toolbar-select"><MSelect v-model="fPos" :options="opt(d.positions, 'Tất cả chức vụ')" /></div>
      <div class="toolbar-select"><MSelect v-model="fSize" :options="opt(d.company_sizes, 'Tất cả quy mô')" /></div>
      <a class="lnk-btn" :href="exportUrl" download>⬇ Xuất Excel</a>
    </div>
    <div class="muted" style="margin-bottom:10px">Hiển thị <b>{{ filtered.length }}</b> / tổng <b>{{ d.rows.length }}</b> người</div>

    <div class="card" style="padding:0;overflow-x:auto">
      <table class="tbl">
        <thead><tr>
          <th>Họ và tên</th><th>Mức độ</th><th>SĐT</th><th>Công ty</th><th>Check-in</th><th>Thời gian</th>
          <th>Booth đã ghé</th><th>📝 Ghi chú giám sát</th><th>NV check-in</th><th v-if="canManage"></th>
        </tr></thead>
        <tbody>
          <tr v-for="r in filtered" :key="r.id" :style="r.eligible ? '' : 'background:#fef2f2'">
            <td>
              <span class="name-tags">
                <b>{{ (r.salutation ? r.salutation + ' ' : '') + r.name }}</b>
                <MTag v-if="r.is_walkin" color="warning" size="sm">Vãng lai</MTag>
                <MTag v-if="!r.eligible" color="danger" size="sm">Không đủ ĐK</MTag>
              </span>
            </td>
            <td><MTag :color="impColor(r.importance)" size="sm">{{ r.importance || 'Bình thường' }}</MTag></td>
            <td>{{ r.phone }}</td><td>{{ r.company }}</td>
            <td><MTag :color="r.checked_in_at ? 'success' : 'neutral'" size="sm">{{ r.checked_in_at ? 'Có' : 'Không' }}</MTag></td>
            <td style="white-space:nowrap">{{ r.checked_in_at ? fmtDate(r.checked_in_at, true) : '' }}</td>
            <td>
              <template v-if="r.booth_visits && r.booth_visits.length">
                <b>{{ r.booth_visits.length }}</b>
                <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:3px">
                  <MTag v-for="(bv, i) in r.booth_visits" :key="i" color="info" size="sm" :title="fmtDate(bv.visited_at, true)">{{ bv.name }}</MTag>
                </div>
              </template>
              <span v-else class="muted">—</span>
            </td>
            <td>
              <template v-for="(bv, i) in (r.booth_visits || []).filter(x => x.note)" :key="i">
                <div style="font-size:12px"><b>{{ bv.name }}:</b> {{ bv.note }}</div>
              </template>
            </td>
            <td>{{ r.checked_in_by_name || '' }}</td>
            <td v-if="canManage" style="white-space:nowrap;text-align:right">
              <span class="cell-actions" style="justify-content:flex-end">
                <MButton variant="secondary" size="md" @click="openEdit(r)">Sửa</MButton>
                <MButton v-if="r.checked_in_at" variant="secondary" size="md" @click="printQr(r)">🖨</MButton>
              </span>
            </td>
          </tr>
          <tr v-if="!filtered.length"><td :colspan="canManage ? 10 : 9" class="muted" style="padding:20px;text-align:center">Không có ai phù hợp.</td></tr>
        </tbody>
      </table>
    </div>

    <MDialog v-model="dlgOpen" type="confirm" confirm-text="Lưu" :title="editing ? 'Sửa: ' + editing.name : 'Sửa'" :width="560" @confirm="save">
      <AttendeeFields :form="form" />
    </MDialog>
  </div>
</template>

<style scoped>
.stats { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-bottom: 16px; }
@media (max-width: 820px) { .stats { grid-template-columns: repeat(2, 1fr); } }
.tile { background: #fff; border: 1px solid var(--app-border); border-radius: 12px; padding: 14px 16px; }
.tile .n { font-size: 24px; font-weight: 800; }
.tile .l { color: #6b7280; font-size: 12px; margin-top: 2px; }
.tile.ok .n { color: #15803d; } .tile.warn .n { color: #c2410c; }
h3 { font-size: 16px; font-weight: 700; margin: 0; }
.tbl { width: 100%; border-collapse: collapse; }
.tbl th, .tbl td { padding: 9px 10px; text-align: left; border-bottom: 1px solid var(--app-border); font-size: 13px; vertical-align: top; }
.tbl th { background: #f9fafb; font-weight: 600; white-space: nowrap; }
.lnk-btn { display: inline-flex; align-items: center; padding: 0 14px; height: 32px; border: 1px solid var(--app-border); border-radius: 8px; background: #fff; color: #374151; text-decoration: none; font-weight: 600; font-size: 13px; }
.lnk-btn:hover { background: var(--app-bg); }
</style>
