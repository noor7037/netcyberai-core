import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import type { Unit } from '@/lib/family/english/course';

// The Focus Lock's block screen lists everything a child still has to do today (C540), through the real status route on
// the real schema. Besides the day plan: the English course's next lesson, today's quick quiz (or a review due today) and
// the linked school's homework due today. Each appears only when its module is on and the child has such a task,
// disappears when done, `done` follows all of them, and another family's tasks never appear. Made-up people only.

const A = 'f9500000-0000-4000-8000-0000000000a1';
const B = 'f9500000-0000-4000-8000-0000000000b1';
const KA = 'f9500000-0000-4000-8000-0000000000a2'; // Meera: class 2, Hindi, English track b
const KA2 = 'f9500000-0000-4000-8000-0000000000a3'; // Neel: class 2, English, not matched to the school
const KB = 'f9500000-0000-4000-8000-0000000000b2';
const VERSION = 'f9500000-0000-4000-8000-0000000000c1';
const PHONE_A = 'phoneA-0123456789abcdefghijklmnopqrstuvwxyz_';
const PHONE_B = 'phoneB-0123456789abcdefghijklmnopqrstuvwxyz_';
const SCHOOL = 'f9500000-0000-4000-8000-000000000501';
const PRINCIPAL = 'f9500000-0000-4000-8000-0000000005a1';
const TEACHER = 'f9500000-0000-4000-8000-0000000005a2';
const GUARDIAN = 'f9500000-0000-4000-8000-0000000005e1';
const STUDENT = 'f9500000-0000-4000-8000-0000000005a3';
const CLASS = 'f9500000-0000-4000-8000-0000000005c6';
const SCI = 'f9500000-0000-4000-8000-0000000005d1';
const HW_TODAY = 'f9500000-0000-4000-8000-0000000005f1';
const HW_LATER = 'f9500000-0000-4000-8000-0000000005f2';
const HW_TARGET_TODAY = 'f9500000-0000-4000-8000-0000000005b1';
const HW_TARGET_LATER = 'f9500000-0000-4000-8000-0000000005b2';

const unit1 = JSON.parse(readFileSync(path.resolve(__dirname, '../../data/english/b/unit-01.json'), 'utf8')) as Unit;
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let R: Record<string, any>;
let cookieA = '';
let cookieB = '';
let today = '';
let yesterday = '';
let tomorrow = '';
let linkId = '';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const q = async (sql: string, p: unknown[] = []): Promise<any[]> => (await db.pg.query(sql, p)).rows;
const day = (offset: number) => new Date(Date.parse(`${today}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);

type Pending = { key: string; title: string; subject: string; kind: string };
type Child = { childId: string; firstName: string; done: boolean; pending: Pending[] };
const status = async (cookie: string, device: string): Promise<Child[]> => {
  const res = await R.status.GET(new NextRequest('http://localhost/api/family/focus/status', { headers: { cookie, 'x-focus-device': device } }));
  expect(res.status).toBe(200);
  return (await res.json()).children;
};
const child = async (id: string, cookie = cookieA, device = PHONE_A) => (await status(cookie, device)).find((c) => c.childId === id)!;
const kinds = (c: Child) => c.pending.map((p) => p.kind);
// A module's switch in Control: off, or on again (a module never saved is on, C230-Z).
const setSwitch = async (module: string, on: boolean) => {
  await q(`delete from control.app_flags where app = 'family' and module = $1`, [module]);
  if (!on) await q(`insert into control.app_flags (app, module, enabled, reason) values ('family', $1, false, 'test')`, [module]);
};

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  process.env.DATABASE_URL = db.url;
  process.env.DB_POOL_MAX = '1';
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-family-focus-today-0123456789';
  const lessons = [unit1].flatMap((u) =>
    u.lessons.map((l, i) => `('${VERSION}', '${l.key}', '${u.key}', ${i + 1}, '${l.kind}', ${lit(l.title.en)}, ${lit(l.title.hi ?? l.title.en)}, ${l.minutes}, ${lit(JSON.stringify(l))}::jsonb)`)
  );
  const today0 = (await import('@/lib/time/india')).indiaDate();
  today = today0;
  yesterday = day(-1);
  tomorrow = day(1);
  await db.pg.exec(`
    update control.settings set value = '[]'::jsonb where key in ('family.open_subjects', 'family.reviewed_only_subjects');
    insert into family.accounts (account_id, email) values ('${A}', 'today.a@example.org'), ('${B}', 'today.b@example.org');
    insert into family.consents (account_id, purpose, granted, verification_method, notice_version) values
      ('${A}', 'study_core', true, 'parent_tap', 'v1'), ('${A}', 'english_programme', true, 'parent_tap', 'v1'),
      ('${B}', 'study_core', true, 'parent_tap', 'v1'), ('${B}', 'english_programme', true, 'parent_tap', 'v1');
    insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code) values
      ('${KA}', '${A}', 'Meera', 2, 'CBSE', 'hi', 'hi', 'IN-UP'), ('${KA2}', '${A}', 'Neel', 2, 'CBSE', 'en', 'en', 'IN-UP'), ('${KB}', '${B}', 'Kabir', 2, 'CBSE', 'en', 'en', 'IN-RJ');
    insert into content.english_versions (version_id, track, version_no, status, audience, import_source, import_ref, approved_by, approved_at, released_at)
      values ('${VERSION}', 'b', 1, 'published', 'everyone', 'repository', 'test', 'f9500000-0000-4000-8000-0000000000f1', now(), now());
    insert into content.english_units (version_id, unit_key, position, title_en, title_hi, can_do_en, can_do_hi, pic) values
      ('${VERSION}', 'b.u01', 1, 'All about me', 'मेरे बारे में', 'I can introduce myself.', 'मैं अपना परिचय दे सकता/सकती हूँ।', '🙋');
    insert into content.english_lessons (version_id, lesson_key, unit_key, position, kind, title_en, title_hi, minutes, body) values ${lessons.join(',\n')};
    insert into control.app_flags (app, module, enabled, reason) values ('family', 'focus_lock', true, 'closed pilot, written consent');
    -- The school: one student with homework due today and one due tomorrow, and a guardian who will link.
    insert into schools (school_id, name, jurisdiction, is_test_fixture) values ('${SCHOOL}', 'School A', 'IN-UP', false);
    insert into users (user_id, school_id, email, role, display_name, is_active) values
      ('${PRINCIPAL}', '${SCHOOL}', 'p@a.invalid', 'principal', 'Priya Principal', true), ('${TEACHER}', '${SCHOOL}', 't@a.invalid', 'teacher', 'Tara Teacher', true);
    insert into memberships (user_id, school_id, role, is_active) values ('${PRINCIPAL}', '${SCHOOL}', 'principal', true), ('${TEACHER}', '${SCHOOL}', 'teacher', true);
    insert into classes (class_id, school_id, name, grade, section) values ('${CLASS}', '${SCHOOL}', '2-A', '2', 'A');
    insert into subjects (subject_id, school_id, name) values ('${SCI}', '${SCHOOL}', 'Science');
    insert into students (student_id, school_id, admission_no, name, class_id, status) values ('${STUDENT}', '${SCHOOL}', 'A-1', 'Meera Kumar', '${CLASS}', 'active');
    insert into parents (parent_id, school_id, name, phone, relation) values ('${GUARDIAN}', '${SCHOOL}', 'Rajesh Kumar', '9800000001', 'Father');
    insert into parent_student_map (school_id, parent_id, student_id) values ('${SCHOOL}', '${GUARDIAN}', '${STUDENT}');
    insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version) values ('${SCHOOL}', '${STUDENT}', 'core_records', true, 'school_attested', 'v1');
    insert into homework (homework_id, school_id, subject_id, title, details, due_date, created_by) values
      ('${HW_TODAY}', '${SCHOOL}', '${SCI}', 'Leaf collection', null, '${today}', '${TEACHER}'),
      ('${HW_LATER}', '${SCHOOL}', '${SCI}', 'Magnet list', null, '${tomorrow}', '${TEACHER}');
    insert into homework_targets (target_id, school_id, homework_id, class_id, title, details, due_date) values
      ('${HW_TARGET_TODAY}', '${SCHOOL}', '${HW_TODAY}', '${CLASS}', 'Leaf collection', null, '${today}'),
      ('${HW_TARGET_LATER}', '${SCHOOL}', '${HW_LATER}', '${CLASS}', 'Magnet list', null, '${tomorrow}');
  `);
  // The real path: the school's principal makes a code for the guardian, the family spends it and matches Meera.
  const asStaff = (fn: (c: never) => Promise<unknown>) =>
    db.pg.transaction(async (c: { query: (s: string, p?: unknown[]) => Promise<unknown> }) => {
      await c.query(`set local role app_user`);
      for (const [k, v] of Object.entries({ 'app.current_tenant_id': SCHOOL, 'app.current_role': 'principal', 'app.current_user_id': PRINCIPAL })) await c.query(`select set_config($1, $2, true)`, [k, v]);
      return fn(c as never);
    });
  const { issueConnectCode, redeemConnectCode } = await import('@/lib/school-link');
  const { withFamilyContext } = await import('@/lib/auth/db');
  const { setChildLinks } = await import('@/lib/family/school');
  const issued = (await asStaff((c) => issueConnectCode(c, { userId: PRINCIPAL, role: 'principal', schoolId: SCHOOL }, GUARDIAN))) as { code: string };
  const claims = { accountId: A, tokenVersion: 0 };
  const made = await withFamilyContext(claims, (c) => redeemConnectCode(c, A, issued.code));
  linkId = made!.linkId;
  await withFamilyContext(claims, (c) => setChildLinks(c, A, linkId, [STUDENT], [{ studentId: STUDENT, childId: KA }]));
  // The phones: A's for both children, B's for its own.
  const { deviceHash, registerDevice } = await import('@/lib/family/focus');
  await withFamilyContext(claims, (c) => registerDevice(c, A, deviceHash(A, PHONE_A)!, [KA, KA2]));
  await withFamilyContext({ accountId: B, tokenVersion: 0 }, (c) => registerDevice(c, B, deviceHash(B, PHONE_B)!, [KB]));
  const { signFamilySession } = await import('@/lib/family/session');
  cookieA = `ncf_session=${await signFamilySession({ accountId: A, tokenVersion: 0, sessionId: 'sa' })}`;
  cookieB = `ncf_session=${await signFamilySession({ accountId: B, tokenVersion: 0, sessionId: 'sb' })}`;
  R = { status: await import('@/app/api/family/focus/status/route') };
  // The school's module is off until its own test, so each source is seen alone.
  await setSwitch('school_today', false);
}, 120_000);
afterAll(async () => {
  await (await import('@/lib/auth/db')).endPool();
  await db?.stop();
});

describe('what the block screen lists beyond the plan (C540)', () => {
  it('English: the next lesson, in the child’s language, while the module is on, the child is enrolled and nothing is done today', async () => {
    // Not enrolled yet: no task is invented (the status never enrols a child).
    expect(await child(KA)).toMatchObject({ done: true, pending: [] });
    expect(await q(`select 1 from family.english_enrolments`)).toHaveLength(0);
    await q(`insert into family.english_enrolments (account_id, child_id, track, started_on) values ($1, $2, 'b', $3), ($1, $4, 'b', $3)`, [A, KA, yesterday, KA2]);
    const meera = await child(KA);
    expect(meera.done).toBe(false);
    expect(meera.pending).toEqual([{ key: 'b.u01.l1', title: expect.stringMatching(/^अंग्रेज़ी: /), subject: 'english', kind: 'english' }]);
    const neel = await child(KA2);
    expect(neel.pending).toEqual([{ key: 'b.u01.l1', title: expect.stringMatching(/^English: /), subject: 'english', kind: 'english' }]);
    // Control's switch off, or the parent's consent withdrawn: nothing listed.
    await setSwitch('english_programme', false);
    expect(await child(KA)).toMatchObject({ done: true, pending: [] });
    await setSwitch('english_programme', true);
    await q(`update family.consents set granted = false where account_id = $1 and purpose = 'english_programme'`, [A]);
    expect(await child(KA)).toMatchObject({ done: true, pending: [] });
    await q(`update family.consents set granted = true where account_id = $1 and purpose = 'english_programme'`, [A]);
    expect(kinds(await child(KA))).toEqual(['english']);
  });

  it('English: a lesson finished yesterday does not count for today; one finished today clears the item for that child only', async () => {
    await q(`insert into family.english_lessons_done (account_id, child_id, lesson_key, tries, best_score, stars, done_on, last_on) values ($1, $2, 'b.u01.l1', 1, 90, 2, $3, $3)`, [A, KA, yesterday]);
    expect((await child(KA)).pending.map((p) => p.key)).toEqual(['b.u01.l2']);
    await q(`insert into family.english_lessons_done (account_id, child_id, lesson_key, tries, best_score, stars, done_on, last_on) values ($1, $2, 'b.u01.l2', 1, 90, 2, $3, $3)`, [A, KA, today]);
    expect(await child(KA)).toMatchObject({ done: true, pending: [] });
    expect(kinds(await child(KA2))).toEqual(['english']);
  });

  it('quiz: today’s untaken quiz and a review due today appear; a taken, older or switched-off one does not', async () => {
    await q(`insert into family.tutor_conversations (conversation_id, account_id, child_id, subject) values
      ('f9500000-0000-4000-8000-0000000007a1', $1, $2, 'science'), ('f9500000-0000-4000-8000-0000000007a2', $1, $2, 'science'), ('f9500000-0000-4000-8000-0000000007a3', $1, $2, 'science')`, [A, KA]);
    const quiz = (conv: string, sessionDay: string, due: string[], title: string) =>
      q(`insert into family.session_quizzes (account_id, child_id, conversation_id, session_day, subject, title, items, review_due_on) values ($1, $2, $3, $4, 'science', $5, '[{"q":1}]'::jsonb, $6::date[]) returning quiz_id`, [A, KA, conv, sessionDay, title, due]).then((r) => String(r[0].quiz_id));
    const fresh = await quiz('f9500000-0000-4000-8000-0000000007a1', today, [day(1), day(3), day(7)], 'Plants and light');
    const old = await quiz('f9500000-0000-4000-8000-0000000007a2', day(-5), [day(-4), day(-2), day(2)], 'Old untaken quiz');
    expect(old).toBeTruthy();
    let meera = await child(KA);
    expect(meera.pending).toEqual([{ key: `quiz.${fresh}`, title: 'क्विज़: Plants and light', subject: 'science', kind: 'quiz' }]);
    expect(meera.done).toBe(false);
    // Switched off in Control: nothing.
    await setSwitch('tutor_quiz', false);
    expect(await child(KA)).toMatchObject({ done: true, pending: [] });
    await setSwitch('tutor_quiz', true);
    // Taken (an attempt is recorded): it leaves the list; its review comes back on its day, not before.
    await q(`insert into family.chapter_test_attempts (account_id, child_id, chapter_key, block_id, mcq_total, mcq_correct) values ($1, $2, 'session-quiz', $3, 3, 2)`, [A, KA, fresh]);
    expect(await child(KA)).toMatchObject({ done: true, pending: [] });
    await q(`update family.session_quizzes set session_day = $2::date - 1, review_due_on = array[$2::date, $2::date + 2, $2::date + 6] where quiz_id = $1`, [fresh, today]);
    meera = await child(KA);
    expect(meera.pending.map((p) => p.key)).toEqual([`quiz.${fresh}`]);
    await q(`insert into family.chapter_test_attempts (account_id, child_id, chapter_key, block_id, mcq_total, mcq_correct) values ($1, $2, 'session-quiz', $3, 3, 3)`, [A, KA, fresh]);
    expect(await child(KA)).toMatchObject({ done: true, pending: [] });
    // Another child of the same family has none of it.
    expect(await child(KA2)).toMatchObject({ pending: [{ kind: 'english' }] });
  });

  it('school homework: only what is due today, for the matched child, until the teacher marks it done', async () => {
    expect(await child(KA)).toMatchObject({ done: true, pending: [] });
    await setSwitch('school_today', true);
    const meera = await child(KA);
    expect(meera.done).toBe(false);
    expect(meera.pending).toEqual([{ key: expect.stringMatching(/^homework\.[0-9a-f]{12}$/), title: 'गृहकार्य: Leaf collection', subject: 'school', kind: 'homework' }]);
    // The unmatched sibling sees none of the school's homework.
    expect(kinds(await child(KA2))).toEqual(['english']);
    // Switched off, or the link ended: nothing.
    // The teacher's done mark clears it.
    await q(`insert into homework_status (school_id, target_id, class_id, student_id, done, checked_by, checked_at) values ($1, $2, $3, $4, true, $5, now())`, [SCHOOL, HW_TARGET_TODAY, CLASS, STUDENT, TEACHER]);
    expect(await child(KA)).toMatchObject({ done: true, pending: [] });
    await q(`delete from homework_status`);
    expect(kinds(await child(KA))).toEqual(['homework']);
  });

  it('done is true only when every listed item is done, and the response keeps its shape', async () => {
    await q(`delete from family.english_lessons_done where child_id = $1`, [KA]);
    const fresh = String((await q(`select quiz_id from family.session_quizzes limit 1`))[0].quiz_id);
    await q(`delete from family.chapter_test_attempts where block_id = $1`, [fresh]);
    await q(`update family.session_quizzes set session_day = $2::date, review_due_on = array[$2::date + 1, $2::date + 3, $2::date + 7] where quiz_id = $1`, [fresh, today]);
    const all = await child(KA);
    expect(all.pending.map((p) => p.kind).sort()).toEqual(['english', 'homework', 'quiz']);
    expect(all.done).toBe(false);
    expect(Object.keys(all).sort()).toEqual(['childId', 'done', 'firstName', 'pending']);
    expect(Object.keys(all.pending[0]).sort()).toEqual(['key', 'kind', 'subject', 'title']);
    // One by one: the list shrinks, and done turns true only with the last.
    await q(`insert into family.english_lessons_done (account_id, child_id, lesson_key, tries, best_score, stars, done_on, last_on) values ($1, $2, 'b.u01.l1', 1, 90, 2, $3, $3)`, [A, KA, today]);
    expect((await child(KA)).pending.map((p) => p.kind).sort()).toEqual(['homework', 'quiz']);
    await q(`insert into family.chapter_test_attempts (account_id, child_id, chapter_key, block_id, mcq_total, mcq_correct) values ($1, $2, 'session-quiz', $3, 3, 2)`, [A, KA, fresh]);
    expect(await child(KA)).toMatchObject({ done: false, pending: [{ kind: 'homework' }] });
    await q(`insert into homework_status (school_id, target_id, class_id, student_id, done, checked_by, checked_at) values ($1, $2, $3, $4, true, $5, now())`, [SCHOOL, HW_TARGET_TODAY, CLASS, STUDENT, TEACHER]);
    expect(await child(KA)).toMatchObject({ done: true, pending: [] });
  });

  it('switching the school’s module off, or ending the link, removes its homework', async () => {
    await q(`delete from homework_status`);
    expect(kinds(await child(KA))).toEqual(['homework']);
    await setSwitch('school_today', false);
    expect(await child(KA)).toMatchObject({ done: true, pending: [] });
    await setSwitch('school_today', true);
    expect(kinds(await child(KA))).toEqual(['homework']);
    await q(`update family.school_links set revoked_at = now(), revoked_by = 'family' where link_id = $1`, [linkId]);
    expect(await child(KA)).toMatchObject({ done: true, pending: [] });
  });

  it('another family’s tasks never appear', async () => {
    // B has its own enrolled child with an English lesson due; A's quiz, homework and lessons are not in B's answer, nor B's in A's.
    await q(`insert into family.english_enrolments (account_id, child_id, track, started_on) values ($1, $2, 'b', $3)`, [B, KB, yesterday]);
    const kabir = await child(KB, cookieB, PHONE_B);
    expect(kabir.pending).toEqual([{ key: 'b.u01.l1', title: expect.stringMatching(/^English: /), subject: 'english', kind: 'english' }]);
    expect((await status(cookieB, PHONE_B)).map((c) => c.childId)).toEqual([KB]);
    const a = await status(cookieA, PHONE_A);
    expect(a.map((c) => c.childId)).toEqual([KA, KA2]);
    expect(JSON.stringify(a)).not.toContain(KB);
    expect(JSON.stringify(await status(cookieB, PHONE_B))).not.toMatch(/Leaf collection|Plants and light/);
    // A's phone id is no key to B's children.
    const res = await R.status.GET(new NextRequest('http://localhost/api/family/focus/status', { headers: { cookie: cookieB, 'x-focus-device': PHONE_A } }));
    expect(res.status).toBe(404);
  });
});
