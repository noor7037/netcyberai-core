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

// The Family app (M2-9, C283): the same worker, registered with scope /family. Its pages are never kept; with no
// network any of them is answered with the app's shell (/family/offline), which opens the chapters saved on the phone.
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
    expect(src).toMatch(/type === 'family-clear'\) event\.waitUntil\(caches\.delete\(FAMILY_CACHE\)\)/);
    // Only the shell is ever put in the family cache.
    expect(src.match(/caches\.open\(FAMILY_CACHE\)\)\.put\(([^,]+),/)?.[1]).toBe('FAMILY_SHELL');
  });
});
