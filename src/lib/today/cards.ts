import { isModuleEnabled, type SchoolEntitlements } from '@/lib/contracts/entitlements';
import { arrangeMyDay, type MyDay, type TodayCard, type TodayContext, type TodayProvider, type TodaySql } from '@/lib/contracts/today-cards';
import { feeIsOverdueSql } from '@/lib/fees/overdue';
import { classLabel } from '@/lib/frameworks/class-label';
import { INDIA_TODAY_SQL } from '@/lib/time/india';
import { periodsToday } from '@/lib/timetable/timetable';

// The "today" cards of the modules that are live (docs/19 rule 2, C136).
// Each provider runs inside the caller's own tenant context, so row-level
// security decides what it may count: a teacher's cards are about their own
// classes, a school's cards never count another school. A module adds its
// cards by adding a provider here; My Day itself does not change.
//
// "Today" is the day in India, which is the day a school means.

const TODAY = INDIA_TODAY_SQL;
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
    // teach a subject in or are the class teacher of (teacher_scope_attendance,
    // C144). A card never offers work the person would then be refused.
    // Students waiting for consent are marked too (C143).
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
                (select count(*) from students s where s.school_id = c.school_id and s.class_id = c.class_id and s.status in ('active', 'pending_consent')) as active,
                (select count(*) from students s
                   join attendance a on a.school_id = s.school_id and a.student_id = s.student_id and a.date = ${TODAY}
                  where s.school_id = c.school_id and s.class_id = c.class_id and s.status in ('active', 'pending_consent')) as marked
         from classes c
         where c.school_id = $1
           and (c.class_teacher_id = $2
                or exists (select 1 from teacher_subjects ts
                             join teachers t on t.school_id = ts.school_id and t.teacher_id = ts.teacher_id
                            where ts.school_id = c.school_id and ts.class_id = c.class_id and t.user_id = $2))
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
                           where s.school_id = c.school_id and s.class_id = c.class_id and s.status in ('active', 'pending_consent')) as marked
           from classes c
           where c.school_id = $1
             and exists (select 1 from students s where s.school_id = c.school_id and s.class_id = c.class_id and s.status in ('active', 'pending_consent'))
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
    // Marks that arrived after their day ended and wait for the office (C146).
    type: 'attendance-requests',
    moduleId: 'attendance',
    roles: OFFICE,
    async load(db, ctx) {
      const { rows } = await db.query(`select count(*) as c from attendance_correction_requests where school_id = $1 and status = 'waiting'`, [ctx.schoolId]);
      return waiting('attendance-requests', 'attendance', n(rows[0]?.c), '/app/attendance');
    },
  },
  {
    // Students noted as needing a follow-up (D6, C148). RLS shows a teacher their own classes'.
    type: 'followups-open',
    moduleId: 'pulse',
    roles: ['principal', 'school_admin', 'teacher'],
    async load(db, ctx) {
      const { rows } = await db.query(`select count(*) as c from pulse_followups where school_id = $1 and status = 'open'`, [ctx.schoolId]);
      return waiting('followups-open', 'pulse', n(rows[0]?.c), '/app/pulse');
    },
  },
  {
    // Homework due today that is not fully checked (C150). RLS shows a teacher their own classes'.
    type: 'homework-to-check',
    moduleId: 'homework',
    roles: ['teacher'],
    async load(db, ctx) {
      const { rows } = await db.query(
        `select count(*) as c from homework_targets t
          where t.school_id = $1 and t.due_date = ${TODAY}
            and (select count(*) from students s where s.school_id = t.school_id and s.class_id = t.class_id and s.status in ('active', 'pending_consent'))
              > (select count(*) from homework_status hs join students s on s.school_id = hs.school_id and s.student_id = hs.student_id and s.class_id = t.class_id and s.status in ('active', 'pending_consent') where hs.target_id = t.target_id)`,
        [ctx.schoolId]
      );
      return waiting('homework-to-check', 'homework', n(rows[0]?.c), '/app/homework');
    },
  },
  {
    // "You teach 4 periods today", in order (C145). It is information, not
    // work waiting, so it is never counted as waiting.
    type: 'timetable-today',
    moduleId: 'timetable',
    roles: ['teacher'],
    async load(db, ctx) {
      const periods = await periodsToday(db as never, ctx.schoolId, ctx.userId);
      if (periods.length === 0) return [];
      return [{ id: 'timetable-today', type: 'timetable-today', moduleId: 'timetable', state: 'done', count: periods.length, subject: periods.map((e) => `${e.period}. ${e.class_name} ${e.subject_name}`).join(' · '), href: '/app/timetable' }];
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
      const { rows } = await db.query(`select count(*) as c from fees_ledger where school_id = $1 and due_date = ${TODAY} and status::text in ('pending', 'partial')`, [ctx.schoolId]);
      return waiting('fees-due-today', 'fees', n(rows[0]?.c), '/app/fees');
    },
  },
  {
    // Past its due date with something still owed, part paid or not: the same
    // rule as the dashboard (src/lib/fees/overdue.ts).
    type: 'fees-overdue',
    moduleId: 'fees',
    roles: ['principal', 'accountant'],
    async load(db, ctx) {
      const { rows } = await db.query(`select count(*) as c from fees_ledger l where l.school_id = $1 and ${feeIsOverdueSql('l.')} and l.amount_minor > coalesce((select sum(p.amount_minor) from payments p where p.fee_id = l.fee_id), 0)`, [ctx.schoolId]);
      return waiting('fees-overdue', 'fees', n(rows[0]?.c), '/app/fees');
    },
  },
  {
    // UPI payments parents have reported and nobody has yet found in the school's bank (C174). A parent's
    // receipt waits on this, so it is on the verifiers' day until a person decides each one.
    type: 'payments-to-verify',
    moduleId: 'fees',
    roles: ['principal', 'accountant', 'school_admin'],
    async load(db, ctx) {
      const { rows } = await db.query(`select count(*) as c from payment_reports where school_id = $1 and status in ('reported', 'awaiting_principal')`, [ctx.schoolId]);
      return waiting('payments-to-verify', 'fees', n(rows[0]?.c), '/app/fees');
    },
  },
  {
    // Promises to pay whose date is today or has gone by, still open (C178, C180): the office rings the family
    // again or closes the promise. Reminders to that family have started again.
    type: 'promises-due',
    moduleId: 'fees',
    roles: ['principal', 'accountant', 'school_admin'],
    async load(db, ctx) {
      const { rows } = await db.query(`select count(*) as c from fee_followups where school_id = $1 and kind = 'promise' and status = 'open' and promise_date <= ${TODAY}`, [ctx.schoolId]);
      return waiting('promises-due', 'fees', n(rows[0]?.c), '/app/fees');
    },
  },
  {
    // Complaints still open past their due time (C195): they have been passed to the principal, who is the one
    // to settle them now.
    type: 'complaints-overdue',
    moduleId: 'complaints',
    roles: ['principal', 'school_admin'],
    async load(db, ctx) {
      // The principal: every overdue one they may act on (never one about themselves). The school admin: the
      // overdue ones that are theirs, which is where a complaint about the principal goes (C200).
      const { rows } = await db.query(
        `select count(*) as c from complaints where school_id = $1 and status = 'open' and due_at <= now() and about_user_id is distinct from $2::uuid and ($3 = 'principal' or owner_id = $2::uuid)`,
        [ctx.schoolId, ctx.userId, ctx.role]
      );
      return waiting('complaints-overdue', 'complaints', n(rows[0]?.c), '/app/complaints');
    },
  },
  {
    // Conversations with a message from a parent nobody has opened yet (C187). Row level security shows the
    // office every conversation and a teacher those of their own classes' guardians.
    type: 'replies-waiting',
    moduleId: 'communication',
    roles: ['principal', 'school_admin', 'teacher'],
    async load(db, ctx) {
      const { rows } = await db.query(`select count(*) as c from message_threads where school_id = $1 and unread > 0`, [ctx.schoolId]);
      return waiting('replies-waiting', 'communication', n(rows[0]?.c), '/app/communication');
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
  // --- P5 (docs/26): one block a slice. A slice's lines go between its own two marker lines, nowhere else. ---
  // p5-8a begin
  // p5-8a end
  // p5-8b begin
  {
    // Leave requests waiting for the office that are not the person's own (C201): nobody decides their own, so
    // one's own request is the other office person's card. Row level security shows the office every request.
    type: 'leave-waiting',
    moduleId: 'staff',
    roles: OFFICE,
    async load(db, ctx) {
      const { rows } = await db.query(`select count(*) as c from staff_leave where school_id = $1 and status = 'waiting' and user_id <> $2`, [ctx.schoolId, ctx.userId]);
      return waiting('leave-waiting', 'staff', n(rows[0]?.c), '/app/staff');
    },
  },
  // p5-8b end
  // p5-8c begin
  {
    // A teacher's covers today (C202): the periods the office has given them for a teacher on leave, in order.
    // Row level security gives a teacher their own covers and nobody else's. It is work for today, so it waits.
    // On a day the school is closed there is no period to take, so there is no card.
    type: 'covers-today',
    moduleId: 'proxy',
    roles: ['teacher'],
    async load(db, ctx) {
      const { coversFor } = await import('@/lib/proxy/proxy');
      const covers = await coversFor(db as never, ctx.schoolId, ctx.userId);
      if (covers.length === 0) return [];
      return [{ id: 'covers-today', type: 'covers-today', moduleId: 'proxy', state: 'todo', count: covers.length, subject: covers.map((c) => `${c.period}. ${c.class_name} ${c.subject_name}`).join(' · '), href: '/app/proxy' }];
    },
  },
  {
    // Today's periods of teachers on leave that have no teacher (C202), for the people who arrange cover: no cover
    // yet, or a cover whose teacher cannot take it any more (now on leave, no longer an active teacher, or given
    // a class of their own then). Counted by the reading the Proxy Auto screen draws from, with the rule its
    // "Needs cover" badge uses, so the card and the screen cannot disagree.
    type: 'periods-uncovered',
    moduleId: 'proxy',
    roles: ['principal', 'school_admin', 'academic_coordinator'],
    async load(db, ctx) {
      const { coverWork } = await import('@/lib/proxy/proxy');
      const { open } = await coverWork(db as never, { schoolId: ctx.schoolId, userId: ctx.userId, role: ctx.role as never });
      return waiting('periods-uncovered', 'proxy', open.length, '/app/proxy');
    },
  },
  {
    // Today's covers that nothing needs any more (C202): the leave was cancelled, the timetable changed, or today
    // became a holiday after the tap. The app undoes nothing by itself, so on a working day the teacher is still
    // shown the cover: this card is what tells the people who arrange cover to undo it. Its number is the length of
    // the screen's own "Covers no longer needed" list.
    type: 'covers-not-needed',
    moduleId: 'proxy',
    roles: ['principal', 'school_admin', 'academic_coordinator'],
    async load(db, ctx) {
      const { coverWork } = await import('@/lib/proxy/proxy');
      const { noLongerNeeded } = await coverWork(db as never, { schoolId: ctx.schoolId, userId: ctx.userId, role: ctx.role as never });
      return waiting('covers-not-needed', 'proxy', noLongerNeeded.length, '/app/proxy');
    },
  },
  // p5-8c end
  // p5-8d begin
  // p5-8d end
  // p5-8e begin
  // p5-8e end
  // p5-8f begin
  // p5-8f end
  // p5-8g begin
  // p5-8g end
  // p5-8h begin
  // p5-8h end
  // p5-8i begin
  // p5-8i end
  // p5-8j begin
  // p5-8j end
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
