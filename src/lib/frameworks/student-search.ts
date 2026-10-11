import {
  STUDENT_SEARCH_DEFAULT_LIMIT,
  STUDENT_SEARCH_MAX_LIMIT,
  STUDENT_SEARCH_MIN_CHARS,
  type StudentMatchField,
  type StudentSearchResult,
} from '@/lib/contracts/student-search';
import type { SchoolRole } from '@/lib/contracts/modules';
import type { Sql } from '@/lib/jobs/types';

// Student 360 search (17 §3a, C112): one box, by name, admission number,
// roll number or a guardian's whole phone number. Runs inside the caller's tenant context,
// so the database decides what each role sees: a teacher only students of
// their own classes (teacher_scope_students), pending-consent students
// only for the roles the consent gate allows. The API never widens it.
//
// Roles: the office (Students module) and the academic coordinator
// school-wide; teachers for their own classes (not the Students module).
export const STUDENT_SEARCH_ROLES: readonly SchoolRole[] = ['principal', 'school_admin', 'academic_coordinator', 'teacher'];

export type ParsedSearch = { term: string; digits: string | null; limit: number };

export function parseStudentSearch(q: unknown, limit: unknown): ParsedSearch | null {
  if (typeof q !== 'string') return null;
  const term = q.trim().replace(/\s+/g, ' ').slice(0, 100);
  if (term.length < STUDENT_SEARCH_MIN_CHARS) return null;
  const n = Number(limit);
  return {
    term,
    digits: fullPhone(term),
    limit: Number.isInteger(n) && n > 0 ? Math.min(n, STUDENT_SEARCH_MAX_LIMIT) : STUDENT_SEARCH_DEFAULT_LIMIT,
  };
}

// A parent's phone is matched only as a whole number (C137): ten digits, or
// + and a country code followed by the number. Part of a number finds
// nobody, so a number cannot be worked out by guessing it digit by digit.
// Returns the ten digits to compare, or null when the text is not a whole
// phone number.
export function fullPhone(term: string): string | null {
  const s = term.trim();
  if (!/^\+?[\d\s()-]+$/.test(s)) return null;
  const digits = s.replace(/\D/g, '');
  if (digits.length === 10 && !s.startsWith('+')) return digits;
  // "+91 98765 43210": a country code of one to three digits, then the ten.
  if (s.startsWith('+') && digits.length >= 11 && digits.length <= 13) return digits.slice(-10);
  return null;
}

// For ILIKE: the term's own % and _ are literal.
export function likeEscape(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// One query: each way to match gives candidates with a rank (exact before
// prefix before contains), then one row per student, best match first.
const SEARCH_SQL = `
with cand as (
  select s.student_id, 'admission_no'::text as matched_on,
         case when lower(s.admission_no) = lower($2) then 0 else 1 end as rank, null::text as phone
  from students s
  where s.school_id = $1 and lower(s.admission_no) like lower($3) || '%' escape '\\'
  union all
  select s.student_id, 'name', case when lower(s.name) like lower($3) || '%' escape '\\' then 2 else 3 end, null
  from students s
  where s.school_id = $1 and lower(s.name) like '%' || lower($3) || '%' escape '\\'
  union all
  select s.student_id, 'roll_no', 4, null
  from students s
  where s.school_id = $1 and s.roll_no = $2
  union all
  select s.student_id, 'guardian_phone', 5, p.phone
  from students s
  join parent_student_map m on m.school_id = s.school_id and m.student_id = s.student_id
  join parents p on p.school_id = m.school_id and p.parent_id = m.parent_id
  where $4::text is not null and s.school_id = $1
    and right(regexp_replace(p.phone, '[^0-9]', '', 'g'), 10) = $4::text
),
best as (
  select distinct on (student_id) student_id, matched_on, rank, phone
  from cand
  order by student_id, rank
)
select s.student_id, s.name, s.admission_no, s.roll_no, s.status::text as status,
       c.name as class_name, c.section, b.matched_on, b.phone
from best b
join students s on s.school_id = $1 and s.student_id = b.student_id
left join classes c on c.school_id = s.school_id and c.class_id = s.class_id
order by b.rank, lower(s.name), s.student_id
limit $5`;

export async function searchStudents(db: Sql, schoolId: string, parsed: ParsedSearch): Promise<StudentSearchResult[]> {
  const { rows } = await db.query(SEARCH_SQL, [schoolId, parsed.term, likeEscape(parsed.term), parsed.digits, parsed.limit]);
  return rows.map((r) => {
    const phoneDigits = typeof r.phone === 'string' ? r.phone.replace(/\D/g, '') : '';
    return {
      studentId: r.student_id,
      displayName: r.name,
      admissionNo: r.admission_no,
      className: r.class_name,
      section: r.section,
      rollNo: r.roll_no,
      status: r.status,
      matchedOn: r.matched_on as StudentMatchField,
      // Only the last four digits, and only when the phone matched.
      ...(r.matched_on === 'guardian_phone' && phoneDigits.length >= 4 ? { guardianPhoneLast4: phoneDigits.slice(-4) } : {}),
      href: `/app/students/${r.student_id}`,
    };
  });
}
