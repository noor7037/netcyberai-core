import { NextRequest, NextResponse } from 'next/server';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';
import { testGateway } from '@/lib/payments/setup';

// POST { mode }: "Test connection" (docs/24 §3.8, C172). A harmless call to the provider with the school's saved keys;
// the answer is plain words, and is kept beside the keys. Principal or school admin. No key is in the answer.
export async function POST(req: NextRequest) {
  const body = await readJson(req);
  let schoolId: string | null = null;
  const res = await appRoute(req, async ({ claims }) => {
    if (claims.role !== 'principal' && claims.role !== 'school_admin') return ruleError(403, 'not_allowed');
    schoolId = claims.schoolId;
    return NextResponse.json({});
  });
  const school = schoolId as string | null;
  if (!school) return res;
  if (body?.mode !== 'test' && body?.mode !== 'live') return ruleError(400, 'not_sent_properly');
  const result = await testGateway(school, body.mode);
  return result ? NextResponse.json(result) : jsonError(404, 'no keys are saved for that mode', { code: 'no_keys' });
}
