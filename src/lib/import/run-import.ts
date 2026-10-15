import { createHash, randomUUID } from 'crypto';
import { withTenantContext } from '@/lib/auth/db';
import type { SessionClaims } from '@/lib/auth/types';
import type { SiblingSuggestion } from '@/lib/contracts/families';
import { emailKey, phoneKey, suggestSiblingsFor } from '@/lib/families/families';
import type { Sql } from '@/lib/jobs/types';
import type { RecordGender } from '@/lib/students/data-check-rules';
import { mayRecordGender, readImportGender } from '@/lib/students/gender';
import { indiaDate } from '@/lib/time/india';
import { parseCsvChecked, rowsToRecords } from './csv';
import { basicRowErrors } from './rules';

// Optional columns used only to suggest siblings (C116): a row whose
// guardian phone or email matches a guardian already on record lists that
// guardian's children. Nothing is linked and no guardian is created from
// them; the office confirms each suggestion on the student's page. Kept out
// of IMPORT_COLUMNS (rules.ts), which the public import checker also shows.
export const SIBLING_HINT_COLUMNS = ['guardian_phone', 'guardian_email'] as const;

// Optional column 'gender' (C222, C224): Aadhaar's values as Aadhaar prints them (male, female, transgender, any
// case) or empty for "not given". Only the office records a gender (the database's students_gender_office_only),
// so a row with a gender from anyone else is refused, never written. Also kept out of IMPORT_COLUMNS: the public
// import checker shows those, and the website is not changed here.
export const GENDER_COLUMN = 'gender';

export type ImportSiblingSuggestion = { row: number; studentId: string | null; name: string; matches: SiblingSuggestion[] };

export interface RowError {
  row: number; // 1-indexed data row (header is row 0, first data row is 1)
  name: string;
  admissionNo: string | null;
  errors: string[];
}

interface ValidRow {
  row: number;
  studentId: string;
  phone: string | null;
  email: string | null;
  name: string;
  admissionNo: string | null;
  classId: string | null;
  rollNo: string | null;
  dob: string | null;
  gender: RecordGender;
}

// A file that cannot be read as a list of students at all (C235-A): said as a
// whole, before any row is looked at. The route answers 400 with the message.
export class ImportFileError extends Error {}

export interface ImportResult {
  alreadyImported: boolean;
  preview: boolean; // true: checked only, nothing written
  // All or nothing (C235-A): true when a row has a problem, so no row was
  // written. Every problem is in `errors`; fix them and import the file again.
  refused: boolean;
  importId: string;
  importedAt: string;
  rowCount: number;
  importedCount: number;
  skippedCount: number;
  errors: RowError[];
  siblingSuggestions: ImportSiblingSuggestion[];
}

// Two-phase commit, per Prompt F Task 2: Phase 1 validates every row
// (including resolving class_name -> class_id via a same-school-scoped
// lookup -- never a raw class_id column, so there is no CSV column an
// attacker or a copy-pasted spreadsheet could use to smuggle another
// school's class in) and produces a complete per-row error report
// before anything is written. Phase 2 inserts every row inside ONE
// transaction, and only when no row has a problem: all or nothing
// (C235-A, as the timetable and classes imports). A file with one bad
// row among 10,000 writes nothing and names that row. No sibling/guardian LINKING
// happens here at all -- this only ever writes `students`, per this
// project's explicit-data-only discipline (05_BUSINESS_LOGIC.md Sec3.3);
// matching guardians are only suggested, for the office to confirm (C116).
//
// Extracted from the API route so the same logic can be exercised
// directly from a verification route with fixture claims -- never
// duplicated, never a paraphrase of what production runs.
export async function runCsvImport(
  claims: SessionClaims & { schoolId: string },
  buffer: Buffer,
  fileName: string,
  opts: { preview?: boolean } = {}
): Promise<ImportResult> {
  const fileHash = createHash('sha256').update(buffer).digest('hex');
  const { records, rowErrors } = readStudentCsv(buffer.toString('utf-8'));
  return withTenantContext(claims, (client) => importStudentRecords(client, claims, records, fileHash, fileName, { ...opts, rowErrors }));
}

// The file as rows, or an ImportFileError for a file that is not one (C235-A): a quote opened and never closed, no
// "name" column, or no data rows. A row with more values than the header has columns is a row error (`rowErrors`,
// by data row), never cut short silently.
export function readStudentCsv(text: string): { records: Record<string, string>[]; rowErrors: Map<number, string[]> } {
  const parsed = parseCsvChecked(text);
  if (parsed.unclosedQuote) throw new ImportFileError('the file has a quote (") that is never closed: check the row where the values stop making sense');
  const records = rowsToRecords(parsed.rows);
  if (records.length === 0) {
    throw new ImportFileError('no data rows found (check the file has a header row plus at least one data row)');
  }
  const header = parsed.rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  if (!header.includes('name')) throw new ImportFileError('the first row must name the columns, with a "name" column (see the column list)');
  const rowErrors = new Map<number, string[]>();
  parsed.rows.slice(1).forEach((cells, i) => {
    if (cells.length > header.length && cells.slice(header.length).some((c) => c.trim() !== '')) rowErrors.set(i + 1, ['this row has more values than the first row has column names']);
  });
  return { records, rowErrors };
}

// The import itself, on the caller's tenant-context connection (so the
// flow tests run it on PGlite). `preview`: validate every row and suggest
// siblings, write nothing.
export async function importStudentRecords(
  client: Sql,
  claims: { schoolId: string; sub: string; role?: string },
  records: Record<string, string | undefined>[],
  fileHash: string,
  fileName: string,
  opts: { preview?: boolean; rowErrors?: ReadonlyMap<number, string[]>; today?: string } = {}
): Promise<ImportResult> {
  const preview = opts.preview === true;
  const today = opts.today ?? indiaDate();

  // File-hash idempotency: a byte-identical re-upload returns the
  // PRIOR result unchanged, never re-processed -- checked inside the
  // same transaction the insert would run in, and also enforced at
  // the database layer by csv_imports' own (school_id, file_hash)
  // unique index, so a racing duplicate request can't slip past a
  // check-then-insert gap either.
  const existing = await client.query(
    `select import_id, row_count, imported_count, skipped_count, errors, created_at
     from csv_imports where school_id = $1 and file_hash = $2`,
    [claims.schoolId, fileHash]
  );
  if (existing.rows[0]) {
    const prior = existing.rows[0];
    return {
      alreadyImported: true,
      preview,
      refused: false,
      importId: prior.import_id,
      importedAt: prior.created_at,
      rowCount: prior.row_count,
      importedCount: prior.imported_count,
      skippedCount: prior.skipped_count,
      errors: prior.errors,
      siblingSuggestions: [],
    };
  }

  // Phase 1: validate every row. Class lookup is read-only and
  // scoped to this school -- classes not found by exact name are a
  // per-row error, never silently ignored or fuzzy-matched.
  const classRows = await client.query(`select class_id, name from classes where school_id = $1`, [claims.schoolId]);
  const classByName = new Map<string, string>(
    classRows.rows.map((r: { class_id: string; name: string }) => [r.name.trim().toLowerCase(), r.class_id])
  );
  // Duplicate records (C235-A): an admission number is one student's, in the
  // file and in the school, case and spaces at the ends ignored.
  const takenAdmissionNos = new Set<string>(
    (await client.query(`select lower(btrim(admission_no)) as a from students where school_id = $1 and admission_no is not null`, [claims.schoolId])).rows.map((r: { a: string }) => r.a)
  );
  const firstRowOfAdmissionNo = new Map<string, number>();

  const valid: ValidRow[] = [];
  const errors: RowError[] = [];

  records.forEach((rec, i) => {
    const row = i + 1;
    const name = rec.name?.trim() ?? '';
    const admissionNo = rec.admission_no?.trim() || null;
    const className = rec.class_name?.trim() || null;
    const rollNo = rec.roll_no?.trim() || null;
    const dob = rec.dob?.trim() || null;
    const rowErrors: string[] = [...(opts.rowErrors?.get(row) ?? []), ...basicRowErrors(rec, today)];
    if (admissionNo) {
      const key = admissionNo.toLowerCase();
      const first = firstRowOfAdmissionNo.get(key);
      if (first !== undefined) rowErrors.push(`admission number "${admissionNo}" is also on row ${first} of this file`);
      else firstRowOfAdmissionNo.set(key, row);
      if (takenAdmissionNos.has(key)) rowErrors.push(`admission number "${admissionNo}" already belongs to a student of this school`);
    }
    const gender = readImportGender(rec[GENDER_COLUMN]);
    if (!gender.ok) rowErrors.push('gender must be male, female or transgender, as Aadhaar prints it, or left empty');
    else if (gender.value !== 'not_given' && !mayRecordGender(claims.role ?? '')) rowErrors.push('only the principal or the school admin records a gender');

    let classId: string | null = null;
    if (className) {
      const found = classByName.get(className.toLowerCase());
      if (!found) {
        rowErrors.push(`class "${className}" does not exist at this school`);
      } else {
        classId = found;
      }
    }

    if (rowErrors.length > 0) {
      errors.push({ row, name, admissionNo, errors: rowErrors });
    } else {
      // The id is chosen here so a suggestion can name the new student.
      valid.push({ row, studentId: randomUUID(), phone: phoneKey(rec.guardian_phone), email: emailKey(rec.guardian_email), name, admissionNo, classId, rollNo, dob, gender: gender.ok ? gender.value : 'not_given' });
    }
  });

  // Sibling suggestions for valid rows with a guardian phone or email that
  // matches a guardian on record. Read only.
  const matches = await suggestSiblingsFor(
    client,
    claims.schoolId,
    valid.filter((v) => v.phone || v.email).map((v) => ({ key: String(v.row), phone: v.phone, email: v.email }))
  );
  // All or nothing: a file with any row error writes nothing (C235-A).
  const refused = !preview && errors.length > 0;
  const siblingSuggestions: ImportSiblingSuggestion[] = valid
    .filter((v) => matches.has(String(v.row)))
    .map((v) => ({ row: v.row, studentId: preview || refused ? null : v.studentId, name: v.name, matches: matches.get(String(v.row))! }));

  if (preview || refused) {
    return {
      alreadyImported: false,
      preview,
      refused,
      importId: '',
      importedAt: '',
      rowCount: records.length,
      importedCount: 0,
      skippedCount: errors.length,
      errors,
      siblingSuggestions,
    };
  }

  // Phase 2: one transaction, one insert for every row -- students
  // always land in pending_consent (PRD Sec3.1), never client-settable.
  // The rows go as one array a column (unnest), not one parameter a
  // value: Postgres takes at most 65,535 parameters in a statement, and
  // eight a row passed that at 8,192 rows (C235-A). A composite-FK mismatch here (which
  // cannot actually happen through this code path, since classId is
  // always resolved from a same-school lookup above) would surface
  // as a real Postgres 23503 and abort the whole transaction --
  // correct behavior per this task's own instruction, not a bug to
  // catch and paper over.
  let importedCount = 0;
  if (valid.length > 0) {
    const insertResult = await client.query(
      `insert into students (student_id, school_id, admission_no, name, class_id, roll_no, dob, gender, status)
       select v.student_id, $1, v.admission_no, v.name, v.class_id, v.roll_no, v.dob, v.gender, 'pending_consent'
         from unnest($2::uuid[], $3::text[], $4::text[], $5::uuid[], $6::text[], $7::date[], $8::text[]) as v(student_id, admission_no, name, class_id, roll_no, dob, gender)`,
      [
        claims.schoolId,
        valid.map((v) => v.studentId),
        valid.map((v) => v.admissionNo),
        valid.map((v) => v.name),
        valid.map((v) => v.classId),
        valid.map((v) => v.rollNo),
        valid.map((v) => v.dob),
        valid.map((v) => v.gender),
      ]
    );
    importedCount = insertResult.rowCount ?? valid.length;
  }

  const { rows: importRows } = await client.query(
    `insert into csv_imports (school_id, file_hash, file_name, imported_by, row_count, imported_count, skipped_count, errors)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     returning import_id, created_at`,
    [claims.schoolId, fileHash, fileName, claims.sub, records.length, importedCount, errors.length, JSON.stringify(errors)]
  );

  return {
    alreadyImported: false,
    preview: false,
    refused: false,
    importId: importRows[0].import_id,
    importedAt: importRows[0].created_at,
    rowCount: records.length,
    importedCount,
    skippedCount: errors.length,
    errors,
    siblingSuggestions,
  };
}
