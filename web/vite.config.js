import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// Dev: Vite chạy ở 5173, chuyển tiếp /api, /uploads về backend Express (3000).
// Build: xuất ra ../public-vue để Express phục vụ (server.js sẽ ưu tiên thư mục này nếu có).
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/uploads': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
  build: {
    outDir: '../public-vue',
    emptyOutDir: true,
  },
});
