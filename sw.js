// Service worker: lưu cache để chơi được khi không có mạng
// Khi cập nhật game, đổi số VERSION để người chơi nhận bản mới
const VERSION = 'bsr-v2';
const CORE = ['./', 'index.html', 'css/style.css', 'js/cards-data.js', 'js/audio.js', 'js/game.js', 'manifest.json', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(CORE);
    // tải trước toàn bộ ảnh thẻ (nếu lỗi thì bỏ qua, sẽ tự cache khi dùng)
    try {
      const res = await fetch('js/cards-data.js');
      const txt = await res.text();
      const imgs = [...txt.matchAll(/"img":"([^"]+)"/g)].map(m => m[1]);
      await Promise.allSettled(imgs.map(u => cache.add(u)));
    } catch (err) {}
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
    return res;
  })));
});
