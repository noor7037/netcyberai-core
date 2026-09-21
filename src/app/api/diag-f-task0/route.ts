import { NextRequest, NextResponse } from 'next/server';
import { withRoleProbe, withSuperAdminBypass } from '@/lib/auth/db';
import { writeAuditLog } from '@/lib/audit/log';

// Temporary, Preview-only, C38-pattern diagnostic route (Decision Log
// C45): proves the two gaps Pre-F Architecture Hardening deferred to
// Prompt F rather than blocking that merge on them --
//   1. audit_hash_chain()'s advisory-lock fix under REAL concurrent
//      Postgres connections (Stage 2a's own sandbox test could only
//      prove sequential inserts chain correctly; dblink couldn't get a
//      second connection either -- see the migration's own [GAP]).
//   2. SET LOCAL ROLE not leaking from one pooled request onto the
//      next reused physical backend (Decision Log C40/C42) -- proven
//      here specifically, not just asserted, by comparing two
//      back-to-back requests' pg_backend_pid()s.
// Gated by DIAG_TOKEN_F (Preview env var only, never production), 404
// on a missing/wrong token -- never 401/403, so a scan of this path
// with no token looks identical to a route that doesn't exist. Removed
// entirely, token included, before this branch's PR opens (Task 0);
// removal confirmed with a real fetch returning a genuine 404, not
// `git rm` alone (Decision Log C39's own lesson).
function hasValidToken(req: NextRequest): boolean {
  const expected = process.env.DIAG_TOKEN_F;
  if (!expected) return false;
  const header = req.headers.get('x-diag-token');
  const query = req.nextUrl.searchParams.get('token');
  return header === expected || query === expected;
}

interface ConcurrencyResult {
  schoolId: string;
  connectionsDistinct: boolean;
  connectionPids: [number, number];
  rowsBefore: number;
  rowsAfter: number;
  newRows: { auditId: string; occurredAt: string; prevHash: string | null; rowHash: string | null }[];
  chainLinear: boolean;
  pass: boolean;
}

async function checkHashChainConcurrency(): Promise<ConcurrencyResult> {
  const schoolId = await withSuperAdminBypass(async (client) => {
    const { rows } = await client.query(
      `select school_id from schools where name = 'B2 Test School Alpha'`
    );
    if (!rows[0]) {
      throw new Error('fixture school "B2 Test School Alpha" not found -- run against a database that has it');
    }
    return rows[0].school_id as string;
  });

  const rowsBefore = await withSuperAdminBypass(async (client) => {
    const { rows } = await client.query(`select count(*)::int as n from audit_log where school_id = $1`, [
      schoolId,
    ]);
    return rows[0].n as number;
  });

  // Two genuinely separate connections (each its own getPool().connect()
  // call), fired concurrently via Promise.all -- not one connection
  // doing two sequential things. pg_advisory_xact_lock's whole point is
  // to serialize these two REAL backends against each other.
  const fire = () =>
    withSuperAdminBypass(async (client) => {
      const pidResult = await client.query(`select pg_backend_pid() as pid`);
      await writeAuditLog(client, {
        schoolId,
        actorUserId: null,
        actorRole: null,
        eventAction: 'diag.concurrency_probe',
        targetType: 'diagnostic',
      });
      return pidResult.rows[0].pid as number;
    });

  const [pidA, pidB] = await Promise.all([fire(), fire()]);

  const allRows = await withSuperAdminBypass(async (client) => {
    const { rows } = await client.query(
      `select audit_id, occurred_at, prev_hash, row_hash
       from audit_log where school_id = $1
       order by occurred_at asc, audit_id asc`,
      [schoolId]
    );
    return rows;
  });

  const rowsAfter = allRows.length;
  const newRows = allRows.slice(Math.max(0, rowsAfter - 2));
  const chainLinear = newRows.length === 2 && newRows[1].prev_hash === newRows[0].row_hash;

  return {
    schoolId,
    connectionsDistinct: pidA !== pidB,
    connectionPids: [pidA, pidB],
    rowsBefore,
    rowsAfter,
    newRows: newRows.map((r) => ({
      auditId: String(r.audit_id),
      occurredAt: r.occurred_at,
      prevHash: r.prev_hash,
      rowHash: r.row_hash,
    })),
    chainLinear,
    pass: chainLinear && pidA !== pidB,
  };
}

interface RolePersistenceResult {
  requestA: { currentUser: string; backendPid: number };
  requestB: { currentUser: string; backendPid: number };
  sameBackendReused: boolean;
  roleLeaked: boolean;
  pass: boolean;
}

async function checkRolePersistence(): Promise<RolePersistenceResult> {
  // Sequential (not concurrent) -- "two requests back to back," Decision
  // Log C42's exact scenario: whichever role the FIRST request's
  // connection was SET LOCAL ROLE'd to must not still be in effect when
  // the pool hands that same (or any) connection to the SECOND request.
  const requestA = await withRoleProbe('nca_super', async (client) => {
    const { rows } = await client.query(`select current_user, pg_backend_pid() as pid`);
    return { currentUser: rows[0].current_user as string, backendPid: rows[0].pid as number };
  });

  const requestB = await withRoleProbe('app_user', async (client) => {
    const { rows } = await client.query(`select current_user, pg_backend_pid() as pid`);
    return { currentUser: rows[0].current_user as string, backendPid: rows[0].pid as number };
  });

  const sameBackendReused = requestA.backendPid === requestB.backendPid;
  const roleLeaked = requestB.currentUser !== 'app_user';

  return {
    requestA,
    requestB,
    sameBackendReused,
    roleLeaked,
    pass: !roleLeaked,
  };
}

export async function GET(req: NextRequest) {
  if (!hasValidToken(req)) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  try {
    const concurrency = await checkHashChainConcurrency();
    const rolePersistence = await checkRolePersistence();
    return NextResponse.json({
      concurrency,
      rolePersistence,
      overallPass: concurrency.pass && rolePersistence.pass,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
