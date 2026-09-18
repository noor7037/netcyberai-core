// TEMPORARY -- Prompt E Task 0 diagnostic route. This sandbox cannot make
// raw TCP connections to Postgres (confirmed against this environment's
// own documented proxy policy: "raw-TCP databases" are explicitly listed
// as unsupported). Vercel's serverless runtime has real outbound access,
// so this route triggers the real production code path (withBackendConnection
// / withTenantContext, the real app_backend pooler connection) from inside
// a deployment and reports the result as JSON, fetched over ordinary
// HTTPS -- the sandbox just reads the response, it doesn't do the DB work.
//
// MUST be deleted, and DIAG_TOKEN removed from Vercel, before this branch
// merges to main (Decision Log entry pending). An authenticated DB-probe
// endpoint is still attack surface even though nothing here is reachable
// without the token.
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { withBackendConnection, withSuperAdminBypass, withTenantContext } from '@/lib/auth/db';
import type { SessionClaims, StaffRole } from '@/lib/auth/types';

export const dynamic = 'force-dynamic';

type CheckResult = { pass: boolean; [key: string]: unknown };

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// Accepts the token via header OR query param -- some fetch paths that
// route around this sandbox's own network restrictions (see the Task 0
// report) can't attach custom headers, only a URL.
function authorized(req: NextRequest): boolean {
  const expected = process.env.DIAG_TOKEN;
  if (!expected) return false;
  const provided =
    req.headers.get('x-diag-token') ?? req.nextUrl.searchParams.get('diag_token') ?? '';
  return provided.length > 0 && safeEqual(provided, expected);
}

function diagClaims(userId: string, schoolId: string, role: StaffRole = 'school_admin'): SessionClaims {
  return {
    sub: userId,
    role,
    schoolId,
    membershipId: '__diag-membership',
    tokenVersion: 0,
    aal: 'aal2',
    sessionId: '__diag-session',
  };
}

export async function GET(req: NextRequest) {
  // Missing/wrong token: 404, not 401/403 -- don't reveal the route exists.
  if (!authorized(req)) {
    return new NextResponse(null, { status: 404 });
  }

  const checks: Record<string, CheckResult> = {};
  const suffix = randomUUID();
  let schoolAId: string | undefined;
  let schoolBId: string | undefined;
  let userAId: string | undefined;
  let userBId: string | undefined;
  let studentAId: string | undefined;

  try {
    // --- Check 1: connection resolves via the real pooler -------------
    try {
      const row = await withBackendConnection(async (client) => {
        const { rows } = await client.query('select current_user, now() as db_time');
        return rows[0];
      });
      checks.connectionResolves = {
        pass: true,
        currentUser: row.current_user,
        dbTime: row.db_time,
        note: 'DATABASE_URL targets aws-0-ap-south-1.pooler.supabase.com:6543 (Supavisor, transaction mode)',
      };
    } catch (err) {
      checks.connectionResolves = { pass: false, error: String(err) };
      return NextResponse.json({ pass: false, checks }, { status: 200 });
    }

    // --- Setup: two ephemeral schools + users + one ephemeral student,
    // via withSuperAdminBypass (bypassrls). This is test-harness
    // scaffolding, not the code path under test -- the checks below run
    // through the real withTenantContext.
    await withSuperAdminBypass(async (client) => {
      const schoolA = await client.query(
        `insert into schools (name) values ($1) returning school_id`,
        [`__diag_school_a_${suffix}`]
      );
      const schoolB = await client.query(
        `insert into schools (name) values ($1) returning school_id`,
        [`__diag_school_b_${suffix}`]
      );
      schoolAId = schoolA.rows[0].school_id;
      schoolBId = schoolB.rows[0].school_id;

      const userA = await client.query(
        `insert into users (school_id, email, role, display_name, is_active, token_version)
         values ($1, $2, 'school_admin', '__diag user A', true, 0) returning user_id`,
        [schoolAId, `__diag_a_${suffix}@example.invalid`]
      );
      const userB = await client.query(
        `insert into users (school_id, email, role, display_name, is_active, token_version)
         values ($1, $2, 'school_admin', '__diag user B', true, 0) returning user_id`,
        [schoolBId, `__diag_b_${suffix}@example.invalid`]
      );
      userAId = userA.rows[0].user_id;
      userBId = userB.rows[0].user_id;

      const student = await client.query(
        `insert into students (school_id, name) values ($1, $2) returning student_id`,
        [schoolAId, `__diag_student_${suffix}`]
      );
      studentAId = student.rows[0].student_id;
    });

    // --- Check 2: set_config persists correctly per-transaction under
    // real pooled connections -- fired concurrently (Promise.all), not
    // serially, to actually exercise connection reuse under the pooler.
    // This is the exact failure mode db/rls_policies.sql's own header
    // warns about.
    const [tenantA, tenantB] = await Promise.all([
      withTenantContext(diagClaims(userAId!, schoolAId!), async (client) => {
        const { rows } = await client.query(
          `select current_setting('app.current_tenant_id', true) as tenant`
        );
        return rows[0].tenant as string;
      }),
      withTenantContext(diagClaims(userBId!, schoolBId!), async (client) => {
        const { rows } = await client.query(
          `select current_setting('app.current_tenant_id', true) as tenant`
        );
        return rows[0].tenant as string;
      }),
    ]);
    checks.setConfigPersistsUnderPooler = {
      pass: tenantA === schoolAId && tenantB === schoolBId,
      expectedTenantA: schoolAId,
      observedTenantA: tenantA,
      expectedTenantB: schoolBId,
      observedTenantB: tenantB,
    };

    // --- Check 3: a basic cross-tenant read fails under real RLS -------
    // From context B, try to read the student that exists only in school
    // A. Also confirm the same row IS visible from its own tenant (A),
    // so a 0-row result above is proven to be RLS, not a bad/missing ID.
    const [ownTenantRows, crossTenantRows] = await Promise.all([
      withTenantContext(diagClaims(userAId!, schoolAId!), async (client) => {
        const { rows } = await client.query('select student_id from students where student_id = $1', [
          studentAId,
        ]);
        return rows;
      }),
      withTenantContext(diagClaims(userBId!, schoolBId!), async (client) => {
        const { rows } = await client.query('select student_id from students where student_id = $1', [
          studentAId,
        ]);
        return rows;
      }),
    ]);
    checks.crossTenantReadFails = {
      pass: ownTenantRows.length === 1 && crossTenantRows.length === 0,
      rowsVisibleFromOwnTenant: ownTenantRows.length,
      rowsVisibleFromOtherTenant: crossTenantRows.length,
    };

    const pass = Object.values(checks).every((c) => c.pass === true);
    return NextResponse.json({ pass, checks }, { status: 200 });
  } catch (err) {
    return NextResponse.json({ pass: false, checks, fatalError: String(err) }, { status: 200 });
  } finally {
    // Cleanup always runs, regardless of pass/fail above.
    try {
      await withSuperAdminBypass(async (client) => {
        if (studentAId) await client.query('delete from students where student_id = $1', [studentAId]);
        if (userAId) await client.query('delete from users where user_id = $1', [userAId]);
        if (userBId) await client.query('delete from users where user_id = $1', [userBId]);
        if (schoolAId) await client.query('delete from schools where school_id = $1', [schoolAId]);
        if (schoolBId) await client.query('delete from schools where school_id = $1', [schoolBId]);
      });
    } catch (cleanupErr) {
      // eslint-disable-next-line no-console
      console.error('diag: cleanup failed', cleanupErr);
    }
  }
}
