import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { loadScreen, runCheck } from '@/lib/early-warning/early-warning';
import { makeExam } from '@/lib/exams/exams';
import { saveMarks } from '@/lib/exams/marks';
import { publishClass } from '@/lib/exams/publish';
import { indiaDate } from '@/lib/time/india';

// W14-J: Early Warning on a school that has only just begun (the founder's live test, 31 Oct): one class, a few
// children, attendance marked on one day, one exam published with marks for some of the children only, no syllabus,
// no fee structure, no homework, no settings saved. The screen and its API must load, and "Check now" must run.

const state = vi.hoisted(() => ({ tenant: null as unknown, claims: null as unknown }));
vi.mock('@/lib/auth/require-session', () => ({ requireSession: async () => state.claims }));
vi.mock('@/lib/auth/server-session', () => ({ getServerSession: async () => state.claims }));
vi.mock('@/lib/auth/db', async (original) => ({
  ...(await original<typeof import('@/lib/auth/db')>()),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withTenantContext: (claims: any, fn: any) => (state.tenant as any)(claims, fn),
}));
vi.mock('@/lib/i18n/server', () => ({ getLang: () => ({ lang: 'en' }) }));

import { GET as getScreen, POST as postCheck } from '@/app/api/app/early-warning/route';

const u = (n: number) => `9a000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const A = u(1);
const [PRINCIPAL, ADMIN, TEACHER, ACCOUNTANT] = [u(11), u(12), u(13), u(14)];
const [C6A, SESSION, MATHS, ENGLISH] = [u(31), u(33), u(41), u(42)];
const [ASHA, BELA, CHIRAG, DEV] = [u(101), u(102), u(103), u(104)];
const TODAY = indiaDate();
const NOON = new Date(`${TODAY}T12:00:00+05:30`);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string };
const principal: Who = { role: 'principal', user: PRINCIPAL };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const as = <T>(who: Who, fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    for (const [k, v] of [['app.current_tenant_id', A], ['app.current_role', who.role], ['app.current_user_id', who.user]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(tx);
  });
const actor = (who: Who) => ({ schoolId: A, userId: who.user, role: who.role as never });
const signIn = (who: Who) => {
  state.claims = { sub: who.user, role: who.role, schoolId: A };
};
const SCHEME = {
  bands: [{ from: 75, to: 100, grade: 'A', meaning: null }, { from: 33, to: 74, grade: 'B', meaning: null }, { from: 0, to: 32, grade: 'D', meaning: null }],
  decimals: 0,
  passMark: 33,
  components: [],
  terms: [],
  layout: { components: true, total: true, percent: true, grade: true, attendance: true, remarks: true, coScholastic: false },
  coScholastic: null,
};
const get = () => getScreen(new NextRequest('http://localhost/api/app/early-warning'));
const post = () => postCheck(new NextRequest('http://localhost/api/app/early-warning', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }));

describe('Early Warning on a school that has only just begun', () => {
  beforeAll(async () => {
    db = await startHarnessDb({ port: 0 });
    await db.pg.exec(`
      set session_replication_role = replica;
      insert into schools (school_id, name, jurisdiction) values ('${A}', 'New School', 'IN-UP');
      insert into users (user_id, school_id, email, role, display_name, is_active) values
        ('${PRINCIPAL}', '${A}', 'principal@new.example', 'principal', 'Priya Principal', true), ('${ADMIN}', '${A}', 'admin@new.example', 'school_admin', 'Asif Admin', true),
        ('${TEACHER}', '${A}', 'teacher@new.example', 'teacher', 'Tara Teacher', true), ('${ACCOUNTANT}', '${A}', 'accounts@new.example', 'accountant', 'Anil Accountant', true);
      insert into school_entitlements (school_id, plan, access_mode) values ('${A}', 'standard', 'full') on conflict (school_id) do nothing;
      insert into school_module_entitlements (school_id, module_id, enabled, source) values ('${A}', 'early-warning', true, 'plan'), ('${A}', 'recovery', true, 'plan'), ('${A}', 'exams', true, 'plan')
        on conflict (school_id, module_id) do update set enabled = excluded.enabled;
      insert into teachers (teacher_id, school_id, user_id, name) values (gen_random_uuid(), '${A}', '${TEACHER}', 'Tara Teacher');
      insert into academic_sessions (session_id, school_id, label, start_date, end_date, is_current) values ('${SESSION}', '${A}', '2026-27', '2026-04-01', '2027-03-31', true);
      insert into classes (class_id, school_id, name, section, class_teacher_id) values ('${C6A}', '${A}', '6', 'A', '${TEACHER}');
      insert into subjects (subject_id, school_id, name) values ('${MATHS}', '${A}', 'Mathematics'), ('${ENGLISH}', '${A}', 'English');
      insert into students (student_id, school_id, admission_no, name, status, class_id) values
        ('${ASHA}', '${A}', 'N-1', 'Asha', 'active', '${C6A}'), ('${BELA}', '${A}', 'N-2', 'Bela', 'active', '${C6A}'), ('${CHIRAG}', '${A}', 'N-3', 'Chirag', 'active', '${C6A}');
      -- Attendance marked once: Asha and Bela present, Chirag absent, Dev not marked.
      insert into attendance (school_id, student_id, class_id, date, status, marked_by) values
        ('${A}', '${ASHA}', '${C6A}', '${TODAY}', 'present', '${TEACHER}'), ('${A}', '${BELA}', '${C6A}', '${TODAY}', 'present', '${TEACHER}'), ('${A}', '${CHIRAG}', '${C6A}', '${TODAY}', 'absent', '${TEACHER}');
      set session_replication_role = origin;
    `);
    state.tenant = (claims: { role: string; sub: string }, fn: (c: unknown) => Promise<unknown>) => as({ role: claims.role, user: claims.sub }, fn);
    // One exam, a paper in Mathematics, a mark (a score, absent, exempt) for the three children then in the class; published for the class under the school's grading scheme.
    const made = await as(principal, (c) => makeExam(c, actor(principal), { name: 'Unit test 1', sessionId: SESSION, term: null, papers: [{ classId: C6A, subjectId: MATHS, date: null, unitIds: [], maxima: { marks: 50 } }, { classId: C6A, subjectId: ENGLISH, date: null, unitIds: [], maxima: { marks: 50 } }] }));
    expect(made.ok).toBe(true);
    const examId = (made as { examId: string }).examId;
    const papers = (await db.pg.query(`select paper_id from exam_papers where exam_id = $1 order by paper_id`, [examId])).rows.map((r: { paper_id: string }) => r.paper_id as string);
    const teacher = { role: 'teacher', user: TEACHER };
    // Asha scores low in both subjects; Bela was absent and Chirag exempt in both.
    for (const paperId of papers) await as(teacher, (c) => saveMarks(c, actor(teacher), paperId, [{ studentId: ASHA, component: 'marks', kind: 'score', score: 10 }, { studentId: BELA, component: 'marks', kind: 'absent', score: null }, { studentId: CHIRAG, component: 'marks', kind: 'exempt', score: null }]));
    await db.pg.query(`insert into grading_schemes (school_id, version, scheme, made_by) values ($1, 1, $2::jsonb, $3)`, [A, JSON.stringify(SCHEME), PRINCIPAL]);
    expect(await as(principal, (c) => publishClass(c, actor(principal), examId, C6A))).toMatchObject({ ok: true });
    // Dev joins the class after the exam was published: a child with no mark in it, and no attendance yet.
    await db.pg.query(`insert into students (student_id, school_id, admission_no, name, status, class_id) values ($1, $2, 'N-4', 'Dev', 'active', $3)`, [DEV, A, C6A]);
  }, 120_000);
  afterAll(async () => db?.stop());

  it('loads the screen before any check, as the principal, the school admin and a teacher', async () => {
    for (const who of [principal, { role: 'school_admin', user: ADMIN }, { role: 'teacher', user: TEACHER }]) {
      signIn(who);
      const res = await get();
      expect(res.status, who.role).toBe(200);
      const body = await res.json();
      expect(body.open, who.role).toEqual([]);
      expect(body.closed).toEqual([]);
      expect(Array.isArray(body.summary)).toBe(true);
    }
    const screen = await as(principal, (c) => loadScreen(c, actor(principal), NOON));
    expect(screen).toMatchObject({ mayCheck: true, lastCheck: null, open: [], closed: [], truncated: false });
  });

  it('"Check now" runs (one day of attendance says nothing; the first exam with two subjects below the pass mark opens one marks flag), and the screen loads again after it', async () => {
    signIn(principal);
    const res = await post();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ students: 4, attendanceUsed: 0, opened: 1, closed: 0, open: 1 });
    expect((await as(principal, (c) => runCheck(c, actor(principal), NOON)))).toMatchObject({ ok: true, students: 4, opened: 0, kept: 1 });
    const res2 = await get();
    expect(res2.status).toBe(200);
    const body = await res2.json();
    expect(body.lastCheck).toMatchObject({ students: 4, attendanceUsed: 0, open: 1 });
    expect(JSON.stringify(body)).not.toContain('NaN');
  });

  it('the marks flag is read by the screen with its exam labelled', async () => {
    signIn(principal);
    const body = await (await get()).json();
    expect(body.open).toHaveLength(1);
    expect(body.open[0]).toMatchObject({ student_name: 'Asha', class_name: '6-A', reasons: ['marks'] });
    expect(body.open[0].evidence.marks).toMatchObject({ previous: null, fell: null, exam: { name: 'Unit test 1', percent: 20 } });
    expect(body.open[0].evidence.marks.exam.kind).toBeTruthy();
  });
});
