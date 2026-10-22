import { activePromptVersion } from '@/lib/ai/platform';
import { resolverPrompt } from '@/lib/ai/prompts/family.resolver';
import { indiaDate } from '@/lib/time/india';
import type { FamilyChild } from './children';
import { generate, keep, prepareResolve, type ResolverEvent } from './resolver';
import { isSubject } from './subjects';

// Explanations prepared before children ask (P1 slice 3, C300). NetCyberAI staff make, through the Concept Resolver,
// the explanation of every chapter and topic of one syllabus version (in review or released), in English and in Hindi.
// Each goes to Control → Content → Responses as AI-made, for a reviewer to check or withdraw; in a "checked explanations
// only" subject a child sees it only once it is checked. One line per call, so a call never outlasts the server's time
// limit; the Control page calls again until nothing is missing or a line fails. A withdrawn response counts as missing,
// so the next call makes a fresh one. The request goes through the AI platform on the staff profile content.prepare
// (C313: its own provider, model and prompt version, metered, no family's daily cap), with the resolver's prompts and
// block checks and no child in it. Each response is marked prepared, and the responses' read policy keeps it from every
// child until a person has checked it, whichever subject it is in.

type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };
export type Run = <T>(fn: (db: Db) => Promise<T>) => Promise<T>;

export const PREPARE_LANGUAGES = ['en', 'hi'] as const;
export type PrepareLanguage = (typeof PREPARE_LANGUAGES)[number];
type Version = { versionId: string; boardId: string; classLevel: number; subject: string };
type Wanted = { kind: 'chapter' | 'topic'; key: string; language: PrepareLanguage };
// Which part of the version (C316): only these chapters (each with its topics), and lines to pass over this run (one
// that failed, so a run that measures goes on to the next instead of asking for the same line again).
export type PrepareScope = { chapterKeys?: readonly string[]; skip?: readonly { key: string; language: string }[] };
export type PrepareChapter = { key: string; title: string };

export type PrepareState = { total: number; checked: number; aiMade: number; missing: number; withdrawn: number; next: Wanted | null };
export type PrepareOutcome = 'kept' | 'incomplete' | 'already' | Extract<ResolverEvent, { t: 'refused' }>['reason'];
// What the model sent back for one line, for staff measuring it (C318): why its stream ended, how many JSON objects
// came, the block types that passed and those our checks refused. Types and counts only, never the words.
export type PrepareDetail = { finish: string | null; objects: number; kept: string[]; rejected: string[] };

async function versionOf(db: Db, versionId: string): Promise<Version | null> {
  const { rows } = await db.query(`select version_id, board_id, class_level, subject from content.syllabus_versions where version_id = $1`, [versionId]);
  const r = rows[0];
  return r && isSubject(r.subject) ? { versionId: String(r.version_id), boardId: String(r.board_id), classLevel: Number(r.class_level), subject: String(r.subject) } : null;
}

// The version's chapters, for choosing which to prepare.
export async function prepareChapters(db: Db, versionId: string): Promise<PrepareChapter[]> {
  const { rows } = await db.query(`select chapter_key, title_en from content.chapters where version_id = $1 order by position, chapter_key`, [versionId]);
  return rows.map((r) => ({ key: String(r.chapter_key), title: String(r.title_en) }));
}

// The version's chapters (all, or the ones asked for), each followed by its topics, in book order.
async function linesOf(db: Db, versionId: string, chapterKeys?: readonly string[]): Promise<{ kind: 'chapter' | 'topic'; key: string }[]> {
  const { rows } = await db.query(
    `select c.chapter_key, t.topic_key
       from content.chapters c left join content.topics t on t.chapter_id = c.chapter_id
      where c.version_id = $1 and ($2::text[] is null or c.chapter_key = any($2::text[]))
      order by c.position, c.chapter_key, t.position nulls first, t.topic_key`,
    [versionId, chapterKeys?.length ? chapterKeys : null]
  );
  const out: { kind: 'chapter' | 'topic'; key: string }[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const chapter = String(r.chapter_key);
    if (!seen.has(chapter)) {
      seen.add(chapter);
      out.push({ kind: 'chapter', key: chapter });
    }
    if (r.topic_key) out.push({ kind: 'topic', key: String(r.topic_key) });
  }
  return out;
}

// No real child: the class, board and language of the version, the language's own style, no name.
function childFor(v: Version, language: PrepareLanguage): FamilyChild {
  const state = v.boardId.startsWith('ST-');
  return {
    childId: '00000000-0000-4000-8000-000000000000',
    firstName: '',
    classLevel: v.classLevel,
    board: state ? 'STATE' : v.boardId,
    language,
    style: language,
    stateCode: state ? `IN-${v.boardId.slice(3)}` : '',
    freeSubject: null,
  };
}

export async function prepareState(db: Db, versionId: string, scope: PrepareScope = {}): Promise<PrepareState | null> {
  const v = await versionOf(db, versionId);
  if (!v) return null;
  const lines = await linesOf(db, versionId, scope.chapterKeys);
  const skipped = (key: string, language: string) => (scope.skip ?? []).some((s) => s.key === key && s.language === language);
  const promptVersion = resolverPrompt(await activePromptVersion(db as never, 'content.prepare'), false).version;
  const { rows } = await db.query(
    `select topic_key, language, status from content.responses
      where board_id = $1 and class_level = $2 and subject = $3 and style = language and prompt_version = $4 and topic_key = any($5::text[])`,
    [v.boardId, v.classLevel, v.subject, promptVersion, lines.map((l) => l.key)]
  );
  const statusOf = (key: string, language: string) => {
    const mine = rows.filter((r) => r.topic_key === key && r.language === language).map((r) => String(r.status));
    return mine.includes('checked') ? 'checked' : mine.includes('ai_made') ? 'ai_made' : 'missing';
  };
  const state: PrepareState = { total: 0, checked: 0, aiMade: 0, missing: 0, withdrawn: rows.filter((r) => r.status === 'withdrawn').length, next: null };
  for (const line of lines) {
    for (const language of PREPARE_LANGUAGES) {
      state.total += 1;
      const s = statusOf(line.key, language);
      if (s === 'checked') state.checked += 1;
      else if (s === 'ai_made') state.aiMade += 1;
      else {
        state.missing += 1;
        if (!skipped(line.key, language)) state.next ??= { ...line, language };
      }
    }
  }
  return state;
}

// Makes the next missing explanation of the version. `run` opens one short transaction as the platform role; none is
// held while the model answers (as the Understand route, F1-3).
export async function prepareNext(run: Run, by: { userId: string }, versionId: string, scope: PrepareScope = {}): Promise<{ state: PrepareState; made: (Wanted & { outcome: PrepareOutcome; detail?: PrepareDetail }) | null } | null> {
  const first = await run(async (db) => {
    const state = await prepareState(db, versionId, scope);
    const v = await versionOf(db, versionId);
    if (!state || !v || !state.next) return { state, pending: null, want: null, outcome: null };
    const want = state.next;
    let outcome: PrepareOutcome | null = null;
    const pending = await prepareResolve(
      db,
      { accountId: by.userId, child: childFor(v, want.language), childFirstNames: [], parentEmail: '', day: indiaDate(), refusalWords: (key) => key, preparing: { versionId } },
      { kind: want.kind, key: want.key },
      null,
      (e) => {
        if (e.t === 'refused') outcome = e.reason;
        else if (e.t === 'done') outcome = 'already';
      }
    );
    return { state, pending, want, outcome };
  });
  if (!first.state) return null;
  if (!first.want) return { state: first.state, made: null };
  if (!first.pending) return { state: first.state, made: { ...first.want, outcome: first.outcome ?? 'failed' } };
  const pending = first.pending;
  const generated = await generate(pending, () => {});
  const last = await run((db) => keep(db, pending, generated));
  // A fault while the answer was read is this line's failure, so a run goes on to the next line (C316).
  const outcome: PrepareOutcome = generated.error !== null || !last ? 'failed' : last.t === 'refused' ? last.reason : last.t === 'done' && last.complete ? 'kept' : 'incomplete';
  const state = (await run((db) => prepareState(db, versionId, scope)))!;
  const result = generated.sent.result;
  const detail: PrepareDetail = { finish: result.ok ? (result.finish ?? null) : null, objects: generated.objects, kept: generated.kept.map((b) => b.type), rejected: generated.rejected.slice(0, 20) };
  return { state, made: { ...first.want, outcome, detail } };
}

// ---- the preparing job (W2, C316) -----------------------------------------------------------------------------------

// Staff prepare a set of chapters without a browser open: one line per job run (each run fits the server's minute),
// then the next run is queued with what happened so far. A line that fails is passed over, so the run also measures
// how reliably the model returns our blocks (kept, incomplete, refused), line by line. It stops when nothing is left,
// when the AI is not switched on, or after 400 lines.
// `runId` names one run, so the jobs of two runs never share a key; it is the first job's own key when not given.
export type PrepareJobPayload = { versionId: string; chapterKeys: string[]; by: string; runId?: string; outcomes: { key: string; language: string; outcome: PrepareOutcome; detail?: PrepareDetail }[] };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LINE_KEY = /^[a-z0-9][a-z0-9._-]{2,119}$/;
const STOP: readonly PrepareOutcome[] = ['not_switched_on', 'not_cleared_for_minors'];

export function preparePayload(raw: unknown): PrepareJobPayload | null {
  const p = raw as Partial<PrepareJobPayload> | null;
  if (!p || typeof p.versionId !== 'string' || !UUID_RE.test(p.versionId) || typeof p.by !== 'string' || !UUID_RE.test(p.by)) return null;
  if (!Array.isArray(p.chapterKeys) || p.chapterKeys.length > 40 || !p.chapterKeys.every((k) => typeof k === 'string' && LINE_KEY.test(k))) return null;
  const outcomes = Array.isArray(p.outcomes)
    ? p.outcomes.filter((o) => o && typeof o.key === 'string' && LINE_KEY.test(o.key) && (o.language === 'en' || o.language === 'hi') && typeof o.outcome === 'string' && /^[a-z_]{1,40}$/.test(o.outcome))
    : [];
  const runId = typeof p.runId === 'string' && /^[A-Za-z0-9._:-]{1,120}$/.test(p.runId) ? p.runId : undefined;
  const types = (v: unknown) => (Array.isArray(v) ? v.filter((t): t is string => typeof t === 'string' && /^[a-z_]{1,30}$/.test(t)).slice(0, 20) : []);
  const detailOf = (d: unknown): PrepareDetail | undefined => {
    const x = d as Partial<PrepareDetail> | null;
    if (!x || typeof x !== 'object') return undefined;
    return { finish: typeof x.finish === 'string' && /^[a-z_]{1,30}$/.test(x.finish) ? x.finish : null, objects: Number.isInteger(x.objects) ? Math.max(0, Math.min(Number(x.objects), 999)) : 0, kept: types(x.kept), rejected: types(x.rejected) };
  };
  const clean = outcomes.slice(0, 400).map((o) => ({ key: o.key, language: o.language, outcome: o.outcome, ...(detailOf(o.detail) ? { detail: detailOf(o.detail) } : {}) }));
  return { versionId: p.versionId, chapterKeys: p.chapterKeys, by: p.by, runId, outcomes: clean };
}

// One run: the next line, then either the payload for the next run or the finished summary.
export async function prepareJobStep(run: Run, payload: PrepareJobPayload): Promise<{ next: PrepareJobPayload | null; state: PrepareState | null; outcomes: PrepareJobPayload['outcomes'] }> {
  const skip = payload.outcomes.filter((o) => o.outcome !== 'kept');
  const result = await prepareNext(run, { userId: payload.by }, payload.versionId, { chapterKeys: payload.chapterKeys, skip });
  if (!result || !result.made) return { next: null, state: result?.state ?? null, outcomes: payload.outcomes };
  const outcomes = [...payload.outcomes, { key: result.made.key, language: result.made.language, outcome: result.made.outcome, ...(result.made.detail ? { detail: result.made.detail } : {}) }];
  const done = STOP.includes(result.made.outcome) || outcomes.length >= 400;
  return { next: done ? null : { ...payload, outcomes }, state: result.state, outcomes };
}
