import { REFUSAL_MESSAGE, activePromptVersion, prepareText, type AiRefusal, type PreparedText, type SentText } from '@/lib/ai/platform';
import { resolverPrompt, type ResolverAsk } from '@/lib/ai/prompts/family.resolver';
import { BLOCK_SCHEMA_VERSION, completeResponse, parseBlockLine, type Block, type BlockType } from './blocks';
import type { FamilyChild } from './children';
import { sealItem, type PublicItem } from './items';
import { SUBJECTS, subjectAccess, type Subject } from './modules';

// The Concept Resolver, "Understand" (docs/family-app/02 §4, 03 §6; M1-5, C251): a chapter, a topic or a typed
// question in, typed blocks out, streamed one by one as each passes its checks.
//   1. context   the syllabus line from the catalog released to everyone, for the child's class (never a draft)
//   2. cache     a topic or chapter response already made for this class, language, style and prompt version is
//                served from the shared library (content.responses): "checked by NetCyberAI" once the founder approved
//                it, "AI-made" until then. A typed question is never cached: it is the child's own words.
//   3. generate  through the AI platform (profile family.resolver): the minors check, the pre-processor that removes
//                every child identifier, the daily cap and the metering all happen there
//   4. verify    each line is checked against its block's shape; arithmetic is recomputed; links come from the
//                allowlist; only the first block of each type is kept. A typed question's subject is named by the model
//                on its first line and checked here before any block is shown (the screen's subject is never used):
//                another subject, or one the child may not use, is refused with a pointer to it
//   5. keep      a complete topic or chapter response (explanation, check and practice all passed) goes into the
//                library as AI-made for the next child; a follow-up or a typed question does not
// Check and practice items reach the phone without their answers: each carries a sealed token (items.ts).
//
// No database connection is held while the model answers (F1-3): prepareResolve() does 1–2 and the AI platform's
// checks in the caller's first short transaction; generate() streams 3–4 with no database; keep() writes the metering,
// a typed question's subject claim and the library line in the caller's second short transaction. A library hit is
// served in the first transaction alone.

export type FollowUp = NonNullable<ResolverAsk['followUp']>;
export const FOLLOW_UPS: readonly FollowUp[] = ['simpler', 'another_example', 'differently', 'practise_more'];
// A typed question's subject is null: the model names it and the server checks it. A retry of a typed question carries
// the subject sealed in its item by this server.
export type ResolveInput = { kind: 'topic' | 'chapter'; key: string } | { kind: 'question'; text: string; subject: Subject | null };

export type PublicBlock = Exclude<Block, { type: 'check' } | { type: 'practice' }> | { type: 'check' | 'practice'; items: PublicItem[] };
export type ResolverEvent =
  | { t: 'meta'; label: 'ai_made' | 'checked'; cached: boolean; title: string | null; subject: string; topicKey: string | null }
  | { t: 'block'; block: PublicBlock }
  | { t: 'done'; complete: boolean }
  | { t: 'refused'; reason: AiRefusal | 'not_found' | 'not_school_study' | 'not_open' | 'other_subject'; message: string; goTo?: { subject: Subject; label: string } };

type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };
export type ResolverContext = {
  accountId: string;
  child: FamilyChild;
  childFirstNames: string[];
  parentEmail: string;
  day: string;
  refusalWords: (key: string, params?: Record<string, string>) => string;
  // The subject's entitlement (M1-6): the child's free subject, claimed on first use, on the transaction it is given.
  // Returns whether the subject is open. Absent: every subject is open and nothing is claimed.
  claimSubject?: (db: Db, subject: Subject) => Promise<boolean>;
};

// Whom the sealed items are for.
type Seal = Pick<ResolverContext, 'accountId' | 'child'>;

const KEY = /^[a-z0-9][a-z0-9._-]{2,119}$/;

export type Line = { subject: 'mathematics' | 'science'; key: string; chapterEn: string; topicEn: string | null; title: string };

// The syllabus line for a key, from the version released to everyone for this child's board and class.
export async function syllabusLine(db: Db, child: FamilyChild, input: { kind: 'topic' | 'chapter'; key: string }): Promise<Line | null> {
  if (!KEY.test(input.key)) return null;
  const pick = (en: unknown, hi: unknown) => String(child.language === 'hi' && hi ? hi : en);
  if (input.kind === 'topic') {
    const { rows } = await db.query(
      `select v.subject, t.topic_key, t.title_en, t.title_hi, c.title_en as chapter_en
         from content.topics t join content.chapters c on c.chapter_id = t.chapter_id
         join content.syllabus_versions v on v.version_id = t.version_id
        where t.topic_key = $1 and v.board_id = $2 and v.class_level = $3 and v.status = 'published' and v.audience = 'everyone'
        order by v.academic_year desc limit 1`,
      [input.key, child.board, child.classLevel]
    );
    const r = rows[0];
    if (!r || (r.subject !== 'mathematics' && r.subject !== 'science')) return null;
    return { subject: r.subject, key: String(r.topic_key), chapterEn: String(r.chapter_en), topicEn: String(r.title_en), title: pick(r.title_en, r.title_hi) };
  }
  const { rows } = await db.query(
    `select v.subject, c.chapter_key, c.title_en, c.title_hi
       from content.chapters c join content.syllabus_versions v on v.version_id = c.version_id
      where c.chapter_key = $1 and v.board_id = $2 and v.class_level = $3 and v.status = 'published' and v.audience = 'everyone'
      order by v.academic_year desc limit 1`,
    [input.key, child.board, child.classLevel]
  );
  const r = rows[0];
  if (!r || (r.subject !== 'mathematics' && r.subject !== 'science')) return null;
  return { subject: r.subject, key: String(r.chapter_key), chapterEn: String(r.title_en), topicEn: null, title: pick(r.title_en, r.title_hi) };
}

function toPublic(b: Block, ctx: Seal, topicKey: string, subject: string): PublicBlock {
  if (b.type !== 'check' && b.type !== 'practice') return b;
  return { type: b.type, items: b.items.map((i) => sealItem(i, { accountId: ctx.accountId, childId: ctx.child.childId, topicKey, subject, kind: b.type as 'check' | 'practice' })) };
}

// A complete response from the shared library for this child's class, language and style, as the events the phone
// draws (items sealed for this child), or null when there is none.
async function libraryEvents(db: Db, ctx: Seal, line: Line, promptVersion: string): Promise<ResolverEvent[] | null> {
  const child = ctx.child;
  const { rows } = await db.query(
    `select blocks, status from content.responses
      where board_id = $1 and class_level = $2 and subject = $3 and topic_key = $4 and language = $5 and style = $6 and prompt_version = $7 and status <> 'withdrawn'
      limit 1`,
    [child.board, child.classLevel, line.subject, line.key, child.language, child.style, promptVersion]
  );
  const cached = rows[0];
  if (!cached || !Array.isArray(cached.blocks)) return null;
  const blocks = completeResponse((cached.blocks as unknown[]).map((b) => parseBlockLine(JSON.stringify(b))).filter((b): b is Block => b !== null));
  if (!blocks) return null;
  return [
    { t: 'meta', label: cached.status === 'checked' ? 'checked' : 'ai_made', cached: true, title: line.title, subject: line.subject, topicKey: line.key },
    ...blocks.map((b): ResolverEvent => ({ t: 'block', block: toPublic(b, ctx, line.key, line.subject) })),
    { t: 'done', complete: true },
  ];
}

// The Understand page draws a library response with the page itself (09 §4: the explanation is the largest paint, and
// waiting for the phone to ask first cost half a second on a 4G profile). Only when the subject is already the child's
// free one, so drawing the page never claims a subject; otherwise, or when the library has none, the phone asks.
export async function libraryResponse(db: Db, ctx: Seal, line: Line): Promise<ResolverEvent[] | null> {
  if (ctx.child.freeSubject !== line.subject) return null;
  const promptVersion = resolverPrompt(await activePromptVersion(db as never, 'family.resolver'), false).version;
  return libraryEvents(db, ctx, line, promptVersion);
}

// What prepareResolve() hands on: everything generate() and keep() need, and no database client.
export type Pending = {
  ctx: ResolverContext;
  line: Line | null;
  // The subject when the server knows it (a syllabus line, a retry's sealed item); null when the model names it.
  known: Subject | null;
  open: Subject[];
  cacheable: boolean;
  promptVersion: string;
  text: PreparedText;
};

export type Generated = {
  sent: SentText;
  subject: Subject | null;
  kept: Block[];
  shown: boolean;
  refusedByModel: boolean;
  // A refusal already sent while streaming (a typed question in another subject): nothing more is said.
  stopped: boolean;
};

const SUBJECT_NAMED = /"type"\s*:\s*"subject"/;

// The subject the model named, when the line is the subject line: 'other' for any subject outside the app's two.
export function namedSubject(text: string): Subject | 'other' | null {
  if (!SUBJECT_NAMED.test(text)) return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const v = JSON.parse(text.slice(start, end + 1)) as { type?: unknown; subject?: unknown };
    if (v.type !== 'subject' || typeof v.subject !== 'string') return null;
    return (SUBJECTS as readonly string[]).includes(v.subject) ? (v.subject as Subject) : 'other';
  } catch {
    return null;
  }
}

const questionKey = (child: FamilyChild, subject: Subject) => `cbse.c${child.classLevel}.${subject}.question`;

// 1–2 and the AI platform's checks, in the caller's first transaction. null: answered already (a refusal, or the
// library's response); otherwise the call to make, which needs no database connection.
export async function prepareResolve(db: Db, ctx: ResolverContext, input: ResolveInput, followUp: FollowUp | null, emit: (e: ResolverEvent) => void, misconception: string | null = null): Promise<Pending | null> {
  const child = ctx.child;
  let line: Line | null = null;
  if (input.kind !== 'question') {
    line = await syllabusLine(db, child, input);
    if (!line) {
      emit({ t: 'refused', reason: 'not_found', message: ctx.refusalWords('fam.understand.notFound') });
      return null;
    }
  }
  const known: Subject | null = line?.subject ?? (input.kind === 'question' ? input.subject : null);
  if (known && ctx.claimSubject && !(await ctx.claimSubject(db, known))) {
    emit({ t: 'refused', reason: 'not_open', message: ctx.refusalWords('fam.subject.notOpen') });
    return null;
  }
  // A typed question is answered only in a subject this child may use: the free one, or either before one is claimed.
  const open: Subject[] = known ? [known] : SUBJECTS.filter((s) => !ctx.claimSubject || subjectAccess(child, s).open);
  const prompt = resolverPrompt(await activePromptVersion(db as never, 'family.resolver'), known === null);
  const cacheable = input.kind !== 'question' && followUp === null && misconception === null;

  // 2. The shared library.
  if (cacheable && line) {
    const cached = await libraryEvents(db, ctx, line, prompt.version);
    if (cached) {
      for (const e of cached) emit(e);
      return null;
    }
  }

  // 3. The AI platform's checks (profile, minors, key, daily cap) and the cleaned request, still in this transaction.
  const ask: ResolverAsk = {
    board: child.board,
    classLevel: child.classLevel,
    subject: known,
    openSubjects: open,
    chapter: line?.chapterEn ?? null,
    topic: line?.topicEn ?? null,
    question: input.kind === 'question' ? input.text : null,
    language: child.language,
    style: child.style,
    followUp,
    misconception,
  };
  const prepared = await prepareText(
    db as never,
    { accountId: ctx.accountId, childFirstNames: ctx.childFirstNames, parentEmail: ctx.parentEmail, day: ctx.day },
    'family.resolver',
    { system: prompt.system(ask), messages: [{ role: 'user', content: prompt.user(ask) }], responseFormat: undefined }
  );
  if (!prepared.ok) {
    emit({ t: 'refused', reason: prepared.reason, message: ctx.refusalWords(REFUSAL_MESSAGE[prepared.reason]) });
    return null;
  }
  return { ctx, line, known, open, cacheable, promptVersion: prompt.version, text: prepared.text };
}

// 3–4. The model's answer, checked line by line as it arrives. No database: the caller holds no connection here.
export async function generate(p: Pending, emit: (e: ResolverEvent) => void): Promise<Generated> {
  const { ctx, line } = p;
  const words = ctx.refusalWords;
  let subject: Subject | null = p.known;
  let stopped = false;
  let refusedByModel = false;
  let shown = false;
  const seen = new Set<BlockType>();
  const kept: Block[] = [];
  let pending = '';
  const take = (text: string) => {
    if (stopped) return;
    if (/"type"\s*:\s*"refuse"/.test(text)) refusedByModel = true;
    if (!subject) {
      // Nothing is shown until the subject is named, and only a subject this child may use is answered.
      const named = namedSubject(text);
      if (named === null) return;
      if (named === 'other') {
        stopped = true;
        emit({ t: 'refused', reason: 'other_subject', message: words('fam.understand.otherSubject') });
        return;
      }
      if (!p.open.includes(named)) {
        stopped = true;
        const name = words(`fam.subject.${named}`);
        emit({ t: 'refused', reason: 'not_open', message: words('fam.understand.askInSubject', { subject: name }), goTo: { subject: named, label: words('fam.understand.goToSubject', { subject: name }) } });
        return;
      }
      subject = named;
      return;
    }
    const b = parseBlockLine(text);
    if (!b || seen.has(b.type)) return;
    seen.add(b.type);
    kept.push(b);
    if (!shown) {
      emit({ t: 'meta', label: 'ai_made', cached: false, title: line?.title ?? null, subject, topicKey: line?.key ?? null });
      shown = true;
    }
    // Progress and the sealed items are keyed to the syllabus line; a typed question is kept against its subject.
    emit({ t: 'block', block: toPublic(b, ctx, line?.key ?? questionKey(ctx.child, subject), subject) });
  };
  const sent = await p.text.send((delta) => {
    pending += delta;
    let nl = pending.indexOf('\n');
    while (nl >= 0) {
      take(pending.slice(0, nl));
      pending = pending.slice(nl + 1);
      nl = pending.indexOf('\n');
    }
  });
  try {
    if (pending.trim()) take(pending);
  } catch {
    // The phone went away before the last line: the call still reaches keep(), so it is metered.
  }
  return { sent, subject, kept, shown, refusedByModel, stopped };
}

// 5. The writes after the call, in the caller's second transaction: the metering first, then a typed question's subject
// claim and the library line. Returns the last event to send once the transaction has committed (null: already said).
export async function keep(db: Db, p: Pending, g: Generated): Promise<ResolverEvent | null> {
  const { ctx, line } = p;
  await g.sent.record(db as never);
  if (g.stopped) return null;
  // A typed question answered in a subject the child had not claimed: the answer shown makes it their free subject. (Two
  // first questions at the same moment in different subjects: the first claim stands, as claimSubject keeps it.)
  if (p.known === null && g.subject && g.shown && ctx.claimSubject && !ctx.child.freeSubject) await ctx.claimSubject(db, g.subject);
  const result = g.sent.result;
  if (!result.ok) return g.shown ? { t: 'done', complete: false } : { t: 'refused', reason: result.reason, message: ctx.refusalWords(REFUSAL_MESSAGE[result.reason]) };
  if (g.refusedByModel && g.kept.length === 0) return { t: 'refused', reason: 'not_school_study', message: ctx.refusalWords('fam.understand.notStudy') };
  // The model never named the subject: nothing was shown, and no subject is guessed.
  if (!g.subject) return { t: 'refused', reason: 'failed', message: ctx.refusalWords(REFUSAL_MESSAGE.failed) };
  const complete = completeResponse(g.kept);

  // A complete topic or chapter response is kept for the next child, as AI-made, until the founder approves it.
  if (complete && p.cacheable && line) {
    await db.query(
      `insert into content.responses (board_id, class_level, subject, topic_key, language, style, prompt_version, schema_version, blocks, status, provider, model)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, 'ai_made', $10, $11)
       on conflict do nothing`,
      [ctx.child.board, ctx.child.classLevel, line.subject, line.key, ctx.child.language, ctx.child.style, p.promptVersion, BLOCK_SCHEMA_VERSION, JSON.stringify(complete), result.provider, result.model]
    );
  }
  return { t: 'done', complete: complete !== null };
}
