import { NextRequest, NextResponse } from 'next/server';
import { withPlatformService } from '@/lib/auth/db';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { isUuid } from '@/lib/frameworks/custom-fields';
import type { Sql } from '@/lib/jobs/types';
import { decideTemplate, listTemplates, recordMetaDecision, syncTemplates } from '@/lib/whatsapp/templates';

// Control → WhatsApp templates (docs/25 slice 7c, C184). NetCyberAI staff only.
//   GET   every version, with our approval and Meta's
//   POST  { action: 'sync' }                               write the versions that are in the code and not yet here
//         { action: 'approve' | 'reject', id }             our own decision on a version's words
//         { action: 'meta', id, metaStatus, metaTemplateId }  Meta's decision, as read in Business Manager
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
  if (!isUuid(body?.id)) return NextResponse.json({ error: 'not sent properly' }, { status: 400 });
  const id = body.id as string;
  const result =
    body.action === 'approve' || body.action === 'reject'
      ? await platform((db) => decideTemplate(db, { userId: guard.claims.sub }, id, body.action === 'approve'))
      : body.action === 'meta' && typeof body.metaStatus === 'string' && typeof body.metaTemplateId === 'string' && body.metaTemplateId.length <= 120
        ? await platform((db) => recordMetaDecision(db, id, { metaStatus: body.metaStatus as string, metaTemplateId: body.metaTemplateId as string }))
        : null;
  if (!result) return NextResponse.json({ error: 'not sent properly' }, { status: 400 });
  return result.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'not done', code: result.reason }, { status: result.reason === 'not_found' ? 404 : 400 });
}
