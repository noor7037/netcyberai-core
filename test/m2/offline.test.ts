import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { resolverPrompt } from '@/lib/ai/prompts/family.resolver';
import { DAY_MS, openItem, sealItem } from '@/lib/family/items';
import { answerDay, offlineItemKey } from '@/lib/family/pack';
import { indiaDate } from '@/lib/time/india';

// M2-9 (C283): offline chapter packs. A pack holds only the library's text blocks and its items sealed for the pack's
// life; never a withdrawn response; the module and the subject's entitlement are checked. An answer made offline counts
// on the day it was made when that day is real and within the token's life, and is recorded once per key. Made-up names
// and addresses only.

vi.mock('@/lib/ai/platform', async (original) => ({ ...(await original<typeof import('@/lib/ai/platform')>()), activePromptVersion: async () => null }));

const ACCOUNT = 'f9000000-0000-4000-8000-0000000000a1';
const CHILD = 'f9000000-0000-4000-8000-0000000000a2';
const SIBLING = 'f9000000-0000-4000-8000-0000000000a3';
const OTHER = 'f9000000-0000-4000-8000-0000000000b1';
const OTHER_CHILD = 'f9000000-0000-4000-8000-0000000000b2';
const VERSION = 'f9000000-0000-4000-8000-0000000000c1';
const CH = 'f9000000-0000-4000-8000-0000000000d1';
const CHAPTER = 'cbse.c9.mathematics.u1.ch01';
const T1 = `${CHAPTER}.t01`;
const T2 = `${CHAPTER}.t02`;
const T3 = `${CHAPTER}.t03`;
const PV = resolverPrompt(null, false).version;

const quiz = (id: string) => ({ id, question: `Question ${id}?`, options: ['10', '12', '14', '16'], answer: 1, hint: 'Think of pairs.', why: 'Because 6 + 6 = 12.', wrong: ['Counted one pair', '', 'Added two', 'Doubled twice'] });
const BLOCKS = [
  { type: 'explanation', title: 'Adding', idea: 'Adding puts groups together.', example: 'Two rotis and three rotis make five rotis.', steps: ['Count the first group', 'Count on'], terms: [] },
  { type: 'diagram', title: 'Groups', kind: 'flow', nodes: [{ id: 'a', label: 'One' }, { id: 'b', label: 'Two' }], edges: [{ from: 'a', to: 'b' }] },
  { type: 'key_points', points: ['Count on from the bigger group.', 'Adding zero changes nothing.', 'The order does not matter.'] },
  { type: 'check', items: [quiz('c1')] },
  { type: 'practice', items: [quiz('p1'), quiz('p2')] },
  { type: 'english_moment', words: [{ en: 'sum', meaning: 'jod' }], sentence: 'The sum is twelve.', pattern: 'The sum of A and B is C.', sayIt: 'The sum is twelve.' },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
let jar: string;
let siblingJar: string;
let otherJar: string;

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  process.env.DATABASE_URL = db.url;
  process.env.DB_POOL_MAX = '1';
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-family-offline-tests-0123456789';
  const resp = (topic: string, status: string, extra = '') =>
    `('CBSE', 9, 'mathematics', '${topic}', 'en', 'en', '${PV}', 1, '${JSON.stringify(BLOCKS).replace(/'/g, "''")}'::jsonb, '${status}', 'test', 'test'${extra})`;
  await db.pg.exec(`
    insert into family.accounts (account_id, email) values ('${ACCOUNT}', 'offline@example.org'), ('${OTHER}', 'other@example.org');
    insert into family.consents (account_id, purpose, granted, verification_method, notice_version) values ('${ACCOUNT}', 'study_core', true, 'parent_tap', 'v1'), ('${OTHER}', 'study_core', true, 'parent_tap', 'v1');
    insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code, free_subject, free_subject_set_at) values
      ('${CHILD}', '${ACCOUNT}', 'Meera', 9, 'CBSE', 'en', 'en', 'IN-UP', 'mathematics', now()),
      ('${SIBLING}', '${ACCOUNT}', 'Arjun', 9, 'CBSE', 'en', 'en', 'IN-UP', 'science', now()),
      ('${OTHER_CHILD}', '${OTHER}', 'Ravi', 9, 'CBSE', 'en', 'en', 'IN-HR', 'mathematics', now());
    insert into content.syllabus_versions (version_id, board_id, class_level, subject, academic_year, version_no, status, audience, import_source, import_ref, approved_by, approved_at)
      values ('${VERSION}', 'CBSE', 9, 'mathematics', '2026-27', 1, 'published', 'everyone', 'repository', 'test', 'f9000000-0000-4000-8000-0000000000f1', now());
    insert into content.chapters (chapter_id, version_id, chapter_key, position, title_en, source_url, source_page, checked_on)
      values ('${CH}', '${VERSION}', '${CHAPTER}', 1, 'Number Systems', 'https://cbseacademic.nic.in/', '4', '2026-10-21');
    insert into content.topics (version_id, chapter_id, topic_key, position, title_en, source_url, source_page, checked_on) values
      ('${VERSION}', '${CH}', '${T1}', 1, 'Rational numbers', 'https://cbseacademic.nic.in/', '4', '2026-10-21'),
      ('${VERSION}', '${CH}', '${T2}', 2, 'Irrational numbers', 'https://cbseacademic.nic.in/', '4', '2026-10-21'),
      ('${VERSION}', '${CH}', '${T3}', 3, 'Real numbers', 'https://cbseacademic.nic.in/', '4', '2026-10-21');
    insert into content.responses (board_id, class_level, subject, topic_key, language, style, prompt_version, schema_version, blocks, status, provider, model, checked_by, checked_at) values
      ${resp(T1, 'checked', ", 'f9000000-0000-4000-8000-0000000000f1', now()")};
    insert into content.responses (board_id, class_level, subject, topic_key, language, style, prompt_version, schema_version, blocks, status, provider, model, withdrawn_at) values
      ${resp(T2, 'ai_made', ', null')}, ${resp(T3, 'withdrawn', ', now()')};
  `);
  const { signFamilySession } = await import('@/lib/family/session');
  const s = await signFamilySession({ accountId: ACCOUNT, tokenVersion: 0, sessionId: 's1' });
  jar = `ncf_session=${s}; ncf_child=${CHILD}`;
  siblingJar = `ncf_session=${s}; ncf_child=${SIBLING}`;
  otherJar = `ncf_session=${await signFamilySession({ accountId: OTHER, tokenVersion: 0, sessionId: 's2' })}; ncf_child=${OTHER_CHILD}`;
}, 90_000);
afterAll(async () => {
  await (await import('@/lib/auth/db')).endPool();
  await db?.stop();
});

const getPack = async (cookie: string, chapter = CHAPTER) => {
  const { GET } = await import('@/app/api/family/pack/route');
  return GET(new NextRequest(`http://localhost/api/family/pack?chapter=${encodeURIComponent(chapter)}`, { headers: { cookie } }));
};
const check = async (cookie: string, body: Record<string, unknown>) => {
  const { POST } = await import('@/app/api/family/check/route');
  return POST(new NextRequest('http://localhost/api/family/check', { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) }));
};
const daysAgo = (n: number) => indiaDate(new Date(Date.now() - n * DAY_MS));
const packToken = (opts: { childId?: string; accountId?: string; topic?: string; issuedDaysAgo?: number } = {}) =>
  sealItem(quiz('q1'), { accountId: opts.accountId ?? ACCOUNT, childId: opts.childId ?? CHILD, topicKey: opts.topic ?? T1, subject: 'mathematics', kind: 'practice' }, Date.now() - (opts.issuedDaysAgo ?? 0) * DAY_MS, 14 * DAY_MS).token;
const key = () => crypto.randomUUID();

describe('the chapter pack', () => {
  it('needs the offline module switched on in Control (on by default once built, C230-Z; off when Control says so)', async () => {
    await db.pg.query(`insert into control.app_flags (app, module, enabled, reason) values ('family', 'offline', false, 'test') on conflict (app, module) do update set enabled = excluded.enabled, reason = excluded.reason`);
    const res = await getPack(jar);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('not_switched_on');
    await db.pg.query(`update control.app_flags set enabled = true where app = 'family' and module = 'offline'`);
    expect((await getPack(jar)).status).toBe(200);
    // A pack is Understand's responses: with Understand off, no pack.
    await db.pg.query(`update control.app_flags set enabled = false where app = 'family' and module = 'understand'`);
    expect((await getPack(jar)).status).toBe(403);
    await db.pg.query(`update control.app_flags set enabled = true where app = 'family' and module = 'understand'`);
  });

  it('holds only the library text blocks and sealed items, checked first; a withdrawn response never', async () => {
    const res = await getPack(jar);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const text = await res.text();
    const pack = JSON.parse(text);
    expect(pack.bytes).toBe(Buffer.byteLength(text, 'utf8'));
    expect(pack.childId).toBe(CHILD);
    expect(pack.topics.map((t: { key: string; label: string }) => [t.key, t.label])).toEqual([
      [T1, 'checked'],
      [T2, 'ai_made'],
    ]);
    // The withdrawn response is not served: its topic is "not in this pack". The chapter overview is not missing.
    expect(pack.missing.map((m: { key: string }) => m.key)).toEqual([T3]);
    for (const t of pack.topics) {
      expect(t.blocks.map((b: { type: string }) => b.type)).toEqual(['explanation', 'key_points', 'english_moment']);
      expect(t.check).toHaveLength(1);
      expect(t.practice).toHaveLength(2);
      expect(Object.keys(t.check[0]).sort()).toEqual(['id', 'options', 'question', 'token']);
    }
    // No answer, hint or explanation reaches the phone.
    expect(text).not.toContain('Think of pairs');
    expect(text).not.toContain('Because 6 + 6');
    // Sealed for the pack's life (Control: 14 days), and refused by a caller that accepts only a day's token.
    const token = pack.topics[0].check[0].token;
    const item = openItem(token, { accountId: ACCOUNT, childId: CHILD }, Date.now(), 14 * DAY_MS);
    expect(item!.exp - item!.iat!).toBe(14 * DAY_MS);
    expect(openItem(token, { accountId: ACCOUNT, childId: CHILD })).toBeNull();
    expect(Date.parse(pack.expiresAt) - Date.parse(pack.madeAt)).toBe(14 * DAY_MS);
  });

  it('follows Control: the pack life is the setting', async () => {
    await db.pg.query(`update control.settings set value = '3'::jsonb where key = 'family.offline_pack_days'`);
    const pack = await (await getPack(jar)).json();
    expect(Date.parse(pack.expiresAt) - Date.parse(pack.madeAt)).toBe(3 * DAY_MS);
    await db.pg.query(`update control.settings set value = '14'::jsonb where key = 'family.offline_pack_days'`);
  });

  it('a subject the child may not open is refused; an unknown chapter is not found', async () => {
    const res = await getPack(siblingJar);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('not_open');
    expect((await getPack(jar, 'cbse.c9.mathematics.u9.ch99')).status).toBe(404);
  });
});

describe('answers made offline', () => {
  const attempts = async (where = '') => (await db.pg.query(`select topic_key, item_key, answered_on::text as day, correct from family.attempts where child_id = $1 ${where} order by created_at`, [CHILD])).rows;

  it('a valid past day is recorded on that day, and moves revisits and that day’s plan as on that day', async () => {
    const day = daysAgo(2);
    await db.pg.query(`insert into family.plan_days (account_id, child_id, day, items, minutes) values ($1, $2, $3, $4::jsonb, 10)`, [ACCOUNT, CHILD, day, JSON.stringify([{ kind: 'next', topicKey: T1, subject: 'mathematics' }])]);
    // A wrong answer on T2 made two days ago: the topic comes back three days after that day.
    const wrong = await (await check(jar, { token: packToken({ topic: T2, issuedDaysAgo: 3 }), choice: 0, key: key(), answeredOn: day })).json();
    expect(wrong).toMatchObject({ correct: false, day, revisitOn: indiaDate(new Date(Date.parse(`${day}T00:00:00Z`) + 3 * DAY_MS)) });
    const rev = (await db.pg.query(`select set_on::text from family.revisits where child_id = $1 and topic_key = $2 and step = 1`, [CHILD, T2])).rows[0];
    expect(rev.set_on).toBe(day);
    // A right answer on T1, the plan's only item that day: that day's plan is done.
    const right = await (await check(jar, { token: packToken({ issuedDaysAgo: 3 }), choice: 1, key: key(), answeredOn: day })).json();
    expect(right).toMatchObject({ correct: true, day });
    expect((await attempts(`and answered_on = '${day}'`)).map((a: { topic_key: string }) => a.topic_key)).toEqual([T2, T1]);
    const plan = (await db.pg.query(`select completed_at from family.plan_days where child_id = $1 and day = $2`, [CHILD, day])).rows[0];
    expect(plan.completed_at).not.toBeNull();
  });

  it('a future day, a day before the token was issued, or a date that is not real counts today', async () => {
    const today = indiaDate();
    for (const answeredOn of [daysAgo(-2), daysAgo(5), '2026-02-30', 'yesterday', 20261020]) {
      const res = await (await check(jar, { token: packToken({ issuedDaysAgo: 3 }), choice: 1, key: key(), answeredOn })).json();
      expect(res.day).toBe(today);
    }
  });

  it('a token that ended while the phone was offline still sends an answer made in its life; never one moved to today', async () => {
    const day = daysAgo(10);
    const ok = await check(jar, { token: packToken({ issuedDaysAgo: 20 }), choice: 1, key: key(), answeredOn: day });
    expect(ok.status).toBe(200);
    expect((await ok.json()).day).toBe(day);
    expect((await check(jar, { token: packToken({ issuedDaysAgo: 20 }), choice: 1, key: key() })).status).toBe(404);
    expect((await check(jar, { token: packToken({ issuedDaysAgo: 20 }), choice: 1 })).status).toBe(404);
    // Past the week of grace: refused.
    expect((await check(jar, { token: packToken({ issuedDaysAgo: 22 }), choice: 1, key: key(), answeredOn: daysAgo(10) })).status).toBe(404);
  });

  it('a day after the token’s life counts today', () => {
    const iat = Date.parse('2026-10-01T06:00:00Z');
    const item = { iat, exp: iat + DAY_MS };
    expect(answerDay('2026-10-02', item, '2026-10-20')).toBe('2026-10-02');
    expect(answerDay('2026-10-05', item, '2026-10-20')).toBe('2026-10-20');
    expect(answerDay('2026-09-30', item, '2026-10-20')).toBe('2026-10-20');
    // A token sealed before M2-9 has no issue time: a day before it ends.
    expect(answerDay('2026-10-01', { exp: iat + DAY_MS }, '2026-10-20')).toBe('2026-10-01');
  });

  it('the same key is recorded once, however often the phone sends it', async () => {
    const k = key();
    const token = packToken();
    const first = await check(jar, { token, choice: 1, key: k, answeredOn: daysAgo(0) });
    const again = await check(jar, { token, choice: 1, key: k, answeredOn: daysAgo(0) });
    expect(first.status).toBe(200);
    expect((await again.json()).duplicate).toBe(true);
    const item = openItem(token, { accountId: ACCOUNT, childId: CHILD }, Date.now(), 14 * DAY_MS)!;
    expect(await attempts(`and item_key = '${offlineItemKey(item, k)}'`)).toHaveLength(1);
    // Another key on the same token is another answer.
    const before = (await attempts(`and item_key like '${T1}#q1~%'`)).length;
    await check(jar, { token, choice: 0, key: key() });
    expect(await attempts(`and item_key like '${T1}#q1~%'`)).toHaveLength(before + 1);
  });

  it('a malformed key is refused', async () => {
    expect((await check(jar, { token: packToken(), choice: 1, key: 'short' })).status).toBe(400);
    expect((await check(jar, { token: packToken(), choice: 1, key: 42 })).status).toBe(400);
  });

  it("another family's pack token is refused; a queued answer made for a brother or sister is recorded on that child", async () => {
    const foreign = packToken({ accountId: OTHER, childId: OTHER_CHILD });
    expect((await check(jar, { token: foreign, choice: 1, key: key() })).status).toBe(404);
    expect((await check(otherJar, { token: packToken(), choice: 1, key: key() })).status).toBe(404);
    // The phone was switched to the sibling after the answer was made: the token says whose it is.
    const n = (await attempts()).length;
    const res = await check(siblingJar, { token: packToken(), choice: 1, key: key() });
    expect(res.status).toBe(200);
    expect(await attempts()).toHaveLength(n + 1);
    expect((await db.pg.query(`select count(*)::int as n from family.attempts where child_id = $1`, [SIBLING])).rows[0].n).toBe(0);
    // Without a key (an answer made online), only the active child's token is taken.
    expect((await check(siblingJar, { token: packToken(), choice: 1 })).status).toBe(404);
  });

  it('a pack token still answers online, and a day token is unchanged', async () => {
    expect((await check(jar, { token: packToken(), hint: true })).status).toBe(200);
    const dayToken = sealItem(quiz('d1'), { accountId: ACCOUNT, childId: CHILD, topicKey: T1, subject: 'mathematics', kind: 'check' }).token;
    expect(await (await check(jar, { token: dayToken, choice: 1 })).json()).toMatchObject({ correct: true });
  });
});
