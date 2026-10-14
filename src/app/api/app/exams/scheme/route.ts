import { NextRequest, NextResponse } from 'next/server';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';
import { saveScheme, schemeScreen } from '@/lib/exams/schemes';

// The school's grading scheme (docs/27 row 9a, C213).
//   GET   the school's board, the boards and their presets, the scheme in force and its versions
//         (principal, school admin, academic coordinator)
//   POST  { action: 'save', scheme, fromPresetId | null, basedOn }  a new version (principal, school admin)
// The school's board is recorded by NetCyberAI in Control only (C219): this route does not change it.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    const data = await schemeScreen(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role });
    if (!data) return ruleError(403, 'not_allowed');
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  });
}

export async function POST(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    const b = await readJson(req);
    const actor = { schoolId: claims.schoolId, userId: claims.sub, role: claims.role };
    if (b?.action === 'save') {
      const r = await saveScheme(db, actor, { scheme: b.scheme, fromPresetId: b.fromPresetId, basedOn: b.basedOn });
      if (r.ok) return NextResponse.json({ ok: true, version: r.version }, { status: 201 });
      if (r.reason === 'not_allowed') return ruleError(403, 'not_allowed');
      return jsonError(r.reason === 'newer_version' ? 409 : 400, 'the grading scheme was not saved', { code: r.reason, ...(r.at === undefined ? {} : { at: r.at }) });
    }
    return ruleError(400, 'not_sent_properly');
  });
}
