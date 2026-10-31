import type { PoolClient } from 'pg';

// One school's students, read-only, for the founder's school page (W13-A): counts and a page of names. Name, admission
// number, class and section and status only; no phone, address, guardian or date of birth. Read inside the founder's
// own platform transaction, so the school is named explicitly in every query.

export const STUDENTS_PAGE_SIZE = 50;

export type SchoolStudent = { studentId: string; admissionNo: string | null; name: string; className: string | null; section: string | null; status: string };
export type SchoolStudentCounts = { total: number; active: number; byLevel: { level: string | null; count: number }[] };
export type SchoolStudentsPage = { counts: SchoolStudentCounts; students: SchoolStudent[]; page: number; pageSize: number; matching: number };

// The search words, trimmed and capped.
export function studentSearch(raw: string | null): string {
  return (raw ?? '').trim().slice(0, 60);
}
export function studentPage(raw: string | null): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 100000 ? n : 1;
}

export async function listSchoolStudents(db: Pick<PoolClient, 'query'>, schoolId: string, opts: { page: number; q: string }): Promise<SchoolStudentsPage> {
  const { rows: totals } = await db.query(`select count(*)::int as total, (count(*) filter (where status = 'active'))::int as active from students where school_id = $1`, [schoolId]);
  const { rows: levels } = await db.query(
    `select c.grade as level, count(*)::int as n
       from students s left join classes c on c.school_id = s.school_id and c.class_id = s.class_id
      where s.school_id = $1
      group by c.grade
      order by (c.grade is null), case when c.grade ~ '^[0-9]+$' then c.grade::int end, c.grade`,
    [schoolId]
  );
  const params: unknown[] = [schoolId];
  // The LIKE wildcards in the words are made plain.
  if (opts.q) params.push(`%${opts.q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`);
  const where = opts.q ? 'where s.school_id = $1 and (s.name ilike $2 or s.admission_no ilike $2)' : 'where s.school_id = $1';
  const { rows: matched } = await db.query(`select count(*)::int as n from students s ${where}`, params);
  const { rows } = await db.query(
    `select s.student_id, s.admission_no, s.name, c.name as class_name, c.section, s.status::text as status
       from students s left join classes c on c.school_id = s.school_id and c.class_id = s.class_id
      ${where}
      order by lower(s.name), s.student_id
      limit ${STUDENTS_PAGE_SIZE} offset ${(opts.page - 1) * STUDENTS_PAGE_SIZE}`,
    params
  );
  return {
    counts: { total: totals[0].total as number, active: totals[0].active as number, byLevel: levels.map((r) => ({ level: (r.level as string | null) ?? null, count: r.n as number })) },
    students: rows.map((r) => ({ studentId: r.student_id as string, admissionNo: (r.admission_no as string | null) ?? null, name: r.name as string, className: (r.class_name as string | null) ?? null, section: (r.section as string | null) ?? null, status: r.status as string })),
    page: opts.page,
    pageSize: STUDENTS_PAGE_SIZE,
    matching: matched[0].n as number,
  };
}
