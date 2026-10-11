import { isModuleEnabled, type SchoolEntitlements } from '@/lib/contracts/entitlements';
import { arrangeMyDay, type MyDay, type TodayCard, type TodayContext, type TodayProvider, type TodaySql } from '@/lib/contracts/today-cards';
import { classLabel } from '@/lib/frameworks/class-label';

// The "today" cards of the modules that are live (docs/19 rule 2, C136).
// Each provider runs inside the caller's own tenant context, so row-level
// security decides what it may count: a teacher's cards are about their own
// classes, a school's cards never count another school. A module adds its
// cards by adding a provider here; My Day itself does not change.
//
// "Today" is the day in India, which is the day a school means.

const TODAY = `(now() at time zone 'Asia/Kolkata')::date`;
const n = (v: unknown) => Number(v ?? 0);
const OFFICE = ['principal', 'school_admin'] as const;

// One card when the count is above zero, none otherwise.
const waiting = (type: TodayCard['type'], moduleId: TodayCard['moduleId'], count: number, href: string): TodayCard[] => (count > 0 ? [{ id: type, type, moduleId, state: 'todo', count, href }] : []);

// The whole of today in India as a range on a timestamp column, so an index
// on that column can be used.
const DURING_TODAY = (column: string) => `${column} >= (${TODAY})::timestamp at time zone 'Asia/Kolkata' and ${column} < (${TODAY} + 1)::timestamp at time zone 'Asia/Kolkata'`;

// No attendance is expected on a Sunday; a school that does open marks it
// from the Attendance screen as usual.
export async function isSundayInIndia(db: TodaySql): Promise<boolean> {
  const { rows } = await db.query(`select extract(dow from ${TODAY})::int as dow`);
  return n(rows[0]?.dow) === 0;
}

export const TODAY_PROVIDERS: readonly TodayProvider[] = [
  {
    // A teacher's own classes: "Mark attendance: Class 5-A".
    // "Own" means what the database lets this teacher mark: the classes they
    // teach a subject in (teacher_scope_attendance). A card never offers work
    // the person would then be refused.
    type: 'attendance-class',
    moduleId: 'attendance',
    roles: ['teacher'],
    async load(db, ctx) {
      if (ctx.sunday) return [];
      // Counted from the students who are in the class now, as the Attendance
      // screen does: a student moved in after being marked elsewhere today is
      // marked; one moved out is no longer this class's.
      const { rows } = await db.query(
        `select c.class_id, c.name, c.section,
                (select count(*) from students s where s.school_id = c.school_id and s.class_id = c.class_id and s.status = 'active') as active,
                (select count(*) from students s
                   join attendance a on a.school_id = s.school_id and a.student_id = s.student_id and a.date = ${TODAY}
                  where s.school_id = c.school_id and s.class_id = c.class_id and s.status = 'active') as marked
         from classes c
         where c.school_id = $1
           and exists (select 1 from teacher_subjects ts
                         join teachers t on t.school_id = ts.school_id and t.teacher_id = ts.teacher_id
                        where ts.school_id = c.school_id and ts.class_id = c.class_id and t.user_id = $2)
         order by c.name, c.section, c.class_id`,
        [ctx.schoolId, ctx.userId]
      );
      return rows
        .filter((r) => n(r.active) > 0)
        .map((r): TodayCard => {
          const active = n(r.active);
          const marked = n(r.marked);
          const done = marked >= active;
          return {
            id: `attendance-class:${r.class_id}`,
            type: 'attendance-class',
            moduleId: 'attendance',
            state: done ? 'done' : 'todo',
            count: done ? active : active - marked,
            total: active,
            subject: classLabel(r.name as string | null, r.section as string | null) ?? '',
            href: `/app/attendance?class=${r.class_id}`,
          };
        });
    },
  },
  {
    // The office: how many classes have nothing saved yet today.
    type: 'attendance-school',
    moduleId: 'attendance',
    roles: OFFICE,
    async load(db, ctx) {
      if (ctx.sunday) return [];
      const { rows } = await db.query(
        `with c as (
           select c.class_id,
                  exists (select 1 from students s
                            join attendance a on a.school_id = s.school_id and a.student_id = s.student_id and a.date = ${TODAY}
                           where s.school_id = c.school_id and s.class_id = c.class_id and s.status = 'active') as marked
           from classes c
           where c.school_id = $1
             and exists (select 1 from students s where s.school_id = c.school_id and s.class_id = c.class_id and s.status = 'active')
         )
         select count(*) filter (where not marked) as unmarked, count(*) as classes from c`,
        [ctx.schoolId]
      );
      const classes = n(rows[0]?.classes);
      const unmarked = n(rows[0]?.unmarked);
      if (classes === 0) return [];
      return [{ id: 'attendance-school', type: 'attendance-school', moduleId: 'attendance', state: unmarked > 0 ? 'todo' : 'done', count: unmarked > 0 ? unmarked : classes, total: classes, href: '/app/attendance' }];
    },
  },
  {
    type: 'consent-waiting',
    moduleId: 'students',
    roles: OFFICE,
    async load(db, ctx) {
      const { rows } = await db.query(`select count(*) as c from students where school_id = $1 and status = 'pending_consent'`, [ctx.schoolId]);
      return waiting('consent-waiting', 'students', n(rows[0]?.c), '/app/students');
    },
  },
  {
    // "12 fees due today": entries whose due date is today and are not paid or waived.
    type: 'fees-due-today',
    moduleId: 'fees',
    roles: ['school_admin', 'accountant'],
    async load(db, ctx) {
      const { rows } = await db.query(`select count(*) as c from fees_ledger where school_id = $1 and due_date = ${TODAY} and status::text in ('pending', 'overdue', 'partial')`, [ctx.schoolId]);
      return waiting('fees-due-today', 'fees', n(rows[0]?.c), '/app/fees');
    },
  },
  {
    // Past the due date and not paid or waived. Worked out from the date:
    // nothing sets a fee to "overdue" when its date simply passes.
    type: 'fees-overdue',
    moduleId: 'fees',
    roles: ['principal', 'accountant'],
    async load(db, ctx) {
      const { rows } = await db.query(`select count(*) as c from fees_ledger where school_id = $1 and due_date < ${TODAY} and status::text in ('pending', 'overdue', 'partial')`, [ctx.schoolId]);
      return waiting('fees-overdue', 'fees', n(rows[0]?.c), '/app/fees');
    },
  },
  {
    // Tickets NetCyberAI has answered and is waiting on the school for. Row
    // level security shows the office every ticket and anyone else their own.
    type: 'tickets-waiting',
    moduleId: 'raise-ticket',
    roles: ['principal', 'school_admin', 'teacher', 'accountant', 'academic_coordinator'],
    async load(db, ctx) {
      const { rows } = await db.query(`select count(*) as c from support_tickets where school_id = $1 and status = 'waiting_on_school'`, [ctx.schoolId]);
      return waiting('tickets-waiting', 'raise-ticket', n(rows[0]?.c), '/app/help/ticket');
    },
  },
  {
    // Messages the safeguards held back today: consent missing, quiet hours,
    // budget. A pilot school's sends are all held by design and a missing
    // template is a setup matter; neither is a thing that needs the principal today.
    type: 'messages-held',
    moduleId: 'communication',
    roles: ['principal'],
    async load(db, ctx) {
      const { rows } = await db.query(
        `select count(*) as c from communication_log
         where school_id = $1 and status::text in ('blocked_consent', 'blocked_quiet_hours', 'blocked_budget') and ${DURING_TODAY('created_at')}`,
        [ctx.schoolId]
      );
      return waiting('messages-held', 'communication', n(rows[0]?.c), '/app/communication');
    },
  },
];

// Which providers are this person's: their role, and a module the school has on.
export function providersFor(role: TodayContext['role'], entitlements: SchoolEntitlements): TodayProvider[] {
  return TODAY_PROVIDERS.filter((p) => p.roles.includes(role) && isModuleEnabled(entitlements, p.moduleId));
}

// A provider that cannot answer leaves its card out; it never stops the
// home or the other cards (each runs behind its own savepoint, so a failed
// statement does not end the transaction). `failed` lets the page say that
// something is missing. `given` is for tests: the day of the week, and the
// providers to run.
export async function loadMyDay(
  db: TodaySql,
  who: Omit<TodayContext, 'sunday'>,
  entitlements: SchoolEntitlements,
  given: { sunday?: boolean; providers?: readonly TodayProvider[] } = {}
): Promise<MyDay & { failed: number }> {
  const cards: TodayCard[] = [];
  let failed = 0;
  let ctx: TodayContext;
  try {
    ctx = { ...who, sunday: given.sunday ?? (await isSundayInIndia(db)) };
  } catch {
    return { ...arrangeMyDay([]), failed: 1 };
  }
  for (const p of given.providers ?? providersFor(ctx.role, entitlements)) {
    try {
      await db.query('savepoint today_card');
      const found = await p.load(db, ctx);
      await db.query('release savepoint today_card');
      cards.push(...found);
    } catch (err) {
      await db.query('rollback to savepoint today_card').catch(() => undefined);
      console.error('[my-day] a card could not be computed', p.type, err instanceof Error ? err.name : 'error');
      failed += 1;
    }
  }
  return { ...arrangeMyDay(cards), failed };
}
