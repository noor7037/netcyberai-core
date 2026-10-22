import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';

// P1 slice 3 (C300): in a "checked explanations only" subject (the pilot's EVS) a chapter or topic shows a child only a
// checked explanation and is never made live; a typed question and a follow-up stay live. Staff prepare every line of
// a syllabus version, in English and Hindi, into the review queue first.

const ai = vi.hoisted(() => ({ lines: [] as string[], calls: [] as { system: string; user: string }[] }));
vi.mock('@/lib/ai/platform', async (original) => ({
  ...(await original<typeof import('@/lib/ai/platform')>()),
  activePromptVersion: async () => 'v1',
  prepareText: async (_db: unknown, _ctx: unknown, _p: unknown, req: { system: string; messages: { content: string }[] }) => {
    ai.calls.push({ system: req.system, user: req.messages[0].content });
    const lines = [...ai.lines];
    return {
      ok: true,
      text: {
        send: async (onDelta: (t: string) => void) => {
          for (const l of lines) onDelta(`${l}\n`);
          return { result: { ok: true, text: lines.join('\n'), tokensIn: 10, tokensOut: 20, provider: 'anthropic', model: 'test-model' }, record: async () => {} };
        },
      },
    };
  },
}));

const item = (id: string) => ({ id, question: `Question ${id}?`, options: ['10', '12', '14', '16'], answer: 1, hint: 'Think of pairs.', why: 'Because 6 + 6 = 12.', wrong: ['a', '', 'b', 'c'] });
const GOOD = [
  { type: 'explanation', title: 'Water', idea: 'Water moves from place to place.', example: 'Rain fills a pond.', steps: ['Look', 'Tell'], terms: [{ en: 'pond', local: 'talab' }] },
  { type: 'check', items: [item('c1'), item('c2')] },
  { type: 'practice', items: [item('p1')] },
].map((b) => JSON.stringify(b));
const named = (subject: string) => JSON.stringify({ type: 'subject', subject });

const ACCOUNT = 'fc000000-0000-4000-8000-0000000000a1';
const CHILD = 'fc000000-0000-4000-8000-0000000000a2';
const STAFF = 'fc000000-0000-4000-8000-0000000000f1';
const VERSION = 'fc000000-0000-4000-8000-0000000000b1';
const CHAPTER = 'p1t.c5.evs.ch01';
const TOPIC = 'p1t.c5.evs.ch01.t01';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let R: any;
let jar: Record<string, string>;

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  process.env.DATABASE_URL = db.url;
  process.env.DB_POOL_MAX = '1';
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-p1-reviewed-only-tests-0123456789';
  await db.pg.exec(`
    insert into users (user_id, school_id, role, display_name) values ('${STAFF}', null, 'super_admin', 'Made-up Reviewer');
    insert into family.accounts (account_id, email) values ('${ACCOUNT}', 'reviewed@example.org');
    insert into family.consents (account_id, purpose, granted, verification_method, notice_version) values ('${ACCOUNT}', 'study_core', true, 'parent_tap', 'v1');
    insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code) values ('${CHILD}', '${ACCOUNT}', 'Rani', 5, 'CBSE', 'hi', 'hi', 'IN-UP');
    insert into content.syllabus_versions (version_id, board_id, class_level, subject, academic_year, version_no, status, audience, import_source, import_ref, approved_by, approved_at)
      values ('${VERSION}', 'CBSE', 5, 'evs', '2099-00', 1, 'published', 'everyone', 'repository', 'test', '${STAFF}', now());
    insert into content.chapters (chapter_id, version_id, chapter_key, position, title_en, title_hi, source_url, source_page, checked_on)
      values ('fc000000-0000-4000-8000-0000000000d1', '${VERSION}', '${CHAPTER}', 1, 'Water', 'पानी', 'https://ncert.nic.in/', '1', '2026-10-22');
    insert into content.topics (version_id, chapter_id, topic_key, position, title_en, title_hi, source_url, source_page, checked_on)
      values ('${VERSION}', 'fc000000-0000-4000-8000-0000000000d1', '${TOPIC}', 1, 'Where water comes from', 'पानी कहाँ से आता है', 'https://ncert.nic.in/', '1', '2026-10-22');
  `);
  const { signFamilySession } = await import('@/lib/family/session');
  jar = { ncf_session: await signFamilySession({ accountId: ACCOUNT, tokenVersion: 0, sessionId: 's1' }), ncf_child: CHILD };
  R = { understand: await import('@/app/api/family/understand/route'), prepare: await import('@/lib/family/prepare'), auth: await import('@/lib/auth/db') };
}, 90_000);
afterAll(async () => {
  await R?.auth.endPool();
  await db?.stop();
});

const ask = async (body: unknown) => {
  const res = await R.understand.POST(new NextRequest('http://localhost/api/family/understand', { method: 'POST', headers: { 'content-type': 'application/json', cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ') }, body: JSON.stringify(body) }));
  return (await res.text()).trim().split('\n').map((l: string) => JSON.parse(l));
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = <T>(fn: (db: any) => Promise<T>): Promise<T> => R.auth.withPlatformService(fn);
const responses = async () => (await db.pg.query(`select topic_key, language, style, status from content.responses order by topic_key, language`)).rows;

describe('checked explanations only (C300)', () => {
  it('starts with EVS; a topic with no checked explanation is not made live, and the child is told it is being checked', async () => {
    expect((await db.pg.query(`select value from control.settings where key = 'family.reviewed_only_subjects'`)).rows[0].value).toEqual(['evs']);
    ai.lines = GOOD;
    const ev = await ask({ kind: 'topic', key: TOPIC });
    expect(ev).toEqual([{ t: 'refused', reason: 'not_ready', message: 'यह व्याख्या अभी जाँची जा रही है। तब तक इसके बारे में अपना सवाल पूछें।' }]);
    expect(ai.calls).toHaveLength(0);
    expect(await responses()).toEqual([]);
  });

  it('a typed question in EVS stays live', async () => {
    ai.lines = [named('evs'), ...GOOD];
    const ev = await ask({ kind: 'question', text: 'Where does rain come from?', subject: null });
    expect(ev[0]).toMatchObject({ t: 'meta', label: 'ai_made', cached: false, subject: 'evs' });
    expect(ai.calls).toHaveLength(1);
  });

  it('staff prepare every line in English and Hindi into the review queue, one per call, with no child named', async () => {
    ai.lines = GOOD;
    ai.calls = [];
    expect(await run((tx) => R.prepare.prepareState(tx, VERSION))).toEqual({ total: 4, checked: 0, aiMade: 0, missing: 4, withdrawn: 0, next: { kind: 'chapter', key: CHAPTER, language: 'en' } });
    const outcomes = [];
    for (let i = 0; i < 4; i++) outcomes.push((await R.prepare.prepareNext(run, { userId: STAFF }, VERSION)).made.outcome);
    expect(outcomes).toEqual(['kept', 'kept', 'kept', 'kept']);
    expect(await R.prepare.prepareNext(run, { userId: STAFF }, VERSION)).toMatchObject({ state: { aiMade: 4, missing: 0 }, made: null });
    expect(await responses()).toEqual([
      { topic_key: CHAPTER, language: 'en', style: 'en', status: 'ai_made' },
      { topic_key: CHAPTER, language: 'hi', style: 'hi', status: 'ai_made' },
      { topic_key: TOPIC, language: 'en', style: 'en', status: 'ai_made' },
      { topic_key: TOPIC, language: 'hi', style: 'hi', status: 'ai_made' },
    ]);
    expect(ai.calls).toHaveLength(4);
    expect(JSON.stringify(ai.calls)).not.toContain('Rani');
  });

  it('an AI-made one is still not shown; once checked the child gets it from the library', async () => {
    ai.calls = [];
    expect((await ask({ kind: 'topic', key: TOPIC }))[0]).toMatchObject({ t: 'refused', reason: 'not_ready' });
    await db.pg.query(`update content.responses set status = 'checked', checked_by = $1, checked_at = now() where topic_key = $2 and language = 'hi'`, [STAFF, TOPIC]);
    const ev = await ask({ kind: 'topic', key: TOPIC });
    expect(ev[0]).toMatchObject({ t: 'meta', label: 'checked', cached: true });
    expect(ev.at(-1)).toEqual({ t: 'done', complete: true });
    expect(ai.calls).toHaveLength(0);
  });

  it('a follow-up stays live; a withdrawn one counts as missing, so preparing again makes a fresh one', async () => {
    ai.lines = GOOD;
    expect((await ask({ kind: 'topic', key: TOPIC, followUp: 'simpler' }))[0]).toMatchObject({ t: 'meta', label: 'ai_made', cached: false });
    await db.pg.query(`update content.responses set status = 'withdrawn', withdrawn_at = now() where topic_key = $1 and language = 'en'`, [CHAPTER]);
    expect(await run((tx) => R.prepare.prepareState(tx, VERSION))).toMatchObject({ checked: 1, aiMade: 2, missing: 1, withdrawn: 1, next: { key: CHAPTER, language: 'en' } });
    expect((await R.prepare.prepareNext(run, { userId: STAFF }, VERSION)).state).toMatchObject({ missing: 0, withdrawn: 1 });
  });

  it('Control sets the list, audited; with EVS off the list, a topic is made live again', async () => {
    const { setSubjectList } = await import('@/lib/control/family-settings');
    expect(await run((tx) => setSubjectList(tx, { userId: STAFF }, 'reviewed_only', []))).toEqual({ ok: true, subjects: [] });
    expect((await db.pg.query(`select after_state from audit_log where event_action = 'family.reviewed_only_set'`)).rows).toEqual([{ after_state: { subjects: [] } }]);
    await db.pg.query(`delete from content.responses`);
    ai.lines = GOOD;
    expect((await ask({ kind: 'chapter', key: CHAPTER }))[0]).toMatchObject({ t: 'meta', label: 'ai_made', cached: false });
  });
});
