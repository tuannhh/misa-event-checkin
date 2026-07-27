<script setup>
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { auth, logout, eventSidebar, ROLE_NAMES } from './api';
import { useToast } from './components/mds/toast.js';
import MToast from './components/mds/MToast.vue';
import MIcon from './components/mds/MIcon.vue';
import MHeaderBar from './components/mds/MHeaderBar.vue';
import MSidebar from './components/mds/MSidebar.vue';
import MSettingsDialog from './components/mds/MSettingsDialog.vue';
import LoginView from './views/LoginView.vue';
import logoUrl from './assets/logo.svg';
import logoIconUrl from './assets/logo-icon.svg';

const router = useRouter();
const toast = useToast();
const isManager = computed(() => auth.user && ['super_admin', 'admin'].includes(auth.user.role));
// Nhân viên hiện trường (checkin) dùng shell mobile-first Ở MỌI ĐỘ RỘNG cửa sổ - không phụ
// thuộc viewport thật, để chế độ "Desktop site" của Chrome Android (bỏ qua thẻ <meta viewport>)
// không còn phá được layout (mục 4 kế hoạch nâng cấp - vấn đề chủ dự án phản ánh cực kỳ tệ trên
// mobile). Admin/super_admin vẫn dùng App Shell chuẩn MDS (header + sidebar trái).
const isFieldStaff = computed(() => auth.user && auth.user.role === 'checkin');

// Sidebar trái DUY NHẤT của App Shell. Trong 1 sự kiện -> hiện đúng các tab tính năng của
// sự kiện đó (do EventDetailView.vue đẩy lên qua eventSidebar - xem api.js), PHẢI là nội
// dung chính của sidebar, không lồng thêm 1 sidebar phụ khác. Ngoài sự kiện (màn hình danh
// sách) -> chỉ còn đúng 1 lối vào "Sự kiện"; Thành viên/Cấu hình Email đã gom vào dialog
// Thiết lập (nút bánh răng trên header) theo yêu cầu chủ dự án - không còn là mục sidebar.
const navItems = computed(() => eventSidebar.active
  ? eventSidebar.items
  : [{ key: 'events', label: 'Sự kiện', icon: 'calendar' }]);
const activeNav = computed(() => eventSidebar.active ? eventSidebar.activeKey : 'events');
function onNavSelect(key) {
  if (eventSidebar.active) { eventSidebar.onSelect?.(key); return; }
  router.push('/events');
}
const sidebarCollapsed = ref(false);

const headerUser = computed(() => auth.user ? {
  name: `${auth.user.name} · ${ROLE_NAMES[auth.user.role] || auth.user.role}${auth.user.unit ? ' · ' + auth.user.unit : ''}`,
} : null);

const settingsOpen = ref(false);

async function doLogout() { await logout(); router.replace('/events'); }
</script>

<template>
  <template v-if="auth.user">
    <template v-if="isFieldStaff">
      <header class="field-topbar">
        <img :src="logoUrl" alt="MISA Event Check-in" class="field-logo" />
        <span class="field-who">{{ auth.user.name }}</span>
        <button class="field-logout" @click="doLogout" aria-label="Đăng xuất"><MIcon name="logout" :size="20" /></button>
      </header>
      <div class="field-shell"><RouterView /></div>
    </template>
    <template v-else>
      <div class="app-shell">
        <MHeaderBar
          app-name="MISA Check-in"
          :company-name="eventSidebar.active ? eventSidebar.eventName : ''"
          search-placeholder="Tìm sự kiện, thành viên..."
          :user="headerUser"
          @app-switcher="toast.info('Chuyển ứng dụng là tính năng của AMIS Platform, chưa tích hợp trong bản này.')"
          @settings="settingsOpen = true"
          @notifications="toast.info('Chưa có thông báo mới.')"
          @assistant="toast.info('MISA AVA chưa được tích hợp trong bản này.')"
          @chat="toast.info('AMIS Chat chưa được tích hợp trong bản này.')"
          @help="toast.info('Xem hướng dẫn sử dụng ở tài liệu đi kèm dự án.')"
          @more="toast.info('Chưa có thêm tiện ích khác.')"
          @logo-click="router.push('/events')"
          @company-click="router.push('/events')"
        >
          <template #logo>
            <img :src="logoIconUrl" alt="MISA Check-in" class="header-logo" />
          </template>
          <template #actions>
            <button class="logout" @click="doLogout">Đăng xuất</button>
          </template>
        </MHeaderBar>
        <div class="app-body">
          <MSidebar v-model="activeNav" v-model:collapsed="sidebarCollapsed" :items="navItems" @update:model-value="onNavSelect" />
          <div class="app-content"><div class="app-container"><RouterView /></div></div>
        </div>
      </div>
      <MSettingsDialog v-model="settingsOpen" :show-admin-tabs="isManager" />
    </template>
  </template>

  <LoginView v-else />

  <MToast />
</template>

<style scoped>
/* App Shell chuẩn MDS: Global Header full-width trên cùng, dưới là Sidebar trái + Content
   cuộn riêng (xem layout-patterns.md mục 0 "Khung ứng dụng chuẩn"). */
.app-shell { height: 100vh; display: flex; flex-direction: column; overflow: hidden; }
.app-body { flex: 1; display: flex; overflow: hidden; }
.app-content { flex: 1; overflow-y: auto; background: var(--mds-bg-page, #ECEDEF); }
.header-logo { height: 28px; width: auto; display: block; }
.logout { border: 1px solid var(--mds-border); background: var(--mds-bg); color: var(--mds-text); border-radius: 8px; padding: 6px 12px; font-size: 13px; cursor: pointer; font-weight: 600; }
.logout:hover { background: var(--mds-bg-hover-soft); }

/* Shell mobile-first cho nhân viên hiện trường - cột nội dung tối đa 480px, CĂN GIỮA bất kể
   màn hình rộng bao nhiêu (kể cả "Desktop site" trên Android). Bottom nav thật nằm trong
   EventDetailView.vue (cần biết danh sách tab theo quyền); khoảng đệm dưới đã chừa sẵn ở đây. */
.field-topbar {
  height: 48px; background: #fff; border-bottom: 1px solid var(--app-border);
  position: sticky; top: 0; z-index: 50; display: flex; align-items: center; gap: 10px;
  padding: 0 max(12px, env(safe-area-inset-left)) 0 max(12px, env(safe-area-inset-right));
  padding-top: env(safe-area-inset-top);
}
.field-logo { height: 28px; width: auto; }
.field-who { flex: 1; font-size: 13px; font-weight: 600; color: #374151; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.field-logout {
  width: 40px; height: 40px; min-width: 40px; border: none; background: transparent; color: #6b7280;
  font-size: 16px; border-radius: 8px; cursor: pointer;
}
.field-logout:hover { background: var(--app-bg); }
.field-shell {
  max-width: 480px; margin: 0 auto; min-height: calc(100dvh - 48px);
  padding: 12px max(12px, env(safe-area-inset-right)) 12px max(12px, env(safe-area-inset-left));
}
</style>
