import { NextRequest } from 'next/server';
import { withPlatformService } from '@/lib/auth/db';
import { kickJobs } from '@/lib/jobs/handlers';
import { jobQueue } from '@/lib/jobs/pg-queue';
import { ApplicationError, verifyApplicationEmail } from '@/lib/onboarding/applications';
import { allowAndRecord, clientIp, rateKey } from '@/lib/onboarding/intake';
import { UUID_RE, reply } from '@/lib/onboarding/public-http';

// The 6-digit code from the application email (C98). Five tries per code,
// a per-IP cap across applications, and a confirmed application answers
// "verified" again rather than an error.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const applicationId = typeof body?.applicationId === 'string' && UUID_RE.test(body.applicationId) ? body.applicationId : null;
  const code = typeof body?.code === 'string' ? body.code.replace(/\s+/g, '') : '';
  if (!applicationId || !/^\d{6}$/.test(code)) return reply({ error: 'wrong_code' }, 400);
  const ip = clientIp(req.headers);
  try {
    const result = await withPlatformService(async (db) => {
      if (!(await allowAndRecord(db, 'verify_ip', rateKey('ip', ip)))) return { kind: 'rate_limited' as const };
      return verifyApplicationEmail(db, jobQueue, applicationId, code, req.nextUrl.origin);
    });
    switch (result.kind) {
      case 'verified':
        await kickJobs(result.jobKeys);
        return reply({ status: 'verified' });
      case 'wrong_code':
        return reply({ error: 'wrong_code', attemptsLeft: result.attemptsLeft }, 400);
      case 'expired':
        return reply({ error: 'expired' }, 400);
      case 'too_many_attempts':
      case 'rate_limited':
        return reply({ error: 'too_many_attempts' }, 429);
    }
  } catch (err) {
    if (err instanceof ApplicationError) return reply({ error: err.code }, err.status);
    console.error('[school-applications] verify failed', err instanceof Error ? err.name : 'error');
    return reply({ error: 'unavailable' }, 503);
  }
}
