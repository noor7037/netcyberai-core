import { createHash, randomUUID } from 'crypto';
import { withTenantContext } from '@/lib/auth/db';
import type { SessionClaims } from '@/lib/auth/types';
import type { SiblingSuggestion } from '@/lib/contracts/families';
import { emailKey, phoneKey, suggestSiblingsFor } from '@/lib/families/families';
import type { Sql } from '@/lib/jobs/types';
import type { RecordGender } from '@/lib/students/data-check-rules';
import { mayRecordGender, readImportGender } from '@/lib/students/gender';
import { parseCsv, rowsToRecords } from './csv';
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

export interface ImportResult {
  alreadyImported: boolean;
  preview: boolean; // true: checked only, nothing written
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
// before anything is written. Phase 2 inserts every VALID row inside
// ONE transaction; an invalid row is skipped and reported, never
// silently dropped or worked around. No sibling/guardian LINKING
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
  const records = rowsToRecords(parseCsv(buffer.toString('utf-8')));

  if (records.length === 0) {
    throw new Error('no data rows found (check the file has a header row plus at least one data row)');
  }

  return withTenantContext(claims, (client) => importStudentRecords(client, claims, records, fileHash, fileName, opts));
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
  opts: { preview?: boolean } = {}
): Promise<ImportResult> {
  const preview = opts.preview === true;

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

  const valid: ValidRow[] = [];
  const errors: RowError[] = [];

  records.forEach((rec, i) => {
    const row = i + 1;
    const name = rec.name?.trim() ?? '';
    const admissionNo = rec.admission_no?.trim() || null;
    const className = rec.class_name?.trim() || null;
    const rollNo = rec.roll_no?.trim() || null;
    const dob = rec.dob?.trim() || null;
    const rowErrors: string[] = basicRowErrors(rec);
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
  const siblingSuggestions: ImportSiblingSuggestion[] = valid
    .filter((v) => matches.has(String(v.row)))
    .map((v) => ({ row: v.row, studentId: preview ? null : v.studentId, name: v.name, matches: matches.get(String(v.row))! }));

  if (preview) {
    return {
      alreadyImported: false,
      preview: true,
      importId: '',
      importedAt: '',
      rowCount: records.length,
      importedCount: 0,
      skippedCount: errors.length,
      errors,
      siblingSuggestions,
    };
  }

  // Phase 2: one transaction, one multi-row insert for every valid
  // row -- students always land in pending_consent (PRD Sec3.1),
  // never client-settable. A composite-FK mismatch here (which
  // cannot actually happen through this code path, since classId is
  // always resolved from a same-school lookup above) would surface
  // as a real Postgres 23503 and abort the whole transaction --
  // correct behavior per this task's own instruction, not a bug to
  // catch and paper over.
  let importedCount = 0;
  if (valid.length > 0) {
    const values: string[] = [];
    const params: unknown[] = [];
    valid.forEach((v) => {
      const base = params.length;
      params.push(v.studentId, claims.schoolId, v.admissionNo, v.name, v.classId, v.rollNo, v.dob, v.gender);
      values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, 'pending_consent')`);
    });
    const insertResult = await client.query(
      `insert into students (student_id, school_id, admission_no, name, class_id, roll_no, dob, gender, status)
       values ${values.join(', ')}`,
      params
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
    importId: importRows[0].import_id,
    importedAt: importRows[0].created_at,
    rowCount: records.length,
    importedCount,
    skippedCount: errors.length,
    errors,
    siblingSuggestions,
  };
}
