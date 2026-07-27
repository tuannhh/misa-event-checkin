<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { api } from '../../api';
import { useToast } from '../../components/mds/toast.js';
import MButton from '../../components/mds/MButton.vue';
import MInput from '../../components/mds/MInput.vue';
import MSelect from '../../components/mds/MSelect.vue';
import MTag from '../../components/mds/MTag.vue';
import MIcon from '../../components/mds/MIcon.vue';

const props = defineProps({ ev: Object });
const toast = useToast();
const d = ref(null);
const count = ref(100);
const q = ref('');
const fStatus = ref('');

async function load() { d.value = await api(`/events/${props.ev.id}/badges`); }
onMounted(load);

/* ============ Trạm in (mục 5 kế hoạch nâng cấp) - in tem QR từ điện thoại qua LAN hoặc
   Print Agent, không cần Chrome + máy tính trung gian như trước. ============ */
const stations = ref([]);
const stForm = reactive({ name: '', kind: 'lan', host: '', port: 9100 });
async function loadStations() { stations.value = await api(`/events/${props.ev.id}/print-stations`); }
onMounted(loadStations);

async function addStation() {
  if (!stForm.name.trim()) { toast.warning('Cần nhập tên trạm in'); return; }
  if (stForm.kind === 'lan' && !stForm.host.trim()) { toast.warning('Trạm in LAN cần nhập IP máy in'); return; }
  try {
    const r = await api(`/events/${props.ev.id}/print-stations`, { method: 'POST', body: { ...stForm } });
    Object.assign(stForm, { name: '', host: '', port: 9100 });
    loadStations();
    if (stForm.kind === 'agent') alert(`Đã tạo trạm in "Agent". Mã ghép nối: ${r.pairing_code}\nNhập mã này khi chạy chương trình Print Agent trên máy tính (xem print-agent/README.md).`);
  } catch (e) { toast.error(e.message); }
}
async function delStation(s) {
  if (!confirm(`Xoá trạm in "${s.name}"?`)) return;
  try { await api(`/print-stations/${s.id}`, { method: 'DELETE' }); loadStations(); }
  catch (e) { toast.error(e.message); }
}

// Trạm in đang dùng để in tem QR khách (nút In tem ở các tab Quét QR/Lễ tân/Báo cáo) - nhớ theo
// từng sự kiện trên máy này (giống cách nhớ vị trí quét), xem lib/print.js.
const activeStationId = ref(localStorage.getItem('printStation-' + props.ev.id) || '');
function setActiveStation(id) {
  activeStationId.value = String(id);
  localStorage.setItem('printStation-' + props.ev.id, String(id));
  toast.success('Đã đặt làm trạm in mặc định cho sự kiện này');
}
function clearActiveStation() {
  activeStationId.value = '';
  localStorage.removeItem('printStation-' + props.ev.id);
}

const exportUrl = computed(() => `/api/events/${props.ev.id}/badges/export`);
const filtered = computed(() => (d.value?.rows || []).filter(b => {
  const okQ = !q.value || (b.code + ' ' + (b.attendee_name || '')).toLowerCase().includes(q.value.toLowerCase());
  const okS = !fStatus.value
    || (fStatus.value === 'paired' && b.attendee_id)
    || (fStatus.value === 'unpaired' && !b.attendee_id)
    || (fStatus.value === 'stopped' && b.status === 'stopped');
  return okQ && okS;
}));

async function generate() {
  const n = Math.max(1, Math.min(2000, Number(count.value) || 0));
  try { const r = await api(`/events/${props.ev.id}/badges/generate`, { method: 'POST', body: { count: n } }); toast.success(`Đã sinh ${r.added} phôi (mã ${r.from} → ${r.to})`); load(); }
  catch (e) { toast.error(e.message); }
}
async function setStatus(b, status) {
  try { await api(`/events/${props.ev.id}/badges/${b.id}/status`, { method: 'PUT', body: { status } }); load(); }
  catch (e) { toast.error(e.message); }
}
</script>

<template>
  <div v-if="d">
    <div class="hint">
      <MIcon name="tag" /> <b>Quy trình phôi thẻ in sẵn:</b> (1) Sinh phôi số tuần tự → (2) Tải ZIP các file SVG gửi nhà in in số nhảy lên thẻ màu →
      (3) Tại sự kiện, lễ tân quét mã khách + mã phôi ở tab <b>Gán thẻ</b> để gán. Thẻ mất → gán thẻ mới + ngừng thẻ cũ.
    </div>

    <div class="card">
      <h3>Sinh & xuất phôi thẻ</h3>
      <div class="toolbar" style="margin:12px 0 0">
        <a class="lnk-btn green" :class="{ dis: !d.total }" :href="exportUrl" download><MIcon name="download" /> Tải ZIP phôi (SVG) gửi nhà in</a>
        <div style="width:130px"><MInput v-model="count" type="number" placeholder="Số lượng" /></div>
        <MButton variant="primary" @click="generate">+ Sinh phôi</MButton>
      </div>
    </div>

    <div class="stats">
      <div class="tile"><div class="n">{{ d.total }}</div><div class="l">Tổng phôi</div></div>
      <div class="tile ok"><div class="n">{{ d.paired }}</div><div class="l">Đã gán khách</div></div>
      <div class="tile"><div class="n">{{ d.unpaired }}</div><div class="l">Phôi trắng</div></div>
      <div class="tile warn"><div class="n">{{ d.stopped }}</div><div class="l">Đã ngừng</div></div>
    </div>

    <div class="toolbar">
      <div style="flex:1;min-width:200px"><MInput v-model="q" placeholder="Tìm mã phôi hoặc tên khách..." clearable><template #prefix><MIcon name="search" /></template></MInput></div>
      <div class="toolbar-select"><MSelect v-model="fStatus" :options="[{ value: '', label: 'Tất cả trạng thái' }, { value: 'paired', label: 'Đã gán' }, { value: 'unpaired', label: 'Phôi trắng' }, { value: 'stopped', label: 'Đã ngừng' }]" /></div>
    </div>
    <div class="muted" style="margin-bottom:10px">Hiển thị <b>{{ filtered.length }}</b> / tổng <b>{{ d.total }}</b> phôi</div>

    <div class="card" style="padding:0;overflow-x:auto">
      <table class="tbl">
        <thead><tr><th>Mã phôi</th><th>Trạng thái</th><th>Gán cho khách</th><th></th></tr></thead>
        <tbody>
          <tr v-for="b in filtered" :key="b.id">
            <td><b style="font-family:monospace">{{ b.code }}</b></td>
            <td>
              <MTag v-if="b.status === 'stopped'" color="danger" size="sm">Đã ngừng</MTag>
              <MTag v-else-if="b.attendee_id" color="success" size="sm">Đang dùng</MTag>
              <MTag v-else color="neutral" size="sm">Phôi trắng</MTag>
            </td>
            <td>{{ b.attendee_id ? (b.attendee_name + (b.attendee_company ? ' · ' + b.attendee_company : '')) : '—' }}</td>
            <td style="text-align:right;white-space:nowrap">
              <MButton v-if="b.attendee_id && b.status === 'stopped'" variant="secondary" size="md" @click="setStatus(b, 'active')">Dùng lại</MButton>
              <MButton v-else-if="b.attendee_id" variant="danger" size="md" @click="setStatus(b, 'stopped')">Ngừng</MButton>
            </td>
          </tr>
          <tr v-if="!filtered.length"><td colspan="4" class="muted" style="padding:20px;text-align:center">Chưa có phôi thẻ nào. Bấm "+ Sinh phôi".</td></tr>
        </tbody>
      </table>
    </div>

    <!-- Trạm in - in tem QR khách từ điện thoại, không cần Chrome/máy tính trung gian -->
    <div class="card" style="margin-top:16px">
      <h3><MIcon name="printer" /> Trạm in (in từ điện thoại)</h3>
      <p class="muted" style="margin:6px 0 14px">
        <b>LAN</b>: máy in có địa chỉ IP riêng, máy chủ gửi thẳng lệnh in qua mạng.
        <b>Agent</b>: chạy chương trình nhỏ trên 1 máy tính (xem <code>print-agent/README.md</code>) - dùng khi máy in là USB hoặc mạng máy in không thông với máy chủ.
      </p>
      <div class="toolbar" style="align-items:flex-start">
        <div style="width:180px"><MInput v-model="stForm.name" placeholder="Tên trạm in" /></div>
        <div style="width:140px"><MSelect v-model="stForm.kind" :options="[{ value: 'lan', label: 'LAN (IP máy in)' }, { value: 'agent', label: 'Agent (chương trình)' }]" /></div>
        <template v-if="stForm.kind === 'lan'">
          <div style="width:160px"><MInput v-model="stForm.host" placeholder="IP máy in" /></div>
          <div style="width:100px"><MInput v-model="stForm.port" type="number" placeholder="Cổng" /></div>
        </template>
        <MButton variant="primary" @click="addStation">+ Thêm trạm in</MButton>
      </div>
      <div v-if="stations.length" class="card" style="padding:0;overflow-x:auto;margin-top:12px">
        <table class="tbl">
          <thead><tr><th>Tên</th><th>Kiểu</th><th>Địa chỉ / Mã ghép nối</th><th>Lần cuối hoạt động</th><th></th></tr></thead>
          <tbody>
            <tr v-for="s in stations" :key="s.id">
              <td><b>{{ s.name }}</b></td>
              <td><MTag :color="s.kind === 'lan' ? 'info' : 'brand'" size="sm">{{ s.kind === 'lan' ? 'LAN' : 'Agent' }}</MTag></td>
              <td>
                <span v-if="s.kind === 'lan'" style="font-family:monospace">{{ s.host }}:{{ s.port }}</span>
                <span v-else style="font-family:monospace">{{ s.pairing_code }}</span>
                <span v-if="s.printer_name" class="muted"> · {{ s.printer_name }}</span>
              </td>
              <td class="muted">{{ s.last_seen_at || 'Chưa kết nối lần nào' }}</td>
              <td style="text-align:right;white-space:nowrap">
                <MTag v-if="String(activeStationId) === String(s.id)" color="success" size="sm" style="margin-right:8px">Đang dùng</MTag>
                <MButton v-else variant="secondary" size="md" @click="setActiveStation(s.id)">Dùng trạm này</MButton>
                <MButton variant="danger" size="md" @click="delStation(s)">Xoá</MButton>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="muted">Chưa có trạm in nào - nút "In tem" ở các tab khác sẽ in qua trình duyệt như cũ.</p>
      <p v-if="activeStationId" class="muted" style="margin-top:8px">
        Đang in qua trạm đã chọn ở trên. <a href="#" @click.prevent="clearActiveStation">Ngừng dùng, quay lại in qua trình duyệt</a>.
      </p>
    </div>
  </div>
</template>

<style scoped>
.hint { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 12px 16px; margin-bottom: 14px; font-size: 13px; line-height: 1.5; }
h3 { font-size: 16px; font-weight: 700; margin: 0; }
.stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; }
@media (max-width: 640px) { .stats { grid-template-columns: repeat(2, 1fr); } }
.tile { background: #fff; border: 1px solid var(--app-border); border-radius: 12px; padding: 14px 16px; }
.tile .n { font-size: 26px; font-weight: 800; }
.tile .l { color: #6b7280; font-size: 12px; margin-top: 2px; }
.tile.ok .n { color: #15803d; } .tile.warn .n { color: #c2410c; }
.tbl { width: 100%; border-collapse: collapse; }
.tbl th, .tbl td { padding: 9px 10px; text-align: left; border-bottom: 1px solid var(--app-border); font-size: 13px; vertical-align: middle; }
.tbl th { background: #f9fafb; font-weight: 600; white-space: nowrap; }
.lnk-btn { display: inline-flex; align-items: center; padding: 0 14px; height: 32px; border: 1px solid var(--app-border); border-radius: 8px; background: #fff; color: #374151; text-decoration: none; font-weight: 600; font-size: 13px; }
.lnk-btn.green { background: #16a34a; border-color: #16a34a; color: #fff; }
.lnk-btn.dis { opacity: .5; pointer-events: none; }
</style>
