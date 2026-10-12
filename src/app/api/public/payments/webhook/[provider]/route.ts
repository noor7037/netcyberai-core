import { NextRequest, NextResponse } from 'next/server';
import { withPlatformService } from '@/lib/auth/db';
import type { Sql } from '@/lib/jobs/types';
import { handleNotice } from '@/lib/payments/apply';
import { configuredPaymentProvider } from '@/lib/payments/provider';

// A payment provider's notice (docs/23 6f, C169). No session: what makes a
// notice believable is its signature, checked against the provider's secret
// before anything is read from it. Applied once, whatever is sent again.
// A failure here answers 500 so the provider sends it again; that is safe.
export const dynamic = 'force-dynamic';
const MAX_BYTES = 64 * 1024;
const platform = withPlatformService as <T>(fn: (db: Sql) => Promise<T>) => Promise<T>;

export async function POST(req: NextRequest, { params }: { params: { provider: string } }) {
  const provider = configuredPaymentProvider();
  // This address is the stand-in's. A real gateway has an address per school configuration (…/webhook/<provider>/<configId>).
  if (!provider || provider.name !== params.provider) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const raw = await req.text();
  if (raw.length === 0 || raw.length > MAX_BYTES) return NextResponse.json({ error: 'bad request' }, { status: 400 });
  const { status, result } = await handleNotice(platform, provider, raw, (name) => req.headers.get(name));
  // The answer says only how the notice was dealt with: no school, no person, no amount owed.
  return NextResponse.json({ outcome: result.outcome }, { status, headers: { 'Cache-Control': 'no-store' } });
}
