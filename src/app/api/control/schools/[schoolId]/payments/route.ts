import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { saveCredentials, setGatewayAccess } from '@/lib/payments/credentials';
import { gatewaySetup, paymentsPlatform, testGateway, webhookPath } from '@/lib/payments/setup';

// Control → a school → payment gateway (docs/24 §3.8, C171). NetCyberAI staff:
//   GET   what is saved for the school (never the keys) and whether it may use a gateway
//   POST  { action: 'access', allowed, reason }  allow or stop the gateway for this school
//         { action: 'test', mode }  "Test connection" with the saved keys
//         { action: 'credentials', provider, mode, keyId, keySecret, webhookSecret, reason }  enter the school's keys for it
// Every change needs a reason and is audited in the school's own trail. The keys are write-only.
export async function GET(req: NextRequest, { params }: { params: { schoolId: string } }) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  if (!isUuid(params.schoolId)) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const gateway = await gatewaySetup(params.schoolId);
  return NextResponse.json({ gateway: { ...gateway, credentials: gateway.credentials.map((c) => ({ ...c, webhookPath: webhookPath(c.provider, c.configId) })) } });
}

export async function POST(req: NextRequest, { params }: { params: { schoolId: string } }) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  const body = await req.json().catch(() => null);
  const text = (v: unknown, max = 200) => (typeof v === 'string' && v.length <= max ? v.trim() : '');
  if (!isUuid(params.schoolId) || !(await paymentsPlatform(async (p) => (await p.query(`select 1 from schools where school_id = $1`, [params.schoolId])).rows[0]))) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const reason = text(body?.reason, 300);
  if (body?.action === 'access' && typeof body.allowed === 'boolean') {
    const done = await paymentsPlatform((p) => setGatewayAccess(p, { userId: guard.claims.sub }, params.schoolId, 'razorpay', body.allowed as boolean, reason));
    return done ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'a reason is needed', code: 'reason' }, { status: 400 });
  }
  if (body?.action === 'test' && (body.mode === 'test' || body.mode === 'live')) {
    const result = await testGateway(params.schoolId, body.mode);
    return result ? NextResponse.json(result) : NextResponse.json({ error: 'no keys are saved for that mode', code: 'no_keys' }, { status: 404 });
  }
  if (body?.action === 'credentials') {
    const result = await paymentsPlatform((p) => saveCredentials(p, { schoolId: params.schoolId, userId: guard.claims.sub, from: 'control', reason }, { provider: text(body.provider), mode: text(body.mode), keys: { keyId: text(body.keyId), keySecret: text(body.keySecret), webhookSecret: text(body.webhookSecret) } }));
    if (result.ok) return NextResponse.json({ saved: result.meta }, { status: 201 });
    return NextResponse.json({ error: 'the keys were not saved', code: result.reason }, { status: result.reason === 'no_encryption_key' ? 503 : 400 });
  }
  return NextResponse.json({ error: 'not sent properly' }, { status: 400 });
}
