import { NextRequest, NextResponse } from 'next/server';
import { requireAppSession } from '@/lib/auth/require-app-session';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { qrPayloadToToken } from '@/lib/capture/qr';
import { resolveQrScan, SCAN_PURPOSES, type ScanPurpose } from '@/lib/capture/scan';

export async function POST(req: NextRequest) {
  const guard = await requireAppSession(req);
  if ('error' in guard) return guard.error;

  const body = await req.json().catch(() => null);
  const payload = typeof body?.payload === 'string' ? body.payload : '';
  const purpose: ScanPurpose = SCAN_PURPOSES.includes(body?.purpose) ? body.purpose : 'lookup';
  const deviceHint = typeof body?.deviceHint === 'string' ? body.deviceHint.slice(0, 200) : null;

  try {
    const outcome = await resolveQrScan(guard.claims, payload, purpose, deviceHint, qrPayloadToToken);
    const status = outcome.result === 'resolved' ? 200 : outcome.result === 'unauthorized' || outcome.result === 'cross_tenant_denied' ? 403 : 404;
    return NextResponse.json(outcome, { status });
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}
