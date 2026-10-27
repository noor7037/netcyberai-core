import { NextRequest, NextResponse } from 'next/server';
import { requireStepUp } from '@/lib/auth/step-up';
import { withPlatformService } from '@/lib/auth/db';
import { requireAiControl } from '@/lib/ai/control-guard';
import { loadAiOverview, loadProviderHealth, loadRouteRevisions, loadUsageLedger, prepareKeyTest, providerChoices, recordKeyTest, rollbackRoute, setCap, setClearance, setCredential, setProfile, setWorkersCredential, undoChange, type ChangeResult, type Link } from '@/lib/ai/control';

// Control → AI (docs/family-app/10 §3, C249). The founder only, with the authenticator (aal2).
//   GET   providers and their clearance for minors, each key's last four characters (never a key), the profiles, usage
//         counts for today and this month, the daily cap and the recent changes; and the routing records (G2, C370):
//         the latest route revisions, each provider's circuit and the latest attempts in the ledger (ids, outcome
//         classes, times and token counts only)
//   POST  { action: 'credential', providerId, apiKey }                         set or replace a provider's key (write-only)
//         { action: 'credential', providerId: 'workers-ai', accountId, token }  Cloudflare's key in its two parts (C317)
//         { action: 'clearance', providerId, cleared, termsUrl }               clear a provider for children's words, or withdraw it
//         { action: 'profile', profileId, providerId, model, promptVersion, enabled, fallback }
//         { action: 'cap', value }                                            requests per family per day
//         { action: 'undo', auditId }                                         restore the state before that change
//         { action: 'rollback', profileId, revisionId? }                       activate the route's previous revision (or the one named) again
//         { action: 'test', providerId }                                      test a content provider's key (YouTube, M2-5)
// No response carries a key, and nothing here logs the request body.
export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'no-store' };

const str = (v: unknown, max: number): string | null => (typeof v === 'string' && v.length <= max ? v : null);
const optional = (v: unknown, max: number): string | null => {
  const s = str(v, max)?.trim();
  return s ? s : null;
};

export async function GET(req: NextRequest) {
  const guard = await requireAiControl(req);
  if ('error' in guard) return guard.error;
  const { overview, routing } = await withPlatformService(async (db) => ({
    overview: await loadAiOverview(db),
    routing: { revisions: await loadRouteRevisions(db, { limit: 50 }), health: await loadProviderHealth(db), ledger: await loadUsageLedger(db, { limit: 100 }) },
  }));
  return NextResponse.json({ ...overview, routing, providerChoices: providerChoices() }, { headers: NO_STORE });
}

export async function POST(req: NextRequest) {
  const guard = await requireAiControl(req);
  if ('error' in guard) return guard.error;
  const b = await req.json().catch(() => null);
  const by = { userId: guard.claims.sub };
  let result: ChangeResult | null = null;
  if (b?.action === 'credential') {
    // Saving or replacing a provider's key asks for the authenticator again (F1-1b, C260).
    const stepUp = await requireStepUp(req, guard.claims);
    if (stepUp) return stepUp;
    const providerId = str(b.providerId, 40);
    const apiKey = str(b.apiKey, 400);
    const accountId = str(b.accountId, 200);
    const token = str(b.token, 400);
    if (providerId === 'workers-ai' && accountId !== null && token !== null) result = await withPlatformService((db) => setWorkersCredential(db, by, accountId, token));
    else if (providerId && apiKey !== null) result = await withPlatformService((db) => setCredential(db, by, providerId, apiKey));
  } else if (b?.action === 'clearance') {
    const providerId = str(b.providerId, 40);
    if (providerId && typeof b.cleared === 'boolean') result = await withPlatformService((db) => setClearance(db, by, providerId, b.cleared, str(b.termsUrl, 500) ?? ''));
  } else if (b?.action === 'profile') {
    const profileId = str(b.profileId, 60);
    const fallback: Link[] | null = Array.isArray(b.fallback) && b.fallback.length <= 3 ? b.fallback.map((f: unknown) => ({ provider: str((f as Link)?.provider, 40) ?? '', model: str((f as Link)?.model, 80) ?? '' })) : b.fallback === undefined ? [] : null;
    const promptVersion = str(b.promptVersion, 32);
    if (profileId && fallback && promptVersion && typeof b.enabled === 'boolean') {
      result = await withPlatformService((db) => setProfile(db, by, profileId, { providerId: optional(b.providerId, 40), model: optional(b.model, 80), promptVersion, enabled: b.enabled, fallback }));
    }
  } else if (b?.action === 'cap') {
    if (typeof b.value === 'number') result = await withPlatformService((db) => setCap(db, by, b.value));
  } else if (b?.action === 'test') {
    // The key is opened in one short transaction, the provider asked with none held, the outcome kept in a second.
    const providerId = str(b.providerId, 40);
    if (providerId) {
      const prepared = await withPlatformService((db) => prepareKeyTest(db, providerId));
      if (!prepared.ok) result = prepared;
      else {
        const outcome = await prepared.run();
        await withPlatformService((db) => recordKeyTest(db, providerId, outcome));
        return NextResponse.json({ ok: true, works: outcome.ok, code: outcome.code }, { headers: NO_STORE });
      }
    }
  } else if (b?.action === 'rollback') {
    const profileId = str(b.profileId, 60);
    const revisionId = b.revisionId === undefined ? null : str(b.revisionId, 20);
    if (profileId && (b.revisionId === undefined || revisionId)) result = await withPlatformService((db) => rollbackRoute(db, by, profileId, revisionId));
  } else if (b?.action === 'undo') {
    const auditId = str(b.auditId, 20);
    if (auditId) result = await withPlatformService((db) => undoChange(db, by, auditId));
  }
  if (!result) return NextResponse.json({ error: 'not sent properly', code: 'request' }, { status: 400, headers: NO_STORE });
  if (!result.ok) return NextResponse.json({ error: 'not saved', code: result.code }, { status: result.code === 'no_encryption_key' ? 409 : 400, headers: NO_STORE });
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
