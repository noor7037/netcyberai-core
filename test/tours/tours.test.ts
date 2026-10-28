import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'crypto';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'next/server';
import { createTestDb, type TestDb } from '../db/pglite-harness';
import { MARK_TOUR_SEEN_SQL } from '@/lib/auth/db';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { LangProvider } from '@/components/app-shell/LangContext';
import { ToursProvider } from '@/components/app-shell/ToursContext';
import { WordsProvider } from '@/components/app-shell/Words';
import { shellWords } from '@/components/app-shell/shell-words';
import { HELP_ARTICLES } from '@/content/help/articles';
import { SCHOOL_ROLES } from '@/lib/contracts/modules';
import { isTourId, myDayTour, readToursCookie, TOUR_IDS, TOUR_MAX_STEPS, TOURS, toursCookieValue, type TourId } from '@/lib/contracts/tours';
import { isMessageKey, t } from '@/lib/i18n';

// First-visit tours and "Show me how" (docs/19 rule 8, C138).

const USER = '00000000-0000-4000-8000-00000000a001';
const state = vi.hoisted(() => ({ claims: null as any, seen: [] as string[], writes: 0, dbDown: false }));
vi.mock('@/lib/auth/require-session', () => ({ requireSession: async () => state.claims }));
vi.mock('@/lib/auth/db', async (original) => ({
  ...(await original<typeof import('@/lib/auth/db')>()),
  ownToursSeen: async () => {
    if (state.dbDown) throw new Error('db');
    return state.seen;
  },
  markTourSeen: async (_user: string, tour: string) => {
    if (state.dbDown) throw new Error('db');
    state.writes += 1;
    if (!state.seen.includes(tour)) state.seen = [...state.seen, tour];
    return state.seen;
  },
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/app/students', useRouter: () => ({ push: () => undefined, refresh: () => undefined, replace: () => undefined }) }));

import { GET, POST } from '@/app/api/auth/tours/route';
import { POST as logout } from '@/app/api/auth/logout/route';

describe('the tours', () => {
  it('each has one to three steps, and every step has its words in English and Hindi', () => {
    expect(TOUR_IDS.length).toBeGreaterThanOrEqual(14);
    for (const id of TOUR_IDS) {
      const steps = TOURS[id].steps;
      expect(steps.length, id).toBeGreaterThanOrEqual(1);
      expect(steps.length, id).toBeLessThanOrEqual(TOUR_MAX_STEPS);
      steps.forEach((_, i) => {
        for (const part of ['title', 'text']) {
          const key = `tour.${id}.${i + 1}.${part}`;
          expect(isMessageKey(key), key).toBe(true);
          if (isMessageKey(key)) {
            expect(t('hi', key), key).toMatch(/[ऀ-ॿ]/);
            expect(t('en', key), key).not.toMatch(/[ऀ-ॿ]/);
          }
        }
      });
      // No words are left over for a step the tour does not have.
      expect(isMessageKey(`tour.${id}.${steps.length + 1}.title`), id).toBe(false);
    }
  });

  it('a step is short enough to read at a glance', () => {
    for (const id of TOUR_IDS) {
      TOURS[id].steps.forEach((_, i) => {
        expect(t('en', `tour.${id}.${i + 1}.title` as any).length, id).toBeLessThanOrEqual(40);
        expect(t('en', `tour.${id}.${i + 1}.text` as any).length, id).toBeLessThanOrEqual(160);
      });
    }
  });

  it('My Day has a tour for each role: teacher, office, principal, and one for the others', () => {
    expect(myDayTour('teacher')).toBe('my-day-teacher');
    expect(myDayTour('school_admin')).toBe('my-day-office');
    expect(myDayTour('principal')).toBe('my-day-principal');
    expect(myDayTour('accountant')).toBe('my-day');
    for (const role of SCHOOL_ROLES) expect(isTourId(myDayTour(role)), role).toBe(true);
  });

  it('every screen of the school app that is a module page has its tour', () => {
    const root = path.join(__dirname, '../../src');
    const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => (statSync(path.join(dir, n)).isDirectory() ? files(path.join(dir, n)) : [path.join(dir, n)]));
    // Up to the children: `tour=` is one of the first props wherever it is used.
    const tags = (text: string) => [...text.matchAll(/<ModulePage\b([\s\S]*?)(?:\n\s*>|>\s*\n)/g)].map((m) => m[1]);
    // Sub-pages of a screen that has the tour, and the person's own account page.
    const without = new Set(['help/ticket/new/page.tsx', 'help/ticket/[ticketId]/page.tsx', 'account/page.tsx']);
    const app = path.join(root, 'app/(school)/app');
    let checked = 0;
    for (const page of files(app).filter((f) => f.endsWith('page.tsx'))) {
      const rel = path.relative(app, page);
      const text = readFileSync(page, 'utf8');
      let found = tags(text);
      if (!found.length) {
        for (const m of text.matchAll(/from '@\/components\/([^']+)'/g)) {
          const view = path.join(root, 'components', `${m[1]}.tsx`);
          // Not the screen itself: what the page shows when its module is off or not built.
          if (['ModuleOffPage', 'ModuleComingPage'].includes(path.basename(m[1]))) continue;
          if (new RegExp(`<${path.basename(m[1])}\\b`).test(text)) found = found.concat(tags(readFileSync(view, 'utf8')));
        }
      }
      if (!found.length || without.has(rel)) continue;
      checked += 1;
      for (const tag of found) {
        const id = /\btour="([a-z-]+)"/.exec(tag)?.[1];
        expect(id !== undefined || /\btour=\{myDayTour\(role\)\}/.test(tag), `${rel} has no tour`).toBe(true);
        if (id) expect(isTourId(id), `${rel}: ${id}`).toBe(true);
      }
    }
    expect(checked).toBeGreaterThanOrEqual(11);
  });

  it('every tour is used by a screen', () => {
    const src = path.join(__dirname, '../../src');
    const all = (dir: string): string => readdirSync(dir).map((n) => (statSync(path.join(dir, n)).isDirectory() ? all(path.join(dir, n)) : n.endsWith('.tsx') ? readFileSync(path.join(dir, n), 'utf8') : '')).join('\n');
    const text = all(path.join(src, 'app')) + all(path.join(src, 'components'));
    for (const id of TOUR_IDS) expect(id.startsWith('my-day') || text.includes(`tour="${id}"`), id).toBe(true);
  });
});

describe('seen tours belong to the person, not the browser', () => {
  const other = '00000000-0000-4000-8000-00000000a002';
  it('a cookie written for this person is read; anyone else’s is ignored', () => {
    const value = toursCookieValue(USER, ['students', 'attendance']);
    expect(readToursCookie(value, USER)).toEqual(['students', 'attendance']);
    expect(readToursCookie(value, other)).toBeNull();
    expect(readToursCookie(undefined, USER)).toBeNull();
    expect(readToursCookie('students', USER)).toBeNull();
  });

  it('a person who has seen none is known to have seen none (not "unknown")', () => {
    expect(readToursCookie(toursCookieValue(USER, []), USER)).toEqual([]);
  });

  it('only real tours are kept', () => {
    expect(readToursCookie(`${USER}.students,not-a-tour,constructor,attendance`, USER)).toEqual(['students', 'attendance']);
    expect(toursCookieValue(USER, ['students', 'made-up'])).toBe(`${USER}.students`);
  });
});

describe('the API', () => {
  const get = () => GET(new NextRequest('http://localhost/api/auth/tours'));
  const post = (body: unknown, cookie?: string) => POST(new NextRequest('http://localhost/api/auth/tours', { method: 'POST', body: JSON.stringify(body), headers: cookie ? { cookie } : {} }));
  const cookie = (res: Response) => res.headers.get('set-cookie') ?? '';

  beforeEach(() => {
    state.claims = { sub: USER };
    state.seen = [];
    state.writes = 0;
    state.dbDown = false;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('signed out: refused', async () => {
    state.claims = null;
    expect((await get()).status).toBe(401);
    expect((await post({ tour: 'students' })).status).toBe(401);
  });

  it('asking: what the account has seen, remembered for this person only, never cached', async () => {
    state.seen = ['students'];
    const res = await get();
    expect(await res.json()).toEqual({ seen: ['students'] });
    expect(cookie(res)).toContain(`nca_tours=${USER}.students`);
    expect(cookie(res)).toMatch(/HttpOnly/i);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('the database cannot say: not known, so no tour is shown, and nothing is remembered', async () => {
    state.dbDown = true;
    const res = await get();
    expect(await res.json()).toEqual({ seen: null });
    expect(cookie(res)).toBe('');
  });

  it('finishing or skipping a tour saves it on the account, once', async () => {
    expect((await post({ tour: 'students' })).status).toBe(200);
    const again = await post({ tour: 'students' });
    expect(await again.json()).toMatchObject({ seen: ['students'] });
    expect(state.seen).toEqual(['students']);
    expect(cookie(again)).toContain(`nca_tours=${USER}.students`);
  });

  it('a tour that does not exist is refused and nothing is saved', async () => {
    for (const body of [{ tour: 'made-up' }, { tour: 5 }, {}, null]) expect((await post(body)).status).toBe(400);
    expect(state.writes).toBe(0);
  });

  it('during an impersonation the person’s own tours are not used up; only this browser remembers', async () => {
    state.claims = { sub: USER, impersonation: { impersonationId: 'i', actorUserId: 'founder' } };
    const res = await post({ tour: 'attendance' }, `nca_tours=${toursCookieValue(USER, ['students'])}`);
    expect(res.status).toBe(200);
    expect(state.writes).toBe(0);
    expect(cookie(res)).toContain(`nca_tours=${USER}.students%2Cattendance`);
  });

  it('cannot be saved: says so, and the cookie does not claim it was', async () => {
    state.dbDown = true;
    const res = await post({ tour: 'students' });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: 'not_saved' });
    expect(cookie(res)).toBe('');
  });

  it('signing out takes the tours cookie with it', async () => {
    // Signed in: the session is ended (the database call is stood in) and the cookie goes.
    vi.spyOn(await import('@/lib/auth/db'), 'withBackendConnection').mockImplementation(async () => undefined as never);
    state.claims = { sub: USER, sessionId: 's' };
    expect(cookie(await logout(new NextRequest('http://localhost/api/auth/logout', { method: 'POST' })))).toMatch(/nca_tours=;/);
  });
});

describe('on the screen', () => {
  const page = (lang: 'en' | 'hi', seen: readonly TourId[] | null, props: Record<string, unknown> = {}) =>
    renderToStaticMarkup(
      h(LangProvider, { lang, children: h(WordsProvider, { words: shellWords(lang).words, children: h(ToursProvider, { initial: seen, children: h(ModulePage, { moduleId: 'attendance', title: 'Attendance', purpose: 'x', help: 'mark-attendance', tour: 'attendance', children: h('p', null, 'body'), ...props } as any) }) }) })
    );

  it('"Show me how" links to the screen’s guide, in the person’s language', () => {
    const en = page('en', []);
    expect(en).toContain('href="/app/help/mark-attendance"');
    expect(en).toContain('Show me how');
    expect(HELP_ARTICLES.some((a) => a.slug === 'mark-attendance')).toBe(true);
    const hi = page('hi', []);
    expect(hi).toContain('href="/app/help/mark-attendance?lang=hi"');
    expect(hi).toContain('करके दिखाएँ');
  });

  it('a screen without a guide has no link (that a named guide exists is the CI check’s job)', () => {
    expect(page('en', [], { help: undefined })).not.toContain('Show me how');
    expect(page('en', [], { help: 'Not A Slug' })).not.toContain('Show me how');
  });

  it('first visit: the tour shows step 1 of 3 with Next and Skip, and does not block the page', () => {
    const html = page('en', []);
    expect(html).toContain('Step 1 of 3');
    expect(html).toContain('Choose the class');
    expect(html).toContain('>Next<');
    expect(html).toContain('>Skip<');
    expect(html).not.toContain('aria-modal');
    expect(html).not.toContain('role="dialog"');
    // In reading order it comes straight after the header, before the page's body.
    expect(html.indexOf('data-tour=')).toBeLessThan(html.indexOf('data-slot="body"'));
    expect(html).toContain('<p>body</p>');
  });

  it('in Hindi the tour is in Hindi', () => {
    const html = page('hi', []);
    expect(html).toContain('चरण 1 / 3');
    expect(html).toContain('कक्षा चुनें');
    expect(html).toMatch(/<aside[^>]*lang="hi"/);
  });

  it('seen before: no tour', () => {
    expect(page('en', ['attendance'])).not.toContain('Step 1 of');
  });

  it('not known yet whether it was seen: no tour, so a dismissed tour never flashes back', () => {
    expect(page('en', null)).not.toContain('Step 1 of');
  });

  it('a different screen’s tour being seen does not hide this one', () => {
    expect(page('en', ['students'])).toContain('Step 1 of 3');
  });
});

describe('users.tours_seen on real Postgres', () => {
  let db: TestDb;
  const user = randomUUID();
  beforeAll(async () => {
    db = await createTestDb();
    await db.platform((q) => q.query(`insert into users (user_id, role, display_name) values ($1, 'super_admin', 'Someone')`, [user]));
  }, 60000);

  it('is empty for everyone to begin with', async () => {
    expect((await db.query(`select tours_seen from users where user_id = $1`, [user])).rows[0].tours_seen).toEqual([]);
  });

  it('a tour is added once, however often it is marked (the statement the app runs)', async () => {
    await db.platform((q) => q.query(MARK_TOUR_SEEN_SQL, [user, 'students']));
    await db.platform((q) => q.query(MARK_TOUR_SEEN_SQL, [user, 'students']));
    const { rows } = await db.platform((q) => q.query(MARK_TOUR_SEEN_SQL, [user, 'attendance']));
    expect(rows[0].tours_seen).toEqual(['students', 'attendance']);
  });

  it('the list cannot grow without limit', async () => {
    const many = Array.from({ length: 101 }, (_, i) => `t${i}`);
    await expect(db.platform((q) => q.query(`update users set tours_seen = $2 where user_id = $1`, [user, many]))).rejects.toThrow(/users_tours_seen_small/);
  });
});
