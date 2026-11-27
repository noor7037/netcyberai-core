import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'crypto';
import { VOICE_TEXT_MAX, profileReady, voiceCharsLeft, type AiContext } from '@/lib/ai/platform';
import { guarded, loadChapter } from './chapter-store';
import { chapterView } from './chapters';
import { activeChild, isPrePrimary, listChildren, type FamilyChild } from './children';
import { callGate } from './call-gate';
import { chunkEnd, spokenSentences } from './call';
import { narrationScript, parseBlockLine, type Block } from './blocks';
import { consentState } from './consent';
import { LIVE_REPLY_MAX, isUuid, liveChild } from './english/live';
import { familyHashKey } from './secret';
import { indiaDate } from '@/lib/time/india';
import { drawStepText } from './draw-voice';
import { readFamilySwitches, switchOn } from './flags';
import { techlabToBlocks } from './tech/blocks';
import { lessonById } from './tech/catalog';
import { isTechLang, voiceLang } from './tech/text';

// The server voice (C386; C230-AR item 2): which line the speak route may read aloud. It speaks only text this server
// holds, never text a phone sends, so it is no open text-to-speech service:
//   - the chapter reader's narration: a chapter this child may read, by its key and a place in the narration script
//     the server builds (blocks.ts narrationScript), in the child's language;
//   - a live English reply already kept: by the child's own session and the turn's position;
//   - a live English reply's sentence while it streams (not kept yet): the live route seals each checked sentence for
//     this account, child and session (AES-256-GCM, a key derived for this purpose only, fifteen minutes), and the
//     speak route opens the seal. A phone can neither read nor make one, nor use another child's.
//   - a tutor's kept answer (W17-B2): by its message id, for the child it was written to; the teaching text of its blocks;
//   - a call's sentence (W16-A4): the understand route, answering a call, seals each sentence of the answer it checked,
//     for this account and child (a marked seal, so it opens only as a call line), and the speak route opens it.
// Each comes with the gate of the screen it belongs to: the reader's (the parent's yes to learning, Class 1 up), live
// English's (liveChild: the switches and all three consents), or the call's (callGate: the voice input's own).

type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }> };

export const VOICE_PROFILE = 'family.text_to_speech' as const;
const LINE_LIFE_MS = 15 * 60 * 1000;

// ---- the live sentences' seal ----------------------------------------------------------------------------------------

// `k`: 'call' marks a sentence sealed for a call; an unmarked one is a live English sentence. Neither opens as the other.
type LineSecret = { acct: string; c: string; sid: string; text: string; exp: number; k?: 'call' };

function sealSecret(secret: LineSecret): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', familyHashKey('voice-lines.v1'), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(secret), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((b) => b.toString('base64url')).join('.');
}

export function sealLine(ctx: { accountId: string; childId: string; sessionId: string }, text: string, now = Date.now()): string {
  return sealSecret({ acct: ctx.accountId, c: ctx.childId, sid: ctx.sessionId, text, exp: now + LINE_LIFE_MS });
}

// A call's sentence (W16-A4), sealed by the understand route for this account and child.
export function sealCallLine(ctx: { accountId: string; childId: string }, text: string, now = Date.now()): string {
  return sealSecret({ acct: ctx.accountId, c: ctx.childId, sid: randomUUID(), text, exp: now + LINE_LIFE_MS, k: 'call' });
}

function openSecret(token: unknown, ctx: { accountId: string; childId: string }, now: number): LineSecret | null {
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
    return s;
  } catch {
    return null;
  }
}

// The sealed sentence, when the seal is whole, unexpired and this account's child's; null otherwise.
export function openLine(token: unknown, ctx: { accountId: string; childId: string }, now = Date.now()): { sessionId: string; text: string } | null {
  const s = openSecret(token, ctx, now);
  return s && s.k === undefined ? { sessionId: s.sid, text: s.text } : null;
}

// A call's sentence, when the seal is whole, unexpired, a call's, and this account's child's; null otherwise.
export function openCallLine(token: unknown, ctx: { accountId: string; childId: string }, now = Date.now()): { text: string } | null {
  const s = openSecret(token, ctx, now);
  return s && s.k === 'call' ? { text: s.text } : null;
}

// ---- what may be spoken ----------------------------------------------------------------------------------------------

export type SpeakAsk = { kind: 'chapter'; chapterKey: string; blockId: string; sentence: number } | { kind: 'techlab'; lessonId: string; blockId: string; sentence: number; lang: 'en' | 'hi' | 'hinglish' } | { kind: 'live_line'; token: string } | { kind: 'live_turn'; sessionId: string; position: number } | { kind: 'call_line'; token: string } | { kind: 'tutor_answer'; messageId: string; from?: number; max?: number } | { kind: 'draw'; templateId: string; step: number; lang: 'en' | 'hi' };

// The request's body, checked for shape only (what it names is checked against the database below).
export function speakAsk(body: Record<string, unknown>): SpeakAsk | null {
  if (body.kind === 'chapter' && typeof body.chapterKey === 'string' && body.chapterKey.length <= 200 && typeof body.blockId === 'string' && body.blockId.length <= 100 && Number.isInteger(body.sentence) && (body.sentence as number) >= 0)
    return { kind: 'chapter', chapterKey: body.chapterKey, blockId: body.blockId, sentence: body.sentence as number };
  // Tech Lab: a See or Understand sentence. The phone names the lesson, the block and the sentence. The words come from the lesson file.
  if (body.kind === 'techlab' && typeof body.lessonId === 'string' && /^L[1-3]\.[a-z0-9][a-z0-9-]{1,40}\.[0-9]{2}$/.test(body.lessonId) && typeof body.blockId === 'string' && body.blockId.length <= 80 && Number.isInteger(body.sentence) && (body.sentence as number) >= 0 && (body.sentence as number) <= 500 && isTechLang(body.lang))
    return { kind: 'techlab', lessonId: body.lessonId, blockId: body.blockId, sentence: body.sentence as number, lang: body.lang };
  // C519: a step of a Draw template's guide, by template id, step place and language; the server holds the words.
  if (body.kind === 'draw' && typeof body.templateId === 'string' && body.templateId.length <= 80 && Number.isInteger(body.step) && (body.step as number) >= 0 && (body.step as number) <= 60 && (body.lang === 'en' || body.lang === 'hi'))
    return { kind: 'draw', templateId: body.templateId, step: body.step as number, lang: body.lang };
  if (body.kind === 'live_line' && typeof body.token === 'string') return { kind: 'live_line', token: body.token };
  if (body.kind === 'call_line' && typeof body.token === 'string') return { kind: 'call_line', token: body.token };
  if (body.kind === 'tutor_answer' && isUuid(body.messageId)) {
    // W22-S3: `from` is the sentence a part of a long answer starts at (the answer is read in parts, and resumes).
    if (body.from === undefined) return { kind: 'tutor_answer', messageId: body.messageId };
    if (Number.isInteger(body.from) && (body.from as number) >= 0 && (body.from as number) <= 500) {
      // `max`: how many characters this part may hold (the first part of a reading is short, so speech starts fast); the phone and the server cut by the same number.
      const max = body.max;
      if (max === undefined) return { kind: 'tutor_answer', messageId: body.messageId, from: body.from as number };
      if (Number.isInteger(max) && (max as number) >= 100 && (max as number) <= 600) return { kind: 'tutor_answer', messageId: body.messageId, from: body.from as number, max: max as number };
    }
    return null;
  }
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
  if (ask.kind === 'techlab') {
    const children = await listChildren(db as never, accountId);
    const child = activeChild(children, chosen);
    if (!child) return { ok: false, status: 404, error: 'not_found' };
    if (!(await consentState(db as never, accountId)).study_core) return { ok: false, status: 403, error: 'consent_needed' };
    if (!switchOn(await readFamilySwitches(db as never, accountId), 'tech_lab')) return { ok: false, status: 403, error: 'off' };
    const lesson = lessonById(ask.lessonId);
    if (!lesson) return { ok: false, status: 404, error: 'not_found' };
    const line = narrationScript(techlabToBlocks(lesson, ask.lang)).find((item) => item.blockId === ask.blockId && item.sentence === ask.sentence);
    if (!line) return { ok: false, status: 404, error: 'not_found' };
    return { ok: true, child, children, text: line.text, language: voiceLang(ask.lang) };
  }
  if (ask.kind === 'draw') {
    // C519: the Draw guide, for the child this phone has chosen. The words are the template manifest's own, so nothing
    // a phone sends is spoken.
    const children = await listChildren(db as never, accountId);
    const child = activeChild(children, chosen);
    const text = child ? drawStepText(ask.templateId, ask.step, ask.lang) : null;
    if (!child || !text) return { ok: false, status: 404, error: 'not_found' };
    return { ok: true, child, children, text, language: ask.lang };
  }
  if (ask.kind === 'tutor_answer') {
    // W17-B2: the tutor's own answer to this child (Study's gate: a child Class 1 up and the parent's yes to learning),
    // by its message id. Only a tutor message of this family and this child; a child's own question is never read.
    const children = await listChildren(db as never, accountId);
    const child = activeChild(children, chosen);
    if (!child || isPrePrimary(child.classLevel)) return { ok: false, status: 404, error: 'not_found' };
    if (!(await consentState(db as never, accountId)).study_core) return { ok: false, status: 403, error: 'consent_needed' };
    const { rows } = await db.query(
      `select m.blocks, m.lang from family.tutor_messages m join family.tutor_conversations c on c.conversation_id = m.conversation_id
        where m.message_id = $1 and m.account_id = $2 and m.child_id = $3 and m.role = 'tutor' and c.child_id = $3`,
      [ask.messageId, accountId, child.childId]
    );
    if (!rows[0]) return { ok: false, status: 404, error: 'not_found' };
    // Read back through the block checks, as the feed does; only the teaching text is spoken (never a title, a formula
    // or a question), cut at a sentence to the voice's limit.
    const blocks = (Array.isArray(rows[0].blocks) ? rows[0].blocks : []).map((b: unknown) => parseBlockLine(JSON.stringify(b))).filter((b: Block | null): b is Block => b !== null);
    // W22-S3: the whole answer, read in parts: the part that starts at sentence `from`, the same cut the phone makes.
    const all = spokenSentences(blocks, Number.MAX_SAFE_INTEGER);
    const from = ask.from ?? 0;
    const text = all.slice(from, chunkEnd(all, from, Math.min(ask.max ?? VOICE_TEXT_MAX, VOICE_TEXT_MAX))).join(' ').slice(0, VOICE_TEXT_MAX);
    if (!text) return { ok: false, status: 404, error: 'not_found' };
    return { ok: true, child, children, text, language: rows[0].lang === 'hi' ? 'hi' : 'en' };
  }
  if (ask.kind === 'call_line') {
    // W16-A4: a call's sentence, behind the voice input's own gate, for the child this phone has chosen.
    const call = await callGate(db as never, accountId, chosen);
    if (!call.ok) return call;
    const line = openCallLine(ask.token, { accountId, childId: call.child.childId });
    if (!line) return { ok: false, status: 404, error: 'not_found' };
    return { ok: true, child: call.child, children: call.children, text: line.text, language: call.language };
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

// Whether the server voice could speak now (nothing sent, no place taken), for a screen to say which voice it uses:
// set up, and the family's voice allowance for today not used up (C388). The check reads no child's words, so the
// context names no one.
export async function serverVoiceReady(db: Db, accountId: string): Promise<boolean> {
  const ctx: AiContext = { accountId, childFirstNames: [], day: indiaDate() };
  if ((await profileReady(db as never, ctx, VOICE_PROFILE)) !== 'ready') return false;
  return (await voiceCharsLeft(db as never, accountId, ctx.day)) > 0;
}

// Whether a realtime provider is set up for the call (W16-A4), without taking anything or minting a token: for the call
// screen to know whether to ask for the realtime leg at all. False today (family.voice_call has no provider).
export async function realtimeReady(db: Db, accountId: string): Promise<boolean> {
  const ctx: AiContext = { accountId, childFirstNames: [], day: indiaDate() };
  return (await profileReady(db as never, ctx, 'family.voice_call')) === 'ready';
}
