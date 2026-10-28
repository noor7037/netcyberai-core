import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { asLiveStaff } from '@/lib/control/billing-route';
import { addHubEntry, editHubEntry, listHubEntriesForControl, setHubEntryStatus, type HubEntryProblem } from '@/lib/content/hub-entries';

// Control → Content → Hubs (W4-3, C387): the entries of the family app's three hubs (content.hub_entries). NetCyberAI
// staff only, as the platform role.
//   GET   every entry, with its status and whether its review day has passed
//   POST  { action: 'add', ...fields }              a new entry (a draft)
//   POST  { action: 'edit', entryId, ...fields }    its fields corrected
//   POST  { action: 'publish' | 'withdraw', entryId }
// Nothing is deleted. Each change is audited with who, when and the entry before and after.
export const dynamic = 'force-dynamic';

const ACTIONS = ['add', 'edit', 'publish', 'withdraw'];

export async function GET(req: NextRequest) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  const run = await asLiveStaff(guard.claims, (db) => listHubEntriesForControl(db));
  if ('refused' in run) return run.refused;
  return NextResponse.json({ entries: run.value }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  const b = await req.json().catch(() => null);
  if (typeof b !== 'object' || b === null || Array.isArray(b) || !ACTIONS.includes(b.action)) return NextResponse.json({ error: 'not sent properly' }, { status: 400 });
  const by = { userId: guard.claims.sub };
  const fields = {
    hub: b.hub,
    titleEn: b.titleEn,
    titleHi: b.titleHi,
    bodyEn: b.bodyEn,
    bodyHi: b.bodyHi,
    scope: b.scope,
    stateCode: b.stateCode,
    classFrom: b.classFrom,
    classTo: b.classTo,
    sourceUrl: b.sourceUrl,
    verifiedOn: b.verifiedOn,
    reviewOn: b.reviewOn,
  };
  const run = await asLiveStaff(guard.claims, async (db): Promise<{ ok: true } | { ok: false; reason: HubEntryProblem }> => {
    if (b.action === 'add') return addHubEntry(db, by, fields);
    if (b.action === 'edit') return editHubEntry(db, by, b.entryId, fields);
    return setHubEntryStatus(db, by, b.entryId, b.action === 'publish' ? 'published' : 'withdrawn');
  });
  if ('refused' in run) return run.refused;
  const r = run.value;
  if (r.ok) return NextResponse.json({ ok: true }, { status: b.action === 'add' ? 201 : 200 });
  return NextResponse.json({ error: 'not saved', code: r.reason }, { status: r.reason === 'not_found' ? 404 : r.reason === 'expired' ? 409 : 400 });
}
