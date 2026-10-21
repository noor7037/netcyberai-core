import { NextRequest, NextResponse } from 'next/server';
import { withPlatformService } from '@/lib/auth/db';
import { requireAiControl } from '@/lib/ai/control-guard';
import { loadAiOverview, providerChoices, setCap, setClearance, setCredential, setProfile, undoChange, type ChangeResult, type Link } from '@/lib/ai/control';

// Control → AI (docs/family-app/10 §3, C249). The founder only, with the authenticator (aal2).
//   GET   providers and their clearance for minors, each key's last four characters (never a key), the profiles, usage
//         counts for today and this month, the daily cap and the recent changes
//   POST  { action: 'credential', providerId, apiKey }                         set or replace a provider's key (write-only)
//         { action: 'clearance', providerId, cleared, termsUrl }               clear a provider for children's words, or withdraw it
//         { action: 'profile', profileId, providerId, model, promptVersion, enabled, fallback }
//         { action: 'cap', value }                                            requests per family per day
//         { action: 'undo', auditId }                                         restore the state before that change
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
  const overview = await withPlatformService((db) => loadAiOverview(db));
  return NextResponse.json({ ...overview, providerChoices: providerChoices() }, { headers: NO_STORE });
}

export async function POST(req: NextRequest) {
  const guard = await requireAiControl(req);
  if ('error' in guard) return guard.error;
  const b = await req.json().catch(() => null);
  const by = { userId: guard.claims.sub };
  let result: ChangeResult | null = null;
  if (b?.action === 'credential') {
    const providerId = str(b.providerId, 40);
    const apiKey = str(b.apiKey, 400);
    if (providerId && apiKey !== null) result = await withPlatformService((db) => setCredential(db, by, providerId, apiKey));
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
  } else if (b?.action === 'undo') {
    const auditId = str(b.auditId, 20);
    if (auditId) result = await withPlatformService((db) => undoChange(db, by, auditId));
  }
  if (!result) return NextResponse.json({ error: 'not sent properly', code: 'request' }, { status: 400, headers: NO_STORE });
  if (!result.ok) return NextResponse.json({ error: 'not saved', code: result.code }, { status: result.code === 'no_encryption_key' ? 409 : 400, headers: NO_STORE });
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
