// 여명철학출판사 — 서비스 워커
// 정적 파일(이미지·css)만 가볍게 캐시하고, 페이지(.html)는 항상 최신 내용을 불러옵니다.
// 관리자 페이지(/admin/)는 절대 캐시하지 않습니다.

const CACHE_NAME = 'yeomyeong-static-v1';
const STATIC_EXT = ['.css', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.woff2'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== 'GET') return;
    if (url.origin !== self.location.origin) return;

  const isStatic = STATIC_EXT.some((ext) => url.pathname.endsWith(ext));
  if (!isStatic) return; // .html 페이지는 네트워크로만 처리 (서비스워커 개입 없음)

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(req).then((cached) => {
        const fetchPromise = fetch(req)
          .then((res) => {
            if (res && res.status === 200) cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      })
    )
  );
});
