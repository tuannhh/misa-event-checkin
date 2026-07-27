<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, defineAsyncComponent } from 'vue';
import { useRouter } from 'vue-router';
import { api, auth, eventSidebar, fmtDate, eventDayStatus, staffTabsFor, needsOnsite } from '../api';
import MButton from '../components/mds/MButton.vue';
import MTag from '../components/mds/MTag.vue';
import MSpinner from '../components/mds/MSpinner.vue';
import { iconPaths } from '../components/mds/icons.js';
import MIcon from '../components/mds/MIcon.vue';

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
      { key: 'attendees', label: 'Người tham dự', icon: 'users' }, { key: 'scan', label: 'Quét QR', icon: 'camera' },
      { key: 'booths', label: 'Booth', icon: 'map-pin' }, { key: 'badges', label: 'Phôi thẻ', icon: 'credit-card' },
      { key: 'email', label: 'Email', icon: 'mail' }, { key: 'report', label: 'Báo cáo', icon: 'chart-bar' }, { key: 'staff', label: 'Nhân viên', icon: 'briefcase' },
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

// Đẩy danh sách tab tính năng của sự kiện đang mở lên sidebar chính (App.vue) - sidebar
// TRÁI DUY NHẤT của app hiển thị đúng các tab này làm nội dung chính, thay vì lồng thêm
// 1 sidebar phụ bên trong trang. Nhân viên hiện trường (isCheckin) dùng bottom-nav riêng,
// không đụng đến sidebar chính.
watch(
  () => (isCheckin.value ? null : { items: tabs.value, key: activeTab.value, name: ev.value?.name || '' }),
  (state) => {
    if (!state) { eventSidebar.active = false; return; }
    eventSidebar.active = true;
    eventSidebar.eventName = state.name;
    eventSidebar.items = state.items;
    eventSidebar.activeKey = state.key;
    eventSidebar.onSelect = (k) => { activeTab.value = k; };
  },
  { immediate: true }
);
onBeforeUnmount(() => { eventSidebar.active = false; eventSidebar.items = []; eventSidebar.onSelect = null; });
</script>

<template>
  <div v-if="loading" style="text-align:center;padding:40px"><MSpinner :size="28" /></div>
  <div v-else-if="err" class="card">{{ err }} <RouterLink to="/events"><MIcon name="arrow-left" /> Quay lại</RouterLink></div>
  <template v-else-if="ev">
    <!-- Tên sự kiện đã hiện ở header (company-name, bấm vào quay lại danh sách) và tab đang
         chọn đã hiện ở sidebar - page-head ở đây chỉ còn giữ dòng meta (thời gian/đơn vị),
         không lặp lại tên sự kiện + breadcrumb (từng "lơ lửng" do trùng thông tin với header). -->
    <div v-if="!isCheckin" class="muted" style="margin-bottom:16px">
      <MIcon name="clock" /> {{ fmtDate(ev.event_date) }} · <MIcon name="user" /> {{ ev.organizer || '—' }}<template v-if="ev.unit"> · <MIcon name="building" /> {{ ev.unit }}</template>
    </div>
    <div v-else class="page-head">
      <div>
        <RouterLink to="/events" class="muted" style="text-decoration:none"><MIcon name="arrow-left" /> Tất cả sự kiện</RouterLink>
        <h2 style="margin-top:4px">{{ ev.name }}</h2>
        <div class="muted"><MIcon name="clock" /> {{ fmtDate(ev.event_date) }} · <MIcon name="user" /> {{ ev.organizer || '—' }}<template v-if="ev.unit"> · <MIcon name="building" /> {{ ev.unit }}</template></div>
      </div>
    </div>

    <div v-if="dayLocked" class="card" style="text-align:center;padding:40px 20px">
      <div style="font-size:42px;display:flex;justify-content:center"><MIcon name="lock" :size="42" /></div>
      <h3 style="margin:10px 0">{{ eventDayStatus(ev) === 'future' ? 'Sự kiện chưa tới ngày tổ chức' : 'Sự kiện đã kết thúc' }}</h3>
      <p class="muted">Chỉ có thể thao tác vào đúng ngày tổ chức sự kiện.</p>
      <RouterLink to="/events"><MButton variant="primary" style="margin-top:12px"><MIcon name="arrow-left" /> Về danh sách</MButton></RouterLink>
    </div>

    <template v-else>
      <div v-if="!isCheckin" style="margin-top:16px">
        <component v-if="activeComponent" :is="activeComponent" :key="activeTab" :ev="ev" @reload="load" />
        <div v-else class="card">
          <p class="muted">Tab <b>{{ activeTab }}</b> đang được chuyển sang giao diện Vue mới (giai đoạn tiếp theo). Chức năng backend đã sẵn sàng trên MySQL.</p>
        </div>
      </div>
      <div v-else class="field-content" style="margin-top:12px">
        <component v-if="activeComponent" :is="activeComponent" :key="activeTab" :ev="ev" @reload="load" />
        <div v-else class="card">
          <p class="muted">Tab <b>{{ activeTab }}</b> đang được chuyển sang giao diện Vue mới (giai đoạn tiếp theo). Chức năng backend đã sẵn sàng trên MySQL.</p>
        </div>
      </div>

      <!-- Bottom nav mobile-first cho nhân viên hiện trường - tối đa 5 mục có icon+nhãn (MDS
           cấm dãy icon không nhãn). Chỉ hiện khi có từ 2 tab trở lên; 1 tab thì không cần chuyển. -->
      <nav v-if="isCheckin && tabs.length > 1" class="field-bottom-nav">
        <button v-for="t in tabs.slice(0, 5)" :key="t.key" class="field-nav-item" :class="{ active: activeTab === t.key }" @click="activeTab = t.key">
          <svg v-if="iconPaths(t.icon)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="20" height="20">
            <path v-for="(d, i) in iconPaths(t.icon)" :key="i" :d="d" />
          </svg>
          <span>{{ t.label }}</span>
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
  font-size: 12px; font-weight: 600; color: #6b7280; line-height: 1.3; padding: 6px 4px; gap: 2px;
  display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;
}
.field-nav-item.active { color: var(--mds-brand-600, #2563eb); background: var(--mds-brand-50, #eff6ff); }
</style>
