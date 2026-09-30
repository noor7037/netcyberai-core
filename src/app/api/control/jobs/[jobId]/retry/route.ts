import { NextRequest, NextResponse } from 'next/server';
import type { PoolClient } from 'pg';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { withTenantContext } from '@/lib/auth/db';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { writeAuditLog } from '@/lib/audit/log';
import { kickJobs } from '@/lib/jobs/handlers';
import { retryDeadJob } from '@/lib/jobs/pg-queue';
import { UUID_RE } from '@/lib/onboarding/public-http';

// "Retry" on a dead job in the Pipeline view (C97): it runs again now, with
// one more attempt. Audited; a second click on the same job does nothing.
export async function POST(req: NextRequest, { params }: { params: { jobId: string } }) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  if (!UUID_RE.test(params.jobId)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  try {
    const result = await withTenantContext(guard.claims, async (db) => {
      const r = await retryDeadJob(db, params.jobId);
      if (r.retried) {
        await writeAuditLog(db as PoolClient, {
          schoolId: null,
          actorUserId: guard.claims.sub,
          actorRole: guard.claims.role,
          eventAction: 'job.retry',
          targetType: 'jobs',
          targetId: params.jobId,
          afterState: { status: 'pending' },
        });
      }
      return r;
    });
    if (result.idempotencyKey) await kickJobs([result.idempotencyKey]);
    return NextResponse.json({ retried: result.retried });
  } catch (err) {
    const res = sessionErrorResponse(err);
    if (res) return res;
    throw err;
  }
}
