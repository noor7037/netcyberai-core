import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/require-session';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';
import { FINANCE } from '@/lib/fees/structures';
import { saveCredentials } from '@/lib/payments/credentials';
import { listMethods, setDirectUpi, setMethod, type MethodRow } from '@/lib/payments/methods';
import { gatewayReady, gatewaySetup, paymentsPlatform, webhookPath } from '@/lib/payments/setup';

// The school's ways of taking fees (docs/24 §3.2, §3.8, C171).
//   GET  the methods, and for the gateway: what is saved (never the keys), whether NetCyberAI allows it, whether keys can be saved here
//   PUT  switch a method on or off, or move it (principal or school admin)
//   POST save the gateway's keys (principal or school admin). The keys are write-only: the answer carries the last four characters only.
//
// The stored keys are reached only as the platform role, on a connection of
// its own. That is never done while this request's own transaction is open:
// the school's part runs first (session, module and role checked there),
// and the platform's part after it, for the school id that part verified.
const OFFICE: readonly string[] = ['principal', 'school_admin'];

export async function GET(req: NextRequest) {
  let seen: { schoolId: string; methods: MethodRow[]; mayEdit: boolean } | null = null;
  const res = await appRoute(req, async ({ claims, db }) => {
    if (!FINANCE.includes(claims.role)) return ruleError(403, 'not_allowed');
    seen = { schoolId: claims.schoolId, methods: await listMethods(db, claims.schoolId), mayEdit: OFFICE.includes(claims.role) };
    return NextResponse.json({});
  });
  const ok = seen as { schoolId: string; methods: MethodRow[]; mayEdit: boolean } | null;
  if (!ok) return res;
  const gateway = await gatewaySetup(ok.schoolId);
  return NextResponse.json({ methods: ok.methods, gateway: { ...gateway, credentials: gateway.credentials.map((c) => ({ ...c, webhookPath: webhookPath(c.provider, c.configId) })) }, mayEdit: ok.mayEdit });
}

export async function PUT(req: NextRequest) {
  const body = await readJson(req);
  // Direct UPI is saved with its whole set-up: the UPI ID, the account, who verifies, the principal's limit.
  if (body?.method === 'direct_upi' && typeof body.enabled === 'boolean' && body.settings && typeof body.settings === 'object') {
    return appRoute(req, async ({ claims, db }) => {
      const result = await setDirectUpi(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, { enabled: body.enabled as boolean, settings: body.settings });
      if (result.ok) return NextResponse.json({ ok: true });
      return result.reason === 'not_allowed' ? ruleError(403, 'not_allowed') : jsonError(400, 'the UPI set-up was not saved', { code: result.reason });
    });
  }
  if (typeof body?.method !== 'string' || typeof body.enabled !== 'boolean' || typeof body.sortOrder !== 'number') return ruleError(400, 'not_sent_properly');
  // Whether the gateway is ready is read first, for the school in the session; the change itself is checked again inside.
  const session = await requireSession(req);
  const ready = session?.schoolId ? await gatewayReady(session.schoolId, 'razorpay') : false;
  return appRoute(req, async ({ claims, db }) => {
    const result = await setMethod(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, { method: body.method as string, enabled: body.enabled as boolean, sortOrder: body.sortOrder as number }, async () => ready && session?.schoolId === claims.schoolId);
    if (result.ok) return NextResponse.json({ ok: true });
    return result.reason === 'not_allowed' ? ruleError(403, 'not_allowed') : jsonError(result.reason === 'gateway_not_ready' ? 409 : 400, 'the method was not changed', { code: result.reason });
  });
}

export async function POST(req: NextRequest) {
  const body = await readJson(req);
  let who: { schoolId: string; userId: string } | null = null;
  const res = await appRoute(req, async ({ claims }) => {
    if (!OFFICE.includes(claims.role)) return ruleError(403, 'not_allowed');
    who = { schoolId: claims.schoolId, userId: claims.sub };
    return NextResponse.json({});
  });
  const ok = who as { schoolId: string; userId: string } | null;
  if (!ok) return res;
  const text = (v: unknown) => (typeof v === 'string' && v.length <= 200 ? v.trim() : '');
  const result = await paymentsPlatform((p) => saveCredentials(p, { schoolId: ok.schoolId, userId: ok.userId, from: 'school' }, { provider: text(body?.provider), mode: text(body?.mode), keys: { keyId: text(body?.keyId), keySecret: text(body?.keySecret), webhookSecret: text(body?.webhookSecret) } }));
  if (result.ok) return NextResponse.json({ saved: result.meta }, { status: 201 });
  return jsonError(result.reason === 'no_encryption_key' ? 503 : 400, 'the keys were not saved', { code: result.reason });
}
