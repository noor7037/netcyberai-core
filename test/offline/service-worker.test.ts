import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

// The service worker's rules (public/sw.js, C143): what is kept on the
// phone and what never is.
const sw = createRequire(import.meta.url)(path.join(__dirname, '../../public/sw.js')) as {
  route: (method: string, url: string, origin: string, mode: string) => string;
  keepable: (r: unknown) => boolean;
  KEPT_PAGES: string[];
  OFFLINE_PAGE: string;
};
const O = 'https://school.example';
const route = (p: string, mode = 'navigate', method = 'GET') => sw.route(method, O + p, O, mode);

describe('what the service worker keeps', () => {
  it('the pages a teacher starts the day with are kept as their last good copy', () => {
    for (const p of ['/app', '/app/', '/app/my-day', '/app/attendance', '/app/attendance?class=abc']) expect(route(p), p).toBe('kept-page');
    expect(sw.KEPT_PAGES).toEqual(['/app', '/app/my-day', '/app/attendance']);
  });

  it('the app’s own static files are kept', () => {
    for (const p of ['/_next/static/chunks/main.js', '/brand/logo-mark.svg', '/icons/192']) expect(route(p, 'no-cors'), p).toBe('static');
  });

  it('any other page of the app is not kept: with no network it says "offline"', () => {
    for (const p of ['/app/students', '/app/students/123', '/app/settings', '/app/help/ticket']) expect(route(p), p).toBe('other-page');
  });

  it('nothing under /api is ever kept, whatever asks for it', () => {
    for (const p of ['/api/app/students', '/api/app/attendance?classId=1', '/api/auth/refresh', '/api/app/search?q=a']) {
      expect(route(p, 'cors'), p).toBe('network');
      expect(route(p, 'navigate'), p).toBe('network');
    }
  });

  it('it leaves alone: changes, other sites, Control, the website and sign-in', () => {
    expect(route('/app/my-day', 'navigate', 'POST')).toBe('network');
    expect(sw.route('GET', 'https://elsewhere.example/app/my-day', O, 'navigate')).toBe('network');
    for (const p of ['/control', '/control/schools', '/', '/login', '/pricing', '/application']) expect(route(p), p).toBe('network');
    expect(sw.route('GET', 'not a url', O, 'navigate')).toBe('network');
    // A page's data requests (not navigations) always go to the network.
    expect(route('/app/my-day', 'cors')).toBe('network');
  });

  it('only a real, direct 200 is kept: never a redirect to sign-in, an error or another site’s answer', () => {
    expect(sw.keepable({ status: 200, type: 'basic', redirected: false })).toBe(true);
    expect(sw.keepable({ status: 200, type: 'basic', redirected: true })).toBe(false);
    expect(sw.keepable({ status: 500, type: 'basic', redirected: false })).toBe(false);
    expect(sw.keepable({ status: 200, type: 'opaque', redirected: false })).toBe(false);
    expect(sw.keepable(undefined)).toBe(false);
  });

  it('the offline page says so in English and Hindi, links to My Day, and holds nothing personal', () => {
    expect(sw.OFFLINE_PAGE).toContain('You are offline');
    expect(sw.OFFLINE_PAGE).toContain('आप ऑफ़लाइन हैं');
    expect(sw.OFFLINE_PAGE).toContain('href="/app/my-day"');
    expect(sw.OFFLINE_PAGE).not.toMatch(/<script/i);
  });

  it('signing out clears the kept pages and the device store', () => {
    const shell = readFileSync(path.join(__dirname, '../../src/components/app-shell/AppShell.tsx'), 'utf8');
    expect(shell).toMatch(/fetch\('\/api\/auth\/logout'[\s\S]{0,120}await clear\(\)/);
    const offline = readFileSync(path.join(__dirname, '../../src/components/app-shell/OfflineContext.tsx'), 'utf8');
    expect(offline).toContain("postMessage({ type: 'clear' })");
    expect(offline).toContain('deleteDeviceStore(deviceStoreName(schoolId, userId))');
    // A session that ended without signing out: the next person does not see the kept pages.
    expect(offline).toMatch(/getItem\(OWNER_KEY\) === owner\) return;\s+await clearKeptPages\(\)/);
    expect(readFileSync(path.join(__dirname, '../../public/sw.js'), 'utf8')).toMatch(/type === 'clear'\) event\.waitUntil\(caches\.delete\(PAGE_CACHE\)\)/);
    // Registered for the school app only, and only in a production build.
    expect(offline).toMatch(/NODE_ENV === 'production'[\s\S]{0,120}register\('\/sw\.js', \{ scope: '\/app' \}\)/);
  });
});

// The Family app (M2-9, C283): the same worker, registered with scope /family. With no network and no kept copy (C539,
// below) any of its pages is answered with the app's shell (/family/offline), which opens the chapters saved on the phone.
describe('the Family app offline', () => {
  const fam = sw as unknown as typeof sw & { staticFiles: (html: string) => string[]; FAMILY_OFFLINE_PAGE: string; FAMILY_SHELL: string };
  it('a family page is fetched from the network; with none, the shell answers. Its data never passes through', () => {
    for (const p of ['/family', '/family/study', '/family/understand?kind=topic&key=a.b.t01', '/family/offline']) expect(route(p), p).toBe('family-page');
    for (const p of ['/api/family/pack?chapter=x', '/api/family/check']) {
      expect(route(p, 'cors'), p).toBe('network');
      expect(route(p, 'navigate'), p).toBe('network');
    }
    expect(route('/family/study', 'cors')).toBe('network');
    expect(route('/familyx')).toBe('network');
    expect(fam.FAMILY_SHELL).toBe('/family/offline');
  });

  it('the shell keeps the static files its page loads, and nothing else', () => {
    const html = `<script src="/_next/static/chunks/a.js"></script><link href="/_next/static/css/b.css"> self.__next_f.push([1,"0:[\\"/_next/static/chunks/c.js\\"]"]) url(/_next/static/media/f.woff2) <a href="/family/study">`;
    expect(fam.staticFiles(html).sort()).toEqual(['/_next/static/chunks/a.js', '/_next/static/chunks/c.js', '/_next/static/css/b.css', '/_next/static/media/f.woff2']);
  });

  it('the last-resort page says so in English and Hindi, and holds no script', () => {
    expect(fam.FAMILY_OFFLINE_PAGE).toContain('No internet');
    expect(fam.FAMILY_OFFLINE_PAGE).toContain('इंटरनेट नहीं है');
    expect(fam.FAMILY_OFFLINE_PAGE).not.toMatch(/<script/i);
    const src = readFileSync(path.join(__dirname, '../../public/sw.js'), 'utf8');
    // C539: family-clear deletes the shell and every kept page.
    expect(src).toMatch(/type === 'family-clear'\) event\.waitUntil\(familyClear\(\)\)/);
    expect(src).toMatch(/const familyClear = \(\) => familySerial\(\(\) => Promise\.all\(\[caches\.delete\(FAMILY_PAGES\), caches\.delete\(FAMILY_CACHE\)\]\)\)/);
    // Only the shell is ever put in the family cache.
    expect(src.match(/caches\.open\(FAMILY_CACHE\)\)\.put\(([^,]+),/)?.[1]).toBe('FAMILY_SHELL');
  });
});

// W11-A (C416): a reload showed the offline page although the site answered. The cause: one thrown fetch (a dropped
// or stale connection on the phone, or an interrupted navigation) was taken for "no internet", with no second try and
// no look at navigator.onLine. A reload and a redirect were never the cause: both pass straight through.
describe('a Family page when a fetch fails', () => {
  type Deps = { fetch: (r: Request) => Promise<Response>; online: () => boolean; shell: () => Promise<Response | undefined> };
  const fam = sw as unknown as { familyPage: (r: Request, d: Deps) => Promise<Response>; FAMILY_OFFLINE_PAGE: string };
  const page = () => new Response('page', { status: 200 });
  const nav = (init: RequestInit = {}) => new Request(O + '/family/study', init);
  const deps = (answers: Array<Response | Error>, online = true, kept: 'shell' | 'none' = 'shell') => {
    const seen: Request[] = [];
    const d: Deps = {
      fetch: async (r) => {
        seen.push(r);
        const a = answers.shift() ?? new TypeError('Failed to fetch');
        if (a instanceof Error) throw a;
        return a;
      },
      online: () => online,
      shell: async () => (kept === 'shell' ? new Response('shell', { status: 200 }) : undefined),
    };
    return { d, seen };
  };
  const net = () => new TypeError('Failed to fetch');

  it('a reload is answered by the network, once', async () => {
    const { d, seen } = deps([page()]);
    expect(await (await fam.familyPage(nav({ cache: 'reload' }), d)).text()).toBe('page');
    expect(seen).toHaveLength(1);
    expect(seen[0].cache).toBe('reload');
  });

  it('a redirect (to sign-in) is passed on as it came, not taken for offline', async () => {
    const { d, seen } = deps([new Response(null, { status: 307, headers: { location: '/family/sign-in' } })]);
    expect((await fam.familyPage(nav({ redirect: 'manual' }), d)).status).toBe(307);
    expect(seen).toHaveLength(1);
  });

  it('one thrown fetch while online is asked once more, fresh, with the sign-in and the redirect mode kept', async () => {
    const { d, seen } = deps([net(), page()]);
    expect(await (await fam.familyPage(nav({ cache: 'no-cache' }), d)).text()).toBe('page');
    expect(seen).toHaveLength(2);
    expect(seen[1].url).toBe(O + '/family/study');
    expect(seen[1].credentials).toBe('include');
    expect(seen[1].redirect).toBe('manual');
  });

  it('really offline: both tries fail and the shell answers; with no shell, the last-resort page', async () => {
    expect(await (await fam.familyPage(nav(), deps([net(), net()], false).d)).text()).toBe('shell');
    expect(await (await fam.familyPage(nav(), deps([net(), net()], false, 'none').d)).text()).toBe(fam.FAMILY_OFFLINE_PAGE);
  });

  it('online, a network error on the second try too: the shell answers', async () => {
    expect(await (await fam.familyPage(nav(), deps([net(), net()], true).d)).text()).toBe('shell');
  });

  it('online, any other failure (an aborted navigation) is passed on as the error, not the offline page', async () => {
    const abort = () => new DOMException('aborted', 'AbortError');
    expect((await fam.familyPage(nav(), deps([abort(), abort()], true).d)).type).toBe('error');
  });

  it('the fetch handler answers a family page through it', () => {
    const src = readFileSync(path.join(__dirname, '../../public/sw.js'), 'utf8');
    expect(src).toMatch(/kind === 'family-page' \|\| kind === 'family-data'\) \{[\s\S]{0,1200}event\.respondWith\(kind === 'family-page' \? familyPage\(request, deps\) : familyData\(request, deps\)\)/);
    expect(src).toMatch(/online: \(\) => self\.navigator\.onLine/);
  });
});

// C539: on a weak network a Family screen (and the page data the app's router asks for) is fetched from the network
// first; after FAMILY_WAIT_MS a fresh kept copy answers, and with no network any kept copy does. Only the child's
// screens are kept, never /api, never a redirect; a redirect or the sign-in page deletes every kept page.
describe('C539: Family screens on a weak network', () => {
  type Deps = {
    fetch: (r: Request) => Promise<Response>;
    online: () => boolean;
    shell: () => Promise<Response | undefined>;
    kept?: () => Promise<Response | undefined>;
    keep?: (r: Response) => unknown;
    later?: (p: Promise<unknown>) => void;
    wait?: number;
    now?: () => number;
  };
  const fam = sw as unknown as {
    route: (method: string, url: string, origin: string, mode: string, rsc?: boolean) => string;
    familyKey: (url: string, kind: string) => string | null;
    familyStore: (kind: string, url: string, key: string | null, r: unknown) => string;
    mayAnswer: (copy: Response | undefined, why: string, now?: number) => boolean;
    overflow: (keys: string[], max: number) => string[];
    familyPage: (r: Request, d: Deps) => Promise<Response>;
    familyData: (r: Request, d: Deps) => Promise<Response>;
    FAMILY_WAIT_MS: number;
    FAMILY_FRESH_MS: number;
    FAMILY_MAX_KEPT: number;
    FAMILY_KEEP_MARK: string;
    KEPT_AT: string;
    KEPT_PAGES: string[];
  };
  const NOW = Date.parse('2026-11-22T10:00:00Z');
  const copy = (body: string, keptAt: number | null = NOW - 60_000) => new Response(body, { status: 200, headers: keptAt === null ? {} : { [fam.KEPT_AT]: String(keptAt) } });
  const slow = (body: string, ms: number) => () => new Promise<Response>((resolve) => setTimeout(() => resolve(new Response(body, { status: 200 })), ms));
  const net = () => new TypeError('Failed to fetch');
  const make = (fetcher: () => Promise<Response>, kept: Response | undefined, online = true) => {
    const later: Promise<unknown>[] = [];
    const keptSeen: Response[] = [];
    const d: Deps = {
      fetch: () => fetcher(),
      online: () => online,
      shell: async () => new Response('shell', { status: 200 }),
      kept: async () => kept?.clone(),
      keep: (r) => keptSeen.push(r.clone()),
      later: (p) => later.push(p),
      wait: 20,
      now: () => NOW,
    };
    return { d, later, keptSeen };
  };
  const failing = () => Promise.reject(net());

  it('waits about 3.5 s and lets a copy answer a slow network for 6 hours', () => {
    expect(fam.FAMILY_WAIT_MS).toBe(3500);
    expect(fam.FAMILY_FRESH_MS).toBe(6 * 60 * 60 * 1000);
    expect(fam.FAMILY_MAX_KEPT).toBeGreaterThan(0);
  });

  it('the router’s page data for a Family screen goes through the worker; the school app’s and /api never do', () => {
    expect(fam.route('GET', O + '/family/study?_rsc=abc', O, 'cors')).toBe('family-data');
    expect(fam.route('GET', O + '/family/study', O, 'cors', true)).toBe('family-data');
    expect(fam.route('GET', O + '/family/study', O, 'cors', false)).toBe('network');
    expect(fam.route('GET', O + '/app/my-day?_rsc=abc', O, 'cors', true)).toBe('network');
    expect(fam.route('GET', O + '/api/family/pack?chapter=x&_rsc=1', O, 'cors', true)).toBe('network');
    expect(fam.route('POST', O + '/family/study?_rsc=1', O, 'cors', true)).toBe('network');
    expect(fam.route('GET', O + '/family/study', O, 'navigate', true)).toBe('family-page');
    // The school app's rules are as they were.
    expect(fam.KEPT_PAGES).toEqual(['/app', '/app/my-day', '/app/attendance']);
    expect(fam.route('GET', O + '/app/my-day', O, 'navigate')).toBe('kept-page');
    expect(fam.route('GET', O + '/app/reports', O, 'navigate')).toBe('other-page');
  });

  it('keeps only the child’s screens: never Understand, the parent area, results, the call, settings or sign-in', () => {
    for (const p of ['/family', '/family/', '/family/study', '/family/study?subject=science', '/family/study/chapter/cbse.c6.science.ch01', '/family/english/lesson/a', '/family/progress', '/family/future/exams', '/family/draw', '/family/tutors']) expect(fam.familyKey(O + p, 'family-page'), p).not.toBeNull();
    for (const p of ['/family/understand?kind=topic&key=a.t01', '/family/parent', '/family/parent/results', '/family/results/1', '/family/call', '/family/settings', '/family/profile', '/family/children', '/family/notifications', '/family/welcome', '/family/sign-in', '/family/sign-out', '/family/link', '/family/offline', '/family/learn/reader/index.html', '/family/studyx', '/api/family/check']) expect(fam.familyKey(O + p, 'family-page'), p).toBeNull();
    // A page by its path and query; the page data by its full address, `_rsc` and all, and only with it.
    expect(fam.familyKey(O + '/family/study?subject=science&_rsc=x1', 'family-page')).toBe('/family/study?subject=science');
    expect(fam.familyKey(O + '/family/study?_rsc=x1', 'family-data')).toBe('/family/study?_rsc=x1');
    expect(fam.familyKey(O + '/family/study', 'family-data')).toBeNull();
  });

  it('keeps a direct 200 of the right type; a redirect or the sign-in page deletes every kept page', () => {
    const r = (status: number, type: string, extra: Record<string, unknown> = {}) => ({ status, type: 'basic', redirected: false, headers: new Headers({ 'content-type': type }), ...extra });
    const page = O + '/family/study';
    expect(fam.familyStore('family-page', page, '/family/study', r(200, 'text/html; charset=utf-8'))).toBe('keep');
    expect(fam.familyStore('family-data', page + '?_rsc=1', '/family/study?_rsc=1', r(200, 'text/x-component'))).toBe('keep');
    expect(fam.familyStore('family-data', page + '?_rsc=1', '/family/study?_rsc=1', r(200, 'text/html'))).toBe('skip');
    expect(fam.familyStore('family-page', page, '/family/study', r(200, 'text/x-component'))).toBe('skip');
    expect(fam.familyStore('family-page', page, '/family/study', r(500, 'text/html'))).toBe('skip');
    expect(fam.familyStore('family-page', page, '/family/study', r(200, 'text/html', { type: 'cors' }))).toBe('skip');
    expect(fam.familyStore('family-page', O + '/family/parent', null, r(200, 'text/html'))).toBe('skip');
    expect(fam.familyStore('family-page', page, '/family/study', r(0, '', { type: 'opaqueredirect' }))).toBe('forget');
    expect(fam.familyStore('family-data', page + '?_rsc=1', '/family/study?_rsc=1', r(200, 'text/html', { redirected: true }))).toBe('forget');
    expect(fam.familyStore('family-page', page, '/family/study', r(307, 'text/html'))).toBe('forget');
    expect(fam.familyStore('family-page', O + '/family/sign-in', null, r(200, 'text/html'))).toBe('forget');
    expect(fam.familyStore('family-page', page, '/family/study', undefined)).toBe('skip');
  });

  it('a copy answers a slow network only when kept in the last 6 hours; with no network, any copy', () => {
    expect(fam.mayAnswer(copy('a', NOW - 60_000), 'slow', NOW)).toBe(true);
    expect(fam.mayAnswer(copy('a', NOW - 7 * 60 * 60 * 1000), 'slow', NOW)).toBe(false);
    expect(fam.mayAnswer(copy('a', null), 'slow', NOW)).toBe(false);
    expect(fam.mayAnswer(copy('a', NOW - 30 * 24 * 60 * 60 * 1000), 'offline')).toBe(true);
    expect(fam.mayAnswer(undefined, 'offline')).toBe(false);
  });

  it('past the limit the oldest copies go, never the mark', () => {
    const keys = [O + fam.FAMILY_KEEP_MARK, O + '/family', O + '/family/study', O + '/family/draw'];
    expect(fam.overflow(keys, 2)).toEqual([O + '/family']);
    expect(fam.overflow(keys, 5)).toEqual([]);
  });

  it('the network answers in time: its answer, and it is looked at to be kept', async () => {
    const { d, later, keptSeen } = make(slow('fresh', 1), copy('old'));
    expect(await (await fam.familyPage(new Request(O + '/family/study'), d)).text()).toBe('fresh');
    await Promise.all(later);
    expect(keptSeen).toHaveLength(1);
  });

  it('a slow network: after the wait the fresh copy answers, and the late answer still replaces it', async () => {
    const { d, later, keptSeen } = make(slow('late', 80), copy('kept'));
    expect(await (await fam.familyPage(new Request(O + '/family/study'), d)).text()).toBe('kept');
    expect(keptSeen).toHaveLength(0);
    await Promise.all(later);
    expect(keptSeen).toHaveLength(1);
    expect(await keptSeen[0].text()).toBe('late');
  });

  it('a slow network with only an old copy, or none: the network is awaited', async () => {
    expect(await (await fam.familyPage(new Request(O + '/family/study'), make(slow('late', 60), copy('old', NOW - 8 * 60 * 60 * 1000)).d)).text()).toBe('late');
    expect(await (await fam.familyPage(new Request(O + '/family/study'), make(slow('late', 60), undefined).d)).text()).toBe('late');
  });

  it('no network: the kept copy, however old; with none, the shell; an aborted navigation stays an error', async () => {
    expect(await (await fam.familyPage(new Request(O + '/family/study'), make(failing, copy('old', NOW - 9 * 24 * 60 * 60 * 1000), false).d)).text()).toBe('old');
    expect(await (await fam.familyPage(new Request(O + '/family/study'), make(failing, undefined, false).d)).text()).toBe('shell');
    const abort = () => Promise.reject(new DOMException('aborted', 'AbortError'));
    expect((await fam.familyPage(new Request(O + '/family/study'), make(abort, copy('kept'), true).d)).type).toBe('error');
  });

  it('page data: the same, and with no network and no copy an error, so the router loads the page itself', async () => {
    const rsc = new Request(O + '/family/study?_rsc=1', { headers: { RSC: '1' } });
    expect(await (await fam.familyData(rsc, make(slow('late', 80), copy('kept')).d)).text()).toBe('kept');
    expect(await (await fam.familyData(rsc, make(failing, copy('kept'), false).d)).text()).toBe('kept');
    expect((await fam.familyData(rsc, make(failing, undefined, false).d)).type).toBe('error');
    // Asked twice, like a page, before it counts as no network.
    let n = 0;
    const once = () => (n++ === 0 ? Promise.reject(net()) : Promise.resolve(new Response('second', { status: 200 })));
    expect(await (await fam.familyData(rsc, make(once, undefined).d)).text()).toBe('second');
  });

  it('nothing is kept or answered until a signed-in page says the offline module is on; family-clear takes it all', () => {
    const src = readFileSync(path.join(__dirname, '../../public/sw.js'), 'utf8');
    // The kept pages have a cache of their own; the version stays, so the static files, the shell and the school's kept
    // pages already on a phone are not wiped by this release.
    expect(src).toContain("const VERSION = 'nca-v1';");
    expect(src).toContain('const FAMILY_PAGES = `${VERSION}-family-pages`;');
    expect(src).toMatch(/type === 'family-keep'\) event\.waitUntil\(familyKeepOn\(\)\)/);
    expect(src).toMatch(/async function familyKept\(key\) \{[\s\S]{0,200}cache\.match\(FAMILY_KEEP_MARK\)/);
    expect(src).toMatch(/function familyKeepCopy\(key, response\) \{[\s\S]{0,300}cache\.match\(FAMILY_KEEP_MARK\)/);
    expect(src).toMatch(/if \(what === 'forget'\) return familyForget\(\);/);
    const sync = readFileSync(path.join(__dirname, '../../src/components/family/offline/OfflineSync.tsx'), 'utf8');
    expect(sync).toMatch(/register\('\/sw\.js', \{ scope: '\/family' \}\)[\s\S]{0,80}keepPages\(\)/);
    const store = readFileSync(path.join(__dirname, '../../src/components/family/offline/store.ts'), 'utf8');
    expect(store).toContain("postMessage({ type: 'family-keep' })");
    // Sign-out reaches the worker even from a page it does not run.
    expect(store).toMatch(/controller \?\? \(await navigator\.serviceWorker\.getRegistration\('\/family\/'\)[\s\S]{0,80}postMessage\(\{ type: 'family-clear' \}\)/);
    for (const f of ['src/components/family/FamilySignOutNow.tsx', 'src/components/family/ParentArea.tsx']) expect(readFileSync(path.join(__dirname, '../..', f), 'utf8'), f).toContain('clearOffline');
  });
});
