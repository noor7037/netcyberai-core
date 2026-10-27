import { NextRequest, NextResponse } from 'next/server';
import { asLiveStaff } from '@/lib/control/billing-route';
import { claimRequest, createChapter, declineRequest, markReviewed, newVersion, publishVersion, readVersion, retireChapter, saveDraft, studioOverview, type StudioChange } from '@/lib/content/chapter-studio';
import { NO_STORE, requireContentStaff } from '@/lib/content/route';
import { supabaseFileStorage } from '@/lib/storage/supabase-file-storage';

// Control → Content → Studio (S3, C376). NetCyberAI staff with the authenticator, as every Control content route.
//   GET   (no query)              the queue of requested chapters and every chapter version
//   GET   ?key=<key>&version=<n>  one version: its blocks in both languages
//   POST  { action: 'create', key, subject, title, board?, classLevel? }   a new chapter, an empty draft
//         { action: 'claim', requestId }              Received -> Digitizing, opens the draft for the request
//         { action: 'decline', requestId, reason }    ends a request with the reason the family is shown
//         { action: 'save', key, version, titleEn, titleHi, blocks: { en: [...], hi: [...] }, note? }  saves a draft
//         { action: 'review', key, version }          draft -> reviewed (both languages must pass every check)
//         { action: 'publish', key, version }         reviewed -> published; the version before is retired
//         { action: 'retire', key }                   withdraws the published version
//         { action: 'new_version', key }              copies the newest version as the next draft
// A version is never published without being reviewed first: there is no way here to skip a step, and the database
// refuses it as well. A parent's stored upload is removed when its request is published or declined.
export const dynamic = 'force-dynamic';

const STATUS: Record<string, number> = { not_found: 404, bad_request: 400, wrong_state: 409, open_version: 409, exists: 409, not_ready: 409 };

export async function GET(req: NextRequest) {
  const guard = await requireContentStaff(req);
  if ('error' in guard) return guard.error;
  const key = req.nextUrl.searchParams.get('key');
  const version = Number(req.nextUrl.searchParams.get('version'));
  const run = await asLiveStaff(guard.claims, async (db): Promise<unknown> => (key && Number.isInteger(version) ? readVersion(db, key, version) : studioOverview(db)));
  if ('refused' in run) return run.refused;
  if (run.value === null) return NextResponse.json({ error: 'not done', code: 'not_found' }, { status: 404, headers: NO_STORE });
  return NextResponse.json(run.value, { headers: NO_STORE });
}

export async function POST(req: NextRequest) {
  const guard = await requireContentStaff(req);
  if ('error' in guard) return guard.error;
  const b = await req.json().catch(() => null);
  const body = (b && typeof b === 'object' && !Array.isArray(b) ? b : {}) as Record<string, unknown>;
  const actor = { userId: guard.claims.sub };
  const actions = ['create', 'claim', 'decline', 'save', 'review', 'publish', 'retire', 'new_version'];
  if (typeof body.action !== 'string' || !actions.includes(body.action)) return NextResponse.json({ error: 'not sent properly', code: 'bad_request' }, { status: 400 });
  const run = await asLiveStaff(guard.claims, async (db): Promise<StudioChange<Record<string, unknown>>> => {
    switch (body.action) {
      case 'create':
        return createChapter(db, actor, { key: body.key, subject: body.subject, title: body.title, board: body.board, classLevel: body.classLevel });
      case 'claim':
        return claimRequest(db, actor, body.requestId);
      case 'decline':
        return declineRequest(db, actor, body.requestId, body.reason);
      case 'save':
        return saveDraft(db, actor, { key: body.key, version: body.version, titleEn: body.titleEn, titleHi: body.titleHi, blocks: body.blocks, note: body.note });
      case 'review':
        return markReviewed(db, actor, body.key, body.version);
      case 'publish':
        return publishVersion(db, actor, body.key, body.version);
      case 'retire':
        return retireChapter(db, actor, body.key);
      default:
        return newVersion(db, actor, body.key);
    }
  });
  if ('refused' in run) return run.refused;
  const r = run.value;
  if (!r.ok) {
    const reason = r.reason.startsWith('problem:') ? 'problem' : r.reason;
    return NextResponse.json({ error: 'not done', code: reason, detail: r.reason.startsWith('problem:') ? r.reason.slice(8) : undefined }, { status: reason === 'problem' ? 422 : (STATUS[reason] ?? 400), headers: NO_STORE });
  }
  // A parent's stored PDF is removed once its request has ended (published or declined); the row no longer points at it.
  const uploadKey = typeof r.uploadKey === 'string' ? r.uploadKey : null;
  if (uploadKey) await supabaseFileStorage.remove(uploadKey).catch(() => undefined);
  const { uploadKey: _gone, ok: _ok, ...rest } = r;
  return NextResponse.json({ ok: true, ...rest }, { headers: NO_STORE });
}
