<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { api, auth, fmtDate, eventDayStatus, defaultStaffTab } from '../api';
import { useToast } from '../components/mds/toast.js';
import MButton from '../components/mds/MButton.vue';
import MDialog from '../components/mds/MDialog.vue';
import MInput from '../components/mds/MInput.vue';
import MSelect from '../components/mds/MSelect.vue';
import MTag from '../components/mds/MTag.vue';
import MCheckbox from '../components/mds/MCheckbox.vue';
import MSpinner from '../components/mds/MSpinner.vue';
import MEmptyState from '../components/mds/MEmptyState.vue';

const router = useRouter();
const toast = useToast();
const events = ref([]);
const loading = ref(true);
const canCreate = computed(() => ['super_admin', 'admin'].includes(auth.user.role));
const isStaff = computed(() => auth.user.role === 'checkin');

async function load() {
  loading.value = true;
  events.value = await api('/events');
  loading.value = false;
  if (isStaff.value) {
    const todays = events.value.filter(e => eventDayStatus(e) === 'today');
    if (todays.length === 1) router.push(`/event/${todays[0].id}/${defaultStaffTab(todays[0].my_staff_type)}`);
  }
}
onMounted(load);

function statusOf(ev) {
  const s = eventDayStatus(ev);
  if (s === 'past') return { color: 'neutral', text: 'Đã kết thúc' };
  if (s === 'future') return { color: 'warning', text: 'Chưa tới ngày' };
  return { color: 'success', text: 'Đang diễn ra hôm nay' };
}
function locked(ev) { return isStaff.value && eventDayStatus(ev) !== 'today' && ev.my_staff_type !== 'manager'; }
function openBtnText(ev) {
  if (!isStaff.value) return 'Mở';
  return ev.my_staff_type === 'supervisor' ? '📝 Vào ghi chú'
    : ev.my_staff_type === 'reception' ? '🖨 Vào lễ tân'
    : ev.my_staff_type === 'manager' ? '📊 Xem số liệu' : '📷 Vào quét';
}
function openEvent(ev) { if (!locked(ev)) router.push('/event/' + ev.id); }

/* ---- Tạo / sửa sự kiện ---- */
const dlgOpen = ref(false);
const editing = ref(null);
const saving = ref(false);
const form = reactive({ name: '', event_date: '', organizer: '', unit: '', eligibility_field: '', eligibility_values: [] });
const eligFields = computed(() => Object.entries(auth.options.eligibility_fields || {}).map(([k, f]) => ({ value: k, label: f.label })));
const eligOptions = computed(() => {
  const f = auth.options.eligibility_fields?.[form.eligibility_field];
  return f ? f.options : [];
});

function openCreate() {
  editing.value = null;
  Object.assign(form, { name: '', event_date: '', organizer: '', unit: '', eligibility_field: '', eligibility_values: [] });
  dlgOpen.value = true;
}
function openEdit(ev) {
  editing.value = ev;
  let vals = [];
  try { vals = JSON.parse(ev.eligibility_values || '[]'); } catch {}
  Object.assign(form, {
    name: ev.name, event_date: (ev.event_date || '').slice(0, 16), organizer: ev.organizer || '',
    unit: ev.unit || '', eligibility_field: ev.eligibility_field || '', eligibility_values: vals,
  });
  dlgOpen.value = true;
}
async function save() {
  if (!form.name || !form.event_date) { toast.warning('Cần nhập Tên sự kiện và Thời gian tổ chức'); return; }
  saving.value = true;
  try {
    const body = {
      name: form.name, event_date: form.event_date, organizer: form.organizer,
      eligibility_field: form.eligibility_field, eligibility_values: form.eligibility_values,
    };
    if (auth.user.role === 'super_admin') body.unit = form.unit;
    if (editing.value) await api('/events/' + editing.value.id, { method: 'PUT', body });
    else await api('/events', { method: 'POST', body });
    dlgOpen.value = false;
    toast.success('Đã lưu sự kiện');
    load();
  } catch (e) { toast.error(e.message); }
  finally { saving.value = false; }
}
</script>

<template>
  <div class="page-head">
    <h2>Sự kiện</h2>
    <MButton v-if="canCreate" variant="primary" @click="openCreate">+ Tạo sự kiện</MButton>
  </div>

  <div v-if="isStaff && events.length" class="hint">
    📅 Bạn chỉ mở được sự kiện tổ chức <b>đúng ngày hôm nay</b>. Sự kiện chưa tới ngày hoặc đã kết thúc sẽ bị khoá.
  </div>

  <div v-if="loading" style="text-align:center;padding:40px"><MSpinner :size="28" /></div>

  <MEmptyState v-else-if="!events.length" type="initial" title="Chưa có sự kiện nào"
    :description="isStaff ? 'Bạn chưa được gán vào sự kiện nào. Liên hệ quản trị viên để được thêm.' : 'Tạo sự kiện đầu tiên để bắt đầu.'" />

  <div v-else>
    <div v-for="ev in events" :key="ev.id" class="ev-card" :style="locked(ev) ? 'opacity:.6' : ''">
      <div class="ev-main">
        <div class="ev-name" :class="{ clickable: !locked(ev) }" @click="openEvent(ev)">{{ ev.name }}</div>
        <div class="muted ev-meta">
          🕒 {{ fmtDate(ev.event_date) }} · 👤 {{ ev.organizer || '—' }}
          <template v-if="ev.unit"> · 🏢 {{ ev.unit }}</template>
          <template v-if="!isStaff"> · Tạo bởi: {{ ev.creator_name }}</template>
        </div>
      </div>
      <div class="ev-actions">
        <template v-if="!isStaff">
          <MTag color="info">{{ ev.total_attendees }} đăng ký</MTag>
          <MTag color="success">{{ ev.total_checkedin }} check-in</MTag>
        </template>
        <MTag :color="statusOf(ev).color">{{ statusOf(ev).text }}</MTag>
        <MButton v-if="!isStaff" variant="secondary" size="md" @click="openEdit(ev)">Sửa</MButton>
        <MButton v-if="locked(ev)" variant="secondary" size="md" disabled>🔒 Khoá</MButton>
        <MButton v-else variant="primary" size="md" @click="openEvent(ev)">{{ openBtnText(ev) }}</MButton>
      </div>
    </div>
  </div>

  <MDialog v-model="dlgOpen" type="confirm" confirm-text="Lưu" :title="editing ? 'Sửa sự kiện' : 'Tạo sự kiện mới'" :width="560" @confirm="save">
    <label class="fld">Tên sự kiện *</label>
    <MInput v-model="form.name" placeholder="VD: Hội thảo CEO & AI 2026" />
    <label class="fld">Thời gian tổ chức *</label>
    <input type="datetime-local" v-model="form.event_date" class="native-dt" />
    <label class="fld">Trưởng ban tổ chức</label>
    <MInput v-model="form.organizer" />
    <template v-if="auth.user.role === 'super_admin'">
      <label class="fld">Đơn vị</label>
      <MInput v-model="form.unit" placeholder="VD: Công ty X" />
    </template>
    <div class="elig">
      <b>🎯 Điều kiện đủ tham dự</b>
      <p class="muted" style="margin:4px 0 8px">Người KHÔNG đạt vẫn hiện trong danh sách nhưng bị khoá gửi email.</p>
      <MSelect v-model="form.eligibility_field" :options="[{ value: '', label: 'Không áp dụng - tất cả đều đủ' }, ...eligFields]" />
      <div v-if="eligOptions.length" style="margin-top:8px">
        <div class="muted" style="margin-bottom:4px">Tích các giá trị được chấp nhận:</div>
        <MCheckbox v-for="o in eligOptions" :key="o" v-model="form.eligibility_values" :value="o" :label="o" />
      </div>
    </div>
  </MDialog>
</template>

<style scoped>
.hint { background: var(--mds-brand-50, #eff6ff); border: 1px solid var(--mds-brand-200, #bfdbfe); color: var(--mds-brand-700, #1e40af); border-radius: 10px; padding: 12px 14px; font-size: 13px; margin-bottom: 14px; }
.ev-card { background: #fff; border: 1px solid var(--app-border); border-radius: 12px; padding: 18px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; gap: 14px; flex-wrap: wrap; }
.ev-name { font-size: 16px; font-weight: 700; color: var(--mds-brand-700, #1d4ed8); }
.ev-name.clickable { cursor: pointer; }
.ev-name.clickable:hover { text-decoration: underline; }
.ev-meta { font-size: 13px; margin-top: 4px; }
.ev-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.native-dt { width: 100%; padding: 8px 11px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 13px; font-family: inherit; }
.elig { border: 1px dashed var(--app-border); border-radius: 10px; padding: 12px; margin-top: 14px; }
</style>
