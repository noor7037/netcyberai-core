import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import type { Unit } from '@/lib/family/english/course';
import { buildReport } from '@/lib/family/english/report';
import { assessmentOpen, lessonStates, nextReview, placedUnitFor, trackForClass, tracksAllowed } from '@/lib/family/english/progress';

// The English course's engine (docs/family-app/12, C274; slice E-1) through its real routes on the real migrations
// (PGlite): Control's switch and the parent's consent come first; a child's place is made from the class; lessons open
// in order and within the day's limit; checks are scored on the server and the phone never holds an answer; the review
// boxes move; the day-0 check places a child; the parent's settings and report need parent mode. Made-up people only.

const ACCOUNT = 'e1000000-0000-4000-8000-0000000000a1';
const OTHER = 'e1000000-0000-4000-8000-0000000000b1';
const CHILD = 'e1000000-0000-4000-8000-0000000000a2';
const OTHER_CHILD = 'e1000000-0000-4000-8000-0000000000b2';
const VERSION = 'e1000000-0000-4000-8000-0000000000c1';
const unit1 = JSON.parse(readFileSync(path.resolve(__dirname, '../../data/english/b/unit-01.json'), 'utf8')) as Unit;
const unit2: Unit = JSON.parse(JSON.stringify(unit1).replace(/b\.u01/g, 'b.u02').replace('"unit": 1', '"unit": 2'));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let R: Record<string, any>;
let jar: Record<string, string>;
const cookie = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
const get = (p: string) => new NextRequest(`http://localhost${p}`, { headers: { cookie: cookie() } });
const post = (p: string, body: unknown) => new NextRequest(`http://localhost${p}`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: cookie() }, body: JSON.stringify(body) });
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  process.env.DATABASE_URL = db.url;
  process.env.DB_POOL_MAX = '1';
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-family-english-tests-0123456789';
  const lessons = [unit1, unit2].flatMap((u) =>
    u.lessons.map((l, i) => `('${VERSION}', '${l.key}', '${u.key}', ${i + 1}, '${l.kind}', ${lit(l.title.en)}, ${lit(l.title.hi ?? l.title.en)}, ${l.minutes}, ${lit(JSON.stringify(l))}::jsonb)`)
  );
  await db.pg.exec(`
    insert into family.accounts (account_id, email, pin_hash) values ('${ACCOUNT}', 'english@example.org', 'scrypt$16384$8$1$c2FsdHNhbHRzYWx0c2FsdA==$aGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNo'),
      ('${OTHER}', 'other@example.org', null);
    insert into family.consents (account_id, purpose, granted, verification_method, notice_version) values ('${ACCOUNT}', 'study_core', true, 'parent_tap', 'v1'), ('${OTHER}', 'study_core', true, 'parent_tap', 'v1');
    insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code)
      values ('${CHILD}', '${ACCOUNT}', 'Meena', 2, 'CBSE', 'hi', 'hi', 'IN-UP'), ('${OTHER_CHILD}', '${OTHER}', 'Kabir', 5, 'CBSE', 'en', 'en', 'IN-RJ');
    insert into content.english_versions (version_id, track, version_no, status, audience, import_source, import_ref, approved_by, approved_at, released_at)
      values ('${VERSION}', 'b', 1, 'published', 'everyone', 'repository', 'test', 'e1000000-0000-4000-8000-0000000000f1', now(), now());
    insert into content.english_units (version_id, unit_key, position, title_en, title_hi, can_do_en, can_do_hi, pic) values
      ('${VERSION}', 'b.u01', 1, 'All about me', 'मेरे बारे में', 'I can introduce myself.', 'मैं अपना परिचय दे सकता/सकती हूँ।', '🙋'),
      ('${VERSION}', 'b.u02', 2, 'Unit two', 'इकाई दो', 'I can do unit two.', 'मैं इकाई दो कर सकता हूँ।', '🙋');
    insert into content.english_lessons (version_id, lesson_key, unit_key, position, kind, title_en, title_hi, minutes, body) values ${lessons.join(',\n')};
    insert into content.english_assessments (version_id, kind, body) values ('${VERSION}', 'day0', ${lit(
      JSON.stringify({
        track: 'b',
        kind: 'day0',
        key: 'b.day0',
        sections: [
          { skill: 'listening', items: [unit1.lessons[0].check[1]] },
          { skill: 'words', items: [unit1.lessons[0].check[0], unit1.lessons[0].check[3]] },
          { skill: 'grammar', items: [unit1.lessons[1].check[2]] },
          { skill: 'reading', items: [unit1.lessons[2].check[0]] },
        ],
        speaking: [{ key: 'b.day0.s-me', prompt: { en: 'Tell us about you.', hi: 'अपने बारे में बताओ।' }, model: 'I am Meera.', criteria: [{ en: 'Clear', hi: 'साफ़' }, { en: 'Full sentence', hi: 'पूरा वाक्य' }] }],
      })
    )}::jsonb);
  `);
  const { signFamilySession, signParentMode } = await import('@/lib/family/session');
  const s = { accountId: ACCOUNT, tokenVersion: 0, sessionId: 's1' };
  jar = { ncf_session: await signFamilySession(s), ncf_child: CHILD };
  R = {
    course: await import('@/app/api/family/english/route'),
    lesson: await import('@/app/api/family/english/lessons/[key]/route'),
    assessment: await import('@/app/api/family/english/assessments/[kind]/route'),
    settings: await import('@/app/api/family/english/settings/route'),
    report: await import('@/app/api/family/english/report/route'),
    consent: await import('@/app/api/family/consent/route'),
    parent: await signParentMode(s),
  };
}, 90_000);
afterAll(async () => {
  await (await import('@/lib/auth/db')).endPool();
  await db?.stop();
});

const lessonGet = (key: string) => R.lesson.GET(get(`/api/family/english/lessons/${key}`), { params: { key } });
const lessonPost = (key: string, body: unknown) => R.lesson.POST(post(`/api/family/english/lessons/${key}`, body), { params: { key } });
const rightAnswers = (key: string) => {
  const l = [unit1, unit2].flatMap((u) => u.lessons).find((x) => x.key === key)!;
  return Object.fromEntries(l.check.map((c) => [c.key, c.answer]));
};

describe('the gates', () => {
  it('Control can switch the course off (on by default once built, C230-Z); then the parent must consent', async () => {
    await db.pg.query(`insert into control.app_flags (app, module, enabled, reason) values ('family', 'english_programme', false, 'test') on conflict (app, module) do update set enabled = excluded.enabled, reason = excluded.reason`);
    expect((await R.course.GET(get('/api/family/english'))).status).toBe(403);
    expect(await (await R.course.GET(get('/api/family/english'))).json()).toEqual({ error: 'off' });
    await db.pg.query(`update control.app_flags set enabled = true where app = 'family' and module = 'english_programme'`);
    expect(await (await R.course.GET(get('/api/family/english'))).json()).toEqual({ error: 'consent_needed' });
    // Only the parent's own tap, in parent mode, gives it.
    expect((await R.consent.POST(post('/api/family/consent', { purpose: 'english_programme', granted: true, tap: true }))).status).toBe(403);
    jar.ncf_parent = R.parent;
    expect((await R.consent.POST(post('/api/family/consent', { purpose: 'english_programme', granted: true, tap: true }))).status).toBe(200);
    delete jar.ncf_parent;
  });

  it("makes the child's place from the class (Class 2 → track B) and lists the course", async () => {
    const res = await R.course.GET(get('/api/family/english'));
    expect(res.status).toBe(200);
    const c = await res.json();
    expect(c.track).toBe('b');
    expect(c.units.map((u: { key: string }) => u.key)).toEqual(['b.u01', 'b.u02']);
    expect(c.units[0].lessons.map((l: { state: string }) => l.state)).toEqual(['open', 'locked', 'locked', 'locked', 'locked']);
    expect(c.today).toEqual({ newLessons: 0, perDay: 2 });
    expect(c.assessments[0]).toMatchObject({ kind: 'day0', open: true, result: null });
  });
});

describe('lessons', () => {
  it('opens only in order; the phone never gets an answer', async () => {
    expect((await lessonGet('b.u01.l2')).status).toBe(403);
    const res = await lessonGet('b.u01.l1');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.lesson.key).toBe('b.u01.l1');
    expect(body.lesson.check.length).toBe(4);
    expect(JSON.stringify(body.lesson.check)).not.toContain('"answer"');
    expect(body.warmup).toEqual([]);
  });

  it('scores on the server: below 80% is not done; 100% gives 3 stars on the first passing try only', async () => {
    const wrong = await (await lessonPost('b.u01.l1', { answers: {} })).json();
    expect(wrong).toMatchObject({ score: 0, stars: 0, passed: false, tryNo: 1 });
    expect(wrong.results.every((r: { correct: boolean }) => !r.correct)).toBe(true);
    const right = await (await lessonPost('b.u01.l1', { answers: rightAnswers('b.u01.l1') })).json();
    expect(right).toMatchObject({ score: 100, stars: 1, passed: true, tryNo: 2, next: { key: 'b.u01.l2', state: 'open' } });
    // The lesson's six words are in the review boxes, due tomorrow; its answered items too.
    const words = (await db.pg.query(`select count(*)::int n from family.english_reviews where child_id = $1 and kind = 'word'`, [CHILD])).rows[0].n;
    expect(words).toBe(6);
  });

  it('the day allows two new lessons; the third rests until tomorrow', async () => {
    const l2 = await (await lessonPost('b.u01.l2', { answers: rightAnswers('b.u01.l2') })).json();
    expect(l2).toMatchObject({ stars: 3, passed: true, next: { key: 'b.u01.l3', state: 'rest' } });
    expect((await lessonGet('b.u01.l3')).status).toBe(403);
    expect(await (await lessonGet('b.u01.l3')).json()).toEqual({ error: 'rest' });
    // Done lessons stay open to revise.
    expect((await lessonGet('b.u01.l1')).status).toBe(200);
    // The next day.
    await db.pg.query(`update family.english_days set day = day - 1 where child_id = $1`, [CHILD]);
    expect((await lessonGet('b.u01.l3')).status).toBe(200);
  });

  it('due items come back as a warm-up and move their boxes when answered', async () => {
    await db.pg.query(`update family.english_reviews set due_on = due_on - 1 where child_id = $1 and item_key = 'b.u01.l1.girl'`, [CHILD]);
    const body = await (await lessonGet('b.u01.l3')).json();
    const warm = body.warmup.find((w: { key: string }) => w.key === 'b.u01.l1.girl');
    expect(warm).toBeDefined();
    expect(JSON.stringify(warm)).not.toContain('"answer"');
    const girl = warm.options.findIndex((o: { pic: string }) => o.pic === '👧');
    const res = await (await lessonPost('b.u01.l3', { answers: rightAnswers('b.u01.l3'), warmup: { 'b.u01.l1.girl': girl } })).json();
    expect(res.warmup).toEqual([{ key: 'b.u01.l1.girl', correct: true, answer: '👧', why: undefined }]);
    const row = (await db.pg.query(`select box from family.english_reviews where child_id = $1 and item_key = 'b.u01.l1.girl'`, [CHILD])).rows[0];
    expect(row.box).toBe(1);
  });

  it("another account's child and another track's lessons are out of reach", async () => {
    expect((await lessonGet('c.u01.l1')).status).toBe(404);
    const rows = await db.pg.query(`select count(*)::int n from family.english_enrolments where child_id = $1`, [OTHER_CHILD]);
    expect(rows.rows[0].n).toBe(0);
  });
});

describe('assessments, settings and the report', () => {
  it('day 0 is closed once a lesson is done; its scores are kept per skill', async () => {
    expect((await R.assessment.GET(get('/api/family/english/assessments/day0'), { params: { kind: 'day0' } })).status).toBe(403);
    await db.pg.query(`delete from family.english_lessons_done where child_id = $1`, [CHILD]);
    const a = await (await R.assessment.GET(get('/api/family/english/assessments/day0'), { params: { kind: 'day0' } })).json();
    expect(a.sections.map((s: { skill: string }) => s.skill)).toEqual(['listening', 'words', 'grammar', 'reading']);
    expect(JSON.stringify(a.sections)).not.toContain('"answer"');
    const res = await (
      await R.assessment.POST(
        post('/api/family/english/assessments/day0', {
          answers: { 'b.u01.l1.c-school': 0, 'b.u01.l1.c-hello': 0, 'b.u01.l1.c-friend': 1, 'b.u01.l2.c-am': 1, 'b.u01.l3.c-where': 0 },
          speaking: { 'b.day0.s-me': [2, 2] },
        }),
        { params: { kind: 'day0' } }
      )
    ).json();
    expect(res).toMatchObject({ total: 100, placedUnit: 7, scores: { listening: 100, words: 100, grammar: 100, reading: 100, speaking: 100 } });
    expect((await db.pg.query(`select placed_unit from family.english_enrolments where child_id = $1`, [CHILD])).rows[0].placed_unit).toBe(7);
    // The baseline is taken once.
    expect((await R.assessment.POST(post('/api/family/english/assessments/day0', { answers: {} }), { params: { kind: 'day0' } })).status).toBe(409);
  });

  it('the settings and the report need parent mode; the track moves one step, once', async () => {
    expect((await R.settings.POST(post('/api/family/english/settings', { childId: CHILD, weeklyGoal: 4 }))).status).toBe(403);
    jar.ncf_parent = R.parent;
    expect((await R.settings.POST(post('/api/family/english/settings', { childId: CHILD, weeklyGoal: 4 }))).status).toBe(200);
    expect((await R.settings.POST(post('/api/family/english/settings', { childId: CHILD, track: 'd' }))).status).toBe(400);
    const rep = await (await R.report.GET(get(`/api/family/english/report?childId=${CHILD}`))).json();
    expect(rep.report.thisWeek.goal).toBe(4);
    expect(rep.report.totals.wordsLearning).toBe(6);
    expect(rep.report.assessments[0]).toMatchObject({ kind: 'day0', total: 100 });
    delete jar.ncf_parent;
  });
});

describe('the rules', () => {
  it('tracks from classes, and the parent may move one step', () => {
    expect([-2, 0, 1, 3, 4, 7, 8, 12].map(trackForClass)).toEqual(['a', 'a', 'b', 'b', 'c', 'c', 'd', 'd']);
    expect(tracksAllowed(5)).toEqual(['b', 'c', 'd']);
    expect(tracksAllowed(-1)).toEqual(['a', 'b']);
  });
  it('locks, placement and assessments', () => {
    const s = lessonStates('b', new Set(['b.u01.l1']), 1, 0, 2);
    expect([s['b.u01.l1'], s['b.u01.l2'], s['b.u01.l3']]).toEqual(['done', 'open', 'locked']);
    const placed = lessonStates('b', new Set(), 4, 0, 2);
    expect([placed['b.u03.l5'], placed['b.u04.l1'], placed['b.u04.l2']]).toEqual(['placed', 'open', 'locked']);
    expect([placedUnitFor('b', 85), placedUnitFor('b', 65), placedUnitFor('b', 10), placedUnitFor('a', 100)]).toEqual([7, 4, 1, 1]);
    expect(assessmentOpen('b', 'day45', new Set(['b.u09.l5']))).toBe(true);
    expect(assessmentOpen('b', 'day0', new Set(['b.u01.l1']))).toBe(false);
  });
  it('review boxes: 1, 3, 7, 21 days; a miss starts again; learned after two right days a week apart', () => {
    const a = nextReview(null, true, '2026-11-01');
    expect(a).toMatchObject({ box: 1, due_on: '2026-11-02', learned_on: null });
    const b = nextReview(a, true, '2026-11-02');
    expect(b).toMatchObject({ box: 2, due_on: '2026-11-05' });
    const c = nextReview(b, true, '2026-11-08');
    expect(c).toMatchObject({ box: 3, due_on: '2026-11-15', learned_on: '2026-11-08' });
    expect(nextReview(c, false, '2026-11-15')).toMatchObject({ box: 0, due_on: '2026-11-16', misses: 1, learned_on: '2026-11-08' });
  });
  it('the report counts by week and never ranks', () => {
    const r = buildReport({
      startedOn: '2026-11-01',
      today: '2026-11-14',
      weeklyGoal: 5,
      done: [
        { key: 'b.u01.l1', stars: 3, bestScore: 100, tries: 1, doneOn: '2026-11-02', lastOn: '2026-11-02' },
        { key: 'b.u01.l5', stars: 2, bestScore: 80, tries: 1, doneOn: '2026-11-12', lastOn: '2026-11-12' },
      ],
      reviews: [{ kind: 'word', learnedOn: '2026-11-10' }, { kind: 'word', learnedOn: null }, { kind: 'item', learnedOn: null }],
      days: [{ day: '2026-11-12', voiceSeconds: 120 }],
      units: [{ key: 'b.u01', position: 1, titleEn: 'All about me', titleHi: 'मेरे बारे में', canDoEn: 'I can introduce myself.', canDoHi: 'मैं …', pic: '🙋', lessons: [] }],
      results: [],
    });
    expect(r.weeks.map((w) => [w.from, w.lessons, w.meanScore, w.voiceMinutes])).toEqual([
      ['2026-11-01', 1, 100, 0],
      ['2026-11-08', 1, 80, 2],
    ]);
    expect(r.totals).toMatchObject({ lessons: 2, units: 1, wordsLearned: 1, wordsLearning: 1 });
    expect(r.canDos).toEqual([{ unitKey: 'b.u01', en: 'I can introduce myself.', hi: 'मैं …', on: '2026-11-12' }]);
    expect(r.thisWeek).toEqual({ done: 1, goal: 5 });
  });
});
