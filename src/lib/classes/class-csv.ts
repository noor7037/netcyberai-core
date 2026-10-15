import { writeAuditLog } from '@/lib/audit/log';
import type { SchoolRole } from '@/lib/contracts/modules';
import { parseCsvChecked } from '@/lib/import/csv';
import type { Sql } from '@/lib/jobs/types';
import { classOrderSql, PRE_PRIMARY_GRADES } from './class-order';
import { maySetClassTeacher } from './class-teacher';
import { deriveGradeSection } from './grade-section';
import { classKey, currentSessionId, existingClassKeys, lockSchoolClasses } from './standard-classes';

// The school's classes as a CSV file, both ways (C235-A).
//
//   - Download: every class in the class order, with grade, section, class teacher's sign-in email, name and the
//     number of students. The principal and the school admin (it carries staff emails).
//   - Upload: grade, section and an optional class_teacher_email, one class a line. Other columns (the download's
//     name and students) are read past. Two phases, as the student import: "Check file" lists every problem and
//     writes nothing; "Add classes" checks again and, all or nothing, adds every class of the file or none. Problems:
//     a line with more values than the header, an unknown grade (anything but Nursery, LKG, UKG and 1 to 12), a
//     section that is not one letter, a class teacher who is not an active teacher of the school, the same class
//     twice in the file, and a class the school already has. New classes go in the current session, named as the
//     others ("LKG-A", "5-B"). One audit row with the counts.

export const CLASS_CSV_COLUMNS = ['grade', 'section', 'class_teacher_email'] as const;
export const CLASS_CSV_EXPORT_COLUMNS = [...CLASS_CSV_COLUMNS, 'name', 'students'] as const;
export const MAX_CLASS_CSV_ROWS = 1000;
export const MAX_CLASS_CSV_CHARS = 200_000;

export type ClassCsvProblemCode =
  | 'header'
  | 'unclosed_quote'
  | 'no_rows'
  | 'too_many_rows'
  | 'too_many_values'
  | 'grade_missing'
  | 'grade_unknown'
  | 'section_missing'
  | 'section_bad'
  | 'teacher_unknown'
  | 'duplicate_in_file'
  | 'already_exists';
// `line`: the line of the file (the header is line 1). `with`: the earlier line of the same class.
export type ClassCsvProblem = { line: number; code: ClassCsvProblemCode; value?: string; with?: number };

export type ClassCsvRow = { line: number; name: string; grade: string; section: string; teacherEmail: string | null };

// "lkg" is LKG, "05" is 5; null for anything outside Nursery, LKG, UKG and 1 to 12.
export function readGrade(raw: string): string | null {
  const v = raw.trim();
  const pre = PRE_PRIMARY_GRADES.find((g) => g.toLowerCase() === v.toLowerCase());
  if (pre) return pre;
  if (!/^[0-9]{1,2}$/.test(v)) return null;
  const n = Number(v);
  return n >= 1 && n <= 12 ? String(n) : null;
}

// One letter, A to Z, in capitals.
export function readSection(raw: string): string | null {
  const v = raw.trim();
  return /^[A-Za-z]$/.test(v) ? v.toUpperCase() : null;
}

// Everything that needs no database: the shape of the file and each line on its own, and duplicates in the file.
// `lines`: how many lines of classes the file has (blank lines are not counted).
export function readClassCsv(text: string): { rows: ClassCsvRow[]; problems: ClassCsvProblem[]; lines: number } {
  const parsed = parseCsvChecked(text);
  if (parsed.unclosedQuote) return { rows: [], problems: [{ line: 1, code: 'unclosed_quote' }], lines: 0 };
  const header = (parsed.rows[0] ?? []).map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const at = (key: string) => header.indexOf(key);
  if (at('grade') < 0 || at('section') < 0) return { rows: [], problems: [{ line: 1, code: 'header' }], lines: 0 };
  const body = parsed.rows.slice(1).map((cells, i) => ({ line: i + 2, cells })).filter((l) => l.cells.some((c) => c.trim() !== ''));
  if (body.length === 0) return { rows: [], problems: [{ line: 1, code: 'no_rows' }], lines: 0 };
  if (body.length > MAX_CLASS_CSV_ROWS) return { rows: [], problems: [{ line: 1, code: 'too_many_rows', value: String(MAX_CLASS_CSV_ROWS) }], lines: body.length };

  const rows: ClassCsvRow[] = [];
  const problems: ClassCsvProblem[] = [];
  const firstLineOf = new Map<string, number>();
  for (const { line, cells } of body) {
    const cell = (key: string) => (at(key) >= 0 ? (cells[at(key)] ?? '').trim() : '');
    const before = problems.length;
    if (cells.length > header.length && cells.slice(header.length).some((c) => c.trim() !== '')) problems.push({ line, code: 'too_many_values' });
    const rawGrade = cell('grade');
    const rawSection = cell('section');
    const grade = readGrade(rawGrade);
    const section = readSection(rawSection);
    if (!rawGrade) problems.push({ line, code: 'grade_missing' });
    else if (!grade) problems.push({ line, code: 'grade_unknown', value: rawGrade });
    if (!rawSection) problems.push({ line, code: 'section_missing' });
    else if (!section) problems.push({ line, code: 'section_bad', value: rawSection });
    if (grade && section) {
      const name = `${grade}-${section}`;
      const first = firstLineOf.get(classKey(name));
      if (first !== undefined) problems.push({ line, code: 'duplicate_in_file', value: name, with: first });
      else firstLineOf.set(classKey(name), line);
      if (problems.length === before) rows.push({ line, name, grade, section, teacherEmail: cell('class_teacher_email') || null });
    }
  }
  return { rows, problems, lines: body.length };
}

export type ClassImport =
  | { ok: true; preview: boolean; committed: boolean; rowCount: number; problems: ClassCsvProblem[]; created: { class_id: string; name: string }[] }
  | { ok: false; reason: 'not_allowed' };

export async function importClassCsv(db: Sql, actor: { schoolId: string; userId: string; role: SchoolRole }, text: string, opts: { preview: boolean }): Promise<ClassImport> {
  if (!maySetClassTeacher(actor.role)) return { ok: false, reason: 'not_allowed' };
  const read = readClassCsv(text);
  const problems = [...read.problems];
  if (!opts.preview) await lockSchoolClasses(db, actor.schoolId);
  const existing = existingClassKeys((await db.query(`select name, grade, section from classes where school_id = $1`, [actor.schoolId])).rows);
  const teachers = new Map<string, string>(
    (await db.query(`select lower(email) as email, user_id from users where school_id = $1 and role = 'teacher' and is_active and email is not null`, [actor.schoolId])).rows.map(
      (r: { email: string; user_id: string }) => [r.email, r.user_id]
    )
  );
  const ready: (ClassCsvRow & { teacherId: string | null })[] = [];
  for (const r of read.rows) {
    const before = problems.length;
    if (existing.has(classKey(r.name))) problems.push({ line: r.line, code: 'already_exists', value: r.name });
    const teacherId = r.teacherEmail ? (teachers.get(r.teacherEmail.toLowerCase()) ?? null) : null;
    if (r.teacherEmail && !teacherId) problems.push({ line: r.line, code: 'teacher_unknown', value: r.teacherEmail });
    if (problems.length === before) ready.push({ ...r, teacherId });
  }
  problems.sort((a, b) => a.line - b.line);
  const rowCount = read.lines;
  if (opts.preview || problems.length > 0 || ready.length === 0) return { ok: true, preview: opts.preview, committed: false, rowCount, problems, created: [] };

  const sessionId = await currentSessionId(db, actor.schoolId);
  const created = (
    await db.query(
      `with added as (
         insert into classes (school_id, name, grade, section, session_id, class_teacher_id)
         select $1, n.name, n.grade, n.section, $2::uuid, n.teacher from unnest($3::text[], $4::text[], $5::text[], $6::uuid[]) as n(name, grade, section, teacher)
         returning class_id, name, grade, section)
       select class_id, name from added c order by ${classOrderSql('c')}`,
      [actor.schoolId, sessionId, ready.map((r) => r.name), ready.map((r) => r.grade), ready.map((r) => r.section), ready.map((r) => r.teacherId)]
    )
  ).rows as { class_id: string; name: string }[];
  await writeAuditLog(db, {
    schoolId: actor.schoolId,
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventAction: 'class.import',
    targetType: 'classes',
    afterState: { created: created.length, with_class_teacher: ready.filter((r) => r.teacherId).length, session_id: sessionId },
  });
  return { ok: true, preview: false, committed: true, rowCount, problems: [], created };
}

// The download: every class in the class order.
export async function classCsvRows(db: Sql, schoolId: string): Promise<(string | number | null)[][]> {
  const { rows } = await db.query(
    `select c.name, c.grade, c.section, u.email as teacher_email,
            (select count(*)::int from students s where s.school_id = c.school_id and s.class_id = c.class_id) as students
       from classes c left join users u on u.school_id = c.school_id and u.user_id = c.class_teacher_id
      where c.school_id = $1
      order by ${classOrderSql('c')}, c.class_id`,
    [schoolId]
  );
  return rows.map((r: { name: string; grade: string | null; section: string | null; teacher_email: string | null; students: number }) => {
    // A class saved before grade and section had columns: read from a name such as "5-A"; left empty otherwise.
    const derived = deriveGradeSection(r.name);
    const fromName = derived.section ? derived : { grade: null, section: null };
    return [r.grade?.trim() || fromName.grade, r.section?.trim() || fromName.section, r.teacher_email, r.name, r.students];
  });
}
