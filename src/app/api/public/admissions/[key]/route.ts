import { NextRequest } from 'next/server';
import { BODY_MAX_BYTES, checkOnline, schoolForKey, sendOnlineEnquiry } from '@/lib/admissions/online';
import { withPlatformService } from '@/lib/auth/db';
import { clientIp } from '@/lib/onboarding/intake';
import { reply } from '@/lib/onboarding/public-http';

// A school's online enquiry form (W21-M1), public and unauthenticated: the one place a family writes into a school's
// Admissions with no account. Checks in order: the link's seal, the body's size, the honeypot, the fields; then, as
// the platform role in one transaction, the rate limits (per address and school, per school), the database's definer
// function and the audit row (src/lib/admissions/online.ts). Nothing the family typed is logged.
//   POST { childName, classId, guardianName, phone, website: '' }
export async function POST(req: NextRequest, { params }: { params: { key: string } }) {
  const schoolId = schoolForKey(params.key);
  if (!schoolId) return reply({ error: 'not_found' }, 404);
  const raw = await req.text().catch(() => '');
  if (Buffer.byteLength(raw, 'utf8') > BODY_MAX_BYTES) return reply({ error: 'too_large' }, 413);
  let body: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = JSON.parse(raw);
    body = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    body = null;
  }
  if (!body) return reply({ error: 'invalid' }, 400);
  // A field people never see: a filled one is a bot.
  if (typeof body.website !== 'string' || body.website.trim() !== '') return reply({ error: 'rejected' }, 400);
  const checked = checkOnline(body);
  if (!checked.ok) return reply({ error: 'invalid', code: checked.reason }, 400);
  try {
    const done = await withPlatformService((db) => sendOnlineEnquiry(db, schoolId, clientIp(req.headers), checked.value));
    if (done.kind === 'rate_limited') return reply({ error: 'rate_limited' }, 429);
    if (done.kind === 'closed') return reply({ error: 'not_found' }, 404);
    if (done.kind === 'already_received') return reply({ status: 'already_received' });
    return reply({ status: 'received' }, 201);
  } catch (err) {
    console.error('[admissions-online] send failed', err instanceof Error ? err.name : 'error');
    return reply({ error: 'unavailable' }, 503);
  }
}
