import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { FamilyHeader } from '@/components/family/FamilyHeader';
import { FAMILY_MODULES } from '@/lib/contracts/family-modules';
import { familyWords } from '@/lib/family/words';
import { buildNotifications } from '@/lib/family/notifications';
import { futureHubs, hubSections, loadHubEntries, type HubEntry } from '@/lib/family/hubs';
import { visibleTabs } from '@/lib/family/modules';
import { en } from '@/lib/i18n/messages/en';
import { hi } from '@/lib/i18n/messages/hi';
import type { FamilyChild } from '@/lib/family/children';
import type { MessageKey } from '@/lib/i18n';

// H1 (docs/37 §3 decision 8): the Parent button leaves the child-mode header for the Profile ("Parent space", still behind
// the PIN); the bell and the hubs take its place; the notifications centre lists only what the app already knows, for the
// active child; the three hubs are shells that show a child's own state and no other.

const ROOT = path.resolve(__dirname, '../..');
const ACCOUNT = 'fa000000-0000-4000-8000-0000000000a1';
const OTHER = 'fa000000-0000-4000-8000-0000000000b1';
const CHILD = 'fa000000-0000-4000-8000-0000000000c1';
const SIBLING = 'fa000000-0000-4000-8000-0000000000c2';
const STRANGER = 'fa000000-0000-4000-8000-0000000000c3';
const STAFF = 'fa000000-0000-4000-8000-0000000000e1';

const child: FamilyChild = { childId: CHILD, firstName: 'Asha', classLevel: 6, board: 'CBSE', language: 'en', style: 'en', stateCode: 'IN-UP', freeSubject: null };
const KEYS = ['fam.app.name', 'fam.home.hello', 'fam.class.label', 'fam.class.nursery', 'fam.class.lkg', 'fam.class.ukg', 'fam.hub.entry', 'fam.notify.center.title', 'fam.profile.title', 'fam.home.whoIsLearning'] as MessageKey[];

vi.mock('@/lib/family/server', async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return { ...real, requireFamilyPage: async () => (globalThis as { __h1Page?: unknown }).__h1Page ?? null };
});
vi.mock('next/navigation', () => ({ redirect: (to: string) => { throw new Error(`redirect:${to}`); }, usePathname: () => '/family', useRouter: () => ({ refresh() {}, push() {} }) }));

describe('the child-mode header', () => {
  it('has no Parent button and no link to the parent area; it has the bell, the hub entry and the Profile', () => {
    for (const lang of ['en', 'hi'] as const) {
      const html = renderToStaticMarkup(h(FamilyHeader, { w: familyWords(lang, KEYS), child, children: [child], news: 2 }));
      expect(html).not.toContain('/family/parent');
      expect(html).toContain('data-notify-bell');
      expect(html).toContain('href="/family/notifications"');
      expect(html).toContain('href="/family/future"');
      expect(html).toContain('href="/family/profile"');
    }
    expect(renderToStaticMarkup(h(FamilyHeader, { w: familyWords('en', KEYS), child, children: [child] }))).toContain('aria-label="Notifications"');
  });

  it('keeps 44 px targets on the bell and the hub entry', () => {
    const src = readFileSync(path.join(ROOT, 'src/components/family/FamilyHeader.tsx'), 'utf8');
    const bell = readFileSync(path.join(ROOT, 'src/components/family/NotifyBell.tsx'), 'utf8');
    expect(src).toMatch(/data-hub-entry[\s\S]*min-h-\[44px\]/);
    expect(bell).toContain('min-h-[44px]');
    expect(bell).toContain('min-w-[44px]');
  });
});

describe('Parent space under Profile', () => {
  it('the Profile offers Parent space, which goes to the PIN-gated parent area', async () => {
    (globalThis as { __h1Page?: unknown }).__h1Page = {
      session: { accountId: ACCOUNT, tokenVersion: 0 },
      account: { hasPin: true },
      consents: { study_core: true },
      children: [child],
      child,
      parentMode: false,
      childLang: 'hi',
      parentLang: 'en',
    };
    const Page = (await import('@/app/(family)/family/(app)/profile/page')).default;
    const hindi = renderToStaticMarkup(await Page());
    expect(hindi).toContain('href="/family/parent"');
    expect(hindi).toContain('पैरेंट स्पेस');
    (globalThis as { __h1Page?: unknown }).__h1Page = { ...((globalThis as { __h1Page?: object }).__h1Page as object), childLang: 'en' };
    expect(renderToStaticMarkup(await Page())).toContain('Parent space');
  });

  it('the parent area still shows the PIN gate until parent mode is open', () => {
    const src = readFileSync(path.join(ROOT, 'src/app/(family)/family/(app)/parent/page.tsx'), 'utf8');
    expect(src).toMatch(/if \(!page\.parentMode\) \{[\s\S]{0,300}<PinGate/);
  });
});

describe('the three hubs', () => {
  it('are modules of the registry, built, on the Future tab, and listed from it', () => {
    const hubs = futureHubs().map((x) => x.module).sort();
    expect(hubs).toEqual(['careers', 'exams_portal', 'opportunities']);
    for (const id of hubs) expect(FAMILY_MODULES.find((m) => m.id === id)).toMatchObject({ tab: 'future', built: true, entitlement: 'public' });
    expect(visibleTabs(() => true)).toContain('future');
    expect(visibleTabs(() => false)).not.toContain('future');
  });

  it('show national entries to every child and a state’s entries to that state’s children only', () => {
    const entries: HubEntry[] = [
      { id: 'n1', title: 'A national entry', stateCode: null },
      { id: 'up1', title: 'An entry of UP', stateCode: 'IN-UP' },
      { id: 'hr1', title: 'An entry of HR', stateCode: 'IN-HR' },
    ];
    const up = hubSections(entries, 'IN-UP', true);
    expect(up.national.map((e) => e.id)).toEqual(['n1']);
    expect(up.state?.name).toBe('Uttar Pradesh');
    expect(up.state?.entries.map((e) => e.id)).toEqual(['up1']);
    const hr = hubSections(entries, 'IN-HR', true);
    expect(hr.state?.entries.map((e) => e.id)).toEqual(['hr1']);
    // A hub without a state part (the Career Hub), and a child with no known state, show no state section.
    expect(hubSections(entries, 'IN-UP', false).state).toBeNull();
    expect(hubSections(entries, '', true).state).toBeNull();
  });

  it('have no entries yet: nothing is invented', async () => {
    for (const m of ['careers', 'exams_portal', 'opportunities']) expect(await loadHubEntries(m)).toEqual([]);
  });
});

describe('the notifications list', () => {
  it('is built from the school’s counts, tonight’s practice and the chapter requests; empty when there is nothing', () => {
    expect(buildNotifications({ news: null, tonight: [], requests: [] })).toEqual([]);
    expect(buildNotifications({ news: { homework: 0, notices: 0, results: 0 }, tonight: [], requests: [] })).toEqual([]);
    const items = buildNotifications({
      news: { homework: 2, notices: 0, results: 1 },
      tonight: ['mathematics'],
      requests: [{ requestId: 'r1', subject: 'science', title: 'Light', status: 'ready' }],
    });
    expect(items.map((i) => i.id)).toEqual(['news.homework', 'news.results', 'tonight.mathematics', 'request.r1']);
  });
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
const fam = async <R,>(fn: (c: never) => Promise<R>, account = ACCOUNT): Promise<R> => (await import('@/lib/auth/db')).withFamilyContext({ accountId: account, tokenVersion: 0 }, fn as never) as Promise<R>;

describe('the notifications centre on the real schema', () => {
  beforeAll(async () => {
    db = await startHarnessDb({ port: 0 });
    process.env.DATABASE_URL = db.url;
    process.env.DB_POOL_MAX = '1';
    process.env.APP_SESSION_SECRET = 'test-only-secret-for-family-h1-hubs-0123456789abcdef';
    await db.pg.exec(`
      insert into users (user_id, school_id, email, role, display_name) values ('${STAFF}', null, 'h1-staff@x.invalid', 'super_admin', 'Founder');
      insert into family.accounts (account_id, email) values ('${ACCOUNT}', 'h1@example.org'), ('${OTHER}', 'h1-other@example.org');
      insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code) values
        ('${CHILD}', '${ACCOUNT}', 'Asha', 6, 'CBSE', 'en', 'en', 'IN-UP'),
        ('${SIBLING}', '${ACCOUNT}', 'Kabir', 7, 'CBSE', 'en', 'en', 'IN-UP'),
        ('${STRANGER}', '${OTHER}', 'Meena', 6, 'CBSE', 'en', 'en', 'IN-UP');
      insert into content.chapter_requests (account_id, child_id, board_id, class_level, subject, title, source, status, chapter_key, claimed_by, updated_at) values
        ('${ACCOUNT}', '${CHILD}', 'CBSE', 6, 'science', 'Light and shadows', 'catalog', 'received', null, null, now()),
        ('${ACCOUNT}', '${CHILD}', 'CBSE', 6, 'science', 'Sound', 'catalog', 'ready', 'nc.test.sound', '${STAFF}', now() - interval '2 days'),
        ('${ACCOUNT}', '${CHILD}', 'CBSE', 6, 'science', 'Old finished one', 'catalog', 'ready', 'nc.test.old', '${STAFF}', now() - interval '40 days'),
        ('${ACCOUNT}', '${SIBLING}', 'CBSE', 7, 'science', 'Heat of the sibling', 'catalog', 'received', null, null, now()),
        ('${OTHER}', '${STRANGER}', 'CBSE', 6, 'science', 'Another account request', 'catalog', 'received', null, null, now());
    `);
  }, 120_000);
  afterAll(async () => {
    await (await import('@/lib/auth/db')).endPool();
    await db?.stop();
  });

  it('lists this child’s own chapter requests, recent or open, and never a sibling’s or another account’s', async () => {
    const { readNotifications } = await import('@/lib/family/notifications');
    const claims = { accountId: ACCOUNT, tokenVersion: 0 };
    const mine = await fam((c) => readNotifications(c as never, claims, ACCOUNT, { childId: CHILD }));
    const titles = mine.flatMap((i) => (i.kind === 'request' ? [i.title] : []));
    expect(titles.sort()).toEqual(['Light and shadows', 'Sound']);
    expect(mine.find((i) => i.kind === 'request' && i.title === 'Sound')).toMatchObject({ status: 'ready', href: '/family/study?subject=science' });
    const sibling = await fam((c) => readNotifications(c as never, claims, ACCOUNT, { childId: SIBLING }));
    expect(sibling.flatMap((i) => (i.kind === 'request' ? [i.title] : []))).toEqual(['Heat of the sibling']);
    // Another account asking about this account's child reads nothing of it (row level security).
    const strange = await fam((c) => readNotifications(c as never, { accountId: OTHER, tokenVersion: 0 }, OTHER, { childId: CHILD }), OTHER);
    expect(strange).toEqual([]);
  });
});

describe('the words', () => {
  it('every new key is in English and Hindi, the Hindi in Devanagari and different from the English', () => {
    const keys = Object.keys(en).filter((k) => /^fam\.(notify\.center|profile|hub)\./.test(k));
    expect(keys.length).toBeGreaterThanOrEqual(16);
    for (const k of keys) {
      const e = (en as Record<string, string>)[k];
      const x = (hi as Record<string, string>)[k];
      expect(x, k).toBeTruthy();
      expect(x, k).not.toBe(e);
      expect(x, k).toMatch(/[ऀ-ॿ]/);
    }
    expect(/\b(mock|dummy|fake|sample)\b/i.test(keys.map((k) => (en as Record<string, string>)[k]).join(' '))).toBe(false);
  });
});
