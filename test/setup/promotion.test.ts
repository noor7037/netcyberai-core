import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { MODULE_REGISTRY } from '@/lib/contracts/modules';
import { planPromotion } from '@/lib/setup/promotion-plan';

// Promotion to the next academic session (W21-M2), through the app's routes as each person's own session, on the
// whole schema as the app's database role: the dry run's mapping and exceptions, the promotion (classes made and
// re-tagged, students moved, leavers marked, one event each, the new session current), a repeat kept back, the old
// session's attendance and marks untouched, undo within 24 hours and refused after, a teacher and the school admin
// refused, everything audited. Every name is made up.

const state = vi.hoisted(() => ({ claims: null as unknown, tenant: null as unknown }));
vi.mock('@/lib/auth/require-session', () => ({ requireSession: async () => state.claims }));
vi.mock('@/lib/auth/server-session', () => ({ getServerSession: async () => state.claims }));
vi.mock('@/lib/auth/db', async (original) => ({
  ...(await original<typeof import('@/lib/auth/db')>()),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withTenantContext: (claims: any, fn: any) => (state.tenant as any)(claims, fn),
}));
vi.mock('@/lib/frameworks/page-access', () => ({ moduleOffReason: async () => null }));

import { GET as readRoute, POST as promoteRoute } from '@/app/api/app/setup/promotion/route';
import { POST as overrideRoute } from '@/app/api/app/setup/promotion/overrides/route';
import { POST as undoRoute } from '@/app/api/app/setup/promotion/undo/route';

const A = 'e2121000-0000-4000-8000-000000000001';
const B = 'e2121000-0000-4000-8000-000000000002';
const u = (n: number) => `e2121000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const [PRINCIPAL, ADMIN, TARA, B_PRINCIPAL] = [u(11), u(12), u(13), u(14)];
const [S1, S2, B_S1] = [u(21), u(22), u(23)];
const [C5A, C5B, C6A, C12A, HOBBY, B_C5A] = [u(31), u(32), u(33), u(34), u(35), u(36)];
const [ASHA, BILAL, CHIRAG, DIVYA, ESHA, FARAH, GITA, HARI, B_KID] = [u(41), u(42), u(43), u(44), u(45), u(46), u(47), u(48), u(49)];
const [EXAM, PAPER] = [u(51), u(52)];
type Who = { role: string; user: string; school?: string };
const principal: Who = { role: 'principal', user: PRINCIPAL };
const admin: Who = { role: 'school_admin', user: ADMIN };
const tara: Who = { role: 'teacher', user: TARA };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const as = <T>(who: Who, fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    for (const [k, v] of [['app.current_tenant_id', who.school ?? A], ['app.current_role', who.role], ['app.current_user_id', who.user]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(tx);
  });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = (who: Who, sql: string, params: unknown[] = []) => as(who, async (c: any) => c.query(sql, params));
const claims = (who: Who) => ({ sub: who.user, role: who.role, schoolId: who.school ?? A, membershipId: u(90), tokenVersion: 0, aal: 'aal1', sessionId: u(91) });
const call = async (who: Who, fn: () => Promise<Response>) => {
  state.claims = claims(who);
  const res = await fn();
  const text = await res.text();
  return { status: res.status, body: res.headers.get('content-type')?.includes('json') ? JSON.parse(text) : null };
};
const req = (path: string, method = 'GET', body?: unknown) => new NextRequest(`http://localhost${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
const read = (who: Who) => call(who, () => readRoute(req('/api/app/setup/promotion')));
const promoteNow = (who: Who) => call(who, () => promoteRoute(req('/api/app/setup/promotion', 'POST')));
const override = (who: Who, body: unknown) => call(who, () => overrideRoute(req('/api/app/setup/promotion/overrides', 'POST', body)));
const undo = (who: Who) => call(who, () => undoRoute(req('/api/app/setup/promotion/undo', 'POST')));
const owner = async (sql: string, params: unknown[] = []) => (await db.pg.query(sql, params)).rows;
// The promotion tables force row-level security even on their owner: they are read as the principal.
const asPrincipal = async (sql: string, params: unknown[] = []) => (await run(principal, sql, params)).rows;
const where = async () =>
  Object.fromEntries(
    (await owner(`select s.student_id, s.status::text as status, s.left_on::text as left_on, c.name from students s left join classes c on c.class_id = s.class_id where s.school_id = $1`, [A])).map(
      (r: { student_id: string; status: string; left_on: string | null; name: string }) => [r.student_id, `${r.name}|${r.status}${r.left_on ? '|left' : ''}`]
    )
  );
const current = async () => (await owner(`select session_id from academic_sessions where school_id = $1 and is_current`, [A]))[0]?.session_id;
const audits = (like: string) => owner(`select event_action, actor_user_id, target_id, after_state from audit_log where school_id = $1 and event_action like $2 order by audit_id`, [A, like]);
const attendance = () => owner(`select student_id, class_id, date::text as date, status from attendance where school_id = $1 order by date`, [A]);
const BEFORE = {
  [ASHA]: '5-A|active',
  [BILAL]: '5-A|active',
  [CHIRAG]: '5-A|active',
  [DIVYA]: '5-B|active',
  [ESHA]: '6-A|pending_consent',
  [FARAH]: '12-A|active',
  [GITA]: 'Hobby|active',
  [HARI]: '5-A|inactive',
};

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction) values ('${A}', 'School A', 'IN-HR'), ('${B}', 'School B', 'IN-DL');
    insert into users (user_id, school_id, email, role, display_name, is_active) values
      ('${PRINCIPAL}', '${A}', 'principal@school-a.example', 'principal', 'Priya Principal', true), ('${ADMIN}', '${A}', 'admin@school-a.example', 'school_admin', 'Asif Admin', true),
      ('${TARA}', '${A}', 'tara@school-a.example', 'teacher', 'Tara Teacher', true), ('${B_PRINCIPAL}', '${B}', 'principal@school-b.example', 'principal', 'Bela Principal', true);
    insert into school_module_entitlements (school_id, module_id, enabled, source)
      select s, m, true, 'plan' from unnest(array['${A}', '${B}']::uuid[]) s, unnest(array[${MODULE_REGISTRY.map((m) => `'${m.id}'`).join(', ')}]) m on conflict (school_id, module_id) do update set enabled = true;
    insert into academic_sessions (session_id, school_id, label, start_date, end_date, is_current) values
      ('${S1}', '${A}', '2025-26', '2025-04-01', '2026-03-31', true), ('${S2}', '${A}', '2026-27', '2026-04-01', '2027-03-31', false),
      ('${B_S1}', '${B}', '2025-26', '2025-04-01', '2026-03-31', true);
    insert into classes (class_id, school_id, name, grade, section, session_id, class_teacher_id) values
      ('${C5A}', '${A}', '5-A', '5', 'A', '${S1}', '${TARA}'), ('${C5B}', '${A}', '5-B', '5', 'B', '${S1}', null), ('${C6A}', '${A}', '6-A', '6', 'A', '${S1}', null),
      ('${C12A}', '${A}', '12-A', '12', 'A', '${S1}', null), ('${HOBBY}', '${A}', 'Hobby', null, null, null, null), ('${B_C5A}', '${B}', '5-A', '5', 'A', '${B_S1}', null);
    insert into students (student_id, school_id, admission_no, name, class_id, roll_no, status) values
      ('${ASHA}', '${A}', 'A-1', 'Asha Madeup', '${C5A}', '1', 'active'), ('${BILAL}', '${A}', 'A-2', 'Bilal Madeup', '${C5A}', '2', 'active'),
      ('${CHIRAG}', '${A}', 'A-3', 'Chirag Madeup', '${C5A}', '3', 'active'), ('${DIVYA}', '${A}', 'A-4', 'Divya Madeup', '${C5B}', '1', 'active'),
      ('${ESHA}', '${A}', 'A-5', 'Esha Madeup', '${C6A}', '1', 'pending_consent'), ('${FARAH}', '${A}', 'A-6', 'Farah Madeup', '${C12A}', '1', 'active'),
      ('${GITA}', '${A}', 'A-7', 'Gita Madeup', '${HOBBY}', '1', 'active'), ('${HARI}', '${A}', 'A-8', 'Hari Madeup', '${C5A}', '9', 'inactive'),
      ('${B_KID}', '${B}', 'B-1', 'Kabir Madeup', '${B_C5A}', '1', 'active');
    -- The leavers had their consents, so an undo can make them active again.
    insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version)
      select '${A}', s, p::consent_purpose, true, 'school_attested', 'v1' from unnest(array['${FARAH}'::uuid, '${GITA}'::uuid]) s, unnest(array['core_records', 'operational_communication']) p;
    insert into attendance (school_id, student_id, class_id, date, status, marked_by) values
      ('${A}', '${ASHA}', '${C5A}', '2026-03-10', 'present', '${TARA}'), ('${A}', '${FARAH}', '${C12A}', '2026-03-10', 'absent', '${TARA}');
    insert into subjects (subject_id, school_id, name) values ('${u(61)}', '${A}', 'Mathematics');
    insert into exams (exam_id, school_id, name, session_id) values ('${EXAM}', '${A}', 'Annual', '${S1}');
    insert into exam_papers (paper_id, school_id, exam_id, class_id, subject_id, components) values ('${PAPER}', '${A}', '${EXAM}', '${C5A}', '${u(61)}', '[{"key": "theory", "name": "Theory", "max": 80, "share": null}]'::jsonb);
    insert into marks (school_id, exam_id, subject_id, paper_id, component, student_id, kind, score, max_score) values ('${A}', '${EXAM}', '${u(61)}', '${PAPER}', 'theory', '${ASHA}', 'score', 70, 80);
  `);
  state.tenant = (c: { role: string; sub: string; schoolId: string }, fn: (client: unknown) => Promise<unknown>) => as({ role: c.role, user: c.sub, school: c.schoolId }, fn);
}, 120_000);
afterAll(async () => db?.stop());

describe('the plan, without a database', () => {
  it('maps by grade and section, makes a missing class, leaves the top grade, flags a class of no known grade', () => {
    const plan = planPromotion(
      [
        { classId: 'n', name: 'Nursery', grade: 'Nursery', section: null },
        { classId: 'u', name: 'UKG', grade: 'UKG', section: null },
        { classId: '5a', name: '5-A', grade: '5', section: 'A' },
        { classId: '5c', name: '5-C', grade: '5', section: 'C' },
        { classId: '6a', name: '6-A', grade: '6', section: 'A' },
        { classId: 'x', name: 'Choir', grade: null, section: null },
      ],
      [],
      []
    );
    expect(plan.classes.map((c) => [c.name, c.to.kind, 'name' in c.to ? c.to.name : null])).toEqual([
      ['Nursery', 'make', 'LKG'],
      ['UKG', 'make', '1'],
      ['5-A', 'class', '6-A'],
      ['5-C', 'make', '6-C'],
      ['6-A', 'leaving', null],
      ['Choir', 'none', null],
    ]);
  });
});

describe('the dry run', () => {
  it('shows each class and where it goes, with counts; nothing changes', async () => {
    const seen = await read(principal);
    expect(seen.status).toBe(200);
    const p = seen.body.promotion;
    expect([p.from.sessionId, p.to.sessionId, p.alreadyPromoted, p.lastRun]).toEqual([S1, S2, false, null]);
    expect(p.classes.map((c: { name: string; to: { kind: string; name: string | null }; students: unknown[] }) => [c.name, c.to.kind, c.to.name, c.students.length])).toEqual([
      ['5-A', 'class', '6-A', 3],
      ['5-B', 'make', '6-B', 1],
      ['6-A', 'make', '7-A', 1],
      ['12-A', 'leaving', null, 1],
      ['Hobby', 'none', null, 1],
    ]);
    expect(p.toMake).toEqual(['6-B', '7-A']);
    expect(p.counts).toEqual({ promoted: 5, repeated: 0, movedSection: 0, left: 1, undecided: 1 });
    // The school admin reads it too; another school's classes are never in it.
    expect((await read(admin)).body.promotion.classes).toHaveLength(5);
    expect(await where()).toEqual(BEFORE);
  });

  it('a class with no successor blocks the promotion until each of its students is decided', async () => {
    expect(await promoteNow(principal)).toMatchObject({ status: 409, body: { code: 'promotion_students_undecided', undecided: 1 } });
    expect(await asPrincipal(`select count(*)::int as n from promotion_runs`)).toEqual([{ n: 0 }]);
  });

  it('the principal saves overrides with a reason; the list is kept, audited, and shown as exceptions', async () => {
    expect(await override(principal, { studentId: BILAL, decision: 'repeat' })).toMatchObject({ status: 400, body: { code: 'promotion_reason' } });
    expect(await override(principal, { studentId: CHIRAG, decision: 'move_section', reason: 'Asked by parents' })).toMatchObject({ status: 400, body: { code: 'promotion_section' } });
    expect(await override(principal, { studentId: BILAL, decision: 'repeat', reason: 'Card 2345 6789 0124' })).toMatchObject({ status: 400, body: { code: 'promotion_reason_aadhaar' } });
    expect(await override(principal, { studentId: B_KID, decision: 'leave', reason: 'Moving' })).toMatchObject({ status: 404 });
    expect(await override(principal, { studentId: HARI, decision: 'leave', reason: 'Moving' })).toMatchObject({ status: 404 });
    for (const [studentId, decision, extra] of [
      [BILAL, 'repeat', {}],
      [CHIRAG, 'move_section', { toSection: 'b' }],
      [GITA, 'leave', {}],
      [DIVYA, 'leave', {}],
    ] as const)
      expect(await override(principal, { studentId, decision, reason: 'Decided with the parents', ...extra }), studentId).toMatchObject({ status: 200 });
    // Divya's decision is taken back.
    expect(await override(principal, { studentId: DIVYA, decision: 'promote' })).toMatchObject({ status: 200 });
    const p = (await read(principal)).body.promotion;
    const fiveA = p.classes.find((c: { name: string }) => c.name === '5-A').students;
    expect(fiveA.map((s: { name: string; outcome: string; toName: string | null }) => [s.name, s.outcome, s.toName])).toEqual([
      ['Asha Madeup', 'promoted', '6-A'],
      ['Bilal Madeup', 'repeated', '5-A'],
      ['Chirag Madeup', 'moved_section', '6-B'],
    ]);
    expect(p.counts).toEqual({ promoted: 3, repeated: 1, movedSection: 1, left: 2, undecided: 0 });
    expect(await asPrincipal(`select student_id, decision, to_section from promotion_overrides order by student_id`)).toEqual([
      { student_id: BILAL, decision: 'repeat', to_section: null },
      { student_id: CHIRAG, decision: 'move_section', to_section: 'B' },
      { student_id: GITA, decision: 'leave', to_section: null },
    ]);
    expect((await audits('setup.promotion_override_%')).map((a: { event_action: string; target_id: string }) => [a.event_action, a.target_id])).toEqual([
      ['setup.promotion_override_set', BILAL],
      ['setup.promotion_override_set', CHIRAG],
      ['setup.promotion_override_set', GITA],
      ['setup.promotion_override_set', DIVYA],
      ['setup.promotion_override_cleared', DIVYA],
    ]);
  });
});

describe('who may', () => {
  it('a teacher is refused by the route and by the database; the school admin reads but does not promote', async () => {
    expect((await read(tara)).status).toBe(403);
    expect((await promoteNow(tara)).status).toBe(403);
    expect((await undo(tara)).status).toBe(403);
    expect((await override(tara, { studentId: ASHA, decision: 'repeat', reason: 'x' })).status).toBe(403);
    expect((await promoteNow(admin)).status).toBe(403);
    expect((await override(admin, { studentId: ASHA, decision: 'repeat', reason: 'x' })).status).toBe(403);
    expect((await run(tara, `select * from promotion_overrides`)).rows).toEqual([]);
    await expect(run(tara, `insert into promotion_runs (school_id, action, from_session_id, to_session_id, actor_user_id) values ($1, 'promoted', $2, $3, $4)`, [A, S1, S2, TARA])).rejects.toThrow();
    await expect(run(admin, `insert into promotion_runs (school_id, action, from_session_id, to_session_id, actor_user_id) values ($1, 'promoted', $2, $3, $4)`, [A, S1, S2, ADMIN])).rejects.toThrow();
    await expect(run(admin, `insert into promotion_overrides (school_id, from_session_id, student_id, decision, reason, set_by) values ($1, $2, $3, 'leave', 'x', $4)`, [A, S1, ASHA, ADMIN])).rejects.toThrow();
  });
});

describe('the promotion and its undo', () => {
  let runId = '';
  it('moves every student, makes the missing classes, re-tags the rest, marks leavers, writes events, makes the new session current', async () => {
    const done = await promoteNow(principal);
    expect(done.status).toBe(200);
    runId = done.body.runId;
    expect(done.body).toMatchObject({ classesMade: 2, counts: { promoted: 3, repeated: 1, movedSection: 1, left: 2, undecided: 0 } });
    expect(await where()).toEqual({
      [ASHA]: '6-A|active',
      [BILAL]: '5-A|active',
      [CHIRAG]: '6-B|active',
      [DIVYA]: '6-B|active',
      [ESHA]: '7-A|pending_consent',
      [FARAH]: '12-A|inactive|left',
      [GITA]: 'Hobby|inactive|left',
      [HARI]: '5-A|inactive',
    });
    // A student who changed class starts it with no roll number (Asha's 1 would clash in 6-A); one kept back keeps it.
    expect(await owner(`select student_id, roll_no from students where student_id = any ($1::uuid[]) order by student_id`, [[ASHA, BILAL]])).toEqual([
      { student_id: ASHA, roll_no: null },
      { student_id: BILAL, roll_no: '2' },
    ]);
    // Every class of the school is now the new session's; the class teacher stays; another school is untouched.
    expect(await owner(`select name, session_id, class_teacher_id from classes where school_id = $1 order by name`, [A])).toEqual([
      { name: '12-A', session_id: S2, class_teacher_id: null },
      { name: '5-A', session_id: S2, class_teacher_id: TARA },
      { name: '5-B', session_id: S2, class_teacher_id: null },
      { name: '6-A', session_id: S2, class_teacher_id: null },
      { name: '6-B', session_id: S2, class_teacher_id: null },
      { name: '7-A', session_id: S2, class_teacher_id: null },
      { name: 'Hobby', session_id: S2, class_teacher_id: null },
    ]);
    expect(await owner(`select session_id from classes where school_id = $1`, [B])).toEqual([{ session_id: B_S1 }]);
    expect(await owner(`select status::text as status from students where student_id = $1`, [B_KID])).toEqual([{ status: 'active' }]);
    expect(await current()).toBe(S2);
    const events = await asPrincipal(`select outcome, student_id, reason, actor_user_id from promotion_events where run_id = $1 and student_id is not null order by student_id`, [runId]);
    expect(events.map((e: { outcome: string; student_id: string; reason: string | null }) => [e.student_id, e.outcome, e.reason])).toEqual([
      [ASHA, 'promoted', null],
      [BILAL, 'repeated', 'Decided with the parents'],
      [CHIRAG, 'moved_section', 'Decided with the parents'],
      [DIVYA, 'promoted', null],
      [ESHA, 'promoted', null],
      [FARAH, 'left', null],
      [GITA, 'left', 'Decided with the parents'],
    ]);
    expect(events.every((e: { actor_user_id: string }) => e.actor_user_id === PRINCIPAL)).toBe(true);
    expect(await audits('setup.promotion_done')).toEqual([
      { event_action: 'setup.promotion_done', actor_user_id: PRINCIPAL, target_id: runId, after_state: { session_id: S2, promoted: 3, repeated: 1, moved_section: 1, left: 2, classes_made: 2 } },
    ]);
  });

  it('keeps the old session’s attendance and marks as they were; promoting twice is refused', async () => {
    expect(await attendance()).toEqual([
      { student_id: ASHA, class_id: C5A, date: '2026-03-10', status: 'present' },
      { student_id: FARAH, class_id: C12A, date: '2026-03-10', status: 'absent' },
    ]);
    expect(await owner(`select student_id, exam_id, score::int as score from marks where school_id = $1`, [A])).toEqual([{ student_id: ASHA, exam_id: EXAM, score: 70 }]);
    // The dry run now shows the promotion and how long it can be undone.
    const p = (await read(principal)).body.promotion;
    expect(p.lastRun).toMatchObject({ runId, fromLabel: '2025-26', toLabel: '2026-27', canUndo: true });
    expect(p.to).toBeNull();
    expect(await promoteNow(principal)).toMatchObject({ status: 409, body: { code: 'promotion_no_next_session' } });
  });

  it('its history is never edited, not even by the owner', async () => {
    await expect(run(principal, `update promotion_events set reason = 'changed' where run_id = $1`, [runId])).rejects.toThrow();
    await expect(run(principal, `delete from promotion_runs where run_id = $1`, [runId])).rejects.toThrow();
    // The owner, in the school's tenant, is stopped by the trigger.
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db.pg.transaction(async (tx: any) => {
        await tx.query(`select set_config('app.current_tenant_id', $1, true), set_config('app.current_role', 'principal', true)`, [A]);
        await tx.query(`update promotion_events set reason = 'changed' where run_id = $1`, [runId]);
      })
    ).rejects.toThrow(/never changed/);
  });

  it('undo within 24 hours restores every student, class and the current session, and is audited', async () => {
    expect((await undo(admin)).status).toBe(403);
    const done = await undo(principal);
    expect(done).toMatchObject({ status: 200, body: { restored: 6, classesRemoved: 2 } });
    expect(await where()).toEqual(BEFORE);
    expect(await owner(`select roll_no from students where student_id = $1`, [ASHA])).toEqual([{ roll_no: '1' }]);
    expect(await owner(`select name, session_id from classes where school_id = $1 order by name`, [A])).toEqual([
      { name: '12-A', session_id: S1 },
      { name: '5-A', session_id: S1 },
      { name: '5-B', session_id: S1 },
      { name: '6-A', session_id: S1 },
      { name: 'Hobby', session_id: null },
    ]);
    expect(await current()).toBe(S1);
    expect(await attendance()).toHaveLength(2);
    expect(await asPrincipal(`select count(*)::int as n from promotion_events where run_id = $1 and outcome = 'undone'`, [done.body.runId])).toEqual([{ n: 6 }]);
    expect((await audits('setup.promotion_undone')).map((a: { target_id: string; actor_user_id: string }) => [a.target_id, a.actor_user_id])).toEqual([[runId, PRINCIPAL]]);
    expect(await undo(principal)).toMatchObject({ status: 404, body: { code: 'promotion_nothing_to_undo' } });
  });

  it('after 24 hours the promotion is final', async () => {
    const again = await promoteNow(principal);
    expect(again.status).toBe(200);
    // The run is made a day and a minute old (as the owner, with its guard lifted for this step only).
    await db.pg.exec(`alter table promotion_runs disable trigger promotion_runs_fixed;
      alter table promotion_runs no force row level security;
      update promotion_runs set created_at = now() - interval '24 hours 1 minute' where run_id = '${again.body.runId}';
      alter table promotion_runs force row level security;
      alter table promotion_runs enable trigger promotion_runs_fixed;`);
    expect(await undo(principal)).toMatchObject({ status: 409, body: { code: 'promotion_undo_too_late' } });
    expect((await read(principal)).body.promotion.lastRun).toMatchObject({ runId: again.body.runId, canUndo: false });
    expect((await where())[ASHA]).toBe('6-A|active');
  });
});
