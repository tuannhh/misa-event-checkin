import { createApp } from 'vue';
import './style.css';
import App from './App.vue';
import router from './router';
import { loadSession } from './api';

// Nạp phiên đăng nhập trước khi mount (để router/UI biết đã đăng nhập chưa)
loadSession().finally(() => {
  createApp(App).use(router).mount('#app');
});
