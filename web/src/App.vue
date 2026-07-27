<script setup>
import { computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { auth, logout, ROLE_NAMES } from './api';
import MToast from './components/mds/MToast.vue';
import LoginView from './views/LoginView.vue';
import logoUrl from './assets/logo.svg';

const router = useRouter();
const route = useRoute();
const isManager = computed(() => auth.user && ['super_admin', 'admin'].includes(auth.user.role));
// Nhân viên hiện trường (checkin) dùng shell mobile-first Ở MỌI ĐỘ RỘNG cửa sổ - không phụ
// thuộc viewport thật, để chế độ "Desktop site" của Chrome Android (bỏ qua thẻ <meta viewport>)
// không còn phá được layout (mục 4 kế hoạch nâng cấp - vấn đề chủ dự án phản ánh cực kỳ tệ trên
// mobile). Admin/super_admin vẫn dùng shell desktop như cũ.
const isFieldStaff = computed(() => auth.user && auth.user.role === 'checkin');

async function doLogout() { await logout(); router.replace('/events'); }
const isActive = (prefix) => route.path.startsWith(prefix);
</script>

<template>
  <template v-if="auth.user">
    <template v-if="isFieldStaff">
      <header class="field-topbar">
        <img :src="logoUrl" alt="MISA Event Check-in" class="field-logo" />
        <span class="field-who">{{ auth.user.name }}</span>
        <button class="field-logout" @click="doLogout" aria-label="Đăng xuất">⏻</button>
      </header>
      <div class="field-shell"><RouterView /></div>
    </template>
    <template v-else>
      <header class="topbar">
        <div class="topbar-inner">
          <img :src="logoUrl" alt="MISA Event Check-in" class="logo" />
          <nav>
            <RouterLink to="/events" :class="{ active: isActive('/event') }">Sự kiện</RouterLink>
            <RouterLink v-if="isManager" to="/members" :class="{ active: isActive('/members') }">Thành viên</RouterLink>
            <RouterLink v-if="isManager" to="/smtp" :class="{ active: isActive('/smtp') }">Cấu hình Email</RouterLink>
          </nav>
          <span class="who">{{ auth.user.name }} · {{ ROLE_NAMES[auth.user.role] }}<template v-if="auth.user.unit"> · {{ auth.user.unit }}</template></span>
          <button class="logout" @click="doLogout">Đăng xuất</button>
        </div>
      </header>
      <div class="app-container"><RouterView /></div>
    </template>
  </template>

  <LoginView v-else />

  <MToast />
</template>

<style scoped>
.topbar { background: #fff; border-bottom: 1px solid var(--app-border); position: sticky; top: 0; z-index: 50; }
.topbar-inner { max-width: 1200px; margin: 0 auto; padding: 0 16px; display: flex; align-items: center; gap: 18px; height: 56px; }
.logo { height: 42px; width: auto; display: block; }
nav { display: flex; gap: 4px; flex: 1; }
nav a { padding: 8px 14px; border-radius: 8px; text-decoration: none; color: #374151; font-weight: 500; }
nav a.active, nav a:hover { background: var(--mds-brand-50, #eff6ff); color: var(--mds-brand-600, #2563eb); }
.who { color: #6b7280; font-size: 13px; white-space: nowrap; }
.logout { border: 1px solid var(--app-border); background: #fff; color: #374151; border-radius: 8px; padding: 7px 12px; font-size: 13px; cursor: pointer; font-weight: 600; }
.logout:hover { background: var(--app-bg); }
@media (max-width: 640px) {
  .topbar-inner { flex-wrap: wrap; height: auto; padding: 8px 12px; gap: 8px; }
  .who { display: none; }
  nav { order: 3; width: 100%; }
}

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
