import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { pickItems, WORKSHEET_MAX } from '@/lib/family/worksheet';

// M2-4 (C278): worksheets. A topic's cached check and practice items are a practice set: sealed for the phone,
// answered through the existing check door (an attempt is recorded), a checked response before an AI-made one, never a
// withdrawn one, no AI call, de-duplicated and capped at ten. The printout and the child-mode requests carry no answer;
// the answer key needs parent mode.

const item = (id: string, question = `Question ${id}?`) => ({ id, question, options: ['alpha', 'beta', 'gamma', 'delta'], answer: 2, hint: 'SECRET-HINT', why: 'SECRET-WHY', wrong: ['w0', 'w1', '', 'w3'] });
const blocks = (items: { check: ReturnType<typeof item>[]; practice: ReturnType<typeof item>[] }) => [
  { type: 'explanation', title: 't', idea: 'i', example: 'e', steps: ['1', '2'], terms: [] },
  { type: 'check', items: items.check },
  { type: 'practice', items: items.practice },
];

describe('picking the items', () => {
  it('check items first, then practice, one of each question, at most ten', () => {
    const picked = pickItems(blocks({ check: [item('c1', 'Same question?'), item('c2')], practice: [item('p0', 'same QUESTION?'), item('p1'), item('p2')] }));
    expect(picked.map((i) => i.id)).toEqual(['c1', 'c2', 'p1', 'p2']);
    // Ten at most, across responses, without repeats.
    const have = Array.from({ length: 8 }, (_, i) => item(`h${i}`));
    const more = pickItems(blocks({ check: [item('c1'), item('h0', 'Question h0?'), item('c3')], practice: [item('p1')] }), have);
    expect(more.map((i) => i.id)).toEqual(['c1', 'c3']);
    expect(have.length + more.length).toBe(WORKSHEET_MAX);
    expect(pickItems([{ type: 'explanation', title: 't', idea: 'i', example: 'e', steps: ['1', '2'], terms: [] }])).toEqual([]);
  });
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let R: Record<string, any>;
const ACCOUNT = 'f7000000-0000-4000-8000-0000000000a1';
const CHILD = 'f7000000-0000-4000-8000-0000000000a2';
const VERSION = 'f7000000-0000-4000-8000-0000000000c1';
const TOPIC = 'cbse.c9.mathematics.u1.ch01.t01';
const EMPTY_TOPIC = 'cbse.c9.mathematics.u1.ch01.t02';
let child: Record<string, string>;
let parent: Record<string, string>;

const insertResponse = (topic: string, version: string, bl: unknown[], status = 'ai_made') =>
  db.pg.query(
    `insert into content.responses (board_id, class_level, subject, topic_key, language, style, prompt_version, schema_version, blocks, status, provider, model, checked_by, checked_at)
     values ('CBSE', 9, 'mathematics', $1, 'en', 'en', $2, 1, $3::jsonb, $4, 'anthropic', 'm', $5, $6)`,
    [topic, version, JSON.stringify(bl), status, status === 'checked' ? 'f7000000-0000-4000-8000-0000000000f1' : null, status === 'checked' ? new Date().toISOString() : null]
  );

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  process.env.DATABASE_URL = db.url;
  process.env.DB_POOL_MAX = '1';
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-m2-worksheet-tests-0123456789';
  await db.pg.exec(`
    insert into family.accounts (account_id, email, pin_hash) values ('${ACCOUNT}', 'worksheets@example.org', 'scrypt$16384$8$1$c2FsdHNhbHRzYWx0c2FsdA==$aGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNo');
    insert into family.consents (account_id, purpose, granted, verification_method, notice_version) values ('${ACCOUNT}', 'study_core', true, 'parent_tap', 'v1');
    insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code) values ('${CHILD}', '${ACCOUNT}', 'Tara', 9, 'CBSE', 'en', 'en', 'IN-KA');
    insert into content.syllabus_versions (version_id, board_id, class_level, subject, academic_year, version_no, status, audience, import_source, import_ref, approved_by, approved_at)
      values ('${VERSION}', 'CBSE', 9, 'mathematics', '2026-27', 1, 'published', 'everyone', 'repository', 'test', 'f7000000-0000-4000-8000-0000000000f1', now());
    insert into content.chapters (chapter_id, version_id, chapter_key, position, title_en, source_url, source_page, checked_on)
      values ('f7000000-0000-4000-8000-0000000000d1', '${VERSION}', 'cbse.c9.mathematics.u1.ch01', 1, 'Number Systems', 'https://cbseacademic.nic.in/', '4', '2026-10-21');
    insert into content.topics (version_id, chapter_id, topic_key, position, title_en, source_url, source_page, checked_on) values
      ('${VERSION}', 'f7000000-0000-4000-8000-0000000000d1', '${TOPIC}', 1, 'Rational numbers', 'https://cbseacademic.nic.in/', '4', '2026-10-21'),
      ('${VERSION}', 'f7000000-0000-4000-8000-0000000000d1', '${EMPTY_TOPIC}', 2, 'Irrational numbers', 'https://cbseacademic.nic.in/', '4', '2026-10-21');
    insert into control.app_flags (app, module, enabled, reason) values ('family', 'worksheets', true, 'test');
  `);
  const { signFamilySession, signParentMode } = await import('@/lib/family/session');
  const s = { accountId: ACCOUNT, tokenVersion: 0, sessionId: 's1' };
  child = { ncf_session: await signFamilySession(s), ncf_child: CHILD };
  parent = { ...child, ncf_parent: await signParentMode(s) };
  R = { worksheet: await import('@/app/api/family/worksheet/route'), check: await import('@/app/api/family/check/route') };
}, 90_000);
afterAll(async () => {
  await (await import('@/lib/auth/db')).endPool();
  await db?.stop();
});

const cookie = (j: Record<string, string>) => Object.entries(j).map(([k, v]) => `${k}=${v}`).join('; ');
const get = (key: string, j: Record<string, string>, view = '') => new NextRequest(`http://localhost/api/family/worksheet?key=${key}${view}`, { headers: { cookie: cookie(j) } });
const post = (body: unknown) => new NextRequest('http://localhost/api/family/check', { method: 'POST', headers: { 'content-type': 'application/json', cookie: cookie(child) }, body: JSON.stringify(body) });

describe('worksheets, end to end', () => {
  it('a topic with no cached response says so, and nothing is made', async () => {
    const res = await R.worksheet.GET(get(EMPTY_TOPIC, child));
    expect(await res.json()).toEqual({ state: 'none' });
    expect((await db.pg.query(`select count(*)::int n from content.responses`)).rows[0].n).toBe(0);
  });

  it('lists the cached items sealed, and answering one records an attempt', async () => {
    await insertResponse(TOPIC, 'v1', blocks({ check: [item('c1'), item('c2')], practice: [item('p1', 'Question c1?'), item('p2')] }));
    const res = await R.worksheet.GET(get(TOPIC, child));
    expect(res.status).toBe(200);
    const ws = await res.json();
    expect(ws).toMatchObject({ state: 'ok', label: 'ai_made', title: 'Rational numbers', topicKey: TOPIC });
    // c1, c2, p2: the practice repeat of c1's question is dropped.
    expect(ws.items.map((i: { question: string }) => i.question)).toEqual(['Question c1?', 'Question c2?', 'Question p2?']);
    expect(Object.keys(ws.items[0]).sort()).toEqual(['id', 'options', 'question', 'token']);
    expect(JSON.stringify(ws)).not.toMatch(/SECRET|"answer"|"hint"/);

    const wrong = await R.check.POST(post({ token: ws.items[0].token, choice: 0 }));
    expect((await wrong.json()).correct).toBe(false);
    const right = await R.check.POST(post({ token: ws.items[0].token, choice: 2, hintUsed: true }));
    expect((await right.json()).correct).toBe(true);
    const kept = (await db.pg.query(`select kind, topic_key, correct, hint_used from family.attempts where child_id = $1 order by created_at`, [CHILD])).rows;
    expect(kept).toEqual([
      { kind: 'practice', topic_key: TOPIC, correct: false, hint_used: false },
      { kind: 'practice', topic_key: TOPIC, correct: true, hint_used: true },
    ]);
    expect((await db.pg.query(`select free_subject from family.children where child_id = $1`, [CHILD])).rows[0].free_subject).toBe('mathematics');
  });

  it('a checked response comes before an AI-made one, and a withdrawn one never', async () => {
    await insertResponse(TOPIC, 'v2', blocks({ check: [item('k1', 'Checked question?')], practice: [] }), 'checked');
    let ws = await (await R.worksheet.GET(get(TOPIC, child))).json();
    // The checked response's item first, then the AI-made ones (so the sheet is not called checked).
    expect(ws.items.map((i: { question: string }) => i.question)).toEqual(['Checked question?', 'Question c1?', 'Question c2?', 'Question p2?']);
    expect(ws.label).toBe('ai_made');
    await db.pg.query(`update content.responses set status = 'withdrawn', checked_by = null where prompt_version = 'v2'`);
    ws = await (await R.worksheet.GET(get(TOPIC, child))).json();
    expect(ws.items.length).toBe(3);
    await db.pg.query(`update content.responses set status = 'withdrawn'`);
    expect(await (await R.worksheet.GET(get(TOPIC, child))).json()).toEqual({ state: 'none' });
    await db.pg.query(`update content.responses set status = 'ai_made' where prompt_version = 'v1'`);
    // Only checked responses make a "checked" sheet.
    await db.pg.query(`update content.responses set status = 'checked', checked_by = 'f7000000-0000-4000-8000-0000000000f1', checked_at = now() where prompt_version = 'v1'`);
    expect(await (await R.worksheet.GET(get(TOPIC, child))).json()).toMatchObject({ label: 'checked' });
    await db.pg.query(`update content.responses set status = 'ai_made', checked_by = null, checked_at = null where prompt_version = 'v1'`);
  });

  it('a subject that is not the child’s free one is refused; an unknown key is not found', async () => {
    await db.pg.query(`update family.children set free_subject = 'science' where child_id = $1`, [CHILD]);
    const res = await R.worksheet.GET(get(TOPIC, child));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'not_open' });
    await db.pg.query(`update family.children set free_subject = 'mathematics' where child_id = $1`, [CHILD]);
    expect((await R.worksheet.GET(get('cbse.c9.nothing.here', child))).status).toBe(404);
  });

  it('module off: refused', async () => {
    await db.pg.query(`update control.app_flags set enabled = false where app = 'family' and module = 'worksheets'`);
    const res = await R.worksheet.GET(get(TOPIC, child));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'not_switched_on' });
    await db.pg.query(`update control.app_flags set enabled = true where app = 'family' and module = 'worksheets'`);
  });

  it('child mode never receives an answer; the key needs parent mode and lists each question’s right option', async () => {
    const refused = await R.worksheet.GET(get(TOPIC, child, '&view=key'));
    expect(refused.status).toBe(403);
    const text = await refused.text();
    expect(text).toContain('parent_pin_required');
    expect(text).not.toMatch(/gamma|SECRET/);
    expect((await R.worksheet.GET(get(TOPIC, {}, '&view=key'))).status).toBe(401);

    const ok = await R.worksheet.GET(get(TOPIC, parent, '&view=key'));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({
      state: 'ok',
      key: [
        { n: 1, letter: 'C', option: 'gamma' },
        { n: 2, letter: 'C', option: 'gamma' },
        { n: 3, letter: 'C', option: 'gamma' },
      ],
    });
  });

  it('the child’s printout and screen data hold the questions only', async () => {
    const { loadWorksheet, printItems } = await import('@/lib/family/worksheet');
    const { withFamilyContext } = await import('@/lib/family/db');
    const { listChildren } = await import('@/lib/family/children');
    await withFamilyContext({ accountId: ACCOUNT, tokenVersion: 0 }, async (c) => {
      const kid = (await listChildren(c, ACCOUNT))[0];
      const w = await loadWorksheet(c, { accountId: ACCOUNT, child: kid }, TOPIC);
      if (w.state !== 'ok') throw new Error('expected a worksheet');
      const printed = JSON.stringify(printItems(w));
      expect(printed).not.toMatch(/SECRET|answer|hint|why|wrong/);
      expect(Object.keys(printItems(w)[0]).sort()).toEqual(['options', 'question']);
    });
  });
});
