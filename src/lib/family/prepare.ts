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

export type PrepareState = { total: number; checked: number; aiMade: number; missing: number; withdrawn: number; next: Wanted | null };
export type PrepareOutcome = 'kept' | 'incomplete' | 'already' | Extract<ResolverEvent, { t: 'refused' }>['reason'];

async function versionOf(db: Db, versionId: string): Promise<Version | null> {
  const { rows } = await db.query(`select version_id, board_id, class_level, subject from content.syllabus_versions where version_id = $1`, [versionId]);
  const r = rows[0];
  return r && isSubject(r.subject) ? { versionId: String(r.version_id), boardId: String(r.board_id), classLevel: Number(r.class_level), subject: String(r.subject) } : null;
}

// The version's chapters, each followed by its topics, in book order.
async function linesOf(db: Db, versionId: string): Promise<{ kind: 'chapter' | 'topic'; key: string }[]> {
  const { rows } = await db.query(
    `select c.chapter_key, t.topic_key
       from content.chapters c left join content.topics t on t.chapter_id = c.chapter_id
      where c.version_id = $1
      order by c.position, c.chapter_key, t.position nulls first, t.topic_key`,
    [versionId]
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

export async function prepareState(db: Db, versionId: string): Promise<PrepareState | null> {
  const v = await versionOf(db, versionId);
  if (!v) return null;
  const lines = await linesOf(db, versionId);
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
        state.next ??= { ...line, language };
      }
    }
  }
  return state;
}

// Makes the next missing explanation of the version. `run` opens one short transaction as the platform role; none is
// held while the model answers (as the Understand route, F1-3).
export async function prepareNext(run: Run, by: { userId: string }, versionId: string): Promise<{ state: PrepareState; made: (Wanted & { outcome: PrepareOutcome }) | null } | null> {
  const first = await run(async (db) => {
    const state = await prepareState(db, versionId);
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
  if (generated.error !== null) throw generated.error;
  const outcome: PrepareOutcome = !last ? 'failed' : last.t === 'refused' ? last.reason : last.t === 'done' && last.complete ? 'kept' : 'incomplete';
  const state = (await run((db) => prepareState(db, versionId)))!;
  return { state, made: { ...first.want, outcome } };
}
