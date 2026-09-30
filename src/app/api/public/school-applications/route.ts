import { NextRequest } from 'next/server';
import { withPlatformService } from '@/lib/auth/db';
import { kickJobs } from '@/lib/jobs/handlers';
import { jobQueue } from '@/lib/jobs/pg-queue';
import { submitApplication } from '@/lib/onboarding/applications';
import { allowAndRecord, clientIp, rateKey, turnstilePasses, validateApplication } from '@/lib/onboarding/intake';
import { isUniqueViolation, maskEmail, reply } from '@/lib/onboarding/public-http';

// "Register your school" (C98), public. Checks in order: honeypot,
// Turnstile (only when switched on), field rules, per-IP and per-email
// rate limits; then the application and its code email are written in one
// transaction, and the email is sent right after commit.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  // A field people never see: a filled one is a bot.
  if (typeof body?.website === 'string' && body.website.trim() !== '') return reply({ error: 'rejected' }, 400);
  const ip = clientIp(req.headers);
  if (!(await turnstilePasses(body?.turnstileToken, ip))) return reply({ error: 'challenge_failed' }, 400);
  const checked = validateApplication(body);
  if (!checked.ok) return reply({ error: 'invalid', fields: checked.errors }, 400);
  const input = checked.value;

  try {
    const result = await withPlatformService(async (db) => {
      if (!(await allowAndRecord(db, 'apply_ip', rateKey('ip', ip)))) return { kind: 'rate_limited' as const };
      if (!(await allowAndRecord(db, 'apply_email', rateKey('email', input.email)))) return { kind: 'rate_limited' as const };
      return submitApplication(db, jobQueue, input);
    });
    if (result.kind === 'rate_limited') return reply({ error: 'rate_limited' }, 429);
    if (result.kind === 'duplicate') return reply({ status: 'already_received' });
    await kickJobs(result.jobKeys);
    return reply(
      { status: 'code_sent', applicationId: result.applicationId, maskedEmail: maskEmail(input.email), codeSent: result.codeSent, retryAfter: result.retryAfter ?? null },
      result.kind === 'created' ? 201 : 200
    );
  } catch (err) {
    // Two identical submissions in the same instant: the second meets the
    // unique index.
    if (isUniqueViolation(err)) return reply({ status: 'already_received' });
    console.error('[school-applications] submit failed', err instanceof Error ? err.name : 'error');
    return reply({ error: 'unavailable' }, 503);
  }
}
