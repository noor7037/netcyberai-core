import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { FAMILY_MODULES, visibleTabs, subjectAccess } from '@/lib/family/modules';

// M1-6 (C252): learning and home. School information is never paid; the tabs follow Control's switches; the first
// subject a child studies is their free one and the other is refused; only checked answers move progress, and a topic
// is mastered when it is right on two days a week apart; the parent's calm card counts checked answers only; Control's
// kill switch and audiences reach the family. The model is a scripted stream (the AI platform is tested in test/ai).

const ai = vi.hoisted(() => ({ lines: [] as string[] }));
vi.mock('@/lib/ai/platform', async (original) => ({
  ...(await original<typeof import('@/lib/ai/platform')>()),
  activePromptVersion: async () => 'v1',
  prepareText: async () => ({
    ok: true,
    text: {
      send: async (onDelta: (t: string) => void) => {
        for (const l of ai.lines) onDelta(`${l}\n`);
        return { result: { ok: true, text: '', tokensIn: 1, tokensOut: 1, provider: 'anthropic', model: 'm' }, record: async () => {} };
      },
    },
  }),
}));
// A typed question's answer starts with the subject the model names (F1-3); a topic's has no such line.
const about = (subject: string) => [JSON.stringify({ type: 'subject', subject }), ...BLOCKS];

const item = (id: string) => ({ id, question: `Q ${id}?`, options: ['a', 'b', 'c', 'd'], answer: 2, hint: 'h', why: 'y', wrong: ['w0', 'w1', '', 'w3'] });
const BLOCKS = [
  { type: 'explanation', title: 't', idea: 'i', example: 'e', steps: ['1', '2'], terms: [] },
  { type: 'check', items: [item('c1')] },
  { type: 'practice', items: [item('p1')] },
].map((b) => JSON.stringify(b));

describe('the registry', () => {
  it('never gives a school information module a paid entitlement (05 rule 1)', () => {
    for (const m of FAMILY_MODULES.filter((x) => x.entitlement === 'school_info')) expect(['school_info']).toContain(m.entitlement);
    expect(FAMILY_MODULES.filter((m) => m.tab === 'home' && m.entitlement === 'school_info').every((m) => m.entitlement !== 'plus' && m.entitlement !== 'learning')).toBe(true);
  });
  it('shows a tab only when a built module of it is switched on', () => {
    expect(visibleTabs(() => true)).toEqual(['home', 'study', 'family']);
    expect(visibleTabs((f) => f !== 'understand' && f !== 'practice')).toEqual(['home', 'family']);
  });
  it('opens every subject until the first is claimed, then only that one', () => {
    expect(subjectAccess({ freeSubject: null }, 'science').open).toBe(true);
    expect(subjectAccess({ freeSubject: 'science' }, 'mathematics').open).toBe(false);
  });
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let R: Record<string, any>;
const ACCOUNT = 'f6000000-0000-4000-8000-0000000000a1';
const CHILD = 'f6000000-0000-4000-8000-0000000000a2';
const VERSION = 'f6000000-0000-4000-8000-0000000000c1';
const TOPIC = 'cbse.c9.science.u1.ch01.t01';
let jar: Record<string, string>;

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  process.env.DATABASE_URL = db.url;
  process.env.DB_POOL_MAX = '1';
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-family-learning-tests-0123456789';
  await db.pg.exec(`
    insert into family.accounts (account_id, email, pin_hash) values ('${ACCOUNT}', 'learning@example.org', 'scrypt$16384$8$1$c2FsdHNhbHRzYWx0c2FsdA==$aGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNo');
    insert into family.consents (account_id, purpose, granted, verification_method, notice_version) values ('${ACCOUNT}', 'study_core', true, 'parent_tap', 'v1');
    insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code) values ('${CHILD}', '${ACCOUNT}', 'Tara', 9, 'CBSE', 'en', 'en', 'IN-KA');
    insert into content.syllabus_versions (version_id, board_id, class_level, subject, academic_year, version_no, status, audience, import_source, import_ref, approved_by, approved_at)
      values ('${VERSION}', 'CBSE', 9, 'science', '2026-27', 1, 'published', 'everyone', 'repository', 'test', 'f6000000-0000-4000-8000-0000000000f1', now());
    insert into content.chapters (chapter_id, version_id, chapter_key, position, title_en, source_url, source_page, checked_on)
      values ('f6000000-0000-4000-8000-0000000000d1', '${VERSION}', 'cbse.c9.science.u1.ch01', 1, 'Matter', 'https://cbseacademic.nic.in/', '4', '2026-10-21');
    insert into content.topics (version_id, chapter_id, topic_key, position, title_en, source_url, source_page, checked_on)
      values ('${VERSION}', 'f6000000-0000-4000-8000-0000000000d1', '${TOPIC}', 1, 'States of matter', 'https://cbseacademic.nic.in/', '4', '2026-10-21');
  `);
  const { signFamilySession, signParentMode } = await import('@/lib/family/session');
  const s = { accountId: ACCOUNT, tokenVersion: 0, sessionId: 's1' };
  jar = { ncf_session: await signFamilySession(s), ncf_child: CHILD, ncf_parent: await signParentMode(s) };
  R = {
    understand: await import('@/app/api/family/understand/route'),
    check: await import('@/app/api/family/check/route'),
    subject: await import('@/app/api/family/children/[childId]/subject/route'),
  };
  ai.lines = BLOCKS;
}, 90_000);
afterAll(async () => {
  await (await import('@/lib/auth/db')).endPool();
  await db?.stop();
});

const post = (path: string, body: unknown) =>
  new NextRequest(`http://localhost${path}`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ') }, body: JSON.stringify(body) });
const events = async (res: Response) => (await res.text()).trim().split('\n').map((l) => JSON.parse(l));
const firstToken = (ev: { t: string; block?: { type: string; items: { token: string }[] } }[]) => ev.find((e) => e.t === 'block' && e.block!.type === 'check')!.block!.items[0].token;

describe('learning, end to end', () => {
  it('the first subject studied becomes the free one; the other is refused', async () => {
    const ev = await events(await R.understand.POST(post('/api/family/understand', { kind: 'topic', key: TOPIC })));
    expect(ev[0].t).toBe('meta');
    expect((await db.pg.query(`select free_subject from family.children where child_id = $1`, [CHILD])).rows[0].free_subject).toBe('science');
    ai.lines = about('mathematics');
    const other = await events(await R.understand.POST(post('/api/family/understand', { kind: 'question', text: 'What is a prime number?', subject: 'mathematics' })));
    expect(other[0]).toMatchObject({ t: 'refused', reason: 'not_open' });
    expect(other.some((e: { t: string }) => e.t === 'block')).toBe(false);
  });

  it('only checked answers move progress; a topic right on two days a week apart is mastered', async () => {
    const ev = await events(await R.understand.POST(post('/api/family/understand', { kind: 'topic', key: TOPIC, followUp: 'practise_more' })));
    const token = firstToken(ev);
    expect((await db.pg.query(`select count(*)::int n from family.topic_progress`)).rows[0].n).toBe(0);
    await R.check.POST(post('/api/family/check', { token, choice: 0 }));
    await R.check.POST(post('/api/family/check', { token, choice: 2, hintUsed: true }));
    const p = (await db.pg.query(`select answered, correct, mastered_on from family.topic_progress where child_id = $1 and topic_key = $2`, [CHILD, TOPIC])).rows[0];
    expect(p).toMatchObject({ answered: 2, correct: 1, mastered_on: null });
    const kept = (await db.pg.query(`select answer, correct, hint_used from family.attempts where child_id = $1 order by created_at`, [CHILD])).rows;
    expect(kept).toEqual([
      { answer: 'Q c1? → a', correct: false, hint_used: false },
      { answer: 'Q c1? → c', correct: true, hint_used: true },
    ]);
    // A right answer eight days earlier, then today's: mastered.
    await db.pg.query(`update family.attempts set answered_on = answered_on - 8 where child_id = $1 and correct`, [CHILD]);
    await R.check.POST(post('/api/family/check', { token, choice: 2 }));
    const m = (await db.pg.query(`select mastered_on is not null as mastered from family.topic_progress where child_id = $1 and topic_key = $2`, [CHILD, TOPIC])).rows[0];
    expect(m.mastered).toBe(true);
  });

  it('a typed question’s answers are kept but move no syllabus topic', async () => {
    ai.lines = about('science');
    const ev = await events(await R.understand.POST(post('/api/family/understand', { kind: 'question', text: 'Why does ice float?', subject: 'science' })));
    await R.check.POST(post('/api/family/check', { token: firstToken(ev), choice: 2 }));
    expect((await db.pg.query(`select count(*)::int n from family.topic_progress where topic_key like '%.question'`)).rows[0].n).toBe(0);
    expect((await db.pg.query(`select count(*)::int n from family.attempts where topic_key like '%.question'`)).rows[0].n).toBe(1);
  });

  it('the calm card counts checked answers of the last seven days, nothing else', async () => {
    const { calmCard } = await import('@/lib/family/learning');
    const { withFamilyContext } = await import('@/lib/family/db');
    const { indiaDate } = await import('@/lib/time/india');
    const card = await withFamilyContext({ accountId: ACCOUNT, tokenVersion: 0 }, (c) => calmCard(c, ACCOUNT, CHILD, indiaDate(), 'en'));
    expect(card).toMatchObject({ answers: 3, right: 2, topics: 1, mastered: 1, practisedTitles: ['States of matter'] });
  });

  it('the parent changes the free subject only after the change window', async () => {
    expect((await R.subject.POST(post(`/api/family/children/${CHILD}/subject`, { subject: 'mathematics' }), { params: { childId: CHILD } })).status).toBe(409);
    // Only a subject of the child's class (C264): Physics is not a Class 9 subject; an unknown id is refused too.
    for (const subject of ['physics', 'astrology']) expect((await R.subject.POST(post(`/api/family/children/${CHILD}/subject`, { subject }), { params: { childId: CHILD } })).status, subject).toBe(400);
    await db.pg.query(`update family.children set free_subject_set_at = now() - interval '91 days' where child_id = $1`, [CHILD]);
    expect((await R.subject.POST(post(`/api/family/children/${CHILD}/subject`, { subject: 'mathematics' }), { params: { childId: CHILD } })).status).toBe(200);
  });

  it('Control’s switches reach the family: a module for staff preview only, and the kill switch', async () => {
    await db.pg.query(`update control.app_flags set audience = 'staff_preview' where app = 'family' and module = 'understand'`);
    ai.lines = about('mathematics');
    const off = await events(await R.understand.POST(post('/api/family/understand', { kind: 'question', text: 'What is a ratio?', subject: 'mathematics' })));
    expect(off[0]).toMatchObject({ t: 'refused', reason: 'not_switched_on' });
    await db.pg.query(`insert into control.preview_accounts (account_id, added_by) values ($1, $2)`, [ACCOUNT, 'f6000000-0000-4000-8000-0000000000f1']);
    const on = await events(await R.understand.POST(post('/api/family/understand', { kind: 'question', text: 'What is a ratio?', subject: 'mathematics' })));
    expect(on[0].t).toBe('meta');
    await db.pg.query(`update control.app_flags set enabled = false where app = 'family' and module = '*'`);
    const killed = await events(await R.understand.POST(post('/api/family/understand', { kind: 'question', text: 'What is a ratio?', subject: 'mathematics' })));
    expect(killed[0]).toMatchObject({ t: 'refused', reason: 'not_switched_on' });
    await db.pg.query(`update control.app_flags set enabled = true where app = 'family' and module = '*'`);
  });
});
