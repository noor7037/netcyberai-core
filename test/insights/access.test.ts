import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { SCHOOL_ROLES, moduleById, type SchoolRole } from '@/lib/contracts/modules';
import { FACTS, FACT_IDS, NotThisRolesFact, factContext, factsFor, loadFact, loadFacts, rangeFor, type FactId, type FactResult } from '@/lib/insights';
import { A, ACCOUNTANT, COORDINATOR, PRINCIPAL, TARA, TARUN, TODAY, accountant, admin, asWho, coordinator, ents, principal, startSchool, tara, type Db, type Who } from './seed';

// The acceptance sentence, second and third parts (docs/26 slice 8d, C203):
//   "No file under the dashboard imports the demo fixture."
//   "A role gets only the tiles its own row level security can read."
// On the whole schema, as the app's own database role. An accountant, a teacher and an academic coordinator each
// get exactly the facts their role is for; and when a fact that is NOT theirs is asked for directly, in their own
// database session, the database gives them nothing, for every fact whose tables carry a role policy.

let db: Db;
const who = (w: Who) => ({ schoolId: A, userId: w.user, role: w.role as never });
const ids = async (w: Who) => (await asWho(db, w, (c) => loadFacts(c, who(w), ents(), { range: '30d' }))).facts;
const byId = (facts: FactResult[]) => Object.fromEntries(facts.map((f) => [f.id, f])) as Record<FactId, FactResult>;

const ATTENDANCE: FactId[] = ['attendance.classes_marked', 'attendance.classes_unmarked', 'attendance.students_marked', 'attendance.present', 'attendance.absent', 'attendance.late', 'attendance.leave', 'attendance.present_rate'];
const FEES: FactId[] = ['fees.collected', 'fees.owed', 'fees.overdue', 'fees.promises_due', 'fees.upi_to_verify'];
const PULSE: FactId[] = ['pulse.sent', 'pulse.understood', 'pulse.needs_help'];
const HOMEWORK: FactId[] = ['homework.set', 'homework.checked', 'homework.not_done'];
const MESSAGES: FactId[] = ['messages.total', 'messages.failed', 'messages.held', 'whatsapp.spend'];
const PARENTS: FactId[] = ['complaints.open', 'complaints.overdue', 'notices.waiting', 'ptm.coming', 'events.coming', 'parent_ai.drafts'];
const TICKETS: FactId[] = ['tickets.open', 'tickets.waiting'];
// Staff leave: the office alone. Covers: the people who arrange them (the office and the academic coordinator).
const LEAVE: FactId[] = ['staff.leave_waiting', 'staff.on_leave_today'];
const COVERS: FactId[] = ['proxy.uncovered_today'];
const inOrder = (list: FactId[]) => FACT_IDS.filter((id) => list.includes(id));

// What each role is given. Fees: the finance roles. Learning: the roles that can read the learning tables.
// Leave: the principal and the school admin, nobody else. Covers: those two and the academic coordinator.
const GIVEN: Record<SchoolRole, FactId[]> = {
  principal: [...FACT_IDS],
  school_admin: [...FACT_IDS],
  accountant: inOrder(['students.active', ...FEES, ...TICKETS]),
  teacher: inOrder([...ATTENDANCE, 'students.active', 'students.waiting_consent', ...PULSE, 'followups.open', ...HOMEWORK, ...PARENTS, ...TICKETS]),
  academic_coordinator: inOrder([...ATTENDANCE, 'students.active', 'followups.open', ...HOMEWORK, ...TICKETS, ...COVERS]),
};

// attendance, pulse_messages, pulse_response_log and communication_log carry role policies (C210), so the database
// itself refuses every pair. C210 left five to the fact's own role list (an accountant's "classes not marked today",
// every class with a student on its roll; a teacher's message totals and spend, their own classes' messages); C219
// gives them database rules too (reads_attendance_days(), reads_school_message_totals()), so none is left. The test
// fails if a pair ever comes back.
const HELD_BY_THE_REGISTRY_ONLY: Partial<Record<SchoolRole, FactId[]>> = {};

describe('who gets which fact, on the whole schema', () => {
  beforeAll(async () => {
    db = await startSchool();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  }, 180_000);
  afterAll(async () => db?.stop());

  it('each role is given exactly its own facts: an accountant no learning, a teacher and a coordinator no fees', async () => {
    for (const w of [principal, admin, accountant, tara, coordinator]) {
      expect((await ids(w)).map((f) => f.id), w.role).toEqual(GIVEN[w.role as SchoolRole]);
      expect(factsFor(w.role as SchoolRole, ents()).map((f) => f.id), w.role).toEqual(GIVEN[w.role as SchoolRole]);
    }
    const forAccountant = (await ids(accountant)).map((f) => f.id);
    expect(forAccountant.filter((id) => /^(attendance|homework|pulse|followups|complaints|notices|parent_ai|staff|proxy)\./.test(id))).toEqual([]);
    for (const w of [tara, coordinator]) expect((await ids(w)).filter((f) => f.id.startsWith('fees.') || f.unit === 'inr_paise'), w.role).toEqual([]);
    // Leave is the office's: a teacher, an accountant and an academic coordinator get neither leave number. Covers
    // are for the people who arrange them: the coordinator gets that one number, a teacher and an accountant do not.
    for (const w of [tara, accountant, coordinator]) expect((await ids(w)).filter((f) => LEAVE.includes(f.id)), w.role).toEqual([]);
    expect([principal, admin, coordinator, tara, accountant].map((w) => factsFor(w.role as SchoolRole, ents()).some((f) => f.id === 'proxy.uncovered_today'))).toEqual([true, true, true, false, false]);
    for (const f of FACTS.filter((x) => LEAVE.includes(x.id))) expect([...f.roles], f.id).toEqual(['principal', 'school_admin']);
  });

  it('a fact is offered only to roles its module is for', () => {
    for (const f of FACTS) {
      // The needs-help queue is also the coordinator's (its own route and its table's policy say so), though Daily Pulse's menu is not.
      const also: SchoolRole[] = f.id === 'followups.open' ? ['academic_coordinator'] : f.moduleId === 'students' ? [...SCHOOL_ROLES] : [];
      for (const role of f.roles) expect(moduleById(f.moduleId).roles.includes(role) || also.includes(role), `${f.id} → ${role}`).toBe(true);
    }
  });

  it('a teacher’s numbers are their own classes’: row level security, not the fact, narrows them', async () => {
    const mine = byId(await ids(tara));
    // Tara is the class teacher of 5-A: one class (marked today), its four active students and one waiting for consent.
    expect(mine['attendance.classes_marked']).toMatchObject({ value: 1, total: 1 });
    expect(mine['attendance.classes_unmarked'].value).toBe(0);
    expect(mine['attendance.students_marked']).toMatchObject({ value: 4, total: 5 });
    expect(mine['students.active'].value).toBe(4);
    expect(mine['students.waiting_consent'].value).toBe(1);
    expect(mine['followups.open'].value).toBe(1); // Bela's, not 6-B's
    expect(mine['homework.set'].value).toBe(2); // the two set for 5-A in the month
    expect(mine['pulse.sent'].value).toBe(1);
    // A complaint about her that the principal has not seen yet is not hers to see.
    expect(mine['complaints.open'].value).toBe(2);
    expect(mine['notices.waiting']).toMatchObject({ value: 1, attention: false }); // only the principal approves
    expect(mine['tickets.open'].value).toBe(1); // her own ticket
    const all = byId(await ids(principal));
    expect([all['students.active'].value, all['followups.open'].value, all['complaints.open'].value, all['tickets.open'].value]).toEqual([8, 2, 3, 2]);
  });

  it('an accountant’s student count leaves out the child waiting for consent, whom the database hides from that role', async () => {
    const mine = byId(await ids(accountant));
    expect(mine['students.active']).toMatchObject({ value: 8, total: 9 }); // 10 records, 1 hidden
    expect(mine['fees.overdue']).toMatchObject({ value: 250000, count: 2 });
    expect(mine['tickets.open'].value).toBe(0); // the accountant's own ticket is resolved; nobody else's is theirs to see
  });

  it('asked for through the library, a fact that is not the role’s is refused before any query runs', async () => {
    const range = rangeFor(TODAY, '30d');
    let pairs = 0;
    for (const w of [accountant, tara, coordinator]) {
      const role = w.role as SchoolRole;
      for (const def of FACTS.filter((f) => !f.roles.includes(role))) {
        const asked = { query: vi.fn(async () => ({ rows: [] })) };
        await expect(loadFact(asked, def, factContext(who(w), TODAY, range)), `${def.id} → ${role}`).rejects.toBeInstanceOf(NotThisRolesFact);
        expect(asked.query, `${def.id} → ${role}`).not.toHaveBeenCalled();
        pairs += 1;
      }
    }
    // Every pair is refused by the library too (the database refuses them all as well: the next test).
    expect(pairs).toBeGreaterThan(Object.values(HELD_BY_THE_REGISTRY_ONLY).flat().length);
    // In the role's real session too: nothing is read, and the transaction goes on.
    const still = await asWho(db, accountant, async (c) => {
      await expect(loadFact(c, FACTS.find((f) => f.id === 'attendance.present')!, factContext(who(accountant), TODAY, range))).rejects.toBeInstanceOf(NotThisRolesFact);
      return (await c.query(`select count(*)::int as n from fees_ledger`)).rows[0].n;
    });
    expect(still).toBe(6);
    // A fact that IS the role's is answered as before.
    const own = await asWho(db, accountant, (c) => loadFact(c, FACTS.find((f) => f.id === 'fees.overdue')!, factContext(who(accountant), TODAY, range)));
    expect(own).toMatchObject({ value: 250000, count: 2 });
  });

  it('and the database itself: the fact’s own query, run in the role’s own session with no check in code, gives nothing', async () => {
    const range = rangeFor(TODAY, '30d');
    const all = byId(await ids(principal));
    const notRefused: Partial<Record<SchoolRole, FactId[]>> = {};
    for (const w of [accountant, tara, coordinator]) {
      const role = w.role as SchoolRole;
      for (const def of FACTS.filter((f) => !f.roles.includes(role))) {
        // The principal sees something for every fact in the seeded school, so "nothing" below is the database's doing.
        expect(all[def.id].value, def.id).toBeGreaterThan(0);
        // def.load is the fact's query with nothing in front of it: only row level security stands between
        // this role and the number. (One exception, proven apart in the next test: 'staff.leave_waiting' reads
        // through leaveWaiting, which itself answers nobody outside the office before the database is asked.)
        const got = await asWho(db, w, async (c) => {
          await c.query('savepoint direct');
          try {
            return await def.load(c, factContext(who(w), TODAY, range));
          } catch {
            await c.query('rollback to savepoint direct');
            return null; // the database refused the statement outright
          }
        });
        const nothing = got === null || (got.state ?? 'ok') !== 'ok' || got.value === 0;
        if (!nothing) (notRefused[role] ??= []).push(def.id);
      }
    }
    expect(notRefused).toEqual(HELD_BY_THE_REGISTRY_ONLY);
    expect(notRefused).toEqual({});
  });

  it('the five pairs C210 left to the role list get nothing from the database itself (C219), and the roles that are given them still are', async () => {
    const range = rangeFor(TODAY, '30d');
    const direct = (w: Who, id: FactId) =>
      asWho(db, w, async (c) => {
        await c.query('savepoint direct');
        try {
          return await FACTS.find((f) => f.id === id)!.load(c, factContext(who(w), TODAY, range));
        } catch {
          await c.query('rollback to savepoint direct');
          return null;
        }
      });
    // An accountant's "classes not marked": the day's list of classes is answered no class at all, so the fact is
    // "not set up", where C210 counted every class with a student on its roll.
    expect(await direct(accountant, 'attendance.classes_unmarked')).toMatchObject({ state: 'not_set_up', value: null });
    expect(await asWho(db, accountant, async (c) => (await c.query(`select public.reads_attendance_days() as yes`)).rows[0].yes)).toBe(false);
    // The accountant keeps the classes and the students the fees need.
    expect(await asWho(db, accountant, async (c) => (await c.query(`select (select count(*)::int from classes) as classes, (select count(*)::int from students) as students`)).rows[0])).toEqual({ classes: expect.any(Number), students: 9 });
    expect((await asWho(db, accountant, async (c) => (await c.query(`select count(*)::int as n from classes`)).rows[0].n)) > 0).toBe(true);
    // A teacher's message totals and spend: nothing at all, where C210 counted their own classes' messages.
    for (const id of MESSAGES) {
      const got = await direct(tara, id);
      expect(got === null || got.state === 'not_set_up' || got.value === 0, id).toBe(true);
    }
    expect(await direct(tara, 'whatsapp.spend')).toMatchObject({ state: 'not_set_up', value: null });
    expect(await asWho(db, tara, async (c) => (await c.query(`select public.reads_school_message_totals() as yes`)).rows[0].yes)).toBe(false);
    // The roles the facts are for are answered as before.
    const office = byId(await ids(principal));
    expect(office['attendance.classes_unmarked'].state ?? 'ok').toBe('ok');
    expect(office['messages.total'].value).toBeGreaterThan(0);
    expect((await direct(tara, 'attendance.classes_unmarked'))!.state ?? 'ok').toBe('ok');
    expect(await asWho(db, coordinator, async (c) => (await c.query(`select public.reads_attendance_days() as yes`)).rows[0].yes)).toBe(true);
    expect(await asWho(db, admin, async (c) => (await c.query(`select public.reads_school_message_totals() as yes`)).rows[0].yes)).toBe(true);
  });

  it('leave and covers: the database itself keeps other people’s leave to the office, and who is away to the people who arrange cover', async () => {
    // One of the leave facts reads through a library function that also checks the role in code (leaveWaiting),
    // so the test above does not prove the database's part for it. Here the same rows are asked for in plain SQL,
    // in each role's own session, with nothing in front of the database.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (w: Who, sql: string, params: unknown[] = []): Promise<Record<string, any>[]> => asWho(db, w, async (c) => (await c.query(sql, params)).rows);
    // staff_leave: the office reads every request of the school; anyone else their own, and no one else's.
    const leaveOf = async (w: Who) => (await rows(w, `select user_id, status from staff_leave order by leave_id`)).map((r) => `${r.user_id === w.user ? 'own' : 'another'}:${r.status}`);
    for (const w of [principal, admin]) expect(await leaveOf(w), w.role).toHaveLength(7);
    expect(await leaveOf(tara)).toEqual(['own:waiting']);
    expect(await leaveOf(accountant)).toEqual(['own:refused']);
    expect(await leaveOf(coordinator)).toEqual(['own:approved']);
    // The "waiting" list's own rows (what 'staff.leave_waiting' counts): nothing of anyone else's outside the office.
    const waitingOfOthers = async (w: Who) => (await rows(w, `select count(*)::int as n from staff_leave where school_id = $1 and status = 'waiting' and user_id <> $2`, [A, w.user]))[0].n;
    expect([await waitingOfOthers(principal), await waitingOfOthers(admin), await waitingOfOthers(tara), await waitingOfOthers(accountant), await waitingOfOthers(coordinator)]).toEqual([2, 1, 0, 0, 0]);
    // "On leave on a day" (staff_on_leave, with the caller's own rights; what 'staff.on_leave_today' counts): Tarun
    // is away today, and only the office is told.
    const away = async (w: Who) => (await rows(w, `select u.user_id from users u where u.school_id = $1 and public.staff_on_leave(u.school_id, u.user_id, $2::date)`, [A, TODAY])).map((r) => r.user_id);
    expect([await away(principal), await away(admin), await away(tara), await away(accountant), await away(coordinator)]).toEqual([[TARUN], [TARUN], [], [], []]);
    // Which teachers are away, for arranging cover (teachers_away_on; what 'proxy.uncovered_today' starts from):
    // the three roles that arrange cover, and nobody else. The coordinator is given that one fact, not the leave.
    const awayTeachers = async (w: Who) => (await rows(w, `select user_id from teachers_away_on($1::date)`, [TODAY])).map((r) => r.user_id);
    expect([await awayTeachers(principal), await awayTeachers(admin), await awayTeachers(coordinator), await awayTeachers(tara), await awayTeachers(accountant)]).toEqual([[TARUN], [TARUN], [TARUN], [], []]);
    // substitutions: the people who arrange cover read every row; a teacher the covers they hold or that are for
    // their own periods (Tara holds one); an accountant none.
    const covers = async (w: Who) => (await rows(w, `select count(*)::int as n from substitutions`))[0].n;
    expect([await covers(principal), await covers(admin), await covers(coordinator), await covers(tara), await covers(accountant)]).toEqual([4, 4, 4, 1, 0]);
    expect([TARA, ACCOUNTANT, COORDINATOR].every(Boolean)).toBe(true);
  });

  it('and the tables themselves refuse: fees to a teacher and a coordinator, learning to an accountant', async () => {
    const count = (w: Who, table: string) => asWho(db, w, async (c) => Number((await c.query(`select count(*) as n from ${table}`)).rows[0].n));
    for (const table of ['fees_ledger', 'payments', 'receipts', 'fee_followups', 'payment_reports', 'payment_links']) {
      expect(await count(principal, table), table).toBeGreaterThan(0);
      expect(await count(accountant, table), table).toBeGreaterThan(0);
      for (const w of [tara, coordinator]) expect(await count(w, table), `${table} as ${w.role}`).toBe(0);
    }
    for (const table of ['homework', 'homework_targets', 'homework_status', 'pulse_followups', 'complaints', 'class_notices', 'ptm_events', 'school_events', 'parent_ai_answers']) {
      expect(await count(principal, table), table).toBeGreaterThan(0);
      expect(await count(accountant, table), `${table} as accountant`).toBe(0);
    }
    for (const table of ['complaints', 'class_notices', 'ptm_events', 'school_events', 'parent_ai_answers', 'fees_ledger']) expect(await count(coordinator, table), `${table} as coordinator`).toBe(0);
    expect(PRINCIPAL).toBeTruthy();
  });
});

describe('the dashboard reads the school’s own rows, never the demo fixture', () => {
  const root = path.resolve(__dirname, '../..');
  const files = (p: string): string[] => {
    const full = path.join(root, p);
    return statSync(full).isDirectory() ? readdirSync(full).flatMap((n) => files(path.join(p, n))) : /\.(ts|tsx)$/.test(p) ? [p] : [];
  };
  const DASHBOARD = ['src/lib/insights', 'src/components/dashboards', 'src/components/shell/OfficeDashboard.tsx', 'src/app/(school)/app/dashboard', 'src/app/api/app/dashboard'];

  it('no file under the dashboard imports the demo fixture', () => {
    const all = DASHBOARD.flatMap(files);
    expect(all.length).toBeGreaterThanOrEqual(12);
    for (const dir of DASHBOARD) expect(files(dir).length, dir).toBeGreaterThan(0);
    for (const f of all) expect(readFileSync(path.join(root, f), 'utf8'), f).not.toMatch(/demo-fixture/);
  });

  it('nor does anything the facts are counted from', () => {
    for (const f of ['src/lib/attendance/day.ts', 'src/lib/fees/overdue.ts', 'src/lib/fees/payments.ts', 'src/lib/fees/recovery.ts', 'src/lib/homework/homework.ts', 'src/lib/pulse/drafts.ts', 'src/lib/whatsapp/delivery.ts', 'src/lib/whatsapp/cost.ts', 'src/lib/complaints/complaints.ts', 'src/lib/ptm/ptm.ts', 'src/lib/staff/leave.ts', 'src/lib/staff/leave-rules.ts', 'src/lib/proxy/proxy.ts', 'src/lib/proxy/rules.ts']) {
      expect(readFileSync(path.join(root, f), 'utf8'), f).not.toMatch(/demo-fixture/);
    }
  });

  it('nor do the lists a number opens: each reads in the reader’s own tenant transaction, never as the platform', () => {
    // Every "…Shown" list of rows behind a number, wherever its module keeps it.
    const lists = files('src/components').filter((f) => /Shown\.tsx$/.test(f));
    expect(lists).toEqual(expect.arrayContaining(['src/components/complaints/ComplaintsShown.tsx', 'src/components/ptm/PtmShown.tsx', 'src/components/staff/StaffLeaveShown.tsx']));
    expect(lists.length).toBeGreaterThanOrEqual(11);
    for (const f of lists) {
      const text = readFileSync(path.join(root, f), 'utf8');
      expect(text, f).not.toMatch(/demo-fixture/);
      expect(text, f).not.toMatch(/withPlatformService|withSuperAdminBypass|nca_super/);
      expect(text, f).toMatch(/withTenantContext\(session/);
    }
  });

  it('the office’s page loads the facts in the reader’s own tenant transaction, and never as the platform', () => {
    const loader = readFileSync(path.join(root, 'src/components/shell/OfficeDashboard.tsx'), 'utf8');
    expect(loader).toMatch(/withTenantContext\(/);
    expect(loader).toMatch(/loadFacts\(/);
    for (const f of DASHBOARD.flatMap(files)) expect(readFileSync(path.join(root, f), 'utf8'), f).not.toMatch(/withPlatformService|withSuperAdminBypass|nca_super/);
  });
});
