import { createHash } from 'crypto';
import { withTenantContext } from '@/lib/auth/db';
import type { SessionClaims } from '@/lib/auth/types';
import { parseCsv, rowsToRecords } from './csv';
import { basicRowErrors } from './rules';

export interface RowError {
  row: number; // 1-indexed data row (header is row 0, first data row is 1)
  name: string;
  admissionNo: string | null;
  errors: string[];
}

interface ValidRow {
  row: number;
  name: string;
  admissionNo: string | null;
  classId: string | null;
  rollNo: string | null;
  dob: string | null;
}

export interface ImportResult {
  alreadyImported: boolean;
  importId: string;
  importedAt: string;
  rowCount: number;
  importedCount: number;
  skippedCount: number;
  errors: RowError[];
}

// Two-phase commit, per Prompt F Task 2: Phase 1 validates every row
// (including resolving class_name -> class_id via a same-school-scoped
// lookup -- never a raw class_id column, so there is no CSV column an
// attacker or a copy-pasted spreadsheet could use to smuggle another
// school's class in) and produces a complete per-row error report
// before anything is written. Phase 2 inserts every VALID row inside
// ONE transaction; an invalid row is skipped and reported, never
// silently dropped or worked around. No sibling/guardian matching
// happens here at all -- this only ever touches `students`, per this
// project's explicit-data-only discipline (05_BUSINESS_LOGIC.md Sec3.3).
//
// Extracted from the API route so the same logic can be exercised
// directly from a verification route with fixture claims -- never
// duplicated, never a paraphrase of what production runs.
export async function runCsvImport(
  claims: SessionClaims & { schoolId: string },
  buffer: Buffer,
  fileName: string
): Promise<ImportResult> {
  const fileHash = createHash('sha256').update(buffer).digest('hex');
  const records = rowsToRecords(parseCsv(buffer.toString('utf-8')));

  if (records.length === 0) {
    throw new Error('no data rows found (check the file has a header row plus at least one data row)');
  }

  return withTenantContext(claims, async (client) => {
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
        importId: prior.import_id,
        importedAt: prior.created_at,
        rowCount: prior.row_count,
        importedCount: prior.imported_count,
        skippedCount: prior.skipped_count,
        errors: prior.errors,
      };
    }

    // Phase 1: validate every row. Class lookup is read-only and
    // scoped to this school -- classes not found by exact name are a
    // per-row error, never silently ignored or fuzzy-matched.
    const classRows = await client.query(`select class_id, name from classes where school_id = $1`, [
      claims.schoolId,
    ]);
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
        valid.push({ row, name, admissionNo, classId, rollNo, dob });
      }
    });

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
        params.push(claims.schoolId, v.admissionNo, v.name, v.classId, v.rollNo, v.dob);
        values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, 'pending_consent')`);
      });
      const insertResult = await client.query(
        `insert into students (school_id, admission_no, name, class_id, roll_no, dob, status)
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
      importId: importRows[0].import_id,
      importedAt: importRows[0].created_at,
      rowCount: records.length,
      importedCount,
      skippedCount: errors.length,
      errors,
    };
  });
}
