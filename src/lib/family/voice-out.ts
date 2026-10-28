import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { profileReady, type AiContext } from '@/lib/ai/platform';
import { guarded, loadChapter } from './chapter-store';
import { chapterView } from './chapters';
import { activeChild, isPrePrimary, listChildren, type FamilyChild } from './children';
import { consentState } from './consent';
import { LIVE_REPLY_MAX, isUuid, liveChild } from './english/live';
import { familyHashKey } from './secret';
import { indiaDate } from '@/lib/time/india';

// The server voice (C386; C230-AR item 2): which line the speak route may read aloud. It speaks only text this server
// holds, never text a phone sends, so it is no open text-to-speech service:
//   - the chapter reader's narration: a chapter this child may read, by its key and a place in the narration script
//     the server builds (blocks.ts narrationScript), in the child's language;
//   - a live English reply already kept: by the child's own session and the turn's position;
//   - a live English reply's sentence while it streams (not kept yet): the live route seals each checked sentence for
//     this account, child and session (AES-256-GCM, a key derived for this purpose only, fifteen minutes), and the
//     speak route opens the seal. A phone can neither read nor make one, nor use another child's.
// Each comes with the gate of the screen it belongs to: the reader's (the parent's yes to learning, Class 1 up), or
// live English's (liveChild: the switches and all three consents).

type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }> };

export const VOICE_PROFILE = 'family.text_to_speech' as const;
const LINE_LIFE_MS = 15 * 60 * 1000;

// ---- the live sentences' seal ----------------------------------------------------------------------------------------

type LineSecret = { acct: string; c: string; sid: string; text: string; exp: number };

export function sealLine(ctx: { accountId: string; childId: string; sessionId: string }, text: string, now = Date.now()): string {
  const secret: LineSecret = { acct: ctx.accountId, c: ctx.childId, sid: ctx.sessionId, text, exp: now + LINE_LIFE_MS };
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', familyHashKey('voice-lines.v1'), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(secret), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((b) => b.toString('base64url')).join('.');
}

// The sealed sentence, when the seal is whole, unexpired and this account's child's; null otherwise.
export function openLine(token: unknown, ctx: { accountId: string; childId: string }, now = Date.now()): { sessionId: string; text: string } | null {
  if (typeof token !== 'string' || token.length > 4000) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const [iv, tag, body] = parts.map((p) => Buffer.from(p, 'base64url'));
    // A whole 16-byte tag only (Node would accept a cut one) and the 12-byte nonce the seal makes.
    if (tag.length !== 16 || iv.length !== 12) return null;
    const decipher = createDecipheriv('aes-256-gcm', familyHashKey('voice-lines.v1'), iv, { authTagLength: 16 });
    decipher.setAuthTag(tag);
    const s = JSON.parse(Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8')) as LineSecret;
    if (s.acct !== ctx.accountId || s.c !== ctx.childId || !(s.exp > now) || !(s.exp - now <= LINE_LIFE_MS)) return null;
    if (typeof s.text !== 'string' || !s.text || s.text.length > LIVE_REPLY_MAX || !isUuid(s.sid)) return null;
    return { sessionId: s.sid, text: s.text };
  } catch {
    return null;
  }
}

// ---- what may be spoken ----------------------------------------------------------------------------------------------

export type SpeakAsk = { kind: 'chapter'; chapterKey: string; blockId: string; sentence: number } | { kind: 'live_line'; token: string } | { kind: 'live_turn'; sessionId: string; position: number };

// The request's body, checked for shape only (what it names is checked against the database below).
export function speakAsk(body: Record<string, unknown>): SpeakAsk | null {
  if (body.kind === 'chapter' && typeof body.chapterKey === 'string' && body.chapterKey.length <= 200 && typeof body.blockId === 'string' && body.blockId.length <= 100 && Number.isInteger(body.sentence) && (body.sentence as number) >= 0)
    return { kind: 'chapter', chapterKey: body.chapterKey, blockId: body.blockId, sentence: body.sentence as number };
  if (body.kind === 'live_line' && typeof body.token === 'string') return { kind: 'live_line', token: body.token };
  if (body.kind === 'live_turn' && isUuid(body.sessionId) && Number.isInteger(body.position) && (body.position as number) >= 1) return { kind: 'live_turn', sessionId: body.sessionId, position: body.position as number };
  return null;
}

export type SpeakLine = { ok: true; child: FamilyChild; children: FamilyChild[]; text: string; language: 'en' | 'hi' } | { ok: false; status: number; error: string };

// Whether this child may open the chapter: one published for every family, or one made from this child's own upload
// (never a sibling's); the showcase files are for everyone. The family's row level security already keeps it to the
// account.
async function chapterIsThisChilds(db: Db, chapterKey: string, childId: string): Promise<boolean> {
  const rows = await guarded(db, 'voice_chapter', async () => (await db.query(`select child_id from content.chapter_contents where chapter_key = $1 and status = 'published'`, [chapterKey])).rows, [] as Record<string, unknown>[]);
  return rows.every((r) => r.child_id === null || r.child_id === undefined || r.child_id === childId);
}

// The line to speak and the child it is for, or the refusal. The child is always the one this phone has chosen.
export async function speakLine(db: Db, accountId: string, chosen: string | undefined, ask: SpeakAsk): Promise<SpeakLine> {
  if (ask.kind === 'chapter') {
    const children = await listChildren(db as never, accountId);
    const child = activeChild(children, chosen);
    if (!child || isPrePrimary(child.classLevel)) return { ok: false, status: 404, error: 'not_found' };
    if (!(await consentState(db as never, accountId)).study_core) return { ok: false, status: 403, error: 'consent_needed' };
    if (!(await chapterIsThisChilds(db, ask.chapterKey, child.childId))) return { ok: false, status: 404, error: 'not_found' };
    const chapter = await loadChapter(db as never, ask.chapterKey);
    if (!chapter) return { ok: false, status: 404, error: 'not_found' };
    const view = chapterView(chapter, child.language);
    const line = view.script.find((l) => l.blockId === ask.blockId && l.sentence === ask.sentence);
    if (!line) return { ok: false, status: 404, error: 'not_found' };
    return { ok: true, child, children, text: line.text, language: view.lang };
  }
  const gate = await liveChild(db, accountId, chosen);
  if (!gate.ok) return gate;
  const child = gate.child;
  if (ask.kind === 'live_line') {
    const line = openLine(ask.token, { accountId, childId: child.childId });
    if (!line) return { ok: false, status: 404, error: 'not_found' };
    // The session must still be this child's and open.
    const open = await db.query(`select 1 from family.english_live_sessions where session_id = $1 and account_id = $2 and child_id = $3 and status = 'open'`, [line.sessionId, accountId, child.childId]);
    if (!open.rows[0]) return { ok: false, status: 404, error: 'not_found' };
    return { ok: true, child, children: gate.children, text: line.text, language: 'en' };
  }
  const { rows } = await db.query(`select reply from family.english_live_turns where session_id = $1 and position = $2 and account_id = $3 and child_id = $4`, [ask.sessionId, ask.position, accountId, child.childId]);
  if (!rows[0]) return { ok: false, status: 404, error: 'not_found' };
  return { ok: true, child, children: gate.children, text: String(rows[0].reply), language: 'en' };
}

// Whether the server voice could speak now (nothing sent, no place taken), for a screen to say which voice it uses.
// The check reads no child's words, so the context names no one.
export async function serverVoiceReady(db: Db, accountId: string): Promise<boolean> {
  const ctx: AiContext = { accountId, childFirstNames: [], day: indiaDate() };
  return (await profileReady(db as never, ctx, VOICE_PROFILE)) === 'ready';
}
