import { NextRequest, NextResponse } from 'next/server';
import { withPlatformService } from '@/lib/auth/db';
import { jobQueue } from '@/lib/jobs/pg-queue';
import type { Sql } from '@/lib/jobs/types';
import { openMetaCredentials } from '@/lib/whatsapp/credentials';
import { applyNotices } from '@/lib/whatsapp/delivery';
import { enqueueQueued } from '@/lib/whatsapp/gate';
import { META_SIGNATURE_HEADER, MetaWhatsAppProvider, answerChallenge, wordsForApprovals } from '@/lib/whatsapp/meta';
import { STAND_IN_SIGNATURE_HEADER, StandInWhatsAppProvider, type WhatsAppProvider } from '@/lib/whatsapp/provider';
import { raisesToApproved } from '@/lib/whatsapp/templates';

// A WhatsApp provider tells us where messages got to (docs/25 slices 7b and 7e, C183, C186). No session: the
// provider's own signature over the exact body is what lets it speak. A body whose signature does not hold is
// answered 401 and nothing in it is used. The same body twice changes nothing.
//   /stand-in  the stand-in's notices, signed with its secret. Only where that secret is set, which a
//              production deployment does not do: there the address answers 404.
//   /meta      Meta's, signed with the App Secret of the saved account (X-Hub-Signature-256). It answers 404
//              until an account is saved in Control. GET is Meta's first check of the address: it sends the
//              token we chose and gets its challenge back.
export const dynamic = 'force-dynamic';
const platform = withPlatformService as <T>(fn: (db: Sql) => Promise<T>) => Promise<T>;
const MAX_BODY = 256_000;

async function providerFor(name: string): Promise<{ provider: WhatsAppProvider; header: string; accessToken?: string } | null> {
  const secret = process.env.WHATSAPP_STANDIN_SECRET ?? '';
  if (name === 'stand-in' && process.env.NODE_ENV !== 'production' && secret.length >= 32) return { provider: new StandInWhatsAppProvider({ secret }), header: STAND_IN_SIGNATURE_HEADER };
  if (name === 'meta') {
    // Saved is enough to listen (Meta checks the address before the account is switched on); sending needs the switch.
    const account = await platform((db) => openMetaCredentials(db, false)).catch(() => null);
    return account ? { provider: new MetaWhatsAppProvider(account), header: META_SIGNATURE_HEADER, accessToken: account.accessToken } : null;
  }
  return null;
}

export async function GET(req: NextRequest, { params }: { params: { provider: string } }) {
  if (params.provider !== 'meta') return NextResponse.json({ error: 'not found' }, { status: 404 });
  const account = await platform((db) => openMetaCredentials(db, false)).catch(() => null);
  if (!account) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const q = req.nextUrl.searchParams;
  const challenge = answerChallenge(account, { mode: q.get('hub.mode'), token: q.get('hub.verify_token'), challenge: q.get('hub.challenge') });
  if (challenge === null) return NextResponse.json({ error: 'not accepted' }, { status: 403 });
  return new NextResponse(challenge, { status: 200, headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest, { params }: { params: { provider: string } }) {
  const found = await providerFor(params.provider);
  if (!found) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const rawBody = await req.text();
  if (rawBody.length === 0 || rawBody.length > MAX_BODY) return NextResponse.json({ error: 'not sent properly' }, { status: 400 });
  const signature = req.headers.get(found.header);
  // Meta's words for a template it says is approved, asked outside the transaction (C345, review). Only for a body
  // whose signature holds: readNotice reads nothing otherwise.
  const read = found.accessToken ? found.provider.readNotice(rawBody, signature) : null;
  const words = found.accessToken && read?.ok ? await wordsForApprovals({ accessToken: found.accessToken }, read.notices, raisesToApproved) : undefined;
  const out = await platform((db) => applyNotices(db, found.provider, rawBody, signature, enqueueQueued(jobQueue), words));
  // The provider is told only that it was heard, or that it was not believed.
  return NextResponse.json(out.status === 200 ? { ok: true } : { error: 'not accepted' }, { status: out.status, headers: { 'Cache-Control': 'no-store' } });
}
