import { NextRequest, NextResponse } from 'next/server';
import { withSuperAdminBypass } from '@/lib/auth/db';
import type { SessionClaims } from '@/lib/auth/types';
import { runCsvImport } from '@/lib/import/run-import';
import { captureDocument, reviewDocument } from '@/lib/capture/documents';
import { generateToken, qrPayloadToToken, tokenToQrPayload } from '@/lib/capture/qr';
import { resolveQrScan } from '@/lib/capture/scan';
import { DOC_TEST_IMAGE_BASE64, AADHAAR_TEST_IMAGE_BASE64 } from './fixtures';

// Temporary, Preview-only, C38-pattern verification route. This is the
// SECOND VERIFY pass for Prompt F: the first pass's own route
// (src/app/api/diag-f-verify, Decision Log C46/C48) covered Task 0,
// the composite-FK negative test, OCR extraction, and the Aadhaar
// constraint, but never produced real evidence for the 500-row CSV
// import, the OCR review round trip (accept + correct, via the actual
// captureDocument/reviewDocument functions production calls -- not a
// re-implementation), or a live cross-tenant QR scan denial with its
// logged row. This route closes exactly those three gaps, nothing else
// -- sectioned via ?section= to stay under the fetch tool's ~60s
// ceiling (found live during the first VERIFY pass). Removed, token
// included, before this branch's PR is mergeable again; removal
// confirmed with a real fetch returning a genuine 404.
function hasValidToken(req: NextRequest): boolean {
  const expected = process.env.DIAG_TOKEN_F_VERIFY2;
  if (!expected) return false;
  return req.nextUrl.searchParams.get('token') === expected;
}

const SCHOOL_ALPHA = 'fe7fd8cc-1f7c-4a65-84a6-be4895e99eae';
const SCHOOL_BETA = 'ef65e3ad-dfd9-41a8-bc50-22f977a3fc12';

const ADMIN_ALPHA: SessionClaims & { schoolId: string } = {
  sub: '932b65ef-59fd-446b-bb52-6d6189dd6d0e',
  role: 'school_admin',
  schoolId: SCHOOL_ALPHA,
  membershipId: '54e43138-a5e3-42f5-8f44-c9969ce5b628',
  tokenVersion: 0,
  aal: 'aal1',
  sessionId: 'diag-verify2',
};
const PRINCIPAL_BETA: SessionClaims & { schoolId: string } = {
  sub: 'c8dfbfe1-3e5e-4ed0-8993-4b7dcbc9d3cc',
  role: 'principal',
  schoolId: SCHOOL_BETA,
  membershipId: '45b4ecf8-6c1f-4c22-84cf-f12ceee2c29e',
  tokenVersion: 0,
  aal: 'aal1',
  sessionId: 'diag-verify2',
};

function buildCsv(): { buffer: Buffer; validCount: number; invalidCount: number } {
  const header = 'name,admission_no,class_name,roll_no,dob';
  const rows: string[] = [header];
  for (let i = 1; i <= 497; i++) {
    rows.push(`VerifyF2 Student ${i},VERIFYF2-${i},VerifyF2-8A,${i},2015-01-01`);
  }
  rows.push(`,VERIFYF2-BAD1,VerifyF2-8A,1,2015-01-01`); // missing name
  rows.push(`VerifyF2 Bad Class,VERIFYF2-BAD2,NoSuchClass,2,2015-01-01`); // unknown class
  rows.push(`VerifyF2 Bad Date,VERIFYF2-BAD3,VerifyF2-8A,3,14/06/2015`); // wrong date format
  return { buffer: Buffer.from(rows.join('\n'), 'utf-8'), validCount: 497, invalidCount: 3 };
}

async function runCsvSection() {
  await withSuperAdminBypass(async (client) => {
    await client.query(
      `insert into classes (school_id, name) values ($1, 'VerifyF2-8A') on conflict do nothing`,
      [SCHOOL_ALPHA]
    );
  });

  const { buffer, validCount, invalidCount } = buildCsv();
  const import1 = await runCsvImport(ADMIN_ALPHA, buffer, 'verify2-500.csv');
  const import2 = await runCsvImport(ADMIN_ALPHA, buffer, 'verify2-500.csv'); // byte-identical re-upload

  const dbCount = await withSuperAdminBypass(async (client) => {
    const { rows } = await client.query(
      `select count(*)::int as n from students where school_id = $1 and admission_no like 'VERIFYF2-%'`,
      [SCHOOL_ALPHA]
    );
    return rows[0].n as number;
  });

  const result = {
    csvImport: {
      firstRun: { rowCount: import1.rowCount, importedCount: import1.importedCount, skippedCount: import1.skippedCount, errors: import1.errors },
      secondRun_identicalFile: {
        alreadyImported: import2.alreadyImported,
        importId_matches_first: import2.importId === import1.importId,
        importedCount: import2.importedCount,
        skippedCount: import2.skippedCount,
      },
      expected: { rowCount: 500, importedCount: validCount, skippedCount: invalidCount },
      realStudentCountInDbAfterBothRuns: dbCount,
      pass:
        import1.rowCount === 500 &&
        import1.importedCount === validCount &&
        import1.skippedCount === invalidCount &&
        import2.alreadyImported === true &&
        import2.importId === import1.importId &&
        dbCount === validCount, // proves the second (identical) run did NOT duplicate rows
    },
  };

  // Cleanup: this section's own fixture rows only.
  await withSuperAdminBypass(async (client) => {
    await client.query(`delete from students where school_id = $1 and admission_no like 'VERIFYF2-%'`, [SCHOOL_ALPHA]);
    await client.query(`delete from csv_imports where school_id = $1 and import_id = $2`, [SCHOOL_ALPHA, import1.importId]);
    await client.query(`delete from classes where school_id = $1 and name = 'VerifyF2-8A'`, [SCHOOL_ALPHA]);
  });

  return result;
}

async function runOcrSection() {
  const studentId = await withSuperAdminBypass(async (client) => {
    const existing = await client.query(`select student_id from students where school_id = $1 and admission_no = 'VERIFYF2-OCR'`, [SCHOOL_ALPHA]);
    if (existing.rows[0]) return existing.rows[0].student_id as string;
    const { rows } = await client.query(
      `insert into students (school_id, admission_no, name, status) values ($1, 'VERIFYF2-OCR', 'Rahul Sharma', 'pending_consent') returning student_id`,
      [SCHOOL_ALPHA]
    );
    return rows[0].student_id as string;
  });

  // --- Full round trip via the guardian_id (Aadhaar) path: this is the
  // one doc type that never depends on Supabase's service-role
  // credential (still not configured in this project -- see Decision
  // Log C48), so it's the one that can give a genuine, unblocked proof
  // of captureDocument -> reviewDocument today, through the literal
  // production functions.
  const aadhaarImage = Buffer.from(AADHAAR_TEST_IMAGE_BASE64, 'base64');
  const capture = await captureDocument(ADMIN_ALPHA, studentId, 'guardian_id', aadhaarImage, 'image/png', null);
  if (!capture) throw new Error('captureDocument returned null -- student not found');

  const preFillExtractions = capture.extractions.map((e) => ({ field_name: e.field_name, extracted_value: e.extracted_value, confidence: e.confidence }));

  let reviewOutcome: Record<string, unknown> = { skipped: 'fewer than 2 candidate fields extracted -- OCR result was empty for this image' };
  let finalExtractions: unknown[] = [];
  if (capture.extractions.length >= 2) {
    const review = await reviewDocument(ADMIN_ALPHA, capture.document.document_id, [
      { extractionId: capture.extractions[0].extraction_id, accepted: true },
      { extractionId: capture.extractions[1].extraction_id, accepted: false, correctedValue: 'HUMAN-CORRECTED-VALUE' },
    ]);
    reviewOutcome = { documentId: review?.documentId, studentFieldsCommitted: review?.studentFieldsCommitted };

    finalExtractions = await withSuperAdminBypass(async (client) => {
      const { rows } = await client.query(
        `select field_name, extracted_value, accepted, corrected_value, reviewed_at is not null as was_reviewed
         from ocr_extractions where document_id = $1 order by field_name`,
        [capture.document.document_id]
      );
      return rows;
    });
  }

  // --- Honest, separate check on the still-open service-role-credential
  // gap (Decision Log C48): attempt a real (non-Aadhaar) upload, which
  // does need storage, and report whatever actually happens -- pass or
  // the real thrown error's own message -- rather than assuming it's
  // still broken.
  let storageStatus: Record<string, unknown>;
  try {
    const docImage = Buffer.from(DOC_TEST_IMAGE_BASE64, 'base64');
    const nonAadhaarCapture = await captureDocument(ADMIN_ALPHA, studentId, 'birth_certificate', docImage, 'image/png', null);
    storageStatus = { pass: true, documentId: nonAadhaarCapture?.document.document_id, signedUrlIssued: Boolean(nonAadhaarCapture?.signedUrl) };
    if (nonAadhaarCapture) {
      await withSuperAdminBypass(async (client) => {
        await client.query(`delete from ocr_extractions where document_id = $1`, [nonAadhaarCapture.document.document_id]);
        await client.query(`delete from captured_documents where document_id = $1`, [nonAadhaarCapture.document.document_id]);
      });
    }
  } catch (err) {
    // Reports the raw error message as-is -- if it's the missing
    // credential, the message itself already says so; no need to
    // pattern-match the credential's own name here to know that.
    storageStatus = { pass: false, error: err instanceof Error ? err.message : String(err) };
  }

  const result = {
    ocrReviewRoundTrip: {
      preFill: preFillExtractions,
      reviewDecisionsSubmitted: capture.extractions.length >= 2 ? { accepted: capture.extractions[0].field_name, corrected: capture.extractions[1].field_name } : null,
      reviewOutcome,
      committedOcrExtractionsAfterReview: finalExtractions,
      pass: finalExtractions.some((r) => (r as { accepted: boolean }).accepted === true) && finalExtractions.some((r) => (r as { accepted: boolean }).accepted === false && (r as { corrected_value: string }).corrected_value === 'HUMAN-CORRECTED-VALUE'),
    },
    nonAadhaarStorageStatus: storageStatus,
  };

  await withSuperAdminBypass(async (client) => {
    await client.query(`delete from ocr_extractions where document_id = $1`, [capture.document.document_id]);
    await client.query(`delete from captured_documents where document_id = $1`, [capture.document.document_id]);
    await client.query(`delete from students where school_id = $1 and student_id = $2`, [SCHOOL_ALPHA, studentId]);
  });

  return result;
}

async function runQrSection() {
  const studentId = await withSuperAdminBypass(async (client) => {
    const { rows } = await client.query(
      `insert into students (school_id, admission_no, name, status) values ($1, 'VERIFYF2-QR', 'QR Cross Tenant Test', 'pending_consent') returning student_id`,
      [SCHOOL_ALPHA]
    );
    return rows[0].student_id as string;
  });

  const token = generateToken();
  await withSuperAdminBypass(async (client) => {
    await client.query(`insert into student_qr_tokens (school_id, student_id, token) values ($1, $2, $3)`, [SCHOOL_ALPHA, studentId, token]);
  });
  const payload = tokenToQrPayload(token);

  // Control: same-tenant resolve, proves the token itself is valid.
  const resolvedSameTenant = await resolveQrScan(ADMIN_ALPHA, payload, 'lookup', 'diag-verify2', qrPayloadToToken);

  // The actual VERIFY item: an authenticated scanner at School Beta
  // resolving a token that belongs to School Alpha.
  const crossTenant = await resolveQrScan(PRINCIPAL_BETA, payload, 'lookup', 'diag-verify2', qrPayloadToToken);

  const crossTenantLogRow = await withSuperAdminBypass(async (client) => {
    const { rows } = await client.query(
      `select school_id, token_id, student_id, scanned_by, purpose, result, scanned_at
       from qr_scan_log where school_id = $1 and scanned_by = $2 and result = 'cross_tenant_denied'
       order by scanned_at desc limit 1`,
      [SCHOOL_BETA, PRINCIPAL_BETA.sub]
    );
    return rows[0] ?? null;
  });

  const result = {
    qrCrossTenant: {
      controlResolveSameTenant: resolvedSameTenant.result,
      crossTenantScanResult: crossTenant.result,
      crossTenantLogRow,
      pass:
        resolvedSameTenant.result === 'resolved' &&
        crossTenant.result === 'cross_tenant_denied' &&
        crossTenantLogRow !== null &&
        crossTenantLogRow.school_id === SCHOOL_BETA &&
        crossTenantLogRow.token_id === null &&
        crossTenantLogRow.student_id === null &&
        crossTenantLogRow.scanned_by === PRINCIPAL_BETA.sub,
    },
  };

  await withSuperAdminBypass(async (client) => {
    await client.query(`delete from qr_scan_log where school_id = $1 and student_id = $2`, [SCHOOL_ALPHA, studentId]);
    await client.query(`delete from qr_scan_log where school_id = $1 and scanned_by = $2 and result = 'cross_tenant_denied'`, [
      SCHOOL_BETA,
      PRINCIPAL_BETA.sub,
    ]);
    await client.query(`delete from student_qr_tokens where school_id = $1 and student_id = $2`, [SCHOOL_ALPHA, studentId]);
    await client.query(`delete from students where school_id = $1 and student_id = $2`, [SCHOOL_ALPHA, studentId]);
  });

  return result;
}

export async function GET(req: NextRequest) {
  if (!hasValidToken(req)) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const section = req.nextUrl.searchParams.get('section');

  try {
    if (section === 'csv') return NextResponse.json(await runCsvSection());
    if (section === 'ocr') return NextResponse.json(await runOcrSection());
    if (section === 'qr') return NextResponse.json(await runQrSection());
    return NextResponse.json({ error: 'section must be one of csv, ocr, qr' }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined },
      { status: 500 }
    );
  }
}
