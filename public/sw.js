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
// The Family app (M2-9, C283) registers this same worker with scope /family, in production builds, when Control has
// its offline module on:
//   - /family/offline is the app's shell: it needs no session and shows nothing personal. With no network and no kept
//     copy, any /family page is answered with it; it opens the chapters saved on the phone (the packs live in the page's
//     IndexedDB, not here) or says "needs internet". { type: 'family-shell' } keeps it and the static files it loads.
//   - Weak network (C539): a Family page, and the page data the app's router asks for (a request with `RSC: 1` or an
//     `_rsc` parameter), go to the network first. When the network has not answered in FAMILY_WAIT_MS, a copy kept in
//     the last FAMILY_FRESH_MS answers (the network's answer still replaces the copy when it comes); with no network,
//     any kept copy answers. Only the child's screens are kept (FAMILY_KEPT), only a direct 200 of the right type,
//     never a redirect, never /api, at most FAMILY_MAX_KEPT copies. Nothing is kept until a signed-in page says the
//     offline module is on ({ type: 'family-keep' }). A redirect, or the sign-in page answering, means the session
//     ended: every kept page is deleted. { type: 'family-clear' } (sign-out, another account, offline switched off)
//     deletes the kept pages and the shell.

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
const FAMILY_PAGES = `${VERSION}-family-pages`;
// The mark a signed-in page leaves when the offline module is on; never a real address.
const FAMILY_KEEP_MARK = '/__nca/family-keep';
const FAMILY_WAIT_MS = 3500;
const FAMILY_FRESH_MS = 6 * 60 * 60 * 1000;
const FAMILY_MAX_KEPT = 48;
const KEPT_AT = 'x-nca-kept-at';
// The child's screens that are kept (each with what is under it). Not Understand (offline, the shell opens its saved
// pack), not the parent area, results, the call, settings, sign-in, sign-out or the phone link.
const FAMILY_KEPT = ['/family/study', '/family/english', '/family/progress', '/family/future', '/family/draw', '/family/tutors'];

const PUSH_WORDS = {
  en: {
    homework: 'New homework from school',
    notices: 'A new notice from school',
    results: 'A result from school',
    tonight: 'Tonight’s practice is ready',
    future_deadline: 'A form is about to close',
    future_new: 'Something new for your class',
    body: 'Open NetCyberAI Family to see it.',
  },
  hi: {
    homework: 'स्कूल से नया गृहकार्य',
    notices: 'स्कूल की नई सूचना',
    results: 'स्कूल से रिज़ल्ट',
    tonight: 'आज रात का अभ्यास तैयार है',
    future_deadline: 'एक फ़ॉर्म जल्द बंद होने वाला है',
    future_new: 'आपकी कक्षा के लिए कुछ नया',
    body: 'देखने के लिए NetCyberAI Family खोलें।',
  },
};
const PUSH_PAGES = ['/family', '/family/parent', '/family/future'];

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

// What to do with a request: 'static', 'kept-page', 'other-page', 'family-page', 'family-data' or 'network'. `rsc`: the
// request carries the app router's `RSC: 1` header (an `_rsc` parameter says the same).
function route(method, url, origin, mode, rsc) {
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
  const family = u.pathname === '/family' || u.pathname.startsWith('/family/');
  if (mode !== 'navigate') return family && (rsc === true || u.searchParams.has('_rsc')) ? 'family-data' : 'network';
  if (family) return 'family-page';
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

// ---- the Family app's pages (W11-A, C416; C539) ---------------------------------------------------------------------

// The address a Family answer is kept under, or null when it is never kept: a page by its path and query; the page data
// by its full address, whose `_rsc` names the router state it was made for (so a copy only answers the same request).
function familyKey(url, kind) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const path = u.pathname.replace(/\/$/, '') || '/';
  if (!(path === '/family' || FAMILY_KEPT.some((k) => path === k || path.startsWith(`${k}/`)))) return null;
  if (kind === 'family-data') return u.searchParams.has('_rsc') ? `${u.pathname}${u.search}` : null;
  u.searchParams.delete('_rsc');
  return `${u.pathname}${u.search}`;
}

// What a Family answer does to the kept pages: 'forget' (a redirect, or the sign-in page itself: the session has ended),
// 'keep' (a direct 200 of the right type, for an address that is kept) or 'skip'.
function familyStore(kind, url, key, response) {
  if (!response) return 'skip';
  if (response.type === 'opaqueredirect' || response.redirected || (response.status >= 300 && response.status < 400)) return 'forget';
  let path = '';
  try {
    path = new URL(url).pathname.replace(/\/$/, '');
  } catch {
    return 'skip';
  }
  if (path === '/family/sign-in' && response.status === 200) return 'forget';
  if (!key || !keepable(response)) return 'skip';
  const type = (response.headers && response.headers.get('content-type')) || '';
  return (kind === 'family-data' ? type.startsWith('text/x-component') : type.startsWith('text/html')) ? 'keep' : 'skip';
}

// May this kept copy answer? With no network, any; while the network is only slow, one kept in the last FAMILY_FRESH_MS.
function mayAnswer(copy, why, now) {
  if (!copy) return false;
  if (why === 'offline') return true;
  const at = Number(copy.headers.get(KEPT_AT));
  return Number.isFinite(at) && at > 0 && now - at <= FAMILY_FRESH_MS;
}

// The kept copies past FAMILY_MAX_KEPT, oldest first (a copy kept again moves to the end); never the mark.
function overflow(keys, max) {
  const copies = keys.filter((k) => !(typeof k === 'string' ? k : k.url).endsWith(FAMILY_KEEP_MARK));
  return copies.slice(0, Math.max(0, copies.length - max));
}

// The network, asked twice. One failed fetch is not "no internet": on a phone a connection drops for a moment (a network
// change, a connection gone stale while the phone slept). The second ask is `again` (for a page, a fresh request with
// the same sign-in and its 'manual' redirect mode, because a followed redirect may not answer a navigation).
async function twice(request, again, deps) {
  try {
    return await deps.fetch(request);
  } catch {
    return deps.fetch(again());
  }
}

// Network first: the network's answer when it comes within `wait` ms; after that a fresh kept copy, if there is one
// (the network's answer still replaces the copy when it comes); with none, the network is awaited.
async function networkFirst(net, deps) {
  if (!deps.kept) return net;
  let timer;
  const late = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), deps.wait ?? FAMILY_WAIT_MS);
  });
  const first = await Promise.race([net.then((r) => ({ r }), (e) => ({ e })), late]);
  clearTimeout(timer);
  if (first) {
    if (first.e) throw first.e;
    return first.r;
  }
  const copy = await deps.kept().catch(() => undefined);
  return mayAnswer(copy, 'slow', deps.now ? deps.now() : Date.now()) ? copy : net;
}

// Whatever the network answers is looked at once (`deps.keep`: kept, or the kept pages forgotten) while the page gets it.
function watch(net, deps) {
  if (deps.keep && deps.later) deps.later(net.then((r) => deps.keep(r)).catch(() => undefined));
  return net;
}

// A Family app page. With no network after two tries (the phone offline, or a network error): the kept copy of the page,
// else the shell, else the last-resort page; any other failure (an aborted navigation) is passed on as the error it is.
// A redirect (to sign-in) is passed on as it came.
async function familyPage(request, deps) {
  const net = watch(twice(request, () => new Request(request.url, { credentials: 'include', redirect: 'manual' }), deps), deps);
  try {
    return await networkFirst(net, deps);
  } catch (err) {
    if (deps.online() === false || (err && err.name === 'TypeError')) {
      const copy = deps.kept ? await deps.kept().catch(() => undefined) : undefined;
      if (mayAnswer(copy, 'offline')) return copy;
      const shell = await deps.shell().catch(() => undefined);
      return shell || new Response(FAMILY_OFFLINE_PAGE, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
    }
    return Response.error();
  }
}

// The page data the app's router asks for. With no network: the copy kept for this exact request, else an error, on
// which the router loads the page itself (and familyPage answers that).
async function familyData(request, deps) {
  const net = watch(twice(request, () => request, deps), deps);
  try {
    return await networkFirst(net, deps);
  } catch (err) {
    if (deps.online() === false || (err && err.name === 'TypeError')) {
      const copy = deps.kept ? await deps.kept().catch(() => undefined) : undefined;
      if (mayAnswer(copy, 'offline')) return copy;
    }
    return Response.error();
  }
}

// The kept pages change one at a time, so a clear and a keep sent together never cross.
let familyQueue = Promise.resolve();
function familySerial(fn) {
  familyQueue = familyQueue.then(fn, fn);
  return familyQueue;
}

const familyKeepOn = () => familySerial(() => caches.open(FAMILY_PAGES).then((c) => c.put(FAMILY_KEEP_MARK, new Response('1'))));
const familyForget = () => familySerial(() => caches.delete(FAMILY_PAGES));
const familyClear = () => familySerial(() => Promise.all([caches.delete(FAMILY_PAGES), caches.delete(FAMILY_CACHE)]));

// The kept copy for an address, only while the mark is there.
async function familyKept(key) {
  if (!key || !(await caches.has(FAMILY_PAGES))) return undefined;
  const cache = await caches.open(FAMILY_PAGES);
  if (!(await cache.match(FAMILY_KEEP_MARK))) return undefined;
  return cache.match(key, { ignoreVary: true });
}

// Keep a copy, stamped with when, only while the mark is there; the oldest copies past the limit go.
function familyKeepCopy(key, response) {
  const copy = response.clone();
  return familySerial(async () => {
    if (!(await caches.has(FAMILY_PAGES))) return;
    const cache = await caches.open(FAMILY_PAGES);
    if (!(await cache.match(FAMILY_KEEP_MARK))) return;
    const headers = new Headers(copy.headers);
    headers.delete('content-encoding');
    headers.delete('content-length');
    headers.set(KEPT_AT, String(Date.now()));
    await cache.put(key, new Response(await copy.blob(), { status: copy.status, statusText: copy.statusText, headers }));
    for (const old of overflow(await cache.keys(), FAMILY_MAX_KEPT)) await cache.delete(old);
  });
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
    if (event.data && event.data.type === 'family-keep') event.waitUntil(familyKeepOn());
    if (event.data && event.data.type === 'family-clear') event.waitUntil(familyClear());
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
    const kind = route(request.method, request.url, self.location.origin, request.mode, request.headers.get('RSC') === '1');
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

    if (kind === 'family-page' || kind === 'family-data') {
      const key = familyKey(request.url, kind);
      const deps = {
        fetch: (r) => fetch(r),
        online: () => self.navigator.onLine,
        shell: () => caches.open(FAMILY_CACHE).then((c) => c.match(FAMILY_SHELL)),
        kept: key ? () => familyKept(key) : undefined,
        keep: (response) => {
          const what = familyStore(kind, request.url, key, response);
          if (what === 'forget') return familyForget();
          if (what === 'keep') return familyKeepCopy(key, response);
          return undefined;
        },
        later: (p) => event.waitUntil(p),
        wait: FAMILY_WAIT_MS,
        now: () => Date.now(),
      };
      event.respondWith(kind === 'family-page' ? familyPage(request, deps) : familyData(request, deps));
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
if (typeof module !== 'undefined') module.exports = { route, keepable, familyPage, familyData, familyKey, familyStore, mayAnswer, overflow, networkFirst, staticFiles, pushNotice, scanPagesToSend, KEPT_PAGES, OFFLINE_PAGE, FAMILY_OFFLINE_PAGE, FAMILY_SHELL, FAMILY_KEPT, FAMILY_WAIT_MS, FAMILY_FRESH_MS, FAMILY_MAX_KEPT, FAMILY_KEEP_MARK, KEPT_AT };
