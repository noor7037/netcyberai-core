import { NextRequest } from 'next/server';
import { withPlatformService } from '@/lib/auth/db';
import { kickJobs } from '@/lib/jobs/handlers';
import { jobQueue } from '@/lib/jobs/pg-queue';
import { ApplicationError, resendApplicationCode } from '@/lib/onboarding/applications';
import { UUID_RE, reply } from '@/lib/onboarding/public-http';

// A new code for an application whose email is not confirmed yet (C98):
// one a minute, five per application.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const applicationId = typeof body?.applicationId === 'string' && UUID_RE.test(body.applicationId) ? body.applicationId : null;
  if (!applicationId) return reply({ error: 'not_found' }, 404);
  try {
    const result = await withPlatformService((db) => resendApplicationCode(db, jobQueue, applicationId));
    if (!result.sent) return reply({ error: result.retryAfter ? 'wait' : 'too_many_codes', retryAfter: result.retryAfter ?? null }, 429);
    await kickJobs(result.jobKeys);
    return reply({ status: 'code_sent' });
  } catch (err) {
    if (err instanceof ApplicationError) return reply({ error: err.code }, err.status);
    console.error('[school-applications] resend failed', err instanceof Error ? err.name : 'error');
    return reply({ error: 'unavailable' }, 503);
  }
}
