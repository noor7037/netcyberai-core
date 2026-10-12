import { NextRequest, NextResponse } from 'next/server';
import { handleNotice } from '@/lib/payments/apply';
import { openCredentials } from '@/lib/payments/credentials';
import { razorpayProvider } from '@/lib/payments/razorpay';
import { paymentsPlatform } from '@/lib/payments/setup';

// A gateway's notice for ONE school's configuration (docs/24 §3.8, C172). Each configuration has an address of its
// own, so the notice is checked with that school's webhook secret and can credit only that school, and only a link
// opened with that configuration. No session: the signature is what makes a notice believable, and before any
// credit the payment is fetched from the provider itself.
// A failure here answers 500 so the provider sends the notice again; that is safe, because a notice is applied once.
export const dynamic = 'force-dynamic';
const MAX_BYTES = 256 * 1024;

export async function POST(req: NextRequest, { params }: { params: { provider: string; configId: string } }) {
  const creds = params.provider === 'razorpay' ? await paymentsPlatform((db) => openCredentials(db, params.configId)).catch(() => null) : null;
  if (!creds || creds.provider !== params.provider) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const raw = await req.text();
  if (raw.length === 0 || raw.length > MAX_BYTES) return NextResponse.json({ error: 'bad request' }, { status: 400 });
  const { status, result } = await handleNotice(paymentsPlatform, razorpayProvider(creds.keys), raw, (name) => req.headers.get(name), { scope: { schoolId: creds.schoolId, configId: params.configId } });
  // The answer says only how the notice was dealt with.
  return NextResponse.json({ outcome: result.outcome }, { status, headers: { 'Cache-Control': 'no-store' } });
}
