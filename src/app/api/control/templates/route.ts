import { NextRequest, NextResponse } from 'next/server';
import { withPlatformService } from '@/lib/auth/db';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { isUuid } from '@/lib/frameworks/custom-fields';
import type { Sql } from '@/lib/jobs/types';
import { messagingKey, openMetaCredentials } from '@/lib/whatsapp/credentials';
import { createMetaTemplate, listMetaTemplates } from '@/lib/whatsapp/meta';
import { decideTemplate, listTemplates, markWordingReviewed, reconcileWithMeta, recordMetaDecision, recordSubmission, submissionFor, syncTemplates } from '@/lib/whatsapp/templates';

// Control → WhatsApp templates (docs/25 slice 7c, C184). NetCyberAI staff only.
//   GET   every version, with our approval and Meta's
//   POST  { action: 'sync' }                               write the versions that are in the code and not yet here
//         { action: 'approve' | 'reject', id }             our own decision on a version's words
//         { action: 'meta', id, metaStatus, metaTemplateId }  Meta's decision, as read in Business Manager
//         { action: 'reviewed', id, note }                  a reader of the language has read the words (who, in the note)
//         { action: 'submit', id }                          send a version to Meta for review, with the saved account (C345)
//         { action: 'refresh' }                             read every template Meta holds and match it to ours by words
// Meta is asked outside any transaction; what it answers is then recorded. Its own error is said shortly, never
// the request, which carries the token.
export const dynamic = 'force-dynamic';
const platform = withPlatformService as <T>(fn: (db: Sql) => Promise<T>) => Promise<T>;

export async function GET(req: NextRequest) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  return NextResponse.json({ templates: await platform((db) => listTemplates(db)) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  const body = await req.json().catch(() => null);
  if (body?.action === 'sync') return NextResponse.json(await platform((db) => syncTemplates(db)));
  if (body?.action === 'refresh') {
    const account = await platform((db) => openMetaCredentials(db, false));
    if (!account) return messagingKey() ? NextResponse.json({ error: 'no account', code: 'no_account' }, { status: 404 }) : NextResponse.json({ error: 'this server does not hold the key', code: 'no_encryption_key' }, { status: 503 });
    const listed = await listMetaTemplates(account);
    if (!listed.ok) return NextResponse.json({ error: 'Meta did not answer', code: 'meta', message: listed.message }, { status: 502 });
    return NextResponse.json(await platform((db) => reconcileWithMeta(db, listed.templates)));
  }
  if (body?.action === 'submit') {
    if (!isUuid(body.id)) return NextResponse.json({ error: 'not sent properly' }, { status: 400 });
    const id = body.id as string;
    const ready = await platform(async (db) => {
      const draft = await submissionFor(db, id);
      if (!draft.ok) return draft;
      const account = await openMetaCredentials(db, false);
      return account ? { ...draft, account } : ({ ok: false, reason: messagingKey() ? 'no_account' : 'no_encryption_key' } as const);
    });
    if (!ready.ok) return NextResponse.json({ error: 'not sent to Meta', code: ready.reason }, { status: ready.reason === 'not_found' || ready.reason === 'no_account' ? 404 : ready.reason === 'no_encryption_key' ? 503 : 400 });
    const made = await createMetaTemplate(ready.account, ready.draft);
    if (!made.ok) return NextResponse.json({ error: 'Meta did not take it', code: 'meta', message: made.message }, { status: 502 });
    return NextResponse.json({ ok: true, metaStatus: await platform((db) => recordSubmission(db, id, made)) });
  }
  if (!isUuid(body?.id)) return NextResponse.json({ error: 'not sent properly' }, { status: 400 });
  const id = body.id as string;
  const result =
    body.action === 'approve' || body.action === 'reject'
      ? await platform((db) => decideTemplate(db, { userId: guard.claims.sub }, id, body.action === 'approve'))
      : body.action === 'meta' && typeof body.metaStatus === 'string' && typeof body.metaTemplateId === 'string' && body.metaTemplateId.length <= 120
        ? await platform((db) => recordMetaDecision(db, id, { metaStatus: body.metaStatus as string, metaTemplateId: body.metaTemplateId as string }))
        : body.action === 'reviewed' && typeof body.note === 'string' && body.note.length <= 300
          ? await platform((db) => markWordingReviewed(db, { userId: guard.claims.sub }, id, body.note as string))
          : null;
  if (!result) return NextResponse.json({ error: 'not sent properly' }, { status: 400 });
  return result.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'not done', code: result.reason }, { status: result.reason === 'not_found' ? 404 : 400 });
}
