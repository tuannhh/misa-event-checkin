<script setup>
import { ref, computed, watch, onMounted, defineAsyncComponent } from 'vue';
import { useRouter } from 'vue-router';
import { api, auth, fmtDate, eventDayStatus, staffTabsFor, needsOnsite } from '../api';
import MButton from '../components/mds/MButton.vue';
import MTabs from '../components/mds/MTabs.vue';
import MTag from '../components/mds/MTag.vue';
import MSpinner from '../components/mds/MSpinner.vue';

// Các tab đã chuyển sang Vue (GĐ2). Tab chưa làm (GĐ3-4) sẽ hiện placeholder.
const tabComponents = {
  attendees: defineAsyncComponent(() => import('./tabs/AttendeesTab.vue')),
  booths: defineAsyncComponent(() => import('./tabs/BoothsTab.vue')),
  staff: defineAsyncComponent(() => import('./tabs/StaffTab.vue')),
  scan: defineAsyncComponent(() => import('./tabs/ScanTab.vue')),
  pair: defineAsyncComponent(() => import('./tabs/PairTab.vue')),
  reception: defineAsyncComponent(() => import('./tabs/ReceptionTab.vue')),
  badges: defineAsyncComponent(() => import('./tabs/BadgesTab.vue')),
  email: defineAsyncComponent(() => import('./tabs/EmailTab.vue')),
  report: defineAsyncComponent(() => import('./tabs/ReportTab.vue')),
  monitor: defineAsyncComponent(() => import('./tabs/MonitorTab.vue')),
  dashboard: defineAsyncComponent(() => import('./tabs/DashboardTab.vue')),
};

const props = defineProps({ id: [String, Number], tab: String });
const router = useRouter();
const ev = ref(null);
const loading = ref(true);
const err = ref('');

const isCheckin = computed(() => auth.user.role === 'checkin');

// Tab của nhân viên hiện trường suy ra TỪ QUYỀN thực tế (my_permissions), không còn hard-code
// theo staff_type - tạo nhóm chức năng mới ở tab Nhân viên sẽ tự có đúng tab tương ứng.
const tabs = computed(() => {
  if (!ev.value) return [];
  if (!isCheckin.value) {
    return [
      { key: 'attendees', label: '👥 Người tham dự' }, { key: 'scan', label: '📷 Quét QR' },
      { key: 'booths', label: '🧭 Booth' }, { key: 'badges', label: '🎫 Phôi thẻ' },
      { key: 'email', label: '✉️ Email' }, { key: 'report', label: '📊 Báo cáo' }, { key: 'staff', label: '🧑‍💼 Nhân viên' },
    ];
  }
  return staffTabsFor(ev.value);
});

// Nếu URL trỏ tới 1 tab không còn hợp lệ với quyền hiện tại (VD: đổi nhóm chức năng rồi tải
// lại trang đang mở sẵn tab cũ, hoặc bookmark/PWA icon trỏ tab cũ) -> tự về tab đầu tiên hợp lệ
// thay vì hiện màn trắng.
const activeTab = computed({
  get: () => {
    const valid = tabs.value.some(t => t.key === props.tab);
    return valid ? props.tab : ((tabs.value[0] && tabs.value[0].key) || 'attendees');
  },
  set: (k) => router.push(`/event/${props.id}/${k}`),
});

const dayLocked = computed(() => isCheckin.value && ev.value && needsOnsite(ev.value) && eventDayStatus(ev.value) !== 'today');

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
      <MTabs v-if="!isCheckin" v-model="activeTab" :tabs="tabs" variant="underline" />
      <div :style="isCheckin ? 'margin-top:12px' : 'margin-top:16px'" :class="{ 'field-content': isCheckin }">
        <component v-if="activeComponent" :is="activeComponent" :key="activeTab" :ev="ev" @reload="load" />
        <div v-else class="card">
          <p class="muted">Tab <b>{{ activeTab }}</b> đang được chuyển sang giao diện Vue mới (giai đoạn tiếp theo). Chức năng backend đã sẵn sàng trên MySQL.</p>
        </div>
      </div>

      <!-- Bottom nav mobile-first cho nhân viên hiện trường - tối đa 5 mục có icon+nhãn (MDS
           cấm dãy icon không nhãn). Chỉ hiện khi có từ 2 tab trở lên; 1 tab thì không cần chuyển. -->
      <nav v-if="isCheckin && tabs.length > 1" class="field-bottom-nav">
        <button v-for="t in tabs.slice(0, 5)" :key="t.key" class="field-nav-item" :class="{ active: activeTab === t.key }" @click="activeTab = t.key">
          {{ t.label }}
        </button>
      </nav>
    </template>
  </template>
</template>

<style scoped>
/* Nội dung tab cho nhân viên hiện trường: chừa chỗ cho bottom nav sticky bên dưới. */
.field-content { padding-bottom: 76px; }

.field-bottom-nav {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 40;
  display: flex; background: #fff; border-top: 1px solid var(--app-border);
  padding-bottom: max(4px, env(safe-area-inset-bottom));
}
.field-nav-item {
  flex: 1; min-height: 56px; border: none; background: transparent; cursor: pointer;
  font-size: 12px; font-weight: 600; color: #6b7280; line-height: 1.3; padding: 6px 4px;
  display: flex; align-items: center; justify-content: center; text-align: center;
}
.field-nav-item.active { color: var(--mds-brand-600, #2563eb); background: var(--mds-brand-50, #eff6ff); }
</style>
