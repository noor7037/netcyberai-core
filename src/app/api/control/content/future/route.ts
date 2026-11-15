import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { asLiveStaff } from '@/lib/control/billing-route';
import { approveListing, editListing, listDomains, listForReview, rejectListing, REVIEW_FILTERS, setApplyDomain, type ReviewFilter, type ReviewProblem } from '@/lib/future/review';

// Control → Content → Future: the founder's review queue for the Future tab's listings (content.future_listings).
// NetCyberAI staff only, as the platform role.
//   GET   ?filter=all|pending|low|approved|rejected   the listings and the official sites Apply may open
//   POST  { action: 'approve' | 'reject', listingId, note }
//         { action: 'edit', listingId, ...fields }
//         { action: 'domain', domain, enabled }
// Nothing is deleted. Each change is audited with who, when and the listing before and after.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  const raw = req.nextUrl.searchParams.get('filter') ?? 'all';
  const filter = (REVIEW_FILTERS as readonly string[]).includes(raw) ? (raw as ReviewFilter) : 'all';
  const run = await asLiveStaff(guard.claims, async (db) => ({ listings: await listForReview(db, filter), domains: await listDomains(db) }));
  if ('refused' in run) return run.refused;
  return NextResponse.json(run.value, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  const b = await req.json().catch(() => null);
  if (typeof b !== 'object' || b === null || Array.isArray(b) || !['approve', 'reject', 'edit', 'domain'].includes(b.action)) return NextResponse.json({ error: 'not sent properly' }, { status: 400 });
  const by = { userId: guard.claims.sub };
  const run = await asLiveStaff(guard.claims, async (db): Promise<{ ok: true } | { ok: false; reason: ReviewProblem }> => {
    if (b.action === 'approve') return approveListing(db, by, b.listingId, b.note);
    if (b.action === 'reject') return rejectListing(db, by, b.listingId, b.note);
    if (b.action === 'domain') return setApplyDomain(db, by, b.domain, b.enabled);
    return editListing(db, by, b.listingId, b);
  });
  if ('refused' in run) return run.refused;
  const r = run.value;
  if (r.ok) return NextResponse.json({ ok: true });
  return NextResponse.json({ error: 'not saved', code: r.reason }, { status: r.reason === 'not_found' ? 404 : 400 });
}
