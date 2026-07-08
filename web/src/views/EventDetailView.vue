<script setup>
import { ref, computed, watch, onMounted, defineAsyncComponent } from 'vue';
import { useRouter } from 'vue-router';
import { api, auth, fmtDate, eventDayStatus } from '../api';
import MButton from '../components/mds/MButton.vue';
import MTabs from '../components/mds/MTabs.vue';
import MTag from '../components/mds/MTag.vue';
import MSpinner from '../components/mds/MSpinner.vue';

// Các tab đã chuyển sang Vue (GĐ2). Tab chưa làm (GĐ3-4) sẽ hiện placeholder.
const tabComponents = {
  attendees: defineAsyncComponent(() => import('./tabs/AttendeesTab.vue')),
  booths: defineAsyncComponent(() => import('./tabs/BoothsTab.vue')),
  staff: defineAsyncComponent(() => import('./tabs/StaffTab.vue')),
};

const props = defineProps({ id: [String, Number], tab: String });
const router = useRouter();
const ev = ref(null);
const loading = ref(true);
const err = ref('');

const isCheckin = computed(() => auth.user.role === 'checkin');
const staffType = computed(() => isCheckin.value ? (ev.value?.my_position?.staff_type || 'checkin') : null);

const tabs = computed(() => {
  if (!ev.value) return [];
  if (staffType.value === 'supervisor') return [{ key: 'monitor', label: '📝 Ghi chú booth' }];
  if (staffType.value === 'manager') return [{ key: 'dashboard', label: '📊 Số liệu' }];
  if (staffType.value === 'reception') {
    const t = [{ key: 'scan', label: '📷 Quét & Check-in' }];
    if (ev.value.badge_count) t.push({ key: 'pair', label: '🎫 Gán thẻ' });
    t.push({ key: 'reception', label: '🖨 Danh sách & In QR' });
    return t;
  }
  if (isCheckin.value) {
    const t = [{ key: 'scan', label: '📷 Quét QR' }];
    if (ev.value.badge_count) t.push({ key: 'pair', label: '🎫 Gán thẻ' });
    t.push({ key: 'attendees', label: '✅ Đã check-in' });
    return t;
  }
  return [
    { key: 'attendees', label: '👥 Người tham dự' }, { key: 'scan', label: '📷 Quét QR' },
    { key: 'booths', label: '🧭 Booth' }, { key: 'badges', label: '🎫 Phôi thẻ' },
    { key: 'email', label: '✉️ Email' }, { key: 'report', label: '📊 Báo cáo' }, { key: 'staff', label: '🧑‍💼 Nhân viên' },
  ];
});

const activeTab = computed({
  get: () => props.tab || (tabs.value[0] && tabs.value[0].key) || 'attendees',
  set: (k) => router.push(`/event/${props.id}/${k}`),
});

const dayLocked = computed(() => isCheckin.value && staffType.value !== 'manager' && ev.value && eventDayStatus(ev.value) !== 'today');

const activeComponent = computed(() => tabComponents[activeTab.value] || null);

async function load() {
  loading.value = true; err.value = '';
  try { ev.value = await api('/events/' + props.id); }
  catch (e) { err.value = e.message; }
  finally { loading.value = false; }
}
onMounted(load);
watch(() => props.id, load);

async function delEvent() {
  if (!confirm(`Xoá sự kiện "${ev.value.name}" và toàn bộ danh sách?`)) return;
  await api('/events/' + props.id, { method: 'DELETE' });
  router.push('/events');
}
</script>

<template>
  <div v-if="loading" style="text-align:center;padding:40px"><MSpinner :size="28" /></div>
  <div v-else-if="err" class="card">{{ err }} <RouterLink to="/events">← Quay lại</RouterLink></div>
  <template v-else-if="ev">
    <div class="page-head">
      <div>
        <RouterLink to="/events" class="muted" style="text-decoration:none">← Tất cả sự kiện</RouterLink>
        <h2 style="margin-top:4px">{{ ev.name }}</h2>
        <div class="muted">🕒 {{ fmtDate(ev.event_date) }} · 👤 {{ ev.organizer || '—' }}<template v-if="ev.unit"> · 🏢 {{ ev.unit }}</template></div>
      </div>
      <div v-if="ev.can_manage" style="display:flex;gap:8px">
        <MButton variant="danger" @click="delEvent">Xoá</MButton>
      </div>
    </div>

    <div v-if="dayLocked" class="card" style="text-align:center;padding:40px 20px">
      <div style="font-size:42px">🔒</div>
      <h3 style="margin:10px 0">{{ eventDayStatus(ev) === 'future' ? 'Sự kiện chưa tới ngày tổ chức' : 'Sự kiện đã kết thúc' }}</h3>
      <p class="muted">Chỉ có thể thao tác vào đúng ngày tổ chức sự kiện.</p>
      <RouterLink to="/events"><MButton variant="primary" style="margin-top:12px">← Về danh sách</MButton></RouterLink>
    </div>

    <template v-else>
      <MTabs v-model="activeTab" :tabs="tabs" variant="underline" />
      <div style="margin-top:16px">
        <component v-if="activeComponent" :is="activeComponent" :key="activeTab" :ev="ev" @reload="load" />
        <div v-else class="card">
          <p class="muted">Tab <b>{{ activeTab }}</b> đang được chuyển sang giao diện Vue mới (giai đoạn tiếp theo). Chức năng backend đã sẵn sàng trên MySQL.</p>
        </div>
      </div>
    </template>
  </template>
</template>
