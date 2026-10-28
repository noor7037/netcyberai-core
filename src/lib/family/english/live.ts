import { dailyRequestsLeft, profileReady, type AiContext, type AiRefusal, type AiRequest, type ChatMessage } from '@/lib/ai/platform';
import { englishConversationPrompt, type EnglishConversationPrompt } from '@/lib/ai/prompts/family.english_conversation';
import { indiaDate } from '@/lib/time/india';
import { accountSummary } from '../account';
import { activeChild, isPrePrimary, listChildren, type FamilyChild } from '../children';
import { consentState } from '../consent';
import { readFamilySwitches, switchOn } from '../flags';
import { cleanTranscript, voiceDay } from '../voice';
import type { Track } from './course';
import { trackForClass } from './progress';
import { readEnrolment } from './store';

// The live spoken-English tutor (E1, C382; docs/37 §4 Wave 3; the gateway brief §9), beside the English course
// (docs/family-app/12). Turn-based and push-to-talk only:
//   1. the child taps, speaks and taps again; the recording goes once to speech to text (the existing family.voice_input
//      profile and the child's voice seconds a day) and is dropped; the words come back to the screen;
//   2. the child reads the words and may correct them, then sends; only the corrected text is ever kept;
//   3. the reply is a short, level-appropriate role-play line from family.english_conversation, streamed sentence by
//      sentence (C386): each sentence is checked by the safety check (family.moderation), with the child's words and the
//      reply so far, before it is shown; the first refused sentence stops the reply and nothing of it is kept. Each
//      shown sentence is read aloud by the server voice when Control has set one up (family.text_to_speech, through
//      /api/family/voice/speak), else by the phone's own voice, and the screen says which. Duplex (talking over each
//      other) needs an adapter that declares it; none does, so it is not built.
// The context is bounded: the prompt holds at most LIVE_VERBATIM earlier turns word for word, plus a rolling summary of
// the older ones, made by the same workload when the turns not yet summarised reach LIVE_FOLD_AT. A session ends with a
// recap: what was practised and the words that were new, each word checked to be in the talk. Never a pronunciation
// score (the server never hears how the child sounds once the words are made) and no score of any kind.

type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }> };

export const LIVE_TOPICS = ['my_day', 'school', 'market', 'food', 'family', 'games'] as const;
export type LiveTopic = (typeof LIVE_TOPICS)[number];
export const isLiveTopic = (v: unknown): v is LiveTopic => typeof v === 'string' && (LIVE_TOPICS as readonly string[]).includes(v);
// What the model is told the role-play is about (English: the model's instructions are in English).
const TOPIC_TEXT: Record<LiveTopic, string> = {
  my_day: 'the child tells the tutor about their day',
  school: 'a friendly talk about a day at school',
  market: 'the child buys fruit and vegetables from the tutor at a market stall',
  food: 'favourite food and what is cooked at home',
  family: 'the people at home and what they do together',
  games: 'games and sports the child likes to play',
};

export const LIVE_VERBATIM = 6; // the most earlier turns a prompt holds word for word
export const LIVE_FOLD_AT = 6; // the turns not yet summarised, after a save, that start a fold
export const LIVE_KEEP = 3; // the turns left word for word after a fold
export const LIVE_MAX_TURNS = 30;
export const LIVE_TEXT_MAX = 300;
export const LIVE_REPLY_MAX = 500;
export const LIVE_SUMMARY_MAX = 500;
// The longest a streamed sentence waits for its end before it is cut at a space and shown (C386).
export const LIVE_SENTENCE_MAX = 240;
const NEW_WORDS_MAX = 6;

export type LiveTurn = { position: number; childText: string; reply: string };
export type LiveRecap = { topic: LiveTopic; turns: number; practised: string | null; newWords: string[] };
export type LiveSession = { sessionId: string; topic: LiveTopic; track: Track; summary: string | null; summarisedUpto: number; startedAt: string; turns: LiveTurn[] };

// ---- the requests (pure) -------------------------------------------------------------------------------------------

// The reply's request: the role-play's instructions, the summary of the older turns, at most LIVE_VERBATIM earlier
// turns word for word (the newest), then the child's new words.
export function replyRequest(prompt: EnglishConversationPrompt, a: { track: Track; topic: LiveTopic; summary: string | null; turns: readonly LiveTurn[]; text: string }): AiRequest {
  const recent = a.turns.slice(-LIVE_VERBATIM);
  const messages: ChatMessage[] = recent.flatMap((t): ChatMessage[] => [
    { role: 'user', content: t.childText },
    { role: 'assistant', content: t.reply },
  ]);
  messages.push({ role: 'user', content: a.text });
  const earlier = a.summary ? `\n\nEarlier in this talk: ${a.summary}` : '';
  return { system: `${prompt.reply({ track: a.track, topic: TOPIC_TEXT[a.topic] })}${earlier}`, messages, maxTokens: 200 };
}

// The turns to fold into the summary once this turn is saved: none until the turns not yet summarised (with this
// one) reach LIVE_FOLD_AT; then all but the newest LIVE_KEEP (only earlier turns, never the one being made).
export function foldPlan(unsummarised: readonly LiveTurn[]): LiveTurn[] {
  if (unsummarised.length + 1 < LIVE_FOLD_AT) return [];
  return unsummarised.slice(0, Math.max(0, unsummarised.length + 1 - LIVE_KEEP));
}

const lines = (turns: readonly LiveTurn[]) => turns.map((t) => `Child: ${t.childText}\nTutor: ${t.reply}`).join('\n');

export function summaryRequest(prompt: EnglishConversationPrompt, summary: string | null, folded: readonly LiveTurn[]): AiRequest {
  return { system: prompt.summary(), messages: [{ role: 'user', content: `Earlier notes: ${summary ?? '(none)'}\n\nNext turns:\n${lines(folded)}` }], maxTokens: 200 };
}

export function recapRequest(prompt: EnglishConversationPrompt, topic: LiveTopic, turns: readonly LiveTurn[]): AiRequest {
  return { system: prompt.recap(), messages: [{ role: 'user', content: `Topic: ${TOPIC_TEXT[topic]}\n\n${lines(turns)}` }], maxTokens: 300, responseFormat: 'json' };
}

// ---- the answers, read as data (pure) ------------------------------------------------------------------------------

const flat = (text: string) => text.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/[*_#\u0060>]+/g, '').replace(/\s+/g, ' ').trim();

// Cut at the last sentence end within `max` characters (or the last space).
function cut(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = text.slice(0, max);
  const end = Math.max(head.lastIndexOf('. '), head.lastIndexOf('? '), head.lastIndexOf('! '));
  return (end > max / 2 ? head.slice(0, end + 1) : head.slice(0, Math.max(head.lastIndexOf(' '), 1))).trim();
}

// The tutor's reply as the child sees and hears it: one plain line, at most LIVE_REPLY_MAX characters, with an
// Aadhaar-like number taken out (the same rule as the child's words).
export const cleanReply = (text: string): string => cleanTranscript(cut(flat(text), LIVE_REPLY_MAX));
export const cleanSummary = (text: string): string => cleanTranscript(cut(flat(text), LIVE_SUMMARY_MAX));
// The child's corrected words: the voice path's own rule (one line, an Aadhaar-like number taken out), at most 300.
// The reply as it streams (C386): pieces in, whole sentences out (each one plain line, cleaned as the reply is), at a
// sentence end followed by a space, or at a space once LIVE_SENTENCE_MAX characters wait; flush() gives the rest once
// the reply is done. A number such as 3.5 is not an end (no space follows its point).
const SENTENCE_END = /[.!?।]+["'’”)\]]*\s/;
export function sentenceBuffer(): { push: (piece: string) => string[]; flush: () => string[] } {
  let buf = '';
  const clean = (t: string) => cleanTranscript(flat(t));
  const take = (): string[] => {
    const out: string[] = [];
    for (;;) {
      const m = SENTENCE_END.exec(buf);
      const end = m ? m.index + m[0].length : buf.length > LIVE_SENTENCE_MAX ? (buf.lastIndexOf(' ', LIVE_SENTENCE_MAX) > 0 ? buf.lastIndexOf(' ', LIVE_SENTENCE_MAX) : LIVE_SENTENCE_MAX) : 0;
      if (!end) return out.map(clean).filter(Boolean);
      out.push(buf.slice(0, end));
      buf = buf.slice(end);
    }
  };
  return {
    push: (piece: string) => {
      buf += piece;
      return take();
    },
    flush: () => {
      const rest = [...take(), clean(buf)].filter(Boolean);
      buf = '';
      return rest;
    },
  };
}

export const cleanChildText = (text: unknown): string => (typeof text === 'string' ? cleanTranscript(text).slice(0, LIVE_TEXT_MAX).trim() : '');

const WORD = /^[A-Za-z][A-Za-z\u0027-]{1,23}$/;
const SCORE_TALK = /\b(scores?|marks?|grades?|percent|pronunciation|accent|fluency|out of \d+)\b|%|\d+\s*\/\s*\d+/i;
const wordsIn = (text: string) => new Set(text.toLowerCase().match(/[a-z][a-z\u0027-]*/g) ?? []);

// The recap the model wrote, checked: "practised" is kept only when it says nothing of a score or of how the child
// sounds; each new word must be one word that is really in the talk (a checked, rule-based fact), at most six.
export function checkedRecap(text: string, topic: LiveTopic, turns: readonly LiveTurn[]): LiveRecap {
  let parsed: unknown = null;
  const from = text.indexOf('{');
  const to = text.lastIndexOf('}');
  if (from >= 0 && to > from) {
    try {
      parsed = JSON.parse(text.slice(from, to + 1));
    } catch {
      parsed = null;
    }
  }
  const o = (parsed && typeof parsed === 'object' ? parsed : {}) as { practised?: unknown; new_words?: unknown };
  const said = typeof o.practised === 'string' ? cut(flat(o.practised), 240) : '';
  const inTalk = wordsIn(turns.map((t) => `${t.childText} ${t.reply}`).join(' '));
  const words = (Array.isArray(o.new_words) ? o.new_words : [])
    .filter((w): w is string => typeof w === 'string' && WORD.test(w.trim()))
    .map((w) => w.trim().toLowerCase())
    .filter((w, i, all) => inTalk.has(w) && all.indexOf(w) === i)
    .slice(0, NEW_WORDS_MAX);
  return { topic, turns: turns.length, practised: said && !SCORE_TALK.test(said) ? said : null, newWords: words.length ? words : wordsTakenUp(turns) };
}

// Without the model's recap: the words of five letters or more the tutor said that the child then used in a later turn.
export function wordsTakenUp(turns: readonly LiveTurn[]): string[] {
  const found: string[] = [];
  turns.forEach((t, i) => {
    const later = wordsIn(turns.slice(i + 1).map((x) => x.childText).join(' '));
    for (const w of wordsIn(t.reply)) if (w.length >= 5 && WORD.test(w) && later.has(w) && !found.includes(w)) found.push(w);
  });
  return found.slice(0, NEW_WORDS_MAX);
}

// ---- who may use it ------------------------------------------------------------------------------------------------

export type LiveGate = { ok: true; child: FamilyChild; children: FamilyChild[]; track: Track } | { ok: false; status: number; error: string };

// The child using the app now (the one this phone chose, never one the request names), from Class 1 up, with Control's
// English course and voice input switched on, and the parent's yes to learning, the English course AND voice practice.
export async function liveChild(db: Db, accountId: string, chosen: string | undefined): Promise<LiveGate> {
  const children = await listChildren(db as never, accountId);
  const child = activeChild(children, chosen);
  if (!child) return { ok: false, status: 404, error: 'no_child' };
  if (isPrePrimary(child.classLevel)) return { ok: false, status: 403, error: 'not_for_class' };
  // Voice input's own switch too (E1 review): switching voice off in Control stops live speech as it stops Study's.
  const switches = await readFamilySwitches(db as never, accountId);
  if (!switchOn(switches, 'english_programme') || !switchOn(switches, 'voice_input')) return { ok: false, status: 403, error: 'off' };
  // study_core as well (E1 review): every family AI path needs it, and a parent who withdraws it stops this one too.
  const consents = await consentState(db as never, accountId);
  if (!consents.study_core || !consents.english_programme || !consents.voice_practice) return { ok: false, status: 403, error: 'consent_needed' };
  const track = (await readEnrolment(db as never, child.childId))?.track ?? trackForClass(child.classLevel);
  return { ok: true, child, children, track };
}

// What the screen must say before a child speaks: whether speech to text, the reply and the safety check are set up,
// the family's AI requests left today, and the child's voice seconds left. Nothing is sent and no place is taken.
// `tts` (C386): whether the server voice reads the replies; when not, the phone's own voice does (never a refusal).
export type LiveStatus = { speech: 'ready' | AiRefusal; text: 'ready' | AiRefusal; safety: 'ready' | AiRefusal; tts: 'ready' | AiRefusal; requestsLeft: number; voice: { left: number; limit: number } };
export async function liveStatus(db: Db, ctx: AiContext, childId: string): Promise<LiveStatus> {
  const [speech, text, safety] = [await profileReady(db as never, ctx, 'family.voice_input'), await profileReady(db as never, ctx, 'family.english_conversation'), await profileReady(db as never, ctx, 'family.moderation')];
  const tts = await profileReady(db as never, ctx, 'family.text_to_speech');
  const v = await voiceDay(db, ctx.accountId, childId, ctx.day);
  return { speech, text, safety, tts, requestsLeft: await dailyRequestsLeft(db as never, ctx.accountId, ctx.day), voice: { left: v.left, limit: v.limit } };
}

// The AI platform's context for this family today: the children's first names and the parent's email, which the
// platform's pre-processor removes from every request before it leaves.
export async function liveAiContext(db: Db, accountId: string, firstNames: string[]): Promise<AiContext> {
  const account = await accountSummary(db as never, accountId);
  return { accountId, childFirstNames: firstNames, parentEmail: account?.email ?? '', day: indiaDate() };
}

// What the live screen shows, for the API and for the page's first draw: the refusal, or what is set up and the open
// session (the child's words and the replies; never the summary).
export type LiveView = { status: LiveStatus; session: { sessionId: string; topic: LiveTopic; turns: LiveTurn[] } | null; topics: readonly LiveTopic[]; maxTurns: number };
export async function liveView(db: Db, accountId: string, chosen: string | undefined): Promise<{ ok: true; view: LiveView } | { ok: false; status: number; error: string }> {
  const gate = await liveChild(db, accountId, chosen);
  if (!gate.ok) return gate;
  const status = await liveStatus(db, await liveAiContext(db, accountId, gate.children.map((c) => c.firstName)), gate.child.childId);
  const open = await openSession(db, accountId, gate.child.childId);
  return { ok: true, view: { status, session: open ? { sessionId: open.sessionId, topic: open.topic, turns: open.turns } : null, topics: LIVE_TOPICS, maxTurns: LIVE_MAX_TURNS } };
}

// ---- the sessions (the family's own transaction; every table's policies keep rows to the account and the child) ----

const turnOf = (r: Record<string, unknown>): LiveTurn => ({ position: Number(r.position), childText: String(r.child_text), reply: String(r.reply) });

async function turnsOf(db: Db, sessionId: string): Promise<LiveTurn[]> {
  const { rows } = await db.query(`select position, child_text, reply from family.english_live_turns where session_id = $1 order by position`, [sessionId]);
  return rows.map(turnOf);
}

function sessionOf(r: Record<string, unknown>, turns: LiveTurn[]): LiveSession {
  return {
    sessionId: String(r.session_id),
    topic: r.topic as LiveTopic,
    track: r.track as Track,
    summary: r.summary === null || r.summary === undefined ? null : String(r.summary),
    summarisedUpto: Number(r.summarised_upto),
    startedAt: new Date(r.started_at as string).toISOString(),
    turns,
  };
}

const SESSION_COLUMNS = 'session_id, topic, track, summary, summarised_upto, started_at';

// The child's open session, with its turns; null when none is open.
export async function openSession(db: Db, accountId: string, childId: string, sessionId?: string): Promise<LiveSession | null> {
  const { rows } = await db.query(
    `select ${SESSION_COLUMNS} from family.english_live_sessions
      where account_id = $1 and child_id = $2 and status = 'open' and ($3::uuid is null or session_id = $3::uuid)
      order by started_at desc limit 1`,
    [accountId, childId, sessionId ?? null]
  );
  return rows[0] ? sessionOf(rows[0], await turnsOf(db, String(rows[0].session_id))) : null;
}

// A new session; any session the child left open is ended first (without a recap).
export async function startSession(db: Db, accountId: string, childId: string, track: Track, topic: LiveTopic): Promise<LiveSession> {
  await db.query(`update family.english_live_sessions set status = 'ended', ended_at = now(), updated_at = now() where account_id = $1 and child_id = $2 and status = 'open'`, [accountId, childId]);
  const { rows } = await db.query(
    `insert into family.english_live_sessions (account_id, child_id, topic, track) values ($1, $2, $3, $4) returning ${SESSION_COLUMNS}`,
    [accountId, childId, topic, track]
  );
  return sessionOf(rows[0], []);
}

// One turn kept, with the summary when a fold was made on the summary this turn started from. The session row is
// locked, so two sends at once take positions one after the other. null when the session is gone, ended or full.
export async function keepTurn(
  db: Db,
  t: { accountId: string; childId: string; sessionId: string; text: string; reply: string; fold: { from: number; upto: number; summary: string } | null }
): Promise<number | null> {
  const { rows } = await db.query(
    `select summarised_upto from family.english_live_sessions where session_id = $1 and account_id = $2 and child_id = $3 and status = 'open' for update`,
    [t.sessionId, t.accountId, t.childId]
  );
  if (!rows[0]) return null;
  const next = Number((await db.query(`select coalesce(max(position), 0)::int + 1 as n from family.english_live_turns where session_id = $1`, [t.sessionId])).rows[0].n);
  if (next > LIVE_MAX_TURNS) return null;
  await db.query(`insert into family.english_live_turns (session_id, account_id, child_id, position, child_text, reply) values ($1, $2, $3, $4, $5, $6)`, [
    t.sessionId,
    t.accountId,
    t.childId,
    next,
    t.text,
    t.reply,
  ]);
  const fold = t.fold && Number(rows[0].summarised_upto) === t.fold.from ? t.fold : null;
  await db.query(
    `update family.english_live_sessions set updated_at = now(), summary = coalesce($2, summary), summarised_upto = coalesce($3::smallint, summarised_upto) where session_id = $1`,
    [t.sessionId, fold?.summary ?? null, fold?.upto ?? null]
  );
  return next;
}

export async function endSession(db: Db, accountId: string, childId: string, sessionId: string, recap: LiveRecap | null): Promise<boolean> {
  const r = await db.query(
    `update family.english_live_sessions set status = 'ended', ended_at = now(), updated_at = now(), recap = $4::jsonb where session_id = $1 and account_id = $2 and child_id = $3 and status = 'open'`,
    [sessionId, accountId, childId, recap ? JSON.stringify(recap) : null]
  );
  return (r.rowCount ?? 0) > 0;
}

// ---- the parent's view (parent mode) -------------------------------------------------------------------------------

export type ParentLiveSession = { sessionId: string; topic: LiveTopic; startedAt: string; ended: boolean; recap: LiveRecap | null; turns: LiveTurn[] };

// A child's last twenty sessions with their turns, newest first.
export async function parentSessions(db: Db, accountId: string, childId: string): Promise<ParentLiveSession[]> {
  const { rows } = await db.query(
    `select session_id, topic, status, recap, started_at from family.english_live_sessions where account_id = $1 and child_id = $2 order by started_at desc limit 20`,
    [accountId, childId]
  );
  const out: ParentLiveSession[] = [];
  for (const r of rows) {
    const turns = await turnsOf(db, String(r.session_id));
    if (turns.length === 0) continue;
    out.push({ sessionId: String(r.session_id), topic: r.topic as LiveTopic, startedAt: new Date(r.started_at as string).toISOString(), ended: r.status === 'ended', recap: (r.recap as LiveRecap | null) ?? null, turns });
  }
  return out;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

// The parent's "clear": the session and its turns go (the turns by the foreign key).
export async function clearSession(db: Db, accountId: string, sessionId: unknown): Promise<boolean> {
  if (!isUuid(sessionId)) return false;
  const gone = await db.query(`delete from family.english_live_sessions where session_id = $1 and account_id = $2`, [sessionId, accountId]);
  return (gone.rowCount ?? 0) > 0;
}

export { englishConversationPrompt };
