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
//
// The Family app (M2-9, C283) registers this same worker with scope /family,
// in production builds, when Control has its offline module on:
//   - Its pages are always fetched from the network and never kept, except
//     /family/offline, the app's shell: it needs no session and shows
//     nothing personal. With no network, any /family page is answered with
//     that shell, which opens the chapters saved on the phone (the packs
//     live in the page's IndexedDB, not here) or says "needs internet".
//   - { type: 'family-shell' } keeps the shell and the static files it loads,
//     so it opens with no network; { type: 'family-clear' } deletes it.
//
// Scanned answer sheets (C230-AJ): the scan screen keeps each page in its own IndexedDB outbox (nca-scan-outbox,
// src/lib/marking/outbox-idb.ts) and asks for a Background Sync ('nca-scan-outbox') where the browser offers one. Then,
// even with the screen closed, this worker sends the pages that already have their upload and file: one page a
// request, only the signed-in person's (the outbox's `meta` says whose), each removed from the phone the moment the
// school confirms it. It never starts or closes an upload (the screen does, next time it opens), never reads a page's
// picture for anything but sending it, and logs nothing. A failure leaves the page for the next try.
//
// Notifications (M3-8b, C339): a parent who turned them on in the parent area
// gets the push messages here. A message names only a kind of news and the
// app's page it opens ({ k, u, l }); the words are these, fixed: never a
// child's name, marks, fees or any personal detail. A tap opens that page.

const VERSION = 'nca-v1';
const STATIC_CACHE = `${VERSION}-static`;
const PAGE_CACHE = `${VERSION}-pages`;
const KEPT_PAGES = ['/app', '/app/my-day', '/app/attendance'];
const FAMILY_CACHE = `${VERSION}-family`;
const FAMILY_SHELL = '/family/offline';

const PUSH_WORDS = {
  en: {
    homework: 'New homework from school',
    notices: 'A new notice from school',
    results: 'A result from school',
    tonight: 'Tonight’s practice is ready',
    body: 'Open NetCyberAI Family to see it.',
  },
  hi: {
    homework: 'स्कूल से नया गृहकार्य',
    notices: 'स्कूल की नई सूचना',
    results: 'स्कूल से रिज़ल्ट',
    tonight: 'आज रात का अभ्यास तैयार है',
    body: 'देखने के लिए NetCyberAI Family खोलें।',
  },
};
const PUSH_PAGES = ['/family', '/family/parent'];

// A push message, as shown: the kind's fixed words in the parent's language, and an app page to open (only the
// Family app's own pages; anything else opens its home). Nothing from the message is shown as it came.
function pushNotice(data) {
  const lang = data && data.l === 'hi' ? 'hi' : 'en';
  const words = PUSH_WORDS[lang];
  const kind = data && Object.prototype.hasOwnProperty.call(words, data.k) && data.k !== 'body' ? data.k : null;
  return {
    title: kind ? words[kind] : 'NetCyberAI Family',
    body: words.body,
    url: data && PUSH_PAGES.includes(data.u) ? data.u : '/family',
    tag: kind ? `nca-${kind}` : 'nca-news',
  };
}

// What to do with a request: 'static', 'kept-page', 'other-page', 'family-page' or 'network'.
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
  if (u.pathname === '/family' || u.pathname.startsWith('/family/')) return 'family-page';
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

// The Family app's last resort, when its shell was never kept: no script, nothing personal.
const FAMILY_OFFLINE_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>No internet</title>
<style>body{margin:0;font-family:system-ui,sans-serif;background:#f7f9fc;color:#1e293b;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px}main{max-width:28rem}h1{font-size:1.25rem}a{display:inline-block;margin-top:12px;padding:12px 16px;border-radius:8px;background:#002357;color:#fff;text-decoration:none;font-weight:600}p{line-height:1.5}</style></head>
<body><main><h1>No internet</h1><p>This needs a connection. Check it and try again.</p>
<p lang="hi">इंटरनेट नहीं है। इसके लिए कनेक्शन चाहिए। जाँचें और फिर कोशिश करें।</p><a href="/family">Try again · फिर कोशिश करें</a></main></body></html>`;

// ---- scanned pages (C230-AJ) ------------------------------------------------------------------------------------------
const SCAN_DB = 'nca-scan-outbox';
const SCAN_DB_VERSION = 1; // as src/lib/marking/outbox-idb.ts: change both together
const SCAN_STORES = ['pages', 'batches', 'uploads', 'meta'];
const SCAN_SYNC = 'nca-scan-outbox';

// Which pages may go now, in the order they were taken: the owner's, not refused, due, whose file has its upload.
function scanPagesToSend(pages, batches, owner, now) {
  if (!owner) return [];
  const files = new Map(batches.filter((b) => b.owner === owner && b.uploadId && b.fileNo).map((b) => [b.id, b]));
  return pages
    .filter((p) => p.owner === owner && !p.refused && p.nextAt <= now && files.has(p.batchId))
    .sort((a, b) => a.takenAt - b.takenAt || a.seq - b.seq)
    .map((p) => ({ page: p, batch: files.get(p.batchId) }));
}

function scanRequest(r) {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function sendScanPages() {
  const open = indexedDB.open(SCAN_DB, SCAN_DB_VERSION);
  open.onupgradeneeded = () => {
    for (const name of SCAN_STORES) if (!open.result.objectStoreNames.contains(name)) open.result.createObjectStore(name, { keyPath: 'id' });
  };
  const db = await scanRequest(open);
  db.onversionchange = () => db.close();
  try {
    const read = (name) => scanRequest(db.transaction(name, 'readonly').objectStore(name).getAll());
    const meta = await scanRequest(db.transaction('meta', 'readonly').objectStore('meta').get('owner'));
    const due = scanPagesToSend(await read('pages'), await read('batches'), meta && meta.owner, Date.now());
    for (const { page, batch } of due) {
      const form = new FormData();
      form.append('fileNo', String(batch.fileNo));
      form.append('pageNo', String(page.seq));
      form.append('childId', page.childId);
      form.append('page', new Blob([page.bytes], { type: 'image/jpeg' }), 'page.jpg');
      const res = await fetch(`/api/app/marking/uploads/${batch.uploadId}/pages`, { method: 'POST', body: form, credentials: 'same-origin' }).catch(() => null);
      // The network or the server: the browser tries the sync again later. A refusal: left for the screen to show.
      if (!res) throw new Error('offline');
      if (res.status >= 500 || res.status === 408 || res.status === 429) throw new Error('later');
      if (!res.ok) return;
      await scanRequest(db.transaction('pages', 'readwrite').objectStore('pages').delete(page.id));
      const now = await scanRequest(db.transaction('batches', 'readonly').objectStore('batches').get(batch.id));
      if (now) await scanRequest(db.transaction('batches', 'readwrite').objectStore('batches').put({ ...now, sent: (now.sent || 0) + 1 }));
    }
  } finally {
    db.close();
  }
}

// The static files a page loads (its scripts, styles and fonts), from its HTML.
function staticFiles(html) {
  const out = new Set();
  for (const m of String(html).matchAll(/["'(](\/_next\/static\/[^"'()\s\\]+)/g)) out.add(m[1]);
  return [...out].slice(0, 80);
}

// A Family app page (W11-A, C416). It comes from the network. One failed fetch is not "no internet": on a phone a
// connection drops for a moment (a network change, a connection gone stale while the phone slept), yet the app showed
// the offline page for it. So the page is asked for once more, as a fresh request with the same sign-in. Only when that
// fails too, and the phone is offline or the failure is a network error, the shell (or the last-resort page) answers;
// any other failure is passed on as the error it is. A redirect (to sign-in) is passed on as it came: the retry keeps
// the navigation's 'manual' redirect mode, because a followed redirect may not answer a navigation.
async function familyPage(request, deps) {
  try {
    return await deps.fetch(request);
  } catch {
    // asked once more below
  }
  try {
    return await deps.fetch(new Request(request.url, { credentials: 'include', redirect: 'manual' }));
  } catch (err) {
    if (deps.online() === false || (err && err.name === 'TypeError')) {
      const shell = await deps.shell().catch(() => undefined);
      return shell || new Response(FAMILY_OFFLINE_PAGE, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
    }
    return Response.error();
  }
}

async function keepFamilyShell() {
  const response = await fetch(FAMILY_SHELL, { credentials: 'same-origin' });
  if (!keepable(response)) return;
  const html = await response.clone().text();
  await (await caches.open(FAMILY_CACHE)).put(FAMILY_SHELL, response);
  const statics = await caches.open(STATIC_CACHE);
  for (const file of staticFiles(html)) {
    if (await statics.match(file)) continue;
    const r = await fetch(file).catch(() => null);
    if (keepable(r)) await statics.put(file, r);
  }
}

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
    if (event.data && event.data.type === 'family-shell') event.waitUntil(keepFamilyShell().catch(() => undefined));
    if (event.data && event.data.type === 'family-clear') event.waitUntil(caches.delete(FAMILY_CACHE));
  });

  self.addEventListener('sync', (event) => {
    if (event.tag === SCAN_SYNC) event.waitUntil(sendScanPages());
  });

  self.addEventListener('push', (event) => {
    let data = null;
    try {
      data = event.data ? event.data.json() : null;
    } catch {
      data = null;
    }
    const n = pushNotice(data);
    event.waitUntil(self.registration.showNotification(n.title, { body: n.body, tag: n.tag, icon: '/icons/192', badge: '/icons/192', data: { url: n.url } }));
  });

  self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const url = event.notification.data && PUSH_PAGES.includes(event.notification.data.url) ? event.notification.data.url : '/family';
    // A Family app tab this worker looks after is brought to the page; any other tab (the website, the staff app) is
    // left alone and a new window opens.
    event.waitUntil(
      self.clients.matchAll({ type: 'window' }).then(async (list) => {
        const tab = list.find((c) => new URL(c.url).origin === self.location.origin && new URL(c.url).pathname.startsWith('/family'));
        if (tab) {
          const moved = await tab.navigate(url).catch(() => null);
          if (moved) return moved.focus();
        }
        return self.clients.openWindow(url);
      })
    );
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

    if (kind === 'family-page') {
      event.respondWith(
        familyPage(request, {
          fetch: (r) => fetch(r),
          online: () => self.navigator.onLine,
          shell: () => caches.open(FAMILY_CACHE).then((c) => c.match(FAMILY_SHELL)),
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
if (typeof module !== 'undefined') module.exports = { route, keepable, familyPage, staticFiles, pushNotice, scanPagesToSend, KEPT_PAGES, OFFLINE_PAGE, FAMILY_OFFLINE_PAGE, FAMILY_SHELL };
