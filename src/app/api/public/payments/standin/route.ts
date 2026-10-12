import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { withPlatformService } from '@/lib/auth/db';
import type { Sql } from '@/lib/jobs/types';
import { handleNotice, linkForPayer } from '@/lib/payments/apply';
import { STAND_IN_SIGNATURE_HEADER, configuredPaymentProvider, signStandIn } from '@/lib/payments/provider';

// The stand-in provider's own side (C169): what a real gateway does after a
// parent pays on its page. It makes a notice, signs it with the stand-in's
// secret and hands it to the same code the webhook runs. It exists only
// where the stand-in is configured, which is never a production build.
export const dynamic = 'force-dynamic';
const platform = withPlatformService as <T>(fn: (db: Sql) => Promise<T>) => Promise<T>;

export async function POST(req: NextRequest) {
  const provider = configuredPaymentProvider();
  const secret = process.env.PAYMENT_STANDIN_SECRET ?? '';
  if (!provider || provider.name !== 'stand-in') return NextResponse.json({ error: 'not found' }, { status: 404 });
  const body = await req.json().catch(() => null);
  const token = typeof body?.token === 'string' ? body.token : '';
  const link = await platform((db) => linkForPayer(db, token));
  if (!link || link.provider !== 'stand-in' || !link.providerRef) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (link.state !== 'open') return NextResponse.json({ error: 'this link is not open', state: link.state }, { status: 409 });
  const raw = JSON.stringify({ id: `evt_${randomUUID()}`, type: body?.fail === true ? 'payment.failed' : 'payment.captured', order: link.providerRef, payment: `pay_${randomUUID()}`, amount: link.amountMinor });
  const { result } = await handleNotice(platform, provider, raw, (name) => (name === STAND_IN_SIGNATURE_HEADER ? signStandIn(secret, raw) : null));
  return NextResponse.json({ outcome: result.outcome }, { headers: { 'Cache-Control': 'no-store' } });
}
