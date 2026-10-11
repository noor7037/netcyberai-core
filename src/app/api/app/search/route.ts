import { NextRequest, NextResponse } from 'next/server';
import { GLOBAL_SEARCH_MIN_CHARS, type GlobalSearchResponse } from '@/lib/contracts/global-search';
import { validationError } from '@/lib/errors/catalogue';
import { loadEntitlements } from '@/lib/frameworks/entitlements';
import { parseGlobalSearch, searchableKinds, searchSchool } from '@/lib/frameworks/global-search';
import { appRoute } from '@/lib/frameworks/route';

// Global search for the school app (docs/19 rule 6, C135): GET ?q=.
// Any signed-in school role may ask; which kinds are searched follows the
// role and the school's modules, and row-level security decides the rows.
export async function GET(req: NextRequest) {
  const started = performance.now();
  const q = req.nextUrl.searchParams.get('q');
  const term = parseGlobalSearch(q);
  if (!term) return NextResponse.json(validationError('too_short', { field: 'search', have: (q ?? '').trim().length, min: GLOBAL_SEARCH_MIN_CHARS }), { status: 400 });
  return appRoute(req, async ({ claims, db }) => {
    const kinds = searchableKinds(claims.role, await loadEntitlements(db, claims.schoolId));
    const results = await searchSchool(db, claims.schoolId, term, kinds);
    const body: GlobalSearchResponse = { results, tookMs: Math.round(performance.now() - started) };
    return NextResponse.json(body, { headers: { 'cache-control': 'no-store' } });
  });
}
