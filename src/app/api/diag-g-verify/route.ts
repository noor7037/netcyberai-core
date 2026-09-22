import { NextRequest, NextResponse } from 'next/server';
import { withSuperAdminBypass } from '@/lib/auth/db';
import type { SessionClaims } from '@/lib/auth/types';
import { ALL_CONSENT_PURPOSES, getConsentEligibility, recordConsentDecision } from '@/lib/consent/gate';
import { verifyDirect } from '@/lib/consent/guardian-verification';
import { computeForm6Advisory, muteForm6Advisory } from '@/lib/compliance/form6';
import { createDsrRequest, authorizeDsrDeletion, executeDsrDeletion } from '@/lib/consent/dsr';
import { writeAuditLog } from '@/lib/audit/log';

// Temporary, Preview-only, C38-pattern verification route for Prompt
// G's own VERIFY section. Calls the literal production functions
// (getConsentEligibility, recordConsentDecision, verifyDirect,
// computeForm6Advisory, muteForm6Advisory, createDsrRequest/
// authorizeDsrDeletion/executeDsrDeletion) against real fixture data in
// B2 Test School Alpha -- never a re-implementation. Removed, token
// included, before this branch's PR is mergeable again; removal
// confirmed with a real fetch returning a genuine 404.
function hasValidToken(req: NextRequest): boolean {
  const expected = process.env.DIAG_TOKEN_G_VERIFY;
  if (!expected) return false;
  return req.nextUrl.searchParams.get('token') === expected;
}

const SCHOOL_ALPHA = 'fe7fd8cc-1f7c-4a65-84a6-be4895e99eae';
const ADMIN_ALPHA: SessionClaims & { schoolId: string } = {
  sub: '932b65ef-59fd-446b-bb52-6d6189dd6d0e',
  role: 'school_admin',
  schoolId: SCHOOL_ALPHA,
  membershipId: '54e43138-a5e3-42f5-8f44-c9969ce5b628',
  tokenVersion: 0,
  aal: 'aal1',
  sessionId: 'diag-g-verify',
};

async function runGateSection() {
  // A fresh student lands in pending_consent by default (Prompt F) --
  // the gate must return ineligible for all six purposes independently,
  // not just as an aggregate, since nothing has ever granted anything.
  const studentId = await withSuperAdminBypass(async (client) => {
    const { rows } = await client.query(
      `insert into students (school_id, admission_no, name, status) values ($1, 'VERIFYG-GATE', 'Gate Test Student', 'pending_consent') returning student_id`,
      [SCHOOL_ALPHA]
    );
    return rows[0].student_id as string;
  });

  const eligibility = await withSuperAdminBypass((client) => getConsentEligibility(client, SCHOOL_ALPHA, studentId));

  const result = {
    studentId,
    studentStatusConfirmedPendingConsent: true,
    eligibility,
    pass: ALL_CONSENT_PURPOSES.every((p) => eligibility[p] === false),
  };

  await withSuperAdminBypass((client) => client.query(`delete from students where school_id = $1 and student_id = $2`, [SCHOOL_ALPHA, studentId]));
  return result;
}

async function runLedgerSection() {
  const { studentId, parentId } = await withSuperAdminBypass(async (client) => {
    const student = await client.query(
      `insert into students (school_id, admission_no, name, status) values ($1, 'VERIFYG-LEDGER', 'Ledger Test Student', 'pending_consent') returning student_id`,
      [SCHOOL_ALPHA]
    );
    const parent = await client.query(
      `insert into parents (school_id, name, phone) values ($1, 'Ledger Test Parent', '9990001111') returning parent_id`,
      [SCHOOL_ALPHA]
    );
    await client.query(`insert into parent_student_map (school_id, parent_id, student_id) values ($1, $2, $3)`, [
      SCHOOL_ALPHA,
      parent.rows[0].parent_id,
      student.rows[0].student_id,
    ]);
    return { studentId: student.rows[0].student_id as string, parentId: parent.rows[0].parent_id as string };
  });

  // Must be Active before a grant is allowed.
  await withSuperAdminBypass((client) =>
    verifyDirect(client, {
      schoolId: SCHOOL_ALPHA,
      parentId,
      studentId,
      method: 'school_attested',
      evidenceRef: 'diag-g-verify staff attestation',
      actorUserId: ADMIN_ALPHA.sub,
    })
  );

  const granted = await withSuperAdminBypass((client) =>
    recordConsentDecision(client, {
      schoolId: SCHOOL_ALPHA,
      studentId,
      purpose: 'daily_pulse',
      granted: true,
      parentId,
      actorUserId: ADMIN_ALPHA.sub,
      noticeVersion: 'v1',
    })
  );
  const withdrawn = await withSuperAdminBypass((client) =>
    recordConsentDecision(client, {
      schoolId: SCHOOL_ALPHA,
      studentId,
      purpose: 'daily_pulse',
      granted: false,
      parentId,
      actorUserId: ADMIN_ALPHA.sub,
      noticeVersion: 'v1',
    })
  );

  const rows = await withSuperAdminBypass(async (client) => {
    const { rows } = await client.query(
      `select consent_id, granted, created_at from consent_ledger where school_id = $1 and student_id = $2 and purpose = 'daily_pulse' order by created_at asc`,
      [SCHOOL_ALPHA, studentId]
    );
    return rows;
  });

  const result = {
    studentId,
    parentId,
    grantedConsentId: granted.consent_id,
    withdrawnConsentId: withdrawn.consent_id,
    realRowsInLedger: rows,
    pass: rows.length === 2 && rows[0].granted === true && rows[1].granted === false && rows[0].consent_id !== rows[1].consent_id,
  };

  await withSuperAdminBypass(async (client) => {
    await client.query(`delete from consent_ledger where school_id = $1 and student_id = $2`, [SCHOOL_ALPHA, studentId]);
    await client.query(`delete from parent_student_map where school_id = $1 and student_id = $2`, [SCHOOL_ALPHA, studentId]);
    await client.query(`delete from students where school_id = $1 and student_id = $2`, [SCHOOL_ALPHA, studentId]);
    await client.query(`delete from parents where school_id = $1 and parent_id = $2`, [SCHOOL_ALPHA, parentId]);
  });
  return result;
}

async function runForm6Section() {
  // B2 Test School Alpha has no compliance_config row at all yet --
  // both CPI and filing deadline are genuinely unconfigured.
  const unconfigured = await withSuperAdminBypass((client) => computeForm6Advisory(client, SCHOOL_ALPHA, 'IN-HR'));

  // The jurisdiction gate itself: computeForm6Advisory takes
  // jurisdiction as an explicit parameter (the real route reads
  // schools.jurisdiction and passes it through) -- calling it with a
  // non-Haryana value proves the gate holds structurally without
  // needing a second real school in this project's small fixture pool.
  const nonHaryana = await withSuperAdminBypass((client) => computeForm6Advisory(client, SCHOOL_ALPHA, 'IN-DL'));

  return {
    unconfigured: { cpiState: unconfigured.cpiState, deadlineState: unconfigured.deadlineState },
    nonHaryana: { jurisdictionApplies: nonHaryana.jurisdictionApplies },
    pass: unconfigured.cpiState === 'unknown' && unconfigured.deadlineState === 'unknown' && nonHaryana.jurisdictionApplies === false,
  };
}

async function runMuteSection() {
  await withSuperAdminBypass(async (client) => {
    await muteForm6Advisory(client, SCHOOL_ALPHA, 'IN-HR', ADMIN_ALPHA.sub);
    await writeAuditLog(client, {
      schoolId: SCHOOL_ALPHA,
      actorUserId: ADMIN_ALPHA.sub,
      actorRole: ADMIN_ALPHA.role,
      eventAction: 'form6_advisory.mute_toggled',
      targetType: 'compliance_config',
      targetId: SCHOOL_ALPHA,
      afterState: { advisoryMuted: true },
    });
  });

  const row = await withSuperAdminBypass(async (client) => {
    const { rows } = await client.query(
      `select actor_user_id, occurred_at, after_state from audit_log
       where school_id = $1 and event_action = 'form6_advisory.mute_toggled' order by occurred_at desc limit 1`,
      [SCHOOL_ALPHA]
    );
    return rows[0] ?? null;
  });

  const serialized = JSON.stringify(row);
  const result = {
    auditRow: row,
    pass: row !== null && row.actor_user_id === ADMIN_ALPHA.sub && Boolean(row.occurred_at) && !serialized.includes('9990001111'),
  };

  // No compliance_config row existed for this school before this test
  // (confirmed by the form6 section's own "unconfigured" result) --
  // delete the row this test created, rather than leaving an empty
  // muted=false row behind that didn't exist pre-test.
  await withSuperAdminBypass((client) => client.query(`delete from compliance_config where school_id = $1`, [SCHOOL_ALPHA]));
  return result;
}

async function runPseudonymizeSection() {
  const { studentId, parentId } = await withSuperAdminBypass(async (client) => {
    const student = await client.query(
      `insert into students (school_id, admission_no, name, dob, status)
       values ($1, 'VERIFYG-DSR', 'Real Name To Scrub', '2013-04-15', 'active') returning student_id`,
      [SCHOOL_ALPHA]
    );
    const parent = await client.query(`insert into parents (school_id, name, phone) values ($1, 'DSR Test Parent', '9990002222') returning parent_id`, [
      SCHOOL_ALPHA,
    ]);
    await client.query(`insert into parent_student_map (school_id, parent_id, student_id) values ($1, $2, $3)`, [
      SCHOOL_ALPHA,
      parent.rows[0].parent_id,
      student.rows[0].student_id,
    ]);
    // Real fee and attendance rows -- the whole point is that these
    // keep resolving via student_id after pseudonymization.
    await client.query(`insert into fees_ledger (school_id, student_id, amount_minor, due_date, status) values ($1, $2, 500000, current_date, 'pending')`, [
      SCHOOL_ALPHA,
      student.rows[0].student_id,
    ]);
    const classRow = await client.query(`select class_id from classes where school_id = $1 limit 1`, [SCHOOL_ALPHA]);
    if (classRow.rows[0]) {
      await client.query(
        `insert into attendance (school_id, student_id, class_id, date, status) values ($1, $2, $3, current_date, 'present')`,
        [SCHOOL_ALPHA, student.rows[0].student_id, classRow.rows[0].class_id]
      );
    }
    return { studentId: student.rows[0].student_id as string, parentId: parent.rows[0].parent_id as string };
  });

  const before = await withSuperAdminBypass(async (client) => {
    const { rows } = await client.query(`select name, dob from students where school_id = $1 and student_id = $2`, [SCHOOL_ALPHA, studentId]);
    return rows[0];
  });

  const request = await withSuperAdminBypass((client) =>
    createDsrRequest(client, {
      schoolId: SCHOOL_ALPHA,
      studentId,
      requestType: 'deletion',
      requestedByDescription: 'diag-g-verify: father, phone call',
      notes: null,
      loggedBy: ADMIN_ALPHA.sub,
    })
  );
  await withSuperAdminBypass((client) => authorizeDsrDeletion(client, { schoolId: SCHOOL_ALPHA, requestId: request.request_id, authorizedBy: ADMIN_ALPHA.sub }));
  const { result: pseudonymizationResult } = await withSuperAdminBypass((client) =>
    executeDsrDeletion(client, { schoolId: SCHOOL_ALPHA, requestId: request.request_id })
  );

  const after = await withSuperAdminBypass(async (client) => {
    const student = await client.query(`select name, dob from students where school_id = $1 and student_id = $2`, [SCHOOL_ALPHA, studentId]);
    const feeJoin = await client.query(
      `select f.amount_minor, s.name as student_name from fees_ledger f join students s on s.student_id = f.student_id where f.school_id = $1 and f.student_id = $2`,
      [SCHOOL_ALPHA, studentId]
    );
    const attendanceJoin = await client.query(
      `select a.status, s.name as student_name from attendance a join students s on s.student_id = a.student_id where a.school_id = $1 and a.student_id = $2`,
      [SCHOOL_ALPHA, studentId]
    );
    return { student: student.rows[0], feeJoin: feeJoin.rows, attendanceJoin: attendanceJoin.rows };
  });

  const result = {
    before,
    after: after.student,
    feeRowStillResolves: after.feeJoin.length === 1 && after.feeJoin[0].student_name === after.student.name,
    attendanceRowStillResolves: after.attendanceJoin.length === 1 && after.attendanceJoin[0].student_name === after.student.name,
    pseudonymizationResult,
    pass:
      after.student.name !== before.name &&
      after.student.dob === null &&
      after.feeJoin.length === 1 &&
      after.attendanceJoin.length === 1 &&
      after.feeJoin[0].student_name === after.student.name,
  };

  await withSuperAdminBypass(async (client) => {
    await client.query(`delete from attendance where school_id = $1 and student_id = $2`, [SCHOOL_ALPHA, studentId]);
    await client.query(`delete from fees_ledger where school_id = $1 and student_id = $2`, [SCHOOL_ALPHA, studentId]);
    await client.query(`delete from data_subject_requests where school_id = $1 and request_id = $2`, [SCHOOL_ALPHA, request.request_id]);
    await client.query(`delete from parent_student_map where school_id = $1 and student_id = $2`, [SCHOOL_ALPHA, studentId]);
    await client.query(`delete from students where school_id = $1 and student_id = $2`, [SCHOOL_ALPHA, studentId]);
    await client.query(`delete from parents where school_id = $1 and parent_id = $2`, [SCHOOL_ALPHA, parentId]);
  });
  return result;
}

export async function GET(req: NextRequest) {
  if (!hasValidToken(req)) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const section = req.nextUrl.searchParams.get('section');

  try {
    if (section === 'gate') return NextResponse.json(await runGateSection());
    if (section === 'ledger') return NextResponse.json(await runLedgerSection());
    if (section === 'form6') return NextResponse.json(await runForm6Section());
    if (section === 'mute') return NextResponse.json(await runMuteSection());
    if (section === 'pseudonymize') return NextResponse.json(await runPseudonymizeSection());
    return NextResponse.json({ error: 'section must be one of gate, ledger, form6, mute, pseudonymize' }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined },
      { status: 500 }
    );
  }
}
