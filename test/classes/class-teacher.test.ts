import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { CHECKS } from '@/lib/auditor/checks';
import { CHECK_META, isAppAddress } from '@/lib/auditor/rules';
import { setClassTeacher } from '@/lib/classes/class-teacher';
import { MODULE_REGISTRY } from '@/lib/contracts/modules';
import { t } from '@/lib/i18n';
import { indiaDate } from '@/lib/time/india';

// The class teacher of a class that already exists (C210). The acceptance test: "The principal sets or clears a
// class's class teacher on the Classes screen and the auditor's check opens it." Proven on the whole schema as the
// app's own database role, through the app's route and by going to the database directly. Every name is made up.

const state = vi.hoisted(() => ({ claims: null as unknown, tenant: null as unknown }));
vi.mock('@/lib/auth/require-session', () => ({ requireSession: async () => state.claims }));
vi.mock('@/lib/auth/server-session', () => ({ getServerSession: async () => state.claims }));
vi.mock('@/lib/auth/db', async (original) => ({
  ...(await original<typeof import('@/lib/auth/db')>()),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withTenantContext: (claims: any, fn: any) => (state.tenant as any)(claims, fn),
}));
vi.mock('@/lib/frameworks/page-access', () => ({ moduleOffReason: async () => null }));

import { GET as listClasses, POST as addClass } from '@/app/api/app/classes/route';
import { PATCH as changeClass } from '@/app/api/app/classes/[classId]/route';
import StudentsPage from '@/app/(school)/app/students/page';

const A = 'c7000000-0000-4000-8000-000000000001';
const B = 'c7000000-0000-4000-8000-000000000002';
const u = (n: number) => `c7000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const [PRINCIPAL, ADMIN, TARA, TARUN, LATA, ACCOUNTANT, COORDINATOR, B_TEACHER, B_PRINCIPAL] = [u(11), u(12), u(13), u(14), u(15), u(16), u(17), u(18), u(19)];
const [C5A, C6B, C7C, B_CLASS] = [u(51), u(52), u(53), u(54)];
type Who = { role: string; user: string; school?: string };
const principal: Who = { role: 'principal', user: PRINCIPAL };
const admin: Who = { role: 'school_admin', user: ADMIN };
const tara: Who = { role: 'teacher', user: TARA };
const accountant: Who = { role: 'accountant', user: ACCOUNTANT };
const coordinator: Who = { role: 'academic_coordinator', user: COORDINATOR };
const bPrincipal: Who = { role: 'principal', user: B_PRINCIPAL, school: B };
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
type Out = { rows: { n: number }[]; rowCount: number };
const teacherOf = async (classId: string): Promise<string | null> => (await db.pg.query(`select class_teacher_id from classes where class_id = $1`, [classId])).rows[0].class_teacher_id;
const audits = async (classId: string) =>
  (await db.pg.query(`select actor_user_id, actor_role::text as role, before_state, after_state from audit_log where event_action = 'class.class_teacher' and target_id = $1 order by occurred_at, audit_id`, [classId])).rows;
const claims = (who: Who) => ({ sub: who.user, role: who.role, schoolId: who.school ?? A, membershipId: u(90), tokenVersion: 0, aal: 'aal1', sessionId: u(91) });
const call = async (who: Who, fn: () => Promise<Response>) => {
  state.claims = claims(who);
  const res = await fn();
  return { status: res.status, body: await res.json() };
};
const patch = (who: Who, classId: string, body: unknown) =>
  call(who, () => changeClass(new NextRequest(`http://localhost/api/app/classes/${classId}`, { method: 'PATCH', body: JSON.stringify(body) }), { params: { classId } }));
const actor = (who: Who) => ({ schoolId: who.school ?? A, userId: who.user, role: who.role as never });
const classTeacherCheck = (who: Who = principal) =>
  as(who, (c) =>
    CHECKS.find((x) => x.id === 'class_teacher')!.run(c, {
      schoolId: A,
      userId: who.user,
      role: who.role as never,
      today: indiaDate(),
      fact: async () => {
        throw new Error('the class-teacher check asks no fact');
      },
      calendar: async () => {
        throw new Error('the class-teacher check reads no calendar');
      },
    })
  );

describe('the class teacher of a class, on the whole schema', () => {
  beforeAll(async () => {
    db = await startHarnessDb({ port: 0 });
    await db.pg.exec(`
      insert into schools (school_id, name, jurisdiction) values ('${A}', 'School A', 'IN-HR'), ('${B}', 'School B', 'IN-DL');
      insert into users (user_id, school_id, email, role, display_name, is_active) values
        ('${PRINCIPAL}', '${A}', 'principal@school-a.example', 'principal', 'Priya Principal', true), ('${ADMIN}', '${A}', 'admin@school-a.example', 'school_admin', 'Asif Admin', true),
        ('${TARA}', '${A}', 'tara@school-a.example', 'teacher', 'Tara Teacher', true), ('${TARUN}', '${A}', 'tarun@school-a.example', 'teacher', 'Tarun Teacher', true),
        ('${LATA}', '${A}', 'lata@school-a.example', 'teacher', 'Lata Left', false), ('${ACCOUNTANT}', '${A}', 'accounts@school-a.example', 'accountant', 'Anil Accountant', true),
        ('${COORDINATOR}', '${A}', 'coordinator@school-a.example', 'academic_coordinator', 'Chitra Coordinator', true),
        ('${B_TEACHER}', '${B}', 'teacher@school-b.example', 'teacher', 'Bina Teacher', true), ('${B_PRINCIPAL}', '${B}', 'principal@school-b.example', 'principal', 'Bela Principal', true);
      insert into school_module_entitlements (school_id, module_id, enabled, source)
        select s, m, true, 'plan' from unnest(array['${A}', '${B}']::uuid[]) s, unnest(array[${MODULE_REGISTRY.map((m) => `'${m.id}'`).join(', ')}]) m on conflict (school_id, module_id) do update set enabled = true;
      insert into classes (class_id, school_id, name, grade, section, class_teacher_id) values
        ('${C5A}', '${A}', '5-A', '5', 'A', '${TARA}'), ('${C6B}', '${A}', '6-B', '6', 'B', null), ('${C7C}', '${A}', '7-C', '7', 'C', null), ('${B_CLASS}', '${B}', '9-Z', '9', 'Z', '${B_TEACHER}');
    `);
    state.tenant = (c: { role: string; sub: string; schoolId: string }, fn: (client: unknown) => Promise<unknown>) => as({ role: c.role, user: c.sub, school: c.schoolId }, fn);
  }, 120_000);
  afterAll(async () => db?.stop());

  it('the migration is the narrow one the slice needs: write policies for the office and the class-teacher rule, nothing dropped', () => {
    const dir = path.join(__dirname, '../../supabase/migrations');
    const sql = readFileSync(path.join(dir, readdirSync(dir).find((f) => f.endsWith('_c210_class_teacher.sql'))!), 'utf8');
    for (const policy of ['classes_added_by_office', 'classes_changed_by_office', 'classes_removed_by_office']) expect(sql).toMatch(new RegExp(`create policy ${policy} on classes as restrictive for (insert|update|delete)`));
    // No statement drops, grants, deletes or changes rows: the policies and the trigger are all it adds.
    expect(sql).not.toMatch(/^\s*(drop|grant|delete|update|insert|alter)\b/im);
  });

  it('the principal sets a class teacher on the Classes list, and clears it; each change is audited, in their own name', async () => {
    expect(await patch(principal, C6B, { classTeacherId: TARUN })).toMatchObject({ status: 200, body: { changed: true, class: { class_id: C6B, name: '6-B', class_teacher_id: TARUN, class_teacher_name: 'Tarun Teacher' } } });
    expect(await teacherOf(C6B)).toBe(TARUN);
    // Choosing the one already there changes nothing and writes nothing.
    expect(await patch(principal, C6B, { classTeacherId: TARUN })).toMatchObject({ status: 200, body: { changed: false } });
    expect(await patch(principal, C6B, { classTeacherId: null })).toMatchObject({ status: 200, body: { changed: true, class: { class_teacher_id: null, class_teacher_name: null } } });
    expect(await teacherOf(C6B)).toBeNull();
    expect(await audits(C6B)).toEqual([
      { actor_user_id: PRINCIPAL, role: 'principal', before_state: { class_teacher_id: null }, after_state: { class_teacher_id: TARUN } },
      { actor_user_id: PRINCIPAL, role: 'principal', before_state: { class_teacher_id: TARUN }, after_state: { class_teacher_id: null } },
    ]);
  });

  it('the school admin may do the same; a teacher, the accountant and the coordinator may not, through the app or in the database', async () => {
    expect(await patch(admin, C6B, { classTeacherId: TARA })).toMatchObject({ status: 200, body: { changed: true } });
    expect(await teacherOf(C6B)).toBe(TARA);
    for (const who of [tara, accountant, coordinator]) {
      expect(await patch(who, C6B, { classTeacherId: who === tara ? TARA : null }), who.role).toMatchObject({ status: 403, body: { code: 'not_allowed' } });
      expect(await as(who, (c) => setClassTeacher(c, actor(who), C6B, null)), who.role).toEqual({ ok: false, reason: 'not_allowed' });
      // Directly in the database: no class changes, none is added and none is removed.
      expect((await as<Out>(who, (c) => c.query(`update classes set class_teacher_id = null, name = 'renamed' where class_id = $1`, [C6B]))).rowCount, who.role).toBe(0);
      await expect(as(who, (c) => c.query(`insert into classes (school_id, name, class_teacher_id) values ($1, '8-A', $2)`, [A, who.user])), who.role).rejects.toThrow(/row-level security/);
      expect((await as<Out>(who, (c) => c.query(`delete from classes where class_id = $1`, [C7C]))).rowCount, who.role).toBe(0);
      // Reading the classes is as before, for every role.
      expect((await as<Out>(who, (c) => c.query(`select count(*)::int as n from classes`))).rows[0].n, who.role).toBe(3);
    }
    expect([await teacherOf(C6B), (await db.pg.query(`select name from classes where class_id = $1`, [C6B])).rows[0].name]).toEqual([TARA, '6-B']);
    expect(await audits(C6B)).toHaveLength(3);
  });

  it('only an active teacher of this school can be chosen: not one whose account is off, not another role, not another school’s', async () => {
    for (const someone of [LATA, ACCOUNTANT, PRINCIPAL, B_TEACHER, u(99)]) {
      expect(await patch(principal, C7C, { classTeacherId: someone }), someone).toMatchObject({ status: 400, body: { code: 'not_a_teacher' } });
      // The database holds the rule as well, whoever writes it.
      await expect(as(principal, (c) => c.query(`update classes set class_teacher_id = $2 where class_id = $1`, [C7C, someone])), someone).rejects.toThrow(/active teacher of the class's own school|violates foreign key/);
    }
    expect(await teacherOf(C7C)).toBeNull();
    // A class made with a class teacher keeps to the same rule.
    expect(await call(principal, () => addClass(new NextRequest('http://localhost/api/app/classes', { method: 'POST', body: JSON.stringify({ name: '8-A', classTeacherId: LATA }) })))).toMatchObject({ status: 400, body: { code: 'not_a_teacher' } });
    expect(await call(principal, () => addClass(new NextRequest('http://localhost/api/app/classes', { method: 'POST', body: JSON.stringify({ name: '8-A', classTeacherId: 'not-an-id' }) })))).toMatchObject({ status: 400 });
    expect((await db.pg.query(`select count(*)::int as n from classes where name = '8-A'`)).rows[0].n).toBe(0);
    // A class whose class teacher left keeps them until someone chooses again; choosing another or none is allowed.
    await db.pg.exec(`update classes set class_teacher_id = '${TARUN}' where class_id = '${C7C}'; update users set is_active = false where user_id = '${TARUN}';`);
    expect((await as<Out>(principal, (c) => c.query(`update classes set name = '7-C' where class_id = $1`, [C7C]))).rowCount).toBe(1);
    expect(await patch(principal, C7C, { classTeacherId: null })).toMatchObject({ status: 200, body: { changed: true } });
    await db.pg.query(`update users set is_active = true where user_id = $1`, [TARUN]);
  });

  it('another school’s class is not found, and a request that is not sent properly changes nothing', async () => {
    expect(await patch(principal, B_CLASS, { classTeacherId: TARA })).toMatchObject({ status: 404, body: { code: 'not_found' } });
    expect(await patch(bPrincipal, C6B, { classTeacherId: null })).toMatchObject({ status: 404 });
    expect((await as<Out>(bPrincipal, (c) => c.query(`update classes set class_teacher_id = null where class_id = $1`, [C6B]))).rowCount).toBe(0);
    for (const body of [{}, { classTeacherId: 'someone' }, { classTeacherId: 7 }, null]) expect(await patch(principal, C6B, body), JSON.stringify(body)).toMatchObject({ status: 400, body: { code: 'not_sent_properly' } });
    expect(await patch(principal, 'not-a-class', { classTeacherId: null })).toMatchObject({ status: 400 });
    expect([await teacherOf(C6B), await teacherOf(B_CLASS)]).toEqual([TARA, B_TEACHER]);
  });

  it('the list of classes gives the office the teachers to choose from, and nobody else', async () => {
    const office = await call(principal, () => listClasses(new NextRequest('http://localhost/api/app/classes')));
    expect(office.status).toBe(200);
    expect(office.body.mayChangeClassTeacher).toBe(true);
    // Active teachers of this school only, by name: not Lata (switched off), not the other school's teacher.
    expect(office.body.teachers).toEqual([{ user_id: TARA, name: 'Tara Teacher' }, { user_id: TARUN, name: 'Tarun Teacher' }]);
    expect(office.body.classes.map((c: { name: string; class_teacher_name: string | null; class_teacher_active: boolean }) => [c.name, c.class_teacher_name, c.class_teacher_active])).toEqual([['5-A', 'Tara Teacher', true], ['6-B', 'Tara Teacher', true], ['7-C', null, false]]);
    for (const who of [tara, accountant]) {
      const theirs = await call(who, () => listClasses(new NextRequest('http://localhost/api/app/classes')));
      expect([theirs.status, theirs.body.mayChangeClassTeacher, theirs.body.teachers, theirs.body.classes.length], who.role).toEqual([200, false, [], 3]);
    }
  });

  it('the School Health Auditor’s check opens the Classes list, and passes once every class has an active class teacher', async () => {
    expect(CHECK_META.class_teacher.screen).toBe('/app/students?classes=1');
    expect(isAppAddress(CHECK_META.class_teacher.screen)).toBe(true);
    expect(await classTeacherCheck()).toEqual({ state: 'needs_attention', count: 1, href: '/app/students?classes=1' });
    // The address opens the Students screen with the list of classes open.
    state.claims = claims(principal);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page: any = await StudentsPage({ searchParams: { classes: '1' } });
    expect(page.props.openClasses).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(((await StudentsPage({ searchParams: {} })) as any).props.openClasses).toBe(false);
    // The principal chooses 7-C's class teacher there: the check passes.
    expect(await patch(principal, C7C, { classTeacherId: TARUN })).toMatchObject({ status: 200 });
    expect(await classTeacherCheck()).toEqual({ state: 'passes' });
    // Its words say where to go, in both languages, and no longer send anyone to raise a ticket.
    expect(t('en', 'aud.check.class_teacher.open')).toBe('Choose class teachers');
    for (const lang of ['en', 'hi'] as const) for (const key of ['aud.check.class_teacher.do', 'ntc.noClass', 'ptm.err.no_teacher', 'ptm.new.noClasses'] as const) expect(t(lang, key), `${lang} ${key}`).not.toMatch(/ticket|टिकट|Setup|Classes में/);
    for (const key of ['ntc.noClass', 'ptm.err.no_teacher', 'ptm.new.noClasses'] as const) expect(t('en', key), key).toContain('“Manage classes”');
  });
});
