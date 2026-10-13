import { NextRequest, NextResponse } from 'next/server';
import { withPlatformService } from '@/lib/auth/db';
import type { Sql } from '@/lib/jobs/types';
import { applyNotices } from '@/lib/whatsapp/delivery';
import { STAND_IN_SIGNATURE_HEADER, StandInWhatsAppProvider, type WhatsAppProvider } from '@/lib/whatsapp/provider';

// POST: a WhatsApp provider tells us where messages got to (docs/25 slice 7b, C183). No session: the provider's
// own signature over the exact body is what lets it speak. A body whose signature does not hold is recorded and
// answered 401; nothing in it is used. The same body twice changes nothing.
//   /stand-in  the stand-in's notices, signed with its secret. Only where that secret is set, which a
//              production deployment does not do: there the address answers 404.
// Meta's address is added with its adapter (slice 7e).
export const dynamic = 'force-dynamic';
const platform = withPlatformService as <T>(fn: (db: Sql) => Promise<T>) => Promise<T>;
const MAX_BODY = 256_000;

function providerFor(name: string): { provider: WhatsAppProvider; header: string } | null {
  const secret = process.env.WHATSAPP_STANDIN_SECRET ?? '';
  if (name === 'stand-in' && process.env.NODE_ENV !== 'production' && secret.length >= 32) return { provider: new StandInWhatsAppProvider({ secret }), header: STAND_IN_SIGNATURE_HEADER };
  return null;
}

export async function POST(req: NextRequest, { params }: { params: { provider: string } }) {
  const found = providerFor(params.provider);
  if (!found) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const rawBody = await req.text();
  if (rawBody.length === 0 || rawBody.length > MAX_BODY) return NextResponse.json({ error: 'not sent properly' }, { status: 400 });
  const out = await platform((db) => applyNotices(db, found.provider, rawBody, req.headers.get(found.header)));
  // The provider is told only that it was heard, or that it was not believed.
  return NextResponse.json(out.status === 200 ? { ok: true } : { error: 'not accepted' }, { status: out.status, headers: { 'Cache-Control': 'no-store' } });
}
