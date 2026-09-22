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
// depend on) and cleans up everything -- including vault secrets --
// before returning.
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

async function createFixture(
  client: PoolClient,
  overrides: {
    isPilot?: boolean;
    pilotAllowOutbound?: boolean;
    monthlyBudgetPaise?: number | null;
    quietHoursStart?: string;
    quietHoursEnd?: string;
    grantConsent?: boolean;
  } = {}
): Promise<Fixture> {
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
}

async function cleanupFixture(client: PoolClient, fixture: Fixture): Promise<void> {
  await client.query(`delete from communication_log where school_id = $1`, [fixture.schoolId]);
  await client.query(`delete from consent_ledger where school_id = $1`, [fixture.schoolId]);
  await client.query(`delete from parent_student_map where school_id = $1`, [fixture.schoolId]);
  await client.query(`delete from parents where school_id = $1`, [fixture.schoolId]);
  await client.query(`delete from students where school_id = $1`, [fixture.schoolId]);
  const { rows: configRows } = await client.query(
    `select access_token_secret_id, webhook_verify_token_secret_id from school_whatsapp_configs where school_id = $1`,
    [fixture.schoolId]
  );
  await client.query(`delete from school_whatsapp_configs where school_id = $1`, [fixture.schoolId]);
  for (const row of configRows) {
    if (row.access_token_secret_id) await client.query(`delete from vault.secrets where id = $1`, [row.access_token_secret_id]);
    if (row.webhook_verify_token_secret_id)
      await client.query(`delete from vault.secrets where id = $1`, [row.webhook_verify_token_secret_id]);
  }
  await client.query(`delete from memberships where school_id = $1`, [fixture.schoolId]);
  await client.query(`delete from users where school_id = $1`, [fixture.schoolId]);
  await client.query(`delete from schools where school_id = $1`, [fixture.schoolId]);
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
  return withSuperAdminBypass(async (client) => {
    const fixture = await createFixture(client, { grantConsent: false });
    try {
      const result = await withTenantContext(claimsFor(fixture), (c) =>
        sendWhatsAppMessage(c, {
          schoolId: fixture.schoolId,
          studentId: fixture.studentId,
          purpose: 'operational_communication',
          toPhone: fixture.parentPhone,
          templateName: 'attendance_absence_notification',
          templateParams: {},
          dedupeKey: 'verifyh-consent-1',
        })
      );
      const { rows: logRows } = await client.query(`select status, reason from communication_log where log_id = $1`, [result.logId]);
      return { result, queryable: logRows[0], pass: result.status === 'blocked_consent' && logRows[0]?.status === 'blocked_consent' };
    } finally {
      await cleanupFixture(client, fixture);
    }
  });
}

async function runQuietHoursSection() {
  return withSuperAdminBypass(async (client) => {
    const nowIst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const pad = (n: number) => String(n).padStart(2, '0');
    const start = `${pad(nowIst.getHours())}:${pad(nowIst.getMinutes())}`;
    const end = `${pad((nowIst.getHours() + 1) % 24)}:${pad(nowIst.getMinutes())}`;
    const fixture = await createFixture(client, { grantConsent: true, quietHoursStart: start, quietHoursEnd: end });
    try {
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
      return { result, quietHoursWindow: { start, end }, pass: result.status === 'blocked_quiet_hours' };
    } finally {
      await cleanupFixture(client, fixture);
    }
  });
}

async function runIdempotencySection() {
  return withSuperAdminBypass(async (client) => {
    const fixture = await createFixture(client, { grantConsent: true });
    try {
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
      const { rows: logRows } = await client.query(
        `select count(*)::int as n from communication_log where school_id = $1 and dedupe_key = 'verifyh-idempotent-1'`,
        [fixture.schoolId]
      );
      return {
        first,
        second,
        realProviderCallCount: mock.calls.length,
        logRowCount: logRows[0].n,
        pass: first.status === 'sent' && second.idempotent === true && mock.calls.length === 1 && logRows[0].n === 1,
      };
    } finally {
      await cleanupFixture(client, fixture);
    }
  });
}

async function runBudgetSection() {
  return withSuperAdminBypass(async (client) => {
    const fixture = await createFixture(client, { grantConsent: true, monthlyBudgetPaise: 0 });
    try {
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
      return { result, pass: result.status === 'blocked_budget' };
    } finally {
      await cleanupFixture(client, fixture);
    }
  });
}

async function runResolutionActiveSection() {
  return withSuperAdminBypass(async (client) => {
    const fixture = await createFixture(client, { grantConsent: true });
    try {
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
      await client.query(`update school_whatsapp_configs set status = 'active' where school_id = $1`, [fixture.schoolId]);

      const result = await withTenantContext(claimsFor(fixture), (c) =>
        sendWhatsAppMessage(c, {
          schoolId: fixture.schoolId,
          studentId: fixture.studentId,
          purpose: 'operational_communication',
          toPhone: fixture.parentPhone,
          templateName: 'attendance_absence_notification',
          templateParams: {},
          dedupeKey: 'verifyh-resolution-active-1',
        })
      );
      const { rows: logRows } = await client.query(`select provider_used, fallback_reason, status from communication_log where log_id = $1`, [
        result.logId,
      ]);
      return {
        result,
        loggedRow: logRows[0],
        pass: result.providerUsed === 'school_specific' && logRows[0]?.provider_used === 'school_specific' && logRows[0]?.fallback_reason === null,
      };
    } finally {
      await cleanupFixture(client, fixture);
    }
  });
}

async function runResolutionFallbackSection() {
  return withSuperAdminBypass(async (client) => {
    const fixture = await createFixture(client, { grantConsent: true });
    try {
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
      await client.query(`update school_whatsapp_configs set status = 'suspended' where school_id = $1`, [fixture.schoolId]);

      const mock = new MockWhatsAppProvider();
      const result = await withTenantContext(claimsFor(fixture), (c) =>
        sendWhatsAppMessage(
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
        )
      );
      const { rows: logRows } = await client.query(`select provider_used, fallback_reason, status from communication_log where log_id = $1`, [
        result.logId,
      ]);
      return {
        result,
        loggedRow: logRows[0],
        pass:
          result.providerUsed === 'platform_default' &&
          logRows[0]?.provider_used === 'platform_default' &&
          typeof logRows[0]?.fallback_reason === 'string' &&
          logRows[0].fallback_reason.includes('suspended'),
      };
    } finally {
      await cleanupFixture(client, fixture);
    }
  });
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
