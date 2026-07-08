<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { api, fmtDate } from '../../api';
import { useToast } from '../../components/mds/toast.js';
import { printQr } from '../../lib/print';
import MButton from '../../components/mds/MButton.vue';
import MInput from '../../components/mds/MInput.vue';
import MTag from '../../components/mds/MTag.vue';
import MDialog from '../../components/mds/MDialog.vue';
import AttendeeFields from '../../components/AttendeeFields.vue';

const props = defineProps({ ev: Object });
const toast = useToast();
const rows = ref([]);
const q = ref('');

async function load() { rows.value = await api(`/events/${props.ev.id}/attendees`); }
onMounted(load);

const filtered = computed(() => rows.value.filter(r =>
  !q.value || (r.name + ' ' + r.company + ' ' + r.phone + ' ' + r.email).toLowerCase().includes(q.value.toLowerCase())));

async function checkin(r) {
  try { await api(`/events/${props.ev.id}/checkin/${r.id}`, { method: 'POST' }); toast.success('Đã check-in ' + r.name); load(); }
  catch (e) { toast.error(e.message); }
}

/* Khách vãng lai */
const dlgOpen = ref(false);
const form = reactive({});
function emptyForm() { return { salutation: '', name: '', email: '', phone: '', position: '', importance: 'Bình thường', company: '', tax_code: '', company_size: '' }; }
function openWalkin() { Object.assign(form, emptyForm()); dlgOpen.value = true; }
async function saveWalkin() {
  if (!form.name) { toast.warning('Cần nhập Họ và tên'); return; }
  try {
    const r = await api(`/events/${props.ev.id}/walkin`, { method: 'POST', body: { ...form, booth_id: null } });
    dlgOpen.value = false; toast.success('Đã thêm & check-in khách vãng lai');
    printQr({ id: r.id, name: form.name, company: form.company });
    load();
  } catch (e) { toast.error(e.message); }
}
</script>

<template>
  <div class="hint">🖨 Máy tính này nối máy in tem. Tra cứu khách → bấm <b>In QR</b> để in tem cho khách tự dán/quét. Khách chưa đăng ký → thêm <b>vãng lai</b> (tự in tem ngay).</div>

  <div class="toolbar">
    <div style="flex:1;min-width:220px"><MInput v-model="q" placeholder="🔍 Tìm theo tên, công ty, SĐT, email..." clearable /></div>
    <MButton variant="primary" @click="openWalkin">+ Khách vãng lai</MButton>
  </div>
  <div class="muted" style="margin-bottom:10px">Hiển thị <b>{{ filtered.length }}</b> / tổng <b>{{ rows.length }}</b> khách</div>

  <div class="card" style="padding:0;overflow-x:auto">
    <table class="tbl">
      <thead><tr><th>Họ và tên</th><th>Công ty</th><th>Chức vụ</th><th>Check-in</th><th></th></tr></thead>
      <tbody>
        <tr v-for="r in filtered" :key="r.id">
          <td><span class="name-tags"><b>{{ (r.salutation ? r.salutation + ' ' : '') + r.name }}</b><MTag v-if="r.is_walkin" color="warning" size="sm">Vãng lai</MTag></span></td>
          <td>{{ r.company }}</td><td>{{ r.position }}</td>
          <td><MTag v-if="r.checked_in_at" color="success" size="sm">✓ {{ fmtDate(r.checked_in_at, true) }}</MTag><MTag v-else color="neutral" size="sm">Chưa</MTag></td>
          <td style="white-space:nowrap;text-align:right">
            <span class="cell-actions" style="justify-content:flex-end">
              <MButton v-if="!r.checked_in_at" variant="primary" size="md" @click="checkin(r)">Check-in</MButton>
              <MButton variant="secondary" size="md" @click="printQr(r)">🖨 In QR</MButton>
            </span>
          </td>
        </tr>
        <tr v-if="!filtered.length"><td colspan="5" class="muted" style="padding:20px;text-align:center">Không có khách phù hợp.</td></tr>
      </tbody>
    </table>
  </div>

  <MDialog v-model="dlgOpen" type="confirm" confirm-text="Lưu & in tem" title="Khách vãng lai (chưa đăng ký)" :width="560" @confirm="saveWalkin">
    <AttendeeFields :form="form" />
  </MDialog>
</template>

<style scoped>
.hint { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 12px 16px; margin-bottom: 14px; font-size: 13px; line-height: 1.5; }
.tbl { width: 100%; border-collapse: collapse; }
.tbl th, .tbl td { padding: 9px 10px; text-align: left; border-bottom: 1px solid var(--app-border); font-size: 13px; vertical-align: middle; }
.tbl th { background: #f9fafb; font-weight: 600; white-space: nowrap; }
</style>
