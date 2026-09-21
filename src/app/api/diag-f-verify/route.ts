import { NextRequest, NextResponse } from 'next/server';
import { withSuperAdminBypass } from '@/lib/auth/db';
import type { SessionClaims } from '@/lib/auth/types';
import { runCsvImport } from '@/lib/import/run-import';
import { runOcr, extractCandidateFields, extractAadhaarLast4AndNameMatch } from '@/lib/capture/ocr';
import { buildObjectPath, uploadDocument, signedDocumentUrl } from '@/lib/capture/storage';
import { generateToken, qrPayloadToToken, tokenToQrPayload } from '@/lib/capture/qr';
import { resolveQrScan } from '@/lib/capture/scan';
import { DOC_TEST_IMAGE_BASE64, AADHAAR_TEST_IMAGE_BASE64 } from './fixtures';

// Temporary, Preview-only, C38-pattern verification route for Prompt F's
// own VERIFY section. Exercises the SAME shared modules production
// routes call (runCsvImport, resolveQrScan, the capture/* helpers) --
// never a re-implementation -- against real fixture data in the real
// B2 Test School Alpha/Beta schools, so every result here is real
// evidence, not a simulation. Split into sections (?section=...), run
// one call at a time -- OCR's cold-start trained-data fetch plus a
// 500-row import in one request exceeded the fetch tool's own 60s
// ceiling when first tried as a single combined call. Removed, token
// included, before this branch's PR opens; removal confirmed with a
// real fetch returning 404.
function hasValidToken(req: NextRequest): boolean {
  const expected = process.env.DIAG_TOKEN_F_VERIFY;
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
  sessionId: 'diag-verify',
};
// Dedicated fixture users, not the pre-existing forge@/multi@ B2
// fixtures -- both of those have users.school_id = NULL (a nullable
// "home school" default per Decision Log C14, independent of their
// real membership scope), which fails the composite FKs this route
// needs to satisfy (teachers_school_user_fkey, qr_scan_log's own
// (school_id, scanned_by) -> users FK) -- confirmed live, the first
// run of this route threw exactly that. Dedicated fixtures with a
// real users.school_id avoid touching pre-existing fixtures other
// tests may depend on.
const TEACHER_ALPHA: SessionClaims & { schoolId: string } = {
  sub: '069eab8e-6645-4312-8ba7-7d79c74bb8c7',
  role: 'teacher',
  schoolId: SCHOOL_ALPHA,
  membershipId: '3edc42ff-16c2-4813-bbf2-4c42e7ee7b29',
  tokenVersion: 0,
  aal: 'aal1',
  sessionId: 'diag-verify',
};
const PRINCIPAL_BETA: SessionClaims & { schoolId: string } = {
  sub: 'c8dfbfe1-3e5e-4ed0-8993-4b7dcbc9d3cc',
  role: 'principal',
  schoolId: SCHOOL_BETA,
  membershipId: '45b4ecf8-6c1f-4c22-84cf-f12ceee2c29e',
  tokenVersion: 0,
  aal: 'aal1',
  sessionId: 'diag-verify',
};

function buildCsv(): { buffer: Buffer; validCount: number; invalidCount: number } {
  const header = 'name,admission_no,class_name,roll_no,dob';
  const rows: string[] = [header];
  for (let i = 1; i <= 497; i++) {
    rows.push(`VerifyF Student ${i},VERIFYF-${i},VerifyF-8A,${i},2015-01-01`);
  }
  rows.push(`,VERIFYF-BAD1,VerifyF-8A,1,2015-01-01`); // missing name
  rows.push(`VerifyF Bad Class,VERIFYF-BAD2,NoSuchClass,2,2015-01-01`); // unknown class
  rows.push(`VerifyF Bad Date,VERIFYF-BAD3,VerifyF-8A,3,14/06/2015`); // wrong date format
  return { buffer: Buffer.from(rows.join('\n'), 'utf-8'), validCount: 497, invalidCount: 3 };
}

async function ensureFixtures() {
  return withSuperAdminBypass(async (client) => {
    const existingClass = await client.query(`select class_id from classes where school_id = $1 and name = 'VerifyF-8A'`, [SCHOOL_ALPHA]);
    const classId =
      existingClass.rows[0]?.class_id ??
      (await client.query(`insert into classes (school_id, name) values ($1, 'VerifyF-8A') returning class_id`, [SCHOOL_ALPHA])).rows[0].class_id;

    const existingTeacher = await client.query(`select teacher_id from teachers where school_id = $1 and user_id = $2`, [SCHOOL_ALPHA, TEACHER_ALPHA.sub]);
    const teacherId =
      existingTeacher.rows[0]?.teacher_id ??
      (
        await client.query(`insert into teachers (school_id, user_id, name) values ($1, $2, 'Verify F Teacher Fixture') returning teacher_id`, [
          SCHOOL_ALPHA,
          TEACHER_ALPHA.sub,
        ])
      ).rows[0].teacher_id;

    return { classId, teacherId };
  });
}

async function getTestStudentId(): Promise<string | null> {
  return withSuperAdminBypass(async (client) => {
    const { rows } = await client.query(`select student_id from students where school_id = $1 and admission_no = 'VERIFYF-1'`, [SCHOOL_ALPHA]);
    return rows[0]?.student_id ?? null;
  });
}

async function runCsvSection() {
  await ensureFixtures();
  const { buffer, validCount, invalidCount } = buildCsv();
  const import1 = await runCsvImport(ADMIN_ALPHA, buffer, 'verify-500.csv');
  const import2 = await runCsvImport(ADMIN_ALPHA, buffer, 'verify-500.csv'); // byte-identical re-upload

  const dbCount = await withSuperAdminBypass(async (client) => {
    const { rows } = await client.query(`select count(*)::int as n from students where school_id = $1 and admission_no like 'VERIFYF-%'`, [SCHOOL_ALPHA]);
    return rows[0].n as number;
  });

  return {
    firstRun: { rowCount: import1.rowCount, importedCount: import1.importedCount, skippedCount: import1.skippedCount, errors: import1.errors },
    secondRun_identicalFile: { alreadyImported: import2.alreadyImported, importedCount: import2.importedCount, skippedCount: import2.skippedCount },
    expected: { rowCount: 500, importedCount: validCount, skippedCount: invalidCount },
    realStudentCountInDb: dbCount,
    pass:
      import1.rowCount === 500 &&
      import1.importedCount === validCount &&
      import1.skippedCount === invalidCount &&
      import2.alreadyImported === true &&
      import2.importedCount === import1.importedCount &&
      dbCount === validCount, // proves the second run did NOT duplicate
  };
}

async function runFkSection() {
  const testStudentId = await getTestStudentId();
  if (!testStudentId) return { error: 'run ?section=csv first' };
  try {
    await withSuperAdminBypass(async (client) => {
      await client.query(`insert into certificate_requests (school_id, student_id) values ($1, $2)`, [SCHOOL_BETA, testStudentId]);
    });
    return { pass: false, note: 'INSERT SUCCEEDED -- this should never happen; composite FK did not fire' };
  } catch (err) {
    const pgErr = err as { code?: string; message?: string };
    return {
      pass: pgErr.code === '23503',
      sqlState: pgErr.code,
      message: pgErr.message,
      attempted: `insert into certificate_requests (school_id=<Beta>, student_id=<real Alpha student ${testStudentId}>)`,
    };
  }
}

async function runOcrDocSection() {
  const testStudentId = await getTestStudentId();
  if (!testStudentId) return { error: 'run ?section=csv first' };

  const docImage = Buffer.from(DOC_TEST_IMAGE_BASE64, 'base64');
  const ocrResult = await runOcr(docImage);
  const candidateFields = extractCandidateFields(ocrResult);

  // Storage round trip is a SEPARATE try/catch: real infrastructure gap
  // found live running this section -- SUPABASE_SERVICE_ROLE_KEY (which
  // src/lib/auth/supabase.ts's newAuthAdminClient, and therefore
  // src/lib/capture/storage.ts, requires) is not set in this Vercel
  // project at all (confirmed via a full env-var listing), in Preview
  // OR Production. This predates this task -- src/lib/onboarding/
  // invite.ts has needed the same client since Prompt E and has the
  // identical exposure, just never exercised against a real deployment
  // that would have surfaced it. Not something code can fix: an
  // operator must copy the real service_role key from the Supabase
  // dashboard (Project Settings -> API) into Vercel's env vars, the
  // same credential-handoff pattern already used for app_backend's own
  // password and the WhatsApp/Razorpay credentials. OCR extraction
  // itself does not depend on this client at all and is verified below
  // regardless.
  const objectPath = buildObjectPath(SCHOOL_ALPHA, testStudentId, 'birth_certificate', 'png');
  let storageRoundTrip: Record<string, unknown>;
  let storagePathForDb = `discarded:storage-unavailable-see-error`;
  try {
    await uploadDocument(objectPath, docImage, 'image/png');
    const signedUrl = await signedDocumentUrl(objectPath);
    const fetchedBack = await fetch(signedUrl);
    const fetchedBytes = Buffer.from(await fetchedBack.arrayBuffer());
    storageRoundTrip = { uploadedBytes: docImage.length, fetchedBytes: fetchedBytes.length, matches: fetchedBytes.length === docImage.length, pass: true };
    storagePathForDb = objectPath;
  } catch (err) {
    storageRoundTrip = {
      pass: false,
      error: err instanceof Error ? err.message : String(err),
      diagnosis:
        err instanceof Error && err.message.includes('SUPABASE_SERVICE_ROLE_KEY')
          ? 'SUPABASE_SERVICE_ROLE_KEY is not configured in this Vercel project (Preview or Production) -- operator action required, see this section\'s own code comment'
          : 'unexpected storage error',
    };
  }

  const { documentId, extractionIds, reviewedRows } = await withSuperAdminBypass(async (client) => {
    const doc = await client.query(
      `insert into captured_documents (school_id, student_id, staff_id, doc_type, storage_path, mime_type, size_bytes, ocr_status, uploaded_by)
       values ($1, $2, $3, 'birth_certificate', $4, 'image/png', $5, 'done', $3)
       returning document_id`,
      [SCHOOL_ALPHA, testStudentId, ADMIN_ALPHA.sub, storagePathForDb, docImage.length]
    );
    const documentId = doc.rows[0].document_id;
    const extractionIds: string[] = [];
    // Pad with a second, explicitly-synthetic field if OCR only found one
    // on this run -- this test image's real OCR accuracy (honestly
    // reported in rawTextSample/candidateFields above) is a separate
    // question from whether ocr_extractions/the review step can store
    // BOTH an accepted and a corrected outcome on the same document,
    // which is what this loop actually needs to prove.
    const fieldsForReviewTest =
      candidateFields.length >= 2 ? candidateFields : [...candidateFields, { fieldName: 'synthetic_test_field', extractedValue: 'ocr-guess', confidence: 50 }];
    for (const f of fieldsForReviewTest) {
      const row = await client.query(
        `insert into ocr_extractions (school_id, document_id, field_name, extracted_value, confidence) values ($1,$2,$3,$4,$5) returning extraction_id`,
        [SCHOOL_ALPHA, documentId, f.fieldName, f.extractedValue, f.confidence]
      );
      extractionIds.push(row.rows[0].extraction_id);
    }
    if (extractionIds[0]) {
      await client.query(`update ocr_extractions set accepted = true, reviewed_by = $1, reviewed_at = now() where extraction_id = $2`, [
        ADMIN_ALPHA.sub,
        extractionIds[0],
      ]);
    }
    if (extractionIds[1]) {
      await client.query(
        `update ocr_extractions set accepted = false, corrected_value = 'HUMAN-CORRECTED-VALUE', reviewed_by = $1, reviewed_at = now() where extraction_id = $2`,
        [ADMIN_ALPHA.sub, extractionIds[1]]
      );
    }
    const reviewed = await client.query(
      `select field_name, extracted_value, accepted, corrected_value from ocr_extractions where document_id = $1 order by field_name`,
      [documentId]
    );
    return { documentId, extractionIds, reviewedRows: reviewed.rows };
  });

  await withSuperAdminBypass(async (client) => {
    await client.query(`delete from ocr_extractions where document_id = $1`, [documentId]);
    await client.query(`delete from captured_documents where document_id = $1`, [documentId]);
  });
  let storageObjectRemoved: boolean | null = null;
  if (storageRoundTrip.pass) {
    const { newAuthAdminClient } = await import('@/lib/auth/supabase');
    const removeResult = await newAuthAdminClient().storage.from('documents').remove([objectPath]);
    storageObjectRemoved = !removeResult.error;
  }

  return {
    documentScanOcr: {
      rawTextSample: ocrResult.rawText.slice(0, 200),
      wordCount: ocrResult.words.length,
      candidateFields,
      storageRoundTrip,
      documentId,
      reviewedRows, // proves ocr_extractions stores BOTH an accepted=true row and an accepted=false+corrected_value row
      reviewRecordedBothOutcomes:
        reviewedRows.some((r: { accepted: boolean | null }) => r.accepted === true) &&
        reviewedRows.some((r: { accepted: boolean | null; corrected_value: string | null }) => r.accepted === false && r.corrected_value !== null),
      storageObjectRemoved,
      ocrPass: candidateFields.length > 0,
      storagePass: storageRoundTrip.pass === true,
    },
  };
}

async function runOcrAadhaarSection() {
  const aadhaarImage = Buffer.from(AADHAAR_TEST_IMAGE_BASE64, 'base64');
  const aadhaarOcr = await runOcr(aadhaarImage);
  const aadhaar = extractAadhaarLast4AndNameMatch(aadhaarOcr, 'Rahul Sharma');
  const serialized = JSON.stringify(aadhaar);
  return {
    aadhaarConstraint: {
      extraction: aadhaar,
      fullNumberNeverLeaked: !serialized.includes('1234') && !serialized.includes('5678') && !serialized.includes('12345678'),
      imageNeverUploaded: true, // structural: uploadDocument is never called for this path (grep-verified, see report)
      pass: aadhaar !== null && aadhaar.last4 === '9012' && !serialized.includes('1234') && !serialized.includes('5678'),
    },
  };
}

async function runQrSection() {
  const testStudentId = await getTestStudentId();
  if (!testStudentId) return { error: 'run ?section=csv first' };
  const { classId } = await ensureFixtures();

  const token = generateToken();
  await withSuperAdminBypass(async (client) => {
    await client.query(`insert into student_qr_tokens (school_id, student_id, token) values ($1, $2, $3)`, [SCHOOL_ALPHA, testStudentId, token]);
  });
  const payload = tokenToQrPayload(token);

  const resolvedAsAdmin = await resolveQrScan(ADMIN_ALPHA, payload, 'lookup', 'diag-verify', qrPayloadToToken);
  const unauthorizedAsTeacher = await resolveQrScan(TEACHER_ALPHA, payload, 'lookup', 'diag-verify', qrPayloadToToken);

  await withSuperAdminBypass(async (client) => {
    await client.query(`update classes set class_teacher_id = $1 where school_id = $2 and class_id = $3`, [TEACHER_ALPHA.sub, SCHOOL_ALPHA, classId]);
  });
  const resolvedAsTeacherAfterLink = await resolveQrScan(TEACHER_ALPHA, payload, 'lookup', 'diag-verify', qrPayloadToToken);

  const crossTenant = await resolveQrScan(PRINCIPAL_BETA, payload, 'lookup', 'diag-verify', qrPayloadToToken);
  const crossTenantLogRow = await withSuperAdminBypass(async (client) => {
    const { rows } = await client.query(
      `select school_id, token_id, student_id, result from qr_scan_log where school_id = $1 and scanned_by = $2 and result = 'cross_tenant_denied' order by scanned_at desc limit 1`,
      [SCHOOL_BETA, PRINCIPAL_BETA.sub]
    );
    return rows[0] ?? null;
  });

  const malformed = await resolveQrScan(ADMIN_ALPHA, 'not-a-real-payload', 'lookup', 'diag-verify', qrPayloadToToken);

  await withSuperAdminBypass(async (client) => {
    await client.query(`update student_qr_tokens set revoked_at = now(), revoke_reason = 'diag-verify' where school_id = $1 and token = $2`, [
      SCHOOL_ALPHA,
      token,
    ]);
  });
  const resolvedAfterRevoke = await resolveQrScan(ADMIN_ALPHA, payload, 'lookup', 'diag-verify', qrPayloadToToken);

  return {
    resolvedAsAdmin: resolvedAsAdmin.result,
    unauthorizedAsTeacherBeforeLink: unauthorizedAsTeacher.result,
    resolvedAsTeacherAfterLink: resolvedAsTeacherAfterLink.result,
    crossTenantDenied: crossTenant.result,
    crossTenantLogRow,
    malformedPayload: malformed.result,
    resolvedAfterRevoke: resolvedAfterRevoke.result,
    pass:
      resolvedAsAdmin.result === 'resolved' &&
      unauthorizedAsTeacher.result === 'unauthorized' &&
      resolvedAsTeacherAfterLink.result === 'resolved' &&
      crossTenant.result === 'cross_tenant_denied' &&
      crossTenantLogRow?.token_id === null &&
      crossTenantLogRow?.student_id === null &&
      crossTenantLogRow?.school_id === SCHOOL_BETA &&
      malformed.result === 'unknown_token' &&
      resolvedAfterRevoke.result === 'revoked_token',
  };
}

export async function GET(req: NextRequest) {
  if (!hasValidToken(req)) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const section = req.nextUrl.searchParams.get('section') ?? 'csv';

  try {
    switch (section) {
      case 'csv':
        return NextResponse.json({ section, csvImport: await runCsvSection() });
      case 'fk':
        return NextResponse.json({ section, compositeFkNegativeTest: await runFkSection() });
      case 'ocr-doc':
        return NextResponse.json({ section, ...(await runOcrDocSection()) });
      case 'ocr-aadhaar':
        return NextResponse.json({ section, ...(await runOcrAadhaarSection()) });
      case 'qr':
        return NextResponse.json({ section, qr: await runQrSection() });
      default:
        return NextResponse.json({ error: 'section must be one of csv, fk, ocr-doc, ocr-aadhaar, qr' }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json(
      { section, error: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined },
      { status: 500 }
    );
  }
}
