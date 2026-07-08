<script setup>
import { computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { auth, logout, ROLE_NAMES } from './api';
import MToast from './components/mds/MToast.vue';
import LoginView from './views/LoginView.vue';

const router = useRouter();
const route = useRoute();
const isManager = computed(() => auth.user && ['super_admin', 'admin'].includes(auth.user.role));

async function doLogout() { await logout(); router.replace('/events'); }
const isActive = (prefix) => route.path.startsWith(prefix);
</script>

<template>
  <template v-if="auth.user">
    <header class="topbar">
      <div class="topbar-inner">
        <div class="logo">🎟️ <span>MISA Event Check-in</span></div>
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

  <LoginView v-else />

  <MToast />
</template>

<style scoped>
.topbar { background: #fff; border-bottom: 1px solid var(--app-border); position: sticky; top: 0; z-index: 50; }
.topbar-inner { max-width: 1200px; margin: 0 auto; padding: 0 16px; display: flex; align-items: center; gap: 18px; height: 56px; }
.logo { font-weight: 700; color: var(--mds-brand-700, #1d4ed8); font-size: 16px; white-space: nowrap; display: flex; align-items: center; gap: 6px; }
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
</style>
