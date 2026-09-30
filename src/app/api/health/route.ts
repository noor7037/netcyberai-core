import { NextRequest, NextResponse } from 'next/server';
import { withBackendConnection, withPlatformService } from '@/lib/auth/db';
import { log, requestIdOf } from '@/lib/observability/log';

// Health for the uptime check (C111). Public, so it says only whether each
// part works: the database answers, and background jobs are not stuck (a
// due job waiting more than 10 minutes). No counts, no names. 200 when the
// database answers, 503 when it does not.
export const dynamic = 'force-dynamic';

const TIMEOUT_MS = 3000;

function within<T>(p: Promise<T>): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS))]);
}

export async function GET(req: NextRequest) {
  const requestId = requestIdOf(req);
  const database = await within(withBackendConnection((c) => c.query('select 1')))
    .then(() => 'ok' as const)
    .catch(() => 'fail' as const);
  const jobs =
    database === 'ok'
      ? await within(
          withPlatformService(async (c) => {
            const { rows } = await c.query(
              `select exists (select 1 from jobs where status = 'pending' and next_run_at < now() - interval '10 minutes') as stuck`
            );
            return rows[0]?.stuck ? ('backlog' as const) : ('ok' as const);
          })
        ).catch(() => 'unknown' as const)
      : ('unknown' as const);
  const status = database === 'fail' ? 'down' : jobs === 'ok' ? 'ok' : 'degraded';
  if (status !== 'ok') log('warn', 'health.not_ok', { requestId, database, jobs });
  return NextResponse.json(
    { status, checks: { database, jobs }, commit: (process.env.VERCEL_GIT_COMMIT_SHA ?? 'local').slice(0, 7), time: new Date().toISOString() },
    { status: status === 'down' ? 503 : 200, headers: { 'Cache-Control': 'no-store' } }
  );
}
