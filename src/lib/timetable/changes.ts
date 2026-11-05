import type { PoolClient } from 'pg';
import type { StaffRole } from '@/lib/auth/types';

// The history of timetable changes (W21-M3). Every period that changes leaves one append-only row in
// timetable_changes: what it was, what it became, who, when, and the reason if the person gave one. Written by the
// same functions that change timetable_entries (putEntry, clearEntry, importTimetable, the generator's publish), in
// the same transaction, so a change and its history stand or fall together.

export type ChangeKind = 'set' | 'cleared' | 'imported' | 'generated';
type Sql = Pick<PoolClient, 'query'>;
export type SlotState = { subjectId: string; teacherUserId: string } | null;
export type ChangeInput = { classId: string; weekday: number; period: number; kind: ChangeKind; before: SlotState; after: SlotState };
export const REASON_MAX = 200;

// A reason as typed: trimmed, empty is none, never longer than the column.
export const cleanReason = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, REASON_MAX) : null);

// A change is only a change when the period ends up different from what it was.
export const isChange = (c: Pick<ChangeInput, 'before' | 'after'>): boolean =>
  c.before?.subjectId !== c.after?.subjectId || c.before?.teacherUserId !== c.after?.teacherUserId;

export async function recordChanges(db: Sql, actor: { schoolId: string; userId: string; role: StaffRole }, changes: readonly ChangeInput[], opts: { reason?: string | null; proposalId?: string | null } = {}): Promise<number> {
  const real = changes.filter(isChange);
  if (real.length === 0) return 0;
  await db.query(
    `insert into timetable_changes (school_id, class_id, weekday, period, kind, before_subject_id, before_teacher_user_id, after_subject_id, after_teacher_user_id, changed_by, reason, proposal_id)
     select $1, n.class_id, n.weekday, n.period, n.kind, n.bs, n.bt, n.a_s, n.a_t, $2, $3, $4
       from unnest($5::uuid[], $6::int[], $7::int[], $8::text[], $9::uuid[], $10::uuid[], $11::uuid[], $12::uuid[]) as n(class_id, weekday, period, kind, bs, bt, a_s, a_t)`,
    [
      actor.schoolId, actor.userId, cleanReason(opts.reason), opts.proposalId ?? null,
      real.map((c) => c.classId), real.map((c) => c.weekday), real.map((c) => c.period), real.map((c) => c.kind),
      real.map((c) => c.before?.subjectId ?? null), real.map((c) => c.before?.teacherUserId ?? null), real.map((c) => c.after?.subjectId ?? null), real.map((c) => c.after?.teacherUserId ?? null),
    ]
  );
  return real.length;
}

export const HISTORY_DAYS = 30;
export const HISTORY_ROWS_MAX = 500;
export type ChangeLine = {
  change_id: string;
  at: string;
  kind: ChangeKind;
  class_id: string;
  class_name: string;
  weekday: number;
  period: number;
  before_subject: string | null;
  before_teacher: string | null;
  after_subject: string | null;
  after_teacher: string | null;
  changed_by_name: string | null;
  reason: string | null;
};
export type ChangeHistory = { days: number; changes: ChangeLine[]; cut: boolean };

// The last 30 days, newest first, optionally one class or one teacher (a change where they were teaching before or
// after). The caller's own tenant transaction: row level security keeps a teacher to their own classes' history.
export async function changeHistory(db: Sql, schoolId: string, filter: { classId?: string | null; teacherUserId?: string | null } = {}): Promise<ChangeHistory> {
  const { rows } = await db.query(
    `select h.change_id, h.created_at, h.kind, h.class_id, c.name as class_name, h.weekday::int as weekday, h.period::int as period,
            bs.name as before_subject, bt.display_name as before_teacher, asub.name as after_subject, ateach.display_name as after_teacher,
            u.display_name as changed_by_name, h.reason
       from timetable_changes h
       left join classes c on c.school_id = h.school_id and c.class_id = h.class_id
       left join subjects bs on bs.school_id = h.school_id and bs.subject_id = h.before_subject_id
       left join users bt on bt.school_id = h.school_id and bt.user_id = h.before_teacher_user_id
       left join subjects asub on asub.school_id = h.school_id and asub.subject_id = h.after_subject_id
       left join users ateach on ateach.school_id = h.school_id and ateach.user_id = h.after_teacher_user_id
       left join users u on u.school_id = h.school_id and u.user_id = h.changed_by
      where h.school_id = $1 and h.created_at >= now() - make_interval(days => $2)
        and ($3::uuid is null or h.class_id = $3)
        and ($4::uuid is null or h.before_teacher_user_id = $4 or h.after_teacher_user_id = $4)
      order by h.created_at desc, h.change_id
      limit ${HISTORY_ROWS_MAX + 1}`,
    [schoolId, HISTORY_DAYS, filter.classId ?? null, filter.teacherUserId ?? null]
  );
  const cut = rows.length > HISTORY_ROWS_MAX;
  return {
    days: HISTORY_DAYS,
    cut,
    changes: rows.slice(0, HISTORY_ROWS_MAX).map((r) => ({ ...r, at: new Date(r.created_at as string).toISOString(), class_name: r.class_name ?? '' })) as ChangeLine[],
  };
}
