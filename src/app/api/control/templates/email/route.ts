import { NextRequest, NextResponse } from 'next/server';
import { withTenantContext } from '@/lib/auth/db';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { checkOverride, listEmailTemplates, previewOverride, saveEmailTemplate } from '@/lib/email/template-overrides';

// Control → Templates → Email (W21-M6). NetCyberAI staff only.
//   GET                                                   every email the app sends, and the founder's words where saved
//   POST { action: 'preview', template, subject, body }   the words as they would go, each value as [its name]; saves nothing
//   POST { action: 'save', template, subject, body, reason }   save, audited
//   POST { action: 'reset', template, reason }            back to the code's own words, audited
export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'no-store' };

export async function GET(req: NextRequest) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  try {
    return NextResponse.json({ templates: await withTenantContext(guard.claims, (db) => listEmailTemplates(db)) }, { headers: NO_STORE });
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
  const template = typeof body?.template === 'string' ? body.template : '';
  if (body?.action === 'preview') {
    const checked = checkOverride(template, body);
    if (!checked.ok) return NextResponse.json({ error: 'not shown', code: checked.code }, { status: 400, headers: NO_STORE });
    return NextResponse.json({ preview: previewOverride(template, checked.words) }, { headers: NO_STORE });
  }
  if (body?.action !== 'save' && body?.action !== 'reset') return NextResponse.json({ error: 'not sent properly', code: 'request' }, { status: 400 });
  try {
    const result = await withTenantContext(guard.claims, (db) => saveEmailTemplate(db, { userId: guard.claims.sub }, { ...body, reset: body.action === 'reset' }));
    return result.ok ? NextResponse.json({ ok: true }, { headers: NO_STORE }) : NextResponse.json({ error: 'not saved', code: result.code }, { status: result.code === 'not_editable' ? 404 : 400, headers: NO_STORE });
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}
