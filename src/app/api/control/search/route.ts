import { NextRequest, NextResponse } from 'next/server';
import { GLOBAL_SEARCH_MIN_CHARS, type GlobalSearchResponse } from '@/lib/contracts/global-search';
import { validationError } from '@/lib/errors/catalogue';
import { parseGlobalSearch, searchControl } from '@/lib/frameworks/global-search';
import { controlRoute } from '@/lib/frameworks/route';

// Global search for Control (C135): GET ?q=. The founder only
// (controlRoute); schools, people and tickets across every school.
export async function GET(req: NextRequest) {
  const started = performance.now();
  const q = req.nextUrl.searchParams.get('q');
  const term = parseGlobalSearch(q);
  if (!term) return NextResponse.json(validationError('too_short', { field: 'search', have: (q ?? '').trim().length, min: GLOBAL_SEARCH_MIN_CHARS }), { status: 400 });
  return controlRoute(req, async ({ db }) => {
    const results = await searchControl(db, term);
    const body: GlobalSearchResponse = { results, tookMs: Math.round(performance.now() - started) };
    return NextResponse.json(body, { headers: { 'cache-control': 'no-store' } });
  });
}
