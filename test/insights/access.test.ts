import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { SCHOOL_ROLES, moduleById, type SchoolRole } from '@/lib/contracts/modules';
import { FACTS, FACT_IDS, NotThisRolesFact, factContext, factsFor, loadFact, loadFacts, rangeFor, type FactId, type FactResult } from '@/lib/insights';
import { A, PRINCIPAL, TODAY, accountant, admin, asWho, coordinator, ents, principal, startSchool, tara, type Db, type Who } from './seed';

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
const inOrder = (list: FactId[]) => FACT_IDS.filter((id) => list.includes(id));

// What each role is given. Fees: the finance roles. Learning: the roles that can read the learning tables.
const GIVEN: Record<SchoolRole, FactId[]> = {
  principal: [...FACT_IDS],
  school_admin: [...FACT_IDS],
  accountant: inOrder(['students.active', ...FEES, ...TICKETS]),
  teacher: inOrder([...ATTENDANCE, 'students.active', 'students.waiting_consent', ...PULSE, 'followups.open', ...HOMEWORK, ...PARENTS, ...TICKETS]),
  academic_coordinator: inOrder([...ATTENDANCE, 'students.active', 'followups.open', ...HOMEWORK, ...TICKETS]),
};

// Facts whose tables have NO role policy (attendance, pulse_messages, pulse_response_log, communication_log,
// schools): row level security keeps them to the school (and a teacher to their own classes), but not to a role.
// For these pairs the database would answer; what keeps the number from the role is the fact's own role list,
// which loadFact enforces before any query runs (proven below), and each screen's own route.
// Everything not listed here is refused by the database itself, which the test below proves pair by pair.
// Closing this list needs a migration (a restrictive role policy on each table), which is the lead's to write and
// apply; when it lands, this list is emptied, and the test then fails if a pair ever comes back.
const HELD_BY_THE_REGISTRY_ONLY: Partial<Record<SchoolRole, FactId[]>> = {
  accountant: inOrder([...ATTENDANCE, ...PULSE, ...MESSAGES]),
  teacher: inOrder(MESSAGES),
  academic_coordinator: inOrder([...PULSE, ...MESSAGES]),
};

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
    expect(forAccountant.filter((id) => /^(attendance|homework|pulse|followups|complaints|notices|parent_ai)\./.test(id))).toEqual([]);
    for (const w of [tara, coordinator]) expect((await ids(w)).filter((f) => f.id.startsWith('fees.') || f.unit === 'inr_paise'), w.role).toEqual([]);
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
    // Every pair the database alone would let through is among them.
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
        // this role and the number.
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
    for (const f of ['src/lib/attendance/day.ts', 'src/lib/fees/overdue.ts', 'src/lib/fees/payments.ts', 'src/lib/fees/recovery.ts', 'src/lib/homework/homework.ts', 'src/lib/pulse/drafts.ts', 'src/lib/whatsapp/delivery.ts', 'src/lib/whatsapp/cost.ts']) {
      expect(readFileSync(path.join(root, f), 'utf8'), f).not.toMatch(/demo-fixture/);
    }
  });

  it('the office’s page loads the facts in the reader’s own tenant transaction, and never as the platform', () => {
    const loader = readFileSync(path.join(root, 'src/components/shell/OfficeDashboard.tsx'), 'utf8');
    expect(loader).toMatch(/withTenantContext\(/);
    expect(loader).toMatch(/loadFacts\(/);
    for (const f of DASHBOARD.flatMap(files)) expect(readFileSync(path.join(root, f), 'utf8'), f).not.toMatch(/withPlatformService|withSuperAdminBypass|nca_super/);
  });
});
