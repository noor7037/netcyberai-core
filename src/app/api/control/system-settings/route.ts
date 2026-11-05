import { NextRequest, NextResponse } from 'next/server';
import { withTenantContext } from '@/lib/auth/db';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { listSystemSettings, saveSystemSetting } from '@/lib/control/system-settings';

// GET: the platform's own settings, each with the Control screen that owns it and, for a plain setting, its range.
// Secret-looking keys come back without their value.
// POST { key, value, reason }: one plain setting saved, refused outside its range, audited with the reason (W21-M6).
export async function GET(req: NextRequest) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  try {
    return NextResponse.json({ settings: await withTenantContext(guard.claims, (client) => listSystemSettings(client)) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'not sent properly', code: 'request' }, { status: 400 });
  try {
    const result = await withTenantContext(guard.claims, (client) => saveSystemSetting(client, { userId: guard.claims.sub }, body));
    return result.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'not saved', code: result.code }, { status: result.code === 'unknown_key' ? 404 : 400 });
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}
