import { NextRequest, NextResponse } from 'next/server';
import { runDueJobs } from '@/lib/jobs/handlers';
import { runnerAuthorized } from '@/lib/jobs/runner-auth';

// The job sweeper (C97), called every minute by pg_cron via pg_net. Runs
// due and retry-ready jobs up to RUN_BATCH_CAP within RUN_BUDGET_MS
// (runner.ts), under this function's time limit; the rest waits a minute.
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!runnerAuthorized(req.headers.get('authorization'), process.env.JOBS_RUNNER_SECRET)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const summary = await runDueJobs();
  return NextResponse.json(summary, { headers: { 'Cache-Control': 'no-store' } });
}
