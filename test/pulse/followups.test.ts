import { readFileSync } from 'fs';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { createFollowup, decideFollowup, listFollowups } from '@/lib/pulse/followups';

// The "needs help" queue (D6, C148), on the whole real schema as app_user.

const A = 'a8000000-0000-4000-8000-000000000001';
const B = 'a8000000-0000-4000-8000-000000000002';
const PRINCIPAL = 'a8000000-0000-4000-8000-0000000000a1';
const T1 = 'a8000000-0000-4000-8000-0000000000a2'; // class teacher of 5-A
const T2 = 'a8000000-0000-4000-8000-0000000000a3'; // class teacher of 6-A
const ACCOUNTANT = 'a8000000-0000-4000-8000-0000000000a4';
const PRINCIPAL_B = 'a8000000-0000-4000-8000-0000000000b1';
const C5 = 'a8000000-0000-4000-8000-0000000000c1';
const C6 = 'a8000000-0000-4000-8000-0000000000c2';
const sid = (n: number) => `a8000000-0000-4000-8000-0000005000${String(n).padStart(2, '0')}`;
const S = { asha: sid(1), bilal: sid(2), sixth: sid(10) };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string; school: string };
const principal: Who = { role: 'principal', user: PRINCIPAL, school: A };
const t1: Who = { role: 'teacher', user: T1, school: A };
const t2: Who = { role: 'teacher', user: T2, school: A };
const accountant: Who = { role: 'accountant', user: ACCOUNTANT, school: A };
const principalB: Who = { role: 'principal', user: PRINCIPAL_B, school: B };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const as = <T>(who: Who, fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    await tx.query(`select set_config('app.current_tenant_id', $1, true)`, [who.school]);
    await tx.query(`select set_config('app.current_role', $1, true)`, [who.role]);
    await tx.query(`select set_config('app.current_user_id', $1, true)`, [who.user]);
    return fn(tx);
  });
const actor = (who: Who) => ({ schoolId: who.school, userId: who.user, role: who.role as never });
const open = (who: Who, studentId: string, kind: 'did_not_understand' | 'homework_help' | 'missed_class' | 'other' = 'did_not_understand', reason: string | null = 'Fractions on the number line') => as(who, (c) => createFollowup(c, actor(who), { studentId, kind, reason }));
const queue = (who: Who) => as(who, (c) => listFollowups(c, who.school));
const audits = async () => (await db.pg.query(`select event_action, actor_user_id, after_state from audit_log where school_id = $1 and event_action like 'followup.%' order by audit_id`, [A])).rows;

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction) values ('${A}', 'School A', 'IN-HR'), ('${B}', 'School B', 'IN-DL');
    insert into users (user_id, school_id, email, role, display_name) values
      ('${PRINCIPAL}', '${A}', 'p@a.invalid', 'principal', 'Principal A'), ('${T1}', '${A}', 't1@a.invalid', 'teacher', 'Teacher One'), ('${T2}', '${A}', 't2@a.invalid', 'teacher', 'Teacher Two'),
      ('${ACCOUNTANT}', '${A}', 'acc@a.invalid', 'accountant', 'Accountant'), ('${PRINCIPAL_B}', '${B}', 'p@b.invalid', 'principal', 'Principal B');
    insert into classes (class_id, school_id, name, class_teacher_id) values ('${C5}', '${A}', '5-A', '${T1}'), ('${C6}', '${A}', '6-A', '${T2}');
    insert into students (student_id, school_id, admission_no, name, class_id) values
      ('${S.asha}', '${A}', 'A-1', 'Asha', '${C5}'), ('${S.bilal}', '${A}', 'A-2', 'Bilal', '${C5}'), ('${S.sixth}', '${A}', 'A-10', 'Sixth', '${C6}');
  `);
}, 120_000);
afterAll(async () => {
  await db?.stop();
});

describe('the "needs help" queue', () => {
  it('a teacher adds a student of their own class; asking twice shows the item that is there', async () => {
    const first = await open(t1, S.asha);
    expect(first).toMatchObject({ ok: true, already: false, followup: { student_name: 'Asha', class_name: '5-A', kind: 'did_not_understand', reason: 'Fractions on the number line', source: 'staff', status: 'open', outcome: null } });
    const again = await open(t1, S.asha, 'did_not_understand', 'again');
    if (!first.ok || !again.ok) throw new Error('unreachable');
    expect(again).toMatchObject({ already: true });
    expect(again.followup.followup_id).toBe(first.followup.followup_id);
    // Another kind of need for the same student is its own item.
    expect(await open(t1, S.asha, 'homework_help', null)).toMatchObject({ ok: true, already: false });
    expect((await queue(t1)).open).toHaveLength(2);
  });

  it('the queue is in the order items arrived, never by any score of the child', async () => {
    await open(principal, S.sixth, 'missed_class', null);
    await open(t1, S.bilal, 'other', 'Asked for extra reading');
    const names = (await queue(principal)).open.map((f) => f.student_name);
    expect(names).toEqual(['Asha', 'Asha', 'Sixth', 'Bilal']);
    const src = readFileSync(path.resolve(__dirname, '../../src/lib/pulse/followups.ts'), 'utf8');
    expect(src).toContain(`order by f.created_at, f.followup_id`);
    expect(src).not.toMatch(/score|rank\b/i);
  });

  it('a teacher sees and acts on their own classes only; the office sees all; other roles and schools see nothing', async () => {
    expect((await queue(t1)).open.map((f) => f.class_name)).toEqual(['5-A', '5-A', '5-A']);
    expect((await queue(t2)).open.map((f) => f.student_name)).toEqual(['Sixth']);
    expect((await queue(principal)).open).toHaveLength(4);
    expect(await as(accountant, (c) => c.query(`select 1 from pulse_followups`).then((r: { rows: unknown[] }) => r.rows))).toEqual([]);
    expect(await as(principalB, (c) => c.query(`select 1 from pulse_followups`).then((r: { rows: unknown[] }) => r.rows))).toEqual([]);
    // A teacher cannot add a student of another class, or decide another class's item.
    expect(await open(t2, S.asha)).toEqual({ ok: false, reason: 'unknown_student' });
    const ashas = (await queue(t1)).open[0];
    expect(await as(t2, (c) => decideFollowup(c, actor(t2), ashas.followup_id, { status: 'done', outcome: 'x' }))).toEqual({ ok: false, reason: 'not_found' });
    expect(await open(accountant, S.asha)).toEqual({ ok: false, reason: 'not_allowed' });
    // The database refuses it directly too.
    await expect(as(t2, (c) => c.query(`insert into pulse_followups (school_id, student_id, class_id, kind, created_by) values ($1, $2, $3, 'other', $4)`, [A, S.asha, C5, T2]))).rejects.toThrow(/row-level security/);
    await expect(as(accountant, (c) => c.query(`insert into pulse_followups (school_id, student_id, class_id, kind, created_by) values ($1, $2, $3, 'other', $4)`, [A, S.asha, C5, ACCOUNTANT]))).rejects.toThrow(/row-level security/);
  });

  it('an item moves open → done or not needed only with an outcome, once, and every move is audited', async () => {
    const [first, second] = (await queue(t1)).open;
    expect(await as(t1, (c) => decideFollowup(c, actor(t1), first.followup_id, { status: 'done', outcome: '   ' }))).toEqual({ ok: false, reason: 'outcome_required' });
    const done = await as(t1, (c) => decideFollowup(c, actor(t1), first.followup_id, { status: 'done', outcome: 'Sat with her for ten minutes after class; she can place halves and quarters now' }));
    expect(done).toMatchObject({ ok: true, followup: { status: 'done', outcome: 'Sat with her for ten minutes after class; she can place halves and quarters now' } });
    expect(await as(principal, (c) => decideFollowup(c, actor(principal), second.followup_id, { status: 'not_needed', outcome: 'Homework was not set that day' }))).toMatchObject({ ok: true, followup: { status: 'not_needed' } });
    // Decided once: it cannot be decided again.
    expect(await as(t1, (c) => decideFollowup(c, actor(t1), first.followup_id, { status: 'not_needed', outcome: 'changed my mind' }))).toEqual({ ok: false, reason: 'not_found' });
    const q = await queue(t1);
    expect(q.open.map((f) => f.student_name)).toEqual(['Bilal']);
    expect(q.decided.map((f) => f.status).sort()).toEqual(['done', 'not_needed']);
    // The database holds the rule too: no decided item without an outcome and a decider.
    await expect(db.pg.query(`update pulse_followups set status = 'done' where status = 'open'`)).rejects.toThrow(/check/);
    const log = await audits();
    expect(log.map((a: { event_action: string }) => a.event_action)).toEqual(['followup.opened', 'followup.opened', 'followup.opened', 'followup.opened', 'followup.done', 'followup.not_needed']);
    expect(log[4]).toMatchObject({ actor_user_id: T1, after_state: { status: 'done', studentId: S.asha, kind: 'did_not_understand' } });
    // A new need after the old one was closed is a new item.
    expect(await open(t1, S.asha)).toMatchObject({ ok: true, already: false });
  });

  it('Daily Pulse is switched on for every existing school, once; public roles have no access', async () => {
    const statement = readFileSync(path.resolve(__dirname, '../../supabase/migrations/20261012110000_p2_pulse_followups.sql'), 'utf8').match(/insert into school_module_entitlements[\s\S]*?;/)![0];
    await db.pg.query(`insert into school_module_entitlements (school_id, module_id, enabled, source) values ($1, 'pulse', false, 'founder_override')`, [B]);
    await db.pg.exec(statement);
    await db.pg.exec(statement);
    expect((await db.pg.query(`select school_id, enabled, source from school_module_entitlements where module_id = 'pulse' order by school_id`)).rows).toEqual([{ school_id: A, enabled: true, source: 'plan' }, { school_id: B, enabled: false, source: 'founder_override' }]);
    expect((await db.pg.query(`select grantee from information_schema.role_table_grants where table_name = 'pulse_followups' and grantee in ('anon', 'authenticated', 'PUBLIC')`)).rows).toEqual([]);
  });
});
