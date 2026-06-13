// Service worker cho PWA - giúp app cài được lên màn hình chính & chạy ổn định khi mạng chập chờn
const CACHE = 'misa-checkin-v1';
const ASSETS = ['/', '/index.html', '/app.js', '/style.css', '/manifest.webmanifest', '/icon.svg', '/misa-logo.jpg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return; // POST/PUT/DELETE luôn đi thẳng ra mạng
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // tài nguyên ngoài (thư viện CDN) để trình duyệt tự xử lý
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) return; // dữ liệu động: luôn lấy mới

  // Phần tĩnh: ưu tiên mạng (luôn có bản mới), mất mạng thì dùng bản đã lưu
  e.respondWith(
    fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(req).then(m => m || caches.match('/index.html')))
  );
});
