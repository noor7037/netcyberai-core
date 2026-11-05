import { NextRequest, NextResponse } from 'next/server';
import { hpcCards, hpcScreen, publishHpc, saveHpcEntries } from '@/lib/exams/hpc';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';
import { supabaseFileStorage } from '@/lib/storage/supabase-file-storage';

// The Holistic Progress Card of a class for the school's current session (W21-M4).
//   GET                    the class's children in roll order with the words written on their cards, whether each card
//                          is published, and what this person may do here
//   GET ?card=<studentId>  that child's card as data (the screen draws it with hpcBlocks)
//   POST { action: 'save', entries: [{ studentId, teacherRemark?, healthNote?, selfAssessment?, parentFeedback? }] }
//                          the office or the class teacher
//   POST { action: 'publish' }   the office (the principal, the school admin, the academic coordinator): every child's
//                          card is made as a PDF and kept for the family, replacing the one before
// The office and the class's class teacher only; the library and the database's rules decide every row.
export const dynamic = 'force-dynamic';

type Params = { params: { classId: string } };
const STATUS: Partial<Record<string, number>> = { not_found: 404, no_session: 409 };

export async function GET(req: NextRequest, { params }: Params) {
  return appRoute(req, async ({ claims, db }) => {
    if (!isUuid(params.classId)) return ruleError(400, 'not_sent_properly');
    if (claims.role === 'accountant') return ruleError(403, 'not_allowed');
    const actor = { schoolId: claims.schoolId, userId: claims.sub, role: claims.role };
    const card = req.nextUrl.searchParams.get('card');
    if (card !== null) {
      if (!isUuid(card)) return ruleError(400, 'not_sent_properly');
      const r = await hpcCards(db, actor, params.classId, card);
      if (!r.ok) return r.reason === 'not_allowed' ? ruleError(403, 'not_allowed') : jsonError(STATUS[r.reason] ?? 400, 'not available', { code: r.reason });
      return NextResponse.json(r.cards[0], { headers: { 'Cache-Control': 'no-store' } });
    }
    const data = await hpcScreen(db, actor, params.classId);
    if (data === 'not_allowed') return ruleError(403, 'not_allowed');
    if (typeof data === 'string') return ruleError(404, 'not_found');
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  });
}

export async function POST(req: NextRequest, { params }: Params) {
  let stale: string[] = [];
  const res = await appRoute(req, async ({ claims, db }) => {
    const b = await readJson(req);
    if (!b || !isUuid(params.classId)) return ruleError(400, 'not_sent_properly');
    if (claims.role === 'accountant') return ruleError(403, 'not_allowed');
    const actor = { schoolId: claims.schoolId, userId: claims.sub, role: claims.role };
    const r =
      b.action === 'save' ? await saveHpcEntries(db, actor, params.classId, b.entries)
      : b.action === 'publish' ? await publishHpc(db, supabaseFileStorage, actor, params.classId)
      : null;
    if (!r) return ruleError(400, 'not_sent_properly');
    if (r.ok) {
      const { stale: replaced, ...body } = r as typeof r & { stale?: string[] };
      stale = replaced ?? [];
      return NextResponse.json(body);
    }
    if (r.reason === 'not_allowed') return ruleError(403, 'not_allowed');
    return jsonError(STATUS[r.reason] ?? 400, 'it was not saved', { code: r.reason, ...('at' in r && r.at !== undefined ? { at: r.at } : {}) });
  });
  // After the commit: the files the new cards replaced. A failed commit keeps the old rows and their files.
  if (res.ok) for (const key of stale) await supabaseFileStorage.remove(key).catch(() => undefined);
  return res;
}
