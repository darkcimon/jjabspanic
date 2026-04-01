/**
 * sw.js — 짭스패닉 Service Worker
 *
 * 전략:
 *   - 정적 자산 (HTML, CSS, JS) → Cache First (오프라인 지원)
 *   - /api/* 요청               → Network First (캐시는 폴백용)
 *   - activate 시               → 구버전 캐시 삭제
 */

const CACHE_NAME   = 'galspanic-v1';
const API_CACHE    = 'galspanic-api-v1';

// install 시 pre-cache할 정적 자산 목록
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/app.js',
  '/js/api.js',
  '/js/config.js',
  '/js/game.js',
  '/js/storage.js',
  '/js/payment.js',
  '/manifest.json',
];

// ── install ──────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // 개별 실패가 전체를 막지 않도록 addAll 대신 순차 add
      return Promise.allSettled(
        STATIC_ASSETS.map(url => cache.add(url).catch(() => {}))
      );
    }).then(() => self.skipWaiting())
  );
});

// ── activate ─────────────────────────────────────────────────
self.addEventListener('activate', event => {
  const VALID_CACHES = [CACHE_NAME, API_CACHE];
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => !VALID_CACHES.includes(key))
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── fetch ─────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // /api/* → Network First
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(event.request, API_CACHE));
    return;
  }

  // /payment/* → Network Only (결제 흐름은 캐시하지 않음)
  if (url.pathname.startsWith('/payment/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // 정적 자산 → Cache First
  event.respondWith(cacheFirst(event.request, CACHE_NAME));
});

// ── 전략 헬퍼 ────────────────────────────────────────────────

/**
 * Cache First: 캐시 히트 시 캐시 반환, 없으면 네트워크 → 캐시 저장
 */
async function cacheFirst(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // 오프라인이고 캐시도 없을 때 루트 페이지 폴백
    const fallback = await cache.match('/index.html');
    return fallback || new Response('오프라인 상태입니다.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

/**
 * Network First: 네트워크 우선, 실패 시 캐시 반환
 */
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    return cached || new Response(JSON.stringify({ error: '오프라인 상태입니다.' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
