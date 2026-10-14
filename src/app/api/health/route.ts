import { NextRequest, NextResponse } from 'next/server';
import { withBackendConnection, withPlatformService } from '@/lib/auth/db';
import { healthStatus, jobsHealth, type JobsHealth } from '@/lib/observability/health';
import { log, requestIdOf } from '@/lib/observability/log';

// Health for the uptime check (C111). Public, so it says only whether each
// part works: the database answers, and background jobs are not stuck (a
// due job waiting more than 10 minutes). No counts, no names. 200 when the
// database answers, 503 when it does not. The rule itself is in
// src/lib/observability/health.ts, which Control's Monitoring page also
// reads (C206).
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
  const jobs: JobsHealth = database === 'ok' ? await within(withPlatformService((c) => jobsHealth(c))).catch(() => 'unknown' as const) : 'unknown';
  const status = healthStatus(database, jobs);
  if (status !== 'ok') log('warn', 'health.not_ok', { requestId, database, jobs });
  return NextResponse.json(
    { status, checks: { database, jobs }, commit: (process.env.VERCEL_GIT_COMMIT_SHA ?? 'local').slice(0, 7), time: new Date().toISOString() },
    { status: status === 'down' ? 503 : 200, headers: { 'Cache-Control': 'no-store' } }
  );
}
