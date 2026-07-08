import { createRouter, createWebHashHistory } from 'vue-router';
import { auth } from './api';

import EventsView from './views/EventsView.vue';
import EventDetailView from './views/EventDetailView.vue';
import MembersView from './views/MembersView.vue';
import SmtpView from './views/SmtpView.vue';

const routes = [
  { path: '/', redirect: '/events' },
  { path: '/events', component: EventsView },
  { path: '/event/:id/:tab?', component: EventDetailView, props: true },
  { path: '/members', component: MembersView, meta: { manager: true } },
  { path: '/smtp', component: SmtpView, meta: { manager: true } },
  { path: '/:pathMatch(.*)*', redirect: '/events' },
];

const router = createRouter({ history: createWebHashHistory(), routes });

// Chặn trang quản trị với nhân viên check-in
router.beforeEach((to) => {
  if (to.meta.manager && auth.user && !['super_admin', 'admin'].includes(auth.user.role)) return '/events';
  return true;
});

export default router;
