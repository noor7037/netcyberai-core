import { readFileSync } from 'fs';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { configuredProvider, standInProvider, type AIProvider, type DraftRequest } from '@/lib/ai/provider';
import { approveNote, copilotState, draft, listNotes, usedThisMonth } from '@/lib/copilot/copilot';

// Teacher Copilot v1 (docs/20 5h, C154), with the stand-in provider, on the
// whole real schema as app_user.

const A = 'ac000000-0000-4000-8000-000000000001';
const B = 'ac000000-0000-4000-8000-000000000002';
const PRINCIPAL = 'ac000000-0000-4000-8000-0000000000a1';
const T1 = 'ac000000-0000-4000-8000-0000000000a2';
const T2 = 'ac000000-0000-4000-8000-0000000000a3';
const ACCOUNTANT = 'ac000000-0000-4000-8000-0000000000a4';
const PRINCIPAL_B = 'ac000000-0000-4000-8000-0000000000b1';
const C5 = 'ac000000-0000-4000-8000-0000000000c1';
const C6 = 'ac000000-0000-4000-8000-0000000000c2';
const MATHS = 'ac000000-0000-4000-8000-0000000000d1';
const UNIT = 'ac000000-0000-4000-8000-0000000000e1';
const UNIT_6 = 'ac000000-0000-4000-8000-0000000000e2';

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
// A provider that records exactly what it was sent.
function recording(): AIProvider & { seen: DraftRequest[] } {
  const seen: DraftRequest[] = [];
  return { name: 'recording', seen, draft: async (r) => (seen.push(r), standInProvider.draft(r)) };
}
const ask = (who: Who, provider: AIProvider | null, more = {}) => as(who, (c) => draft(c, provider, actor(who), { kind: 'lesson_plan', classId: C5, subjectId: MATHS, unitId: UNIT, ...more }));
const switchOn = (school: string, limits: object | null) =>
  db.pg.query(`insert into school_module_entitlements (school_id, module_id, enabled, source, limits) values ($1, 'teacher-copilot', true, 'founder_override', $2::jsonb) on conflict (school_id, module_id) do update set enabled = true, limits = excluded.limits`, [school, JSON.stringify(limits ?? {})]);

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction) values ('${A}', 'School A', 'IN-HR'), ('${B}', 'School B', 'IN-DL');
    insert into users (user_id, school_id, email, phone, role, display_name) values
      ('${PRINCIPAL}', '${A}', 'p@a.invalid', null, 'principal', 'Principal Pushpa'), ('${T1}', '${A}', 'tarun.teacher@a.invalid', '9811111111', 'teacher', 'Tarun Teacher'),
      ('${T2}', '${A}', 't2@a.invalid', null, 'teacher', 'Teacher Two'), ('${ACCOUNTANT}', '${A}', 'acc@a.invalid', null, 'accountant', 'Accountant'),
      ('${PRINCIPAL_B}', '${B}', 'p@b.invalid', null, 'principal', 'Principal B');
    insert into classes (class_id, school_id, name, grade, section, class_teacher_id) values ('${C5}', '${A}', '5-A', '5', 'A', '${T1}'), ('${C6}', '${A}', '6-A', null, null, '${T2}');
    insert into subjects (subject_id, school_id, name) values ('${MATHS}', '${A}', 'Maths');
    insert into syllabus_units (unit_id, school_id, class_id, subject_id, position, chapter, topic) values
      ('${UNIT}', '${A}', '${C5}', '${MATHS}', 1, 'Fractions', 'Comparing two fractions'), ('${UNIT_6}', '${A}', '${C6}', '${MATHS}', 1, 'Integers', 'Negative numbers');
    insert into students (school_id, admission_no, name, class_id) values ('${A}', 'A-1', 'Zubeida Qureshi', '${C5}'), ('${A}', 'A-2', 'Xavier Fernandes', '${C5}');
    insert into parents (school_id, name, phone) values ('${A}', 'Wahida Qureshi', '9822222222');
  `);
}, 120_000);
afterAll(async () => {
  await db?.stop();
});

describe('switched off until the founder switches it on', () => {
  it('no provider answers in a production build, and the stand-in only when asked for outside one', () => {
    expect(configuredProvider({ NODE_ENV: 'production', AI_PROVIDER: 'stand-in' })).toBeNull();
    expect(configuredProvider({ NODE_ENV: 'production' })).toBeNull();
    expect(configuredProvider({ NODE_ENV: 'development' })).toBeNull();
    expect(configuredProvider({ NODE_ENV: 'development', AI_PROVIDER: 'stand-in' })?.name).toBe('stand-in');
  });

  it('it is off for every school: the module is not switched on, then no limit is set, then no provider; each says why, and nothing is asked or metered', async () => {
    const provider = recording();
    expect(await as(t1, (c) => copilotState(c, A, provider))).toEqual({ on: false, why: 'module_off' });
    expect(await ask(t1, provider)).toEqual({ ok: false, reason: 'off', why: 'module_off' });
    await switchOn(A, null);
    expect(await ask(t1, provider)).toEqual({ ok: false, reason: 'off', why: 'no_limit' });
    await switchOn(A, { monthly_tokens: 0 });
    expect(await ask(t1, provider)).toEqual({ ok: false, reason: 'off', why: 'no_limit' });
    await switchOn(A, { monthly_tokens: 400 });
    expect(await ask(t1, null)).toEqual({ ok: false, reason: 'off', why: 'no_provider' });
    expect(provider.seen).toEqual([]);
    expect((await db.pg.query(`select 1 from ai_usage`)).rows).toEqual([]);
    // The migration switches no school on.
    expect(readFileSync(path.resolve(__dirname, '../../supabase/migrations/20261013090000_p2_teacher_copilot.sql'), 'utf8')).not.toMatch(/insert into school_module_entitlements/);
  });
});

describe('a draft', () => {
  it('appears from the syllabus map, and what is sent to the provider holds no student, guardian or teacher', async () => {
    const provider = recording();
    const result = await ask(t1, provider, { minutes: 35 });
    expect(result).toMatchObject({ ok: true, limit: 400 });
    if (!result.ok) throw new Error('unreachable');
    expect(result.text).toContain('Comparing two fractions');
    expect(result.text).toContain('Lesson plan (35 minutes)');
    // Exactly these fields, and nothing else, went through the door.
    expect(provider.seen).toEqual([{ kind: 'lesson_plan', classLevel: '5', subject: 'Maths', chapter: 'Fractions', topic: 'Comparing two fractions', minutes: 35 }]);
    const sent = JSON.stringify(provider.seen);
    for (const personal of ['Zubeida', 'Qureshi', 'Xavier', 'Fernandes', 'Wahida', 'Tarun', 'Pushpa', '98111', '98222', '@a.invalid', 'A-1', '5-A', A, T1, C5]) expect(sent, personal).not.toContain(personal);
    // The class level is the grade, or the number in the class's name; never the section.
    const six = recording();
    await as(t2, (c) => draft(c, six, actor(t2), { kind: 'worksheet', classId: C6, subjectId: MATHS, unitId: UNIT_6, questions: 4 }));
    expect(six.seen).toEqual([{ kind: 'worksheet', classLevel: '6', subject: 'Maths', chapter: 'Integers', topic: 'Negative numbers', questions: 4 }]);
  });

  it('is metered per school with who, what kind, how many tokens and when; never the prompt or the draft', async () => {
    const cols = (await db.pg.query(`select column_name from information_schema.columns where table_name = 'ai_usage' order by ordinal_position`)).rows.map((r: { column_name: string }) => r.column_name);
    expect(cols).toEqual(['usage_id', 'school_id', 'user_id', 'kind', 'tokens_in', 'tokens_out', 'created_at']);
    const rows = (await db.pg.query(`select user_id, kind, tokens_in > 0 as counted_in, tokens_out > 0 as counted_out from ai_usage order by created_at`)).rows;
    expect(rows).toEqual([{ user_id: T1, kind: 'lesson_plan', counted_in: true, counted_out: true }, { user_id: T2, kind: 'worksheet', counted_in: true, counted_out: true }]);
    expect(await as(principal, (c) => usedThisMonth(c, A))).toBeGreaterThan(0);
    // The leadership reads the school's use; a teacher only their own; another school none.
    const seen = (who: Who) => as(who, (c) => c.query(`select 1 from ai_usage`).then((r: { rows: unknown[] }) => r.rows.length));
    expect([await seen(principal), await seen(t1), await seen(t2), await seen(principalB)]).toEqual([2, 1, 1, 0]);
    await expect(as(t1, (c) => c.query(`insert into ai_usage (school_id, user_id, kind, tokens_in, tokens_out) values ($1, $2, 'worksheet', 1, 1)`, [A, T2]))).rejects.toThrow(/row-level security/);
  });

  it('a teacher drafts only from their own classes’ map; other roles cannot draft', async () => {
    const provider = recording();
    expect(await as(t1, (c) => draft(c, provider, actor(t1), { kind: 'worksheet', classId: C6, subjectId: MATHS, unitId: UNIT_6 }))).toEqual({ ok: false, reason: 'unknown_topic' });
    expect(await ask(accountant, provider)).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await as(principalB, (c) => draft(c, provider, actor(principalB), { kind: 'lesson_plan', classId: C5, subjectId: MATHS, unitId: UNIT }))).toMatchObject({ ok: false });
    expect(provider.seen).toEqual([]);
  });

  it('a school over its monthly limit is refused, and nothing more is asked', async () => {
    await switchOn(A, { monthly_tokens: 1 });
    const provider = recording();
    expect(await ask(t1, provider)).toEqual({ ok: false, reason: 'over_limit' });
    expect(provider.seen).toEqual([]);
    await switchOn(A, { monthly_tokens: 100000 });
    expect((await ask(t1, provider)).ok).toBe(true);
    // Last month's use does not count against this month.
    await db.pg.query(`update ai_usage set created_at = created_at - interval '40 days'`);
    expect(await as(principal, (c) => usedThisMonth(c, A))).toBe(0);
  });
});

describe('nothing is kept until the teacher approves', () => {
  it('a draft saves nothing; approving saves the words as the teacher left them, marked AI-assisted, under the teacher’s name', async () => {
    const provider = recording();
    const drafted = await ask(t1, provider);
    expect((await db.pg.query(`select 1 from teaching_notes`)).rows).toEqual([]);
    if (!drafted.ok) throw new Error('unreachable');
    const edited = `${drafted.text}\n6. Use paper strips for the comparison.`;
    const saved = await as(t1, (c) => approveNote(c, actor(t1), { kind: 'lesson_plan', classId: C5, subjectId: MATHS, unitId: UNIT, body: edited }));
    expect(saved).toMatchObject({ ok: true });
    expect((await db.pg.query(`select kind, title, body, ai_assisted, approved_by, unit_id from teaching_notes`)).rows).toEqual([{ kind: 'lesson_plan', title: 'Fractions: Comparing two fractions', body: edited, ai_assisted: true, approved_by: T1, unit_id: UNIT }]);
    expect((await db.pg.query(`select actor_user_id, after_state from audit_log where school_id = $1 and event_action = 'copilot.approved'`, [A])).rows).toEqual([{ actor_user_id: T1, after_state: { kind: 'lesson_plan', unitId: UNIT, aiAssisted: true } }]);
    expect(await as(t1, (c) => approveNote(c, actor(t1), { kind: 'lesson_plan', classId: C5, subjectId: MATHS, unitId: UNIT, body: '   ' }))).toEqual({ ok: false, reason: 'empty' });
    expect(await as(t1, (c) => approveNote(c, actor(t1), { kind: 'lesson_plan', classId: C5, subjectId: MATHS, unitId: UNIT, body: 'x'.repeat(8001) }))).toEqual({ ok: false, reason: 'too_long' });
  });

  it('saved notes are for the class’s teacher and the office; nobody approves in another’s name', async () => {
    expect((await as(t1, (c) => listNotes(c, A))).map((n) => [n.class_name, n.kind, n.ai_assisted])).toEqual([['5-A', 'lesson_plan', true]]);
    expect(await as(t2, (c) => listNotes(c, A))).toEqual([]);
    expect(await as(principal, (c) => listNotes(c, A))).toHaveLength(1);
    expect(await as(accountant, (c) => c.query(`select 1 from teaching_notes`).then((r: { rows: unknown[] }) => r.rows))).toEqual([]);
    expect(await as(t2, (c) => approveNote(c, actor(t2), { kind: 'worksheet', classId: C5, subjectId: MATHS, unitId: UNIT, body: 'x' }))).toEqual({ ok: false, reason: 'unknown_topic' });
    await expect(as(t1, (c) => c.query(`insert into teaching_notes (school_id, class_id, subject_id, kind, title, body, ai_assisted, approved_by) values ($1, $2, $3, 'worksheet', 't', 'b', true, $4)`, [A, C5, MATHS, T2]))).rejects.toThrow(/row-level security/);
    expect((await db.pg.query(`select table_name from information_schema.role_table_grants where table_name in ('ai_usage', 'teaching_notes') and grantee in ('anon', 'authenticated', 'PUBLIC')`)).rows).toEqual([]);
  });

  it('remarks about a student are not a kind of draft', () => {
    const provider = readFileSync(path.resolve(__dirname, '../../src/lib/ai/provider.ts'), 'utf8');
    expect(provider).toContain(`export const DRAFT_KINDS = ['lesson_plan', 'worksheet', 'pulse_message'] as const;`);
    // The request type has these fields and no other: none can hold a person.
    const fields = [...provider.match(/export type DraftRequest = \{([\s\S]*?)\n\};/)![1].matchAll(/^\s+(\w+)\??:/gm)].map((m) => m[1]);
    expect(fields).toEqual(['kind', 'classLevel', 'subject', 'chapter', 'topic', 'minutes', 'questions']);
  });
});
