/**
 * sw.js — 짭스패닉 Service Worker
 *
 * 전략:
 *   - 정적 자산 (HTML, CSS, JS) → Stale-While-Revalidate (오프라인 지원 + 자동 갱신)
 *   - /api/* 요청               → Network First (캐시는 폴백용)
 *   - activate 시               → 구버전 캐시 삭제
 *
 * 주의: 예전에는 정적 자산이 Cache First였다. 빌드 스텝이 없어 JS 파일에
 * 콘텐츠 해시가 안 붙다 보니, 코드를 고쳐 배포해도 CACHE_NAME 버전을 같이
 * 올리는 걸 잊으면 이미 SW를 설치한 사용자는 그 파일을 영영 캐시에서만
 * 읽어 옛날 버그(예: game.js 변수 섀도잉으로 렌더 루프가 죽는 문제)가
 * 되살아난 것처럼 재현됐다. Stale-While-Revalidate는 캐시를 즉시 응답하되
 * 매 요청마다 백그라운드에서 네트워크로 갱신해두므로, 버전을 깜빡 안 올려도
 * 다음 방문부터는 최신 파일로 자연히 교체된다.
 */

const CACHE_NAME   = 'galspanic-v9';
const API_CACHE    = 'galspanic-api-v9';

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
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
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

  // 외부 도메인 요청은 서비스 워커가 개입하지 않음
  if (url.origin !== self.location.origin) return;

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

  // 정적 자산 → Stale-While-Revalidate
  event.respondWith(staleWhileRevalidate(event, CACHE_NAME));
});

// ── 전략 헬퍼 ────────────────────────────────────────────────

/**
 * Stale-While-Revalidate: 캐시가 있으면 즉시 캐시로 응답하면서, 동시에
 * 네트워크로 최신 버전을 받아와 다음 요청을 위해 캐시를 갱신해둔다.
 * 캐시가 없으면 네트워크 응답을 기다려 반환(+캐시 저장)한다.
 *
 * 백그라운드 갱신은 반드시 event.waitUntil()로 감싸야 한다 — respondWith()에
 * 넘긴 응답이 반환되고 나면 브라우저가 SW를 아무 때나 종료할 수 있어서,
 * waitUntil 없이 fetch(request).then(...)만 띄워두면 응답 직후 그 갱신
 * 요청이 중간에 죽어버려 캐시가 영영 새로고침되지 않을 수 있다.
 */
async function staleWhileRevalidate(event, cacheName) {
  const { request } = event;
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);

  const networkUpdate = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);

  if (cached) {
    event.waitUntil(networkUpdate); // 백그라운드 갱신, 실패해도 무시(캐시가 이미 응답을 처리함)
    return cached;
  }

  const fresh = await networkUpdate;
  if (fresh) return fresh;

  // 오프라인이고 캐시도 없을 때 루트 페이지 폴백
  const fallback = await cache.match('/index.html');
  return fallback || new Response('오프라인 상태입니다.', {
    status: 503,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

/**
 * Network First: 네트워크 우선, 실패 시 캐시 반환
 */
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    // Cache API는 GET 요청만 저장 가능 — POST(특전 이미지 생성 등)에 put()을
    // 호출하면 거부된 Promise가 되어 콘솔에 처리되지 않은 rejection이 남는다.
    if (response.ok && request.method === 'GET') {
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
