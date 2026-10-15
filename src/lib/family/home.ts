import type { PoolClient } from 'pg';

// The family app's home (founder, 2026-10-15, C230-D): for the signed-in guardian, one card per child with today's
// attendance, the last school days, and what is owed. Read inside the parent's own session, so the database's
// parent rules decide what is visible (own children only, read only, every other table refused); each query also
// names the guardian's own links, so a mistake here could not widen it either.
//
// Consent first (docs/31 §3 rule 3, DPDP): a child appears only when the school's consent for the child's core
// records is on the ledger, latest decision granted. A test school shows its fictional children without it.

export type DayMark = 'present' | 'absent' | 'late' | 'leave';
export type FamilyChild = {
  studentId: string;
  name: string;
  className: string | null;
  today: DayMark | null;
  // The last school days with a mark, oldest first (at most 14).
  days: { date: string; mark: DayMark }[];
  presentDays: number;
  markedDays: number;
  dueMinor: number;
  overdueMinor: number;
  nextDue: string | null;
};
export type FamilyHome = { schoolName: string; guardianName: string; children: FamilyChild[]; awaitingConsent: number };

const MARKS = new Set<DayMark>(['present', 'absent', 'late', 'leave']);
const asMark = (status: string): DayMark | null => (MARKS.has(status as DayMark) ? (status as DayMark) : status === 'on_leave' ? 'leave' : null);

export async function loadFamilyHome(db: Pick<PoolClient, 'query'>, who: { parentId: string; schoolId: string }, today: string): Promise<FamilyHome> {
  const school = (await db.query(`select name, is_test_fixture from schools where school_id = $1`, [who.schoolId])).rows[0] as { name: string; is_test_fixture: boolean } | undefined;
  const guardian = (await db.query(`select name from parents where parent_id = $1`, [who.parentId])).rows[0] as { name: string } | undefined;
  const linked = (
    await db.query(
      `select s.student_id, s.name, c.name as class_name
         from parent_student_map m
         join students s on s.student_id = m.student_id and s.school_id = m.school_id
         left join classes c on c.class_id = s.class_id
        where m.parent_id = $1 and s.status = 'active'
        order by s.name`,
      [who.parentId]
    )
  ).rows as { student_id: string; name: string; class_name: string | null }[];

  let allowed = linked;
  if (!school?.is_test_fixture && linked.length > 0) {
    const consent = (
      await db.query(
        `select distinct on (student_id) student_id, granted from consent_ledger
          where purpose = 'core_records' and student_id = any($1::uuid[])
          order by student_id, created_at desc`,
        [linked.map((c) => c.student_id)]
      )
    ).rows as { student_id: string; granted: boolean }[];
    const granted = new Set(consent.filter((c) => c.granted).map((c) => c.student_id));
    allowed = linked.filter((c) => granted.has(c.student_id));
  }
  const ids = allowed.map((c) => c.student_id);

  const attendance = ids.length
    ? ((
        await db.query(
          `select student_id, to_char(date, 'YYYY-MM-DD') as day, status::text as status from attendance
            where student_id = any($1::uuid[]) and date between ($2::date - 30) and $2::date
            order by date`,
          [ids, today]
        )
      ).rows as { student_id: string; day: string; status: string }[])
    : [];
  const fees = ids.length
    ? ((
        await db.query(
          `select student_id,
                  coalesce(sum(amount_minor) filter (where status in ('pending', 'overdue', 'partial')), 0)::bigint as due,
                  coalesce(sum(amount_minor) filter (where status = 'overdue' or (status in ('pending', 'partial') and due_date < $2::date)), 0)::bigint as overdue,
                  min(due_date) filter (where status in ('pending', 'partial') and due_date >= $2::date) as next_due
             from fees_ledger where student_id = any($1::uuid[]) group by student_id`,
          [ids, today]
        )
      ).rows as { student_id: string; due: string; overdue: string; next_due: string | Date | null }[])
    : [];

  const children: FamilyChild[] = allowed.map((c) => {
    const marks = attendance.filter((a) => a.student_id === c.student_id).flatMap((a) => (asMark(a.status) ? [{ date: a.day, mark: asMark(a.status) as DayMark }] : []));
    const f = fees.find((x) => x.student_id === c.student_id);
    const next = f?.next_due ? (f.next_due instanceof Date ? f.next_due.toISOString() : String(f.next_due)).slice(0, 10) : null;
    return {
      studentId: c.student_id,
      name: c.name,
      className: c.class_name,
      today: marks.find((m) => m.date === today)?.mark ?? null,
      days: marks.slice(-14),
      presentDays: marks.filter((m) => m.mark === 'present' || m.mark === 'late').length,
      markedDays: marks.filter((m) => m.mark !== 'leave').length,
      dueMinor: Number(f?.due ?? 0),
      overdueMinor: Number(f?.overdue ?? 0),
      nextDue: next,
    };
  });
  return { schoolName: school?.name ?? '', guardianName: guardian?.name ?? '', children, awaitingConsent: linked.length - allowed.length };
}

// ₹4,500 or ₹4,500.50, in the Indian grouping.
export function rupeesFromMinor(minor: number): string {
  const rupees = minor / 100;
  return `₹${rupees.toLocaleString('en-IN', { minimumFractionDigits: Number.isInteger(rupees) ? 0 : 2, maximumFractionDigits: 2 })}`;
}
