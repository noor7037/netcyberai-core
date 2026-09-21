// TEMPORARY -- Prompt E verification route, same standing pattern as
// Decision Log C38/C39: this sandbox cannot make raw TCP connections or
// reach *.vercel.app directly, so this route runs the real checks on
// Vercel's own network and reports JSON back over HTTPS. MUST be deleted
// (and PROMPT_E_DIAG_TOKEN removed from Vercel) BEFORE opening a PR this
// time -- C39 documented what happens when that step races a merge
// instead of finishing first.
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { withSuperAdminBypass } from '@/lib/auth/db';
import { signAccessToken } from '@/lib/auth/jwt';

export const dynamic = 'force-dynamic';

type CheckResult = { pass: boolean; [key: string]: unknown };

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function authorized(req: NextRequest): boolean {
  const expected = process.env.PROMPT_E_DIAG_TOKEN;
  if (!expected) return false;
  const provided = req.headers.get('x-diag-token') ?? req.nextUrl.searchParams.get('diag_token') ?? '';
  return provided.length > 0 && safeEqual(provided, expected);
}

function extractCookie(setCookieHeader: string | null, name: string): string | null {
  if (!setCookieHeader) return null;
  const match = setCookieHeader.match(new RegExp(`${name}=([^;,]+)`));
  return match ? match[1] : null;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return new NextResponse(null, { status: 404 });
  }

  const base = `https://${req.headers.get('host')}`;
  // This route's own internal fetches below hit the same .vercel.app
  // hostname a browser would -- Vercel's Deployment Protection applies
  // there too, not only to the initial external request that reached
  // this handler. The bypass query param/header on the INCOMING request
  // doesn't survive to here -- confirmed live: it's consumed at Vercel's
  // edge, never forwarded to the function -- so this falls back to
  // Vercel's own auto-injected VERCEL_AUTOMATION_BYPASS_SECRET (set when
  // Protection Bypass for Automation is enabled with "add to env vars"),
  // never a second hardcoded copy of the secret in source.
  const fromHeader = req.headers.get('x-vercel-protection-bypass');
  const fromQuery = req.nextUrl.searchParams.get('x-vercel-protection-bypass');
  const fromEnv = process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? null;
  const bypassSecret = fromHeader ?? fromQuery ?? fromEnv;
  const bypassSecretSource = () => (fromHeader ? 'header' : fromQuery ? 'query' : fromEnv ? 'env' : 'none');
  const bypassHeaders: Record<string, string> = bypassSecret ? { 'x-vercel-protection-bypass': bypassSecret } : {};
  const checks: Record<string, CheckResult> = {};
  const suffix = randomUUID();
  let schoolId: string | undefined;
  let superAdminId: string | undefined;
  let teacherId: string | undefined;
  let membershipId: string | undefined;
  const impersonationIdsToClean: string[] = [];

  try {
    // --- Setup: one ephemeral school, one ephemeral super_admin actor,
    // one ephemeral teacher with a real active membership. -------------
    await withSuperAdminBypass(async (client) => {
      const school = await client.query(`insert into schools (name) values ($1) returning school_id`, [
        `__verify_e_school_${suffix}`,
      ]);
      schoolId = school.rows[0].school_id;

      const admin = await client.query(
        `insert into users (role, display_name, email, is_active, token_version)
         values ('super_admin', '__verify_e_admin', $1, true, 0) returning user_id`,
        [`__verify_e_admin_${suffix}@example.invalid`]
      );
      superAdminId = admin.rows[0].user_id;

      const teacher = await client.query(
        `insert into users (school_id, role, display_name, email, is_active, token_version)
         values ($1, 'teacher', '__verify_e_teacher', $2, true, 0) returning user_id`,
        [schoolId, `__verify_e_teacher_${suffix}@example.invalid`]
      );
      teacherId = teacher.rows[0].user_id;

      const membership = await client.query(
        `insert into memberships (user_id, school_id, role) values ($1, $2, 'teacher') returning membership_id`,
        [teacherId, schoolId]
      );
      membershipId = membership.rows[0].membership_id;
    });

    const superAdminToken = await signAccessToken({
      sub: superAdminId!,
      role: 'super_admin',
      schoolId: null,
      membershipId: null,
      tokenVersion: 0,
      aal: 'aal2',
      sessionId: `verify-e:${suffix}`,
    });
    const teacherToken = await signAccessToken({
      sub: teacherId!,
      role: 'teacher',
      schoolId: schoolId!,
      membershipId: membershipId!,
      tokenVersion: 0,
      aal: 'aal1',
      sessionId: `verify-e:${suffix}`,
    });

    // --- Task 2 VERIFY: flag off blocks the API directly ---------------
    const offResp = await fetch(`${base}/api/app/pulse/today`, {
      headers: { cookie: `nca_access=${teacherToken}`, ...bypassHeaders },
      cache: 'no-store',
    });
    const offBody = await offResp.json();
    checks.flagOffBlocksApi = { pass: offResp.status === 403 && offBody.error === 'feature_disabled', status: offResp.status, body: offBody };

    const flagResp = await fetch(`${base}/api/control/schools/${schoolId}/features`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `nca_access=${superAdminToken}`, ...bypassHeaders },
      body: JSON.stringify({ feature: 'daily_pulse', enabled: true }),
      cache: 'no-store',
    });
    const flagBody = await flagResp.json();
    checks.flagSetViaRealApi = { pass: flagResp.status === 200 && flagBody.enabledFeatures?.daily_pulse === true, status: flagResp.status, body: flagBody };

    const onResp = await fetch(`${base}/api/app/pulse/today`, {
      headers: { cookie: `nca_access=${teacherToken}`, ...bypassHeaders },
      cache: 'no-store',
    });
    const onBody = await onResp.json();
    checks.flagOnAllowsApi = { pass: onResp.status === 200, status: onResp.status, body: onBody };

    // --- Task 5 VERIFY: impersonation start, use, end, both audit events,
    // then a separately-fabricated EXPIRED impersonation session must be
    // rejected. -----------------------------------------------------
    const startResp = await fetch(`${base}/api/control/impersonate/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `nca_access=${superAdminToken}`, ...bypassHeaders },
      body: JSON.stringify({ targetUserId: teacherId, reason: '__verify_e automated check' }),
      cache: 'no-store',
    });
    const startBody = await startResp.json();
    const impersonatedToken = extractCookie(startResp.headers.get('set-cookie'), 'nca_access');
    if (startBody.impersonationId) impersonationIdsToClean.push(startBody.impersonationId);
    checks.impersonationStarts = { pass: startResp.status === 200 && Boolean(impersonatedToken), status: startResp.status, body: startBody };

    const asImpersonated = impersonatedToken
      ? await fetch(`${base}/api/app/pulse/today`, {
          headers: { cookie: `nca_access=${impersonatedToken}`, ...bypassHeaders },
          cache: 'no-store',
        })
      : null;
    checks.impersonatedSessionWorks = { pass: asImpersonated?.status === 200, status: asImpersonated?.status ?? null };

    const endResp = impersonatedToken
      ? await fetch(`${base}/api/control/impersonate/end`, {
          method: 'POST',
          headers: { cookie: `nca_access=${impersonatedToken}`, ...bypassHeaders },
          cache: 'no-store',
        })
      : null;
    checks.impersonationEnds = { pass: endResp?.status === 200, status: endResp?.status ?? null };

    const afterEndResp = impersonatedToken
      ? await fetch(`${base}/api/app/pulse/today`, {
          headers: { cookie: `nca_access=${impersonatedToken}`, ...bypassHeaders },
          cache: 'no-store',
        })
      : null;
    const afterEndBody = afterEndResp ? await afterEndResp.json().catch(() => null) : null;
    checks.endedImpersonationRejected = { pass: afterEndResp?.status === 401, status: afterEndResp?.status ?? null, body: afterEndBody };

    const auditEvents = await withSuperAdminBypass(async (client) => {
      const { rows } = await client.query(
        `select event_action from audit_log where target_id = $1 and event_action in ('ImpersonationStarted', 'ImpersonationEnded') order by occurred_at asc`,
        [teacherId]
      );
      return rows.map((r) => r.event_action);
    });
    checks.bothAuditEventsPresent = {
      pass: auditEvents.includes('ImpersonationStarted') && auditEvents.includes('ImpersonationEnded'),
      events: auditEvents,
    };

    // Fabricate an ALREADY-EXPIRED impersonation session directly (faster
    // and more precise than waiting out the real 15-minute TTL) and prove
    // withTenantContext's live check rejects it.
    const expiredImpersonationId = await withSuperAdminBypass(async (client) => {
      const { rows } = await client.query(
        `insert into impersonation_sessions (actor_user_id, target_user_id, target_school_id, reason, started_at, expires_at)
         values ($1, $2, $3, 'expired fixture', now() - interval '20 minutes', now() - interval '5 minutes')
         returning impersonation_id`,
        [superAdminId, teacherId, schoolId]
      );
      return rows[0].impersonation_id as string;
    });
    impersonationIdsToClean.push(expiredImpersonationId);

    const expiredToken = await signAccessToken(
      {
        sub: teacherId!,
        role: 'teacher',
        schoolId: schoolId!,
        membershipId: membershipId!,
        tokenVersion: 0,
        aal: 'aal1',
        sessionId: `verify-e-expired:${suffix}`,
        impersonation: { impersonationId: expiredImpersonationId, actorUserId: superAdminId! },
      },
      600 // JWT itself still valid for 10 more minutes -- only the DB-side expiry should reject this
    );
    const expiredResp = await fetch(`${base}/api/app/pulse/today`, {
      headers: { cookie: `nca_access=${expiredToken}`, ...bypassHeaders },
      cache: 'no-store',
    });
    const expiredBody = await expiredResp.json().catch(() => null);
    checks.expiredImpersonationRejected = {
      pass: expiredResp.status === 401 && expiredBody?.error === 'session_revoked',
      status: expiredResp.status,
      body: expiredBody,
    };

    const pass = Object.values(checks).every((c) => c.pass === true);
    return NextResponse.json({ pass, checks, bypassSecretSource: bypassSecretSource() }, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { pass: false, checks, fatalError: String(err), bypassSecretSource: bypassSecretSource() },
      { status: 200 }
    );
  } finally {
    try {
      await withSuperAdminBypass(async (client) => {
        for (const id of impersonationIdsToClean) {
          await client.query('delete from impersonation_sessions where impersonation_id = $1', [id]);
        }
        if (schoolId) await client.query('delete from audit_log where school_id = $1', [schoolId]);
        if (membershipId) await client.query('delete from memberships where membership_id = $1', [membershipId]);
        if (teacherId) await client.query('delete from users where user_id = $1', [teacherId]);
        if (superAdminId) await client.query('delete from users where user_id = $1', [superAdminId]);
        if (schoolId) await client.query('delete from system_config where school_id = $1', [schoolId]);
        if (schoolId) await client.query('delete from schools where school_id = $1', [schoolId]);
      });
    } catch (cleanupErr) {
      // eslint-disable-next-line no-console
      console.error('verify-prompt-e: cleanup failed', cleanupErr);
    }
  }
}
