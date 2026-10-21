import { randomUUID } from 'crypto';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { signAccessToken } from '@/lib/auth/jwt';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { GET as familyGet } from '@/app/api/control/family/route';
import { FamilyCountsView } from '@/components/control/apps/FamilyCountsView';
import { loadFamilyCounts, readFamilyCounts } from '@/lib/control/family-counts';

// Control → Family (M1-7): the counts come through family.control_counts() only, as the platform role, and the
// screen holds numbers and nothing else. One family is seeded (made-up address and first name), and neither may
// appear anywhere on the screen or in the route's answer.

const h = vi.hoisted(() => ({ db: null as unknown as { pg: any; stop?: () => Promise<void> } }));
vi.mock('@/lib/auth/db', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/auth/db')>();
  return {
    ...real,
    withTenantContext: (claims: { role: string }, fn: (db: unknown) => Promise<unknown>) =>
      h.db.pg.transaction(async (tx: { query: (sql: string, p?: unknown[]) => Promise<unknown> }) => {
        await tx.query(`set local role ${claims.role === 'super_admin' ? 'nca_super' : 'app_user'}`);
        return fn(tx);
      }),
  };
});

const A = 'f2000000-0000-4000-8000-0000000000a1';
const B = 'f2000000-0000-4000-8000-0000000000b1';
const CHILD_A = 'f2000000-0000-4000-8000-0000000000a2';
const CHILD_B = 'f2000000-0000-4000-8000-0000000000b2';
const CHILD_C = 'f2000000-0000-4000-8000-0000000000c2';
const FOUNDER = randomUUID();
const EMAIL = 'asha.parent.counts@example.invalid';
const FIRST_NAME = 'Zorbaline';

beforeAll(async () => {
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-family-counts-tests-0123456789abcdef';
  h.db = await startHarnessDb({ port: 0 });
  await h.db.pg.exec(`
    insert into users (user_id, school_id, email, role, display_name, is_active) values ('${FOUNDER}', null, 'founder.counts@example.invalid', 'super_admin', 'Farid Founder', true);
    insert into family.accounts (account_id, email, pin_hash) values ('${A}', '${EMAIL}', 'made-up-hash-for-a-test-only-0123456789abcdef'), ('${B}', 'second.family@example.invalid', null);
    insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code) values
      ('${CHILD_A}', '${A}', '${FIRST_NAME}', 7, 'CBSE', 'hi', 'hinglish', 'IN-UP'),
      ('${CHILD_B}', '${A}', 'Second', 7, 'CBSE', 'en', 'en', 'IN-UP'),
      ('${CHILD_C}', '${B}', 'Third', 9, 'CBSE', 'en', 'en', 'IN-HR');
    insert into family.consents (account_id, purpose, granted, verification_method, notice_version) values ('${A}', 'study_core', true, 'parent_tap', 'v1');
    insert into family.attempts (account_id, child_id, subject, topic_key, item_key, kind, answer, correct, answered_on) values
      ('${A}', '${CHILD_A}', 'science', 'cbse.c7.sci.ch01.t01', 'q1', 'check', 'b', true, current_date),
      ('${A}', '${CHILD_A}', 'science', 'cbse.c7.sci.ch01.t01', 'q2', 'check', 'a', false, current_date);
  `);
}, 120_000);
afterAll(async () => {
  await h.db?.stop?.();
});

const founderCookie = async () => `${ACCESS_COOKIE}=${await signAccessToken({ sub: FOUNDER, role: 'super_admin' as never, schoolId: null, membershipId: null, tokenVersion: 0, aal: 'aal1', sessionId: randomUUID() })}`;

describe('the counts', () => {
  it('are read through family.control_counts() as the platform role', async () => {
    const counts = await h.db.pg.transaction(async (tx: { query: (s: string) => Promise<unknown> }) => {
      await tx.query('set local role nca_super');
      return loadFamilyCounts(tx as never);
    });
    expect(counts).toMatchObject({ accounts: 2, accountsWithPin: 1, children: 3, studyCoreGranted: 1, answers7d: 2, childrenAnswering7d: 1, topicsMastered: 0, aiRequestsToday: 0 });
    expect(counts.childrenByClass).toEqual([
      { classLevel: 7, count: 2 },
      { classLevel: 9, count: 1 },
    ]);
  });
  it('Control reads no family table: the function is the only door', async () => {
    await expect(
      h.db.pg.transaction(async (tx: { query: (s: string) => Promise<unknown> }) => {
        await tx.query('set local role nca_super');
        await tx.query('select email from family.accounts');
      })
    ).rejects.toThrow(/permission denied/);
  });
  it('the reader keeps only the named numbers, whatever else the function might return', () => {
    const counts = readFamilyCounts({ accounts: 3, children_by_class: { '7': 2, nonsense: 5, '99': 1 }, email: EMAIL, first_name: FIRST_NAME, answers_7d: -4 });
    expect(Object.keys(counts).sort()).toEqual(['accounts', 'accountsWithPin', 'answers7d', 'children', 'childrenAnswering7d', 'childrenByClass', 'aiRequestsToday', 'studyCoreGranted', 'topicsMastered'].sort());
    expect(counts.accounts).toBe(3);
    expect(counts.answers7d).toBe(0);
    expect(counts.childrenByClass).toEqual([{ classLevel: 7, count: 2 }]);
    expect(JSON.stringify(counts)).not.toContain(EMAIL);
  });
});

describe('the screen and the route never show a name or an email', () => {
  it('the route’s answer holds numbers only', async () => {
    const res = await familyGet(new NextRequest('https://www.netcyberai.test/api/control/family', { headers: { cookie: await founderCookie() } }));
    expect(res.status).toBe(200);
    const text = JSON.stringify(await res.json());
    expect(text).toContain('"accounts":2');
    expect(text).not.toContain(EMAIL);
    expect(text).not.toContain('example.invalid');
    expect(text).not.toContain(FIRST_NAME);
    expect(text).not.toContain('Second');
  });
  it('the page, in English and in Hindi, holds the figures and neither the address nor the first name', async () => {
    const counts = await h.db.pg.transaction(async (tx: { query: (s: string) => Promise<unknown> }) => {
      await tx.query('set local role nca_super');
      return loadFamilyCounts(tx as never);
    });
    for (const lang of ['en', 'hi'] as const) {
      const html = renderToStaticMarkup(createElement(FamilyCountsView, { counts, lang }));
      expect(html).toContain('data-count="accounts"');
      expect(html).toContain('data-class="7"');
      expect(html).not.toContain(EMAIL);
      expect(html).not.toContain('example.invalid');
      expect(html).not.toContain(FIRST_NAME);
      expect(html).not.toContain('Second');
      expect(html).not.toContain('Third');
    }
    expect(renderToStaticMarkup(createElement(FamilyCountsView, { counts, lang: 'en' }))).toContain('Families that agreed to learning');
  });
});
