// The school app's service worker (docs/20 §4, C143). Its job is small: let
// the app open when the phone has no network.
//
//   - The app's own static files (scripts, styles, the brand mark, icons)
//     are kept after their first load.
//   - The pages a teacher needs to start the day (/app, /app/my-day,
//     /app/attendance) are fetched from the network every time; when the
//     network does not answer, the last copy that loaded is shown.
//   - Any other page under /app, with no network: a plain "you are offline"
//     page with a link back to My Day.
//   - Nothing under /api is ever kept: data comes from the server or from
//     the device store, which the app clears at sign-out. A page that
//     redirected (to sign-in) is never kept either.
//
// Signing out sends { type: 'clear' }: the kept pages are deleted.
// Registered with scope /app, in production builds only.

const VERSION = 'nca-v1';
const STATIC_CACHE = `${VERSION}-static`;
const PAGE_CACHE = `${VERSION}-pages`;
const KEPT_PAGES = ['/app', '/app/my-day', '/app/attendance'];

// What to do with a request: 'static', 'kept-page', 'other-page' or 'network'.
function route(method, url, origin, mode) {
  if (method !== 'GET') return 'network';
  let u;
  try {
    u = new URL(url);
  } catch {
    return 'network';
  }
  if (u.origin !== origin) return 'network';
  if (u.pathname.startsWith('/api/')) return 'network';
  if (u.pathname.startsWith('/_next/static/') || u.pathname.startsWith('/brand/') || u.pathname.startsWith('/icons/')) return 'static';
  if (mode !== 'navigate') return 'network';
  if (!(u.pathname === '/app' || u.pathname.startsWith('/app/'))) return 'network';
  return KEPT_PAGES.includes(u.pathname.replace(/\/$/, '') || '/') ? 'kept-page' : 'other-page';
}

// May this answer be kept as the page's last good copy?
function keepable(response) {
  return !!response && response.status === 200 && response.type === 'basic' && !response.redirected;
}

const OFFLINE_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Offline</title>
<style>body{margin:0;font-family:system-ui,sans-serif;background:#f7f9fc;color:#1e293b;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px}main{max-width:28rem}h1{font-size:1.25rem}a{display:inline-block;margin-top:12px;padding:12px 16px;border-radius:8px;background:#002357;color:#fff;text-decoration:none;font-weight:600}p{line-height:1.5}</style></head>
<body><main><h1>You are offline</h1><p>This page needs the internet. Your day and attendance still open without it.</p>
<p lang="hi">आप ऑफ़लाइन हैं। इस पेज के लिए इंटरनेट चाहिए। आपका दिन और हाज़िरी इसके बिना भी खुलते हैं।</p><a href="/app/my-day">My Day · मेरा दिन</a></main></body></html>`;

if (typeof self !== 'undefined' && typeof self.addEventListener === 'function') {
  self.addEventListener('install', () => self.skipWaiting());

  self.addEventListener('activate', (event) => {
    event.waitUntil(
      caches
        .keys()
        .then((names) => Promise.all(names.filter((n) => n.startsWith('nca-') && !n.startsWith(VERSION)).map((n) => caches.delete(n))))
        .then(() => self.clients.claim())
    );
  });

  self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'clear') event.waitUntil(caches.delete(PAGE_CACHE));
  });

  self.addEventListener('fetch', (event) => {
    const request = event.request;
    const kind = route(request.method, request.url, self.location.origin, request.mode);
    if (kind === 'network') return;

    if (kind === 'static') {
      event.respondWith(
        caches.open(STATIC_CACHE).then(async (cache) => {
          const hit = await cache.match(request);
          if (hit) return hit;
          const response = await fetch(request);
          if (keepable(response)) cache.put(request, response.clone());
          return response;
        })
      );
      return;
    }

    event.respondWith(
      (async () => {
        const cache = await caches.open(PAGE_CACHE);
        const key = new URL(request.url).pathname;
        try {
          const response = await fetch(request);
          if (kind === 'kept-page' && keepable(response)) cache.put(key, response.clone());
          return response;
        } catch {
          const kept = kind === 'kept-page' ? await cache.match(key) : undefined;
          return kept || new Response(OFFLINE_PAGE, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
        }
      })()
    );
  });
}

// For the tests (test/offline/service-worker.test.ts).
if (typeof module !== 'undefined') module.exports = { route, keepable, KEPT_PAGES, OFFLINE_PAGE };
