import { NextRequest, NextResponse } from 'next/server';
import { withSuperAdminBypass, withTenantContext } from '@/lib/auth/db';
import { sendWhatsAppMessage } from '@/lib/whatsapp/gate';
import { MockWhatsAppProvider } from '@/lib/whatsapp/provider';
import type { PoolClient } from 'pg';
import type { SessionClaims } from '@/lib/auth/types';

// C38-pattern temporary, Preview-only, token-gated diagnostic route.
// Removed and 404-confirmed before this PR merges. Every section
// creates its own throwaway school/admin/student/parent (never touches
// the shared School Alpha/Beta fixtures other prompts' VERIFY passes
// depend on).
//
// Fixture creation and cleanup are each their OWN withSuperAdminBypass
// call (committing independently) rather than one call wrapping the
// whole section -- found live: withTenantContext opens a genuinely
// separate pooled connection/transaction, so a fixture row inserted on
// withSuperAdminBypass's own still-open transaction is invisible to it
// under Postgres's normal read-committed isolation ("session revoked:
// user row not found" on the very first run). Committing the fixture
// first, then exercising it through withTenantContext exactly the way
// production code does, is both the fix and the more honest test.
function checkToken(req: NextRequest): NextResponse | null {
  const token = req.nextUrl.searchParams.get('token');
  if (!token || token !== process.env.DIAG_TOKEN_H_VERIFY) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  return null;
}

interface Fixture {
  schoolId: string;
  userId: string;
  membershipId: string;
  studentId: string;
  parentId: string;
  parentPhone: string;
}

async function createFixture(overrides: {
  isPilot?: boolean;
  pilotAllowOutbound?: boolean;
  monthlyBudgetPaise?: number | null;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  grantConsent?: boolean;
} = {}): Promise<Fixture> {
  return withSuperAdminBypass(async (client) => {
    const suffix = Math.random().toString(36).slice(2, 10);
    const { rows: schoolRows } = await client.query(
      `insert into schools (name, jurisdiction, is_pilot, pilot_allow_outbound, monthly_budget_paise, quiet_hours_start, quiet_hours_end)
       values ($1, 'IN-HR', $2, $3, $4, $5, $6)
       returning school_id`,
      [
        `VERIFYH-${suffix}`,
        overrides.isPilot ?? false,
        overrides.pilotAllowOutbound ?? true,
        overrides.monthlyBudgetPaise === undefined ? 100000 : overrides.monthlyBudgetPaise,
        overrides.quietHoursStart ?? '21:00',
        overrides.quietHoursEnd ?? '07:00',
      ]
    );
    const schoolId = schoolRows[0].school_id;

    const { rows: userRows } = await client.query(
      `insert into users (school_id, display_name, role) values ($1, 'VerifyH Admin', 'school_admin') returning user_id`,
      [schoolId]
    );
    const userId = userRows[0].user_id;

    const { rows: membershipRows } = await client.query(
      `insert into memberships (user_id, school_id, role) values ($1, $2, 'school_admin') returning membership_id`,
      [userId, schoolId]
    );
    const membershipId = membershipRows[0].membership_id;

    const { rows: studentRows } = await client.query(
      `insert into students (school_id, name, status) values ($1, 'VerifyH Student', 'active') returning student_id`,
      [schoolId]
    );
    const studentId = studentRows[0].student_id;

    const parentPhone = `9${Math.floor(100000000 + Math.random() * 899999999)}`;
    const { rows: parentRows } = await client.query(
      `insert into parents (school_id, name, phone) values ($1, 'VerifyH Parent', $2) returning parent_id`,
      [schoolId, parentPhone]
    );
    const parentId = parentRows[0].parent_id;
    await client.query(`insert into parent_student_map (school_id, parent_id, student_id) values ($1, $2, $3)`, [
      schoolId,
      parentId,
      studentId,
    ]);

    if (overrides.grantConsent) {
      await client.query(
        `insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, actor_user_id, notice_version)
         values ($1, $2, 'operational_communication', true, 'school_attested', $3, 'v1')`,
        [schoolId, studentId, userId]
      );
    }

    return { schoolId, userId, membershipId, studentId, parentId, parentPhone };
  });
}

// consent_ledger is append-only even for nca_super (Prompt H Stage 0b's
// own fix) -- a granted-consent fixture's row there can never be
// deleted through this app, by design, and schools' FK from
// consent_ledger has ON DELETE NO ACTION, so the throwaway school
// itself becomes permanently undeletable too once consent was ever
// granted. This is the CORRECT, intended consequence of an append-only
// audit trail, not a bug to route around -- so this cleanup does
// everything it structurally can (every other child row, every vault
// secret) and reports what it could NOT remove. Residual VERIFYH-%
// schools/consent_ledger rows are swept up afterward with a
// privileged, one-time direct SQL pass (Supabase's own postgres role,
// which owns the table and isn't subject to the same-session grants
// this fix revoked), never by loosening what this migration correctly
// locked down.
// Each statement runs in its OWN try/catch: withSuperAdminBypass rolls
// back its entire transaction on any thrown error, so one FK failure
// (a granted-consent fixture's student/school rows, blocked by
// consent_ledger's own NO ACTION FKs -- found live) would otherwise
// silently undo every OTHER delete that already succeeded, not just
// the one that failed.
async function tryDelete(client: PoolClient, sql: string, args: unknown[]): Promise<boolean> {
  // A savepoint, not just a JS try/catch: once any statement in a
  // Postgres transaction errors, the WHOLE transaction is aborted and
  // every later statement fails with "current transaction is aborted"
  // until a rollback -- a bare try/catch here would silently poison
  // every delete after the first FK failure, not just skip that one.
  await client.query('savepoint cleanup_step');
  try {
    await client.query(sql, args);
    await client.query('release savepoint cleanup_step');
    return true;
  } catch {
    await client.query('rollback to savepoint cleanup_step');
    return false;
  }
}

async function cleanupFixture(fixture: Fixture): Promise<{ fullyCleanedUp: boolean }> {
  return withSuperAdminBypass(async (client) => {
    await tryDelete(client, `delete from communication_log where school_id = $1`, [fixture.schoolId]);
    await tryDelete(client, `delete from parent_student_map where school_id = $1`, [fixture.schoolId]);
    await tryDelete(client, `delete from parents where school_id = $1`, [fixture.schoolId]);
    const { rows: configRows } = await client.query(
      `select access_token_secret_id, webhook_verify_token_secret_id from school_whatsapp_configs where school_id = $1`,
      [fixture.schoolId]
    );
    await tryDelete(client, `delete from school_whatsapp_configs where school_id = $1`, [fixture.schoolId]);
    for (const row of configRows) {
      if (row.access_token_secret_id) await tryDelete(client, `delete from vault.secrets where id = $1`, [row.access_token_secret_id]);
      if (row.webhook_verify_token_secret_id)
        await tryDelete(client, `delete from vault.secrets where id = $1`, [row.webhook_verify_token_secret_id]);
    }
    await tryDelete(client, `delete from memberships where school_id = $1`, [fixture.schoolId]);
    await tryDelete(client, `delete from users where school_id = $1`, [fixture.schoolId]);
    const studentsDeleted = await tryDelete(client, `delete from students where school_id = $1`, [fixture.schoolId]);
    const schoolDeleted = studentsDeleted && (await tryDelete(client, `delete from schools where school_id = $1`, [fixture.schoolId]));
    return { fullyCleanedUp: schoolDeleted };
  });
}

function claimsFor(fixture: Fixture): SessionClaims {
  return {
    sub: fixture.userId,
    role: 'school_admin',
    schoolId: fixture.schoolId,
    membershipId: fixture.membershipId,
    tokenVersion: 0,
    aal: 'aal1',
    sessionId: 'diag-h-verify',
  };
}

async function runConsentSection() {
  const fixture = await createFixture({ grantConsent: false });
  const { result, queryable } = await withTenantContext(claimsFor(fixture), async (c) => {
    const result = await sendWhatsAppMessage(c, {
      schoolId: fixture.schoolId,
      studentId: fixture.studentId,
      purpose: 'operational_communication',
      toPhone: fixture.parentPhone,
      templateName: 'attendance_absence_notification',
      templateParams: {},
      dedupeKey: 'verifyh-consent-1',
    });
    const { rows } = await c.query(`select status, reason from communication_log where log_id = $1`, [result.logId]);
    return { result, queryable: rows[0] };
  });
  const cleanup = await cleanupFixture(fixture);
  return { result, queryable, cleanup, pass: result.status === 'blocked_consent' && queryable?.status === 'blocked_consent' };
}

async function runQuietHoursSection() {
  const nowIst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const pad = (n: number) => String(n).padStart(2, '0');
  const start = `${pad(nowIst.getHours())}:${pad(nowIst.getMinutes())}`;
  const end = `${pad((nowIst.getHours() + 1) % 24)}:${pad(nowIst.getMinutes())}`;
  const fixture = await createFixture({ grantConsent: true, quietHoursStart: start, quietHoursEnd: end });
  const result = await withTenantContext(claimsFor(fixture), (c) =>
    sendWhatsAppMessage(c, {
      schoolId: fixture.schoolId,
      studentId: fixture.studentId,
      purpose: 'operational_communication',
      toPhone: fixture.parentPhone,
      templateName: 'attendance_absence_notification',
      templateParams: {},
      dedupeKey: 'verifyh-quiet-1',
    })
  );
  const cleanup = await cleanupFixture(fixture);
  return { result, quietHoursWindow: { start, end }, cleanup, pass: result.status === 'blocked_quiet_hours' };
}

async function runIdempotencySection() {
  const fixture = await createFixture({ grantConsent: true });
  const mock = new MockWhatsAppProvider();
  const first = await withTenantContext(claimsFor(fixture), (c) =>
    sendWhatsAppMessage(
      c,
      {
        schoolId: fixture.schoolId,
        studentId: fixture.studentId,
        purpose: 'operational_communication',
        toPhone: fixture.parentPhone,
        templateName: 'attendance_absence_notification',
        templateParams: {},
        dedupeKey: 'verifyh-idempotent-1',
      },
      { platformDefaultProvider: mock }
    )
  );
  const second = await withTenantContext(claimsFor(fixture), (c) =>
    sendWhatsAppMessage(
      c,
      {
        schoolId: fixture.schoolId,
        studentId: fixture.studentId,
        purpose: 'operational_communication',
        toPhone: fixture.parentPhone,
        templateName: 'attendance_absence_notification',
        templateParams: {},
        dedupeKey: 'verifyh-idempotent-1',
      },
      { platformDefaultProvider: mock }
    )
  );
  const logRowCount = await withTenantContext(claimsFor(fixture), async (c) => {
    const { rows } = await c.query(
      `select count(*)::int as n from communication_log where school_id = $1 and dedupe_key = 'verifyh-idempotent-1'`,
      [fixture.schoolId]
    );
    return rows[0].n as number;
  });
  const cleanup = await cleanupFixture(fixture);
  return {
    first,
    second,
    realProviderCallCount: mock.calls.length,
    logRowCount,
    cleanup,
    pass: first.status === 'sent' && second.idempotent === true && mock.calls.length === 1 && logRowCount === 1,
  };
}

async function runBudgetSection() {
  const fixture = await createFixture({ grantConsent: true, monthlyBudgetPaise: 0 });
  const result = await withTenantContext(claimsFor(fixture), (c) =>
    sendWhatsAppMessage(c, {
      schoolId: fixture.schoolId,
      studentId: fixture.studentId,
      purpose: 'operational_communication',
      toPhone: fixture.parentPhone,
      templateName: 'attendance_absence_notification',
      templateParams: {},
      dedupeKey: 'verifyh-budget-1',
    })
  );
  const cleanup = await cleanupFixture(fixture);
  return { result, cleanup, pass: result.status === 'blocked_budget' };
}

async function runResolutionActiveSection() {
  const fixture = await createFixture({ grantConsent: true });
  await withTenantContext(claimsFor(fixture), (c) =>
    c.query(`select whatsapp_config_set_credentials($1, $2, $3, $4, $5, $6, $7)`, [
      fixture.schoolId,
      'verifyh-waba',
      'verifyh-phone-id',
      '+910000000000',
      'fake-access-token',
      'fake-webhook-token',
      fixture.userId,
    ])
  );
  await withTenantContext(claimsFor(fixture), (c) =>
    c.query(`update school_whatsapp_configs set status = 'active' where school_id = $1`, [fixture.schoolId])
  );

  const { result, loggedRow } = await withTenantContext(claimsFor(fixture), async (c) => {
    const result = await sendWhatsAppMessage(c, {
      schoolId: fixture.schoolId,
      studentId: fixture.studentId,
      purpose: 'operational_communication',
      toPhone: fixture.parentPhone,
      templateName: 'attendance_absence_notification',
      templateParams: {},
      dedupeKey: 'verifyh-resolution-active-1',
    });
    const { rows } = await c.query(`select provider_used, fallback_reason, status from communication_log where log_id = $1`, [result.logId]);
    return { result, loggedRow: rows[0] };
  });
  const cleanup = await cleanupFixture(fixture);
  return {
    result,
    loggedRow,
    cleanup,
    pass: result.providerUsed === 'school_specific' && loggedRow?.provider_used === 'school_specific' && loggedRow?.fallback_reason === null,
  };
}

async function runResolutionFallbackSection() {
  const fixture = await createFixture({ grantConsent: true });
  await withTenantContext(claimsFor(fixture), (c) =>
    c.query(`select whatsapp_config_set_credentials($1, $2, $3, $4, $5, $6, $7)`, [
      fixture.schoolId,
      'verifyh-waba',
      'verifyh-phone-id',
      '+910000000000',
      'fake-access-token',
      'fake-webhook-token',
      fixture.userId,
    ])
  );
  await withTenantContext(claimsFor(fixture), (c) =>
    c.query(`update school_whatsapp_configs set status = 'suspended' where school_id = $1`, [fixture.schoolId])
  );

  const mock = new MockWhatsAppProvider();
  const { result, loggedRow } = await withTenantContext(claimsFor(fixture), async (c) => {
    const result = await sendWhatsAppMessage(
      c,
      {
        schoolId: fixture.schoolId,
        studentId: fixture.studentId,
        purpose: 'operational_communication',
        toPhone: fixture.parentPhone,
        templateName: 'attendance_absence_notification',
        templateParams: {},
        dedupeKey: 'verifyh-resolution-fallback-1',
      },
      { platformDefaultProvider: mock }
    );
    const { rows } = await c.query(`select provider_used, fallback_reason, status from communication_log where log_id = $1`, [result.logId]);
    return { result, loggedRow: rows[0] };
  });
  const cleanup = await cleanupFixture(fixture);
  return {
    result,
    loggedRow,
    cleanup,
    pass:
      result.providerUsed === 'platform_default' &&
      loggedRow?.provider_used === 'platform_default' &&
      typeof loggedRow?.fallback_reason === 'string' &&
      loggedRow.fallback_reason.includes('suspended'),
  };
}

export async function GET(req: NextRequest) {
  const denied = checkToken(req);
  if (denied) return denied;

  const section = req.nextUrl.searchParams.get('section');
  try {
    switch (section) {
      case 'consent':
        return NextResponse.json(await runConsentSection());
      case 'quiet_hours':
        return NextResponse.json(await runQuietHoursSection());
      case 'idempotency':
        return NextResponse.json(await runIdempotencySection());
      case 'budget':
        return NextResponse.json(await runBudgetSection());
      case 'resolution_active':
        return NextResponse.json(await runResolutionActiveSection());
      case 'resolution_fallback':
        return NextResponse.json(await runResolutionFallbackSection());
      default:
        return NextResponse.json({ error: 'unknown section' }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'unknown error' }, { status: 500 });
  }
}
