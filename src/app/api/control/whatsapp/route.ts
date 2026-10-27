import { NextRequest, NextResponse } from 'next/server';
import { requireStepUp } from '@/lib/auth/step-up';
import { withPlatformService } from '@/lib/auth/db';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import type { Sql } from '@/lib/jobs/types';
import { messagingKey, metaAccountMeta, openMetaCredentials, recordMetaTest, replaceMetaAppSecret, saveMetaAccount, setMetaEnabled } from '@/lib/whatsapp/credentials';
import { MetaWhatsAppProvider } from '@/lib/whatsapp/meta';
import { unknownSenders } from '@/lib/whatsapp/replies';

// Control → the platform's WhatsApp account (docs/25 slice 7e, C186). NetCyberAI staff only.
//   GET   what is saved (never a secret), whether it is switched on, and whether this server holds the key
//   POST  { action: 'save', phoneNumberId, wabaId, accessToken, appSecret, verifyToken }   save or replace; always switched off
//         { action: 'secret', appSecret }    replace only the App Secret; the rest and the switch stay
//         { action: 'test' }                 ask Meta about the saved number; sends nothing
//         { action: 'on' | 'off' }           the switch; on only after a test that passed
// The secrets are write-only: nothing here, or anywhere, gives them back.
export const dynamic = 'force-dynamic';
const platform = withPlatformService as <T>(fn: (db: Sql) => Promise<T>) => Promise<T>;
const WEBHOOK_PATH = '/api/public/whatsapp/webhook/meta';

export async function GET(req: NextRequest) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  return NextResponse.json({ account: await platform((db) => metaAccountMeta(db)), keyAvailable: messagingKey() !== null, webhookPath: WEBHOOK_PATH, unknownSenders: await platform((db) => unknownSenders(db)) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  const body = await req.json().catch(() => null);
  // Spaces and line breaks are never part of these values: a paste slip loses them here too (C230-D).
  const text = (v: unknown, max: number) => (typeof v === 'string' && v.length <= max ? v.replace(/\s+/g, '') : '');
  const by = { userId: guard.claims.sub };
  if (body?.action === 'save') {
    // Saving the WhatsApp account's keys asks for the authenticator again (F1-1b, C260).
    const stepUp = await requireStepUp(req, guard.claims);
    if (stepUp) return stepUp;
    const result = await platform((db) => saveMetaAccount(db, by, { phoneNumberId: text(body.phoneNumberId, 40), wabaId: text(body.wabaId, 40), accessToken: text(body.accessToken, 700), appSecret: text(body.appSecret, 200), verifyToken: text(body.verifyToken, 200) }));
    return result.ok ? NextResponse.json({ ok: true }, { status: 201 }) : NextResponse.json({ error: 'the account was not saved', code: result.reason }, { status: result.reason === 'no_encryption_key' ? 503 : 400 });
  }
  if (body?.action === 'secret') {
    const stepUp = await requireStepUp(req, guard.claims);
    if (stepUp) return stepUp;
    const result = await platform((db) => replaceMetaAppSecret(db, by, text(body.appSecret, 200)));
    return result.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'the App Secret was not saved', code: result.reason }, { status: result.reason === 'no_encryption_key' ? 503 : result.reason === 'no_account' ? 404 : 400 });
  }
  if (body?.action === 'test') {
    const account = await platform((db) => openMetaCredentials(db, false));
    if (!account) return NextResponse.json({ error: 'no account is saved, or this server does not hold the key', code: messagingKey() ? 'no_account' : 'no_encryption_key' }, { status: 404 });
    // Asked outside any transaction; then the answer is recorded.
    const result = await new MetaWhatsAppProvider(account).testConnection();
    await platform((db) => recordMetaTest(db, result.ok, result.message));
    return NextResponse.json(result);
  }
  if (body?.action === 'on' || body?.action === 'off') {
    const result = await platform((db) => setMetaEnabled(db, by, body.action === 'on'));
    return result.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'not switched', code: result.reason }, { status: result.reason === 'no_account' ? 404 : 409 });
  }
  return NextResponse.json({ error: 'not sent properly' }, { status: 400 });
}
