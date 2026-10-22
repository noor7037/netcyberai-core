import { REFUSAL_MESSAGE, activePromptVersion, prepareText, type AiRefusal, type PreparedText, type SentText } from '@/lib/ai/platform';
import { resolverPrompt, type ResolverAsk } from '@/lib/ai/prompts/family.resolver';
import { BLOCK_SCHEMA_VERSION, completeResponse, isInteractive, parseBlockLine, type Block, type BlockType } from './blocks';
import { boardNameOf, isPrePrimary, syllabusBoardOf, type FamilyChild } from './children';
import { sealItem, type PublicItem } from './items';
import { classSubjects } from './catalog';
import { openSubjects, reviewedOnlySubjects } from './learning';
import { subjectAccess } from './modules';
import { isSubject, type Subject } from './subjects';

// The Concept Resolver, "Understand" (docs/family-app/02 §4, 03 §6; M1-5, C251): a chapter, a topic or a typed
// question in, typed blocks out, streamed one by one as each passes its checks.
//   1. context   the syllabus line from the catalog released to everyone, for the child's class (never a draft)
//   2. cache     a topic or chapter response already made for this class, language, style and prompt version is
//                served from the shared library (content.responses): "checked by NetCyberAI" once the founder approved
//                it, "AI-made" until then. A typed question is never cached: it is the child's own words. In a subject
//                Control marks "checked explanations only" (C300: the pilot's EVS) a chapter or topic is served only a
//                checked response, and is never made live; until one is checked the child is told it is being checked
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
// checks in the caller's first short transaction; generate() streams 3–4 with no connection held (a child with no free
// subject claims a typed question's subject in a short transaction of its own, just before the first block is shown);
// keep() writes the metering and the library line in the caller's second short transaction. A library hit is served
// in the first transaction alone.

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
  | { t: 'refused'; reason: AiRefusal | 'not_found' | 'not_school_study' | 'not_open' | 'other_subject' | 'not_ready'; message: string; goTo?: { subject: Subject; label: string } };

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
  // NetCyberAI staff preparing the shared library before children ask (C300, prepare.ts): the line comes from this
  // syllabus version, in review or released, and the "checked explanations only" rule does not apply (what is made
  // goes to Control's review queue as AI-made). The call runs on the staff profile content.prepare (C313), with its
  // provider and prompt version, and no family's daily cap; the response is marked prepared, so no child sees it
  // before a person has checked it.
  preparing?: { versionId: string };
};

// Whom the sealed items are for.
type Seal = Pick<ResolverContext, 'accountId' | 'child'>;

const KEY = /^[a-z0-9][a-z0-9._-]{2,119}$/;

export type Line = { subject: Subject; key: string; chapterEn: string; topicEn: string | null; title: string };

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
      [input.key, syllabusBoardOf(child), child.classLevel]
    );
    const r = rows[0];
    if (!r || !isSubject(r.subject)) return null;
    return { subject: r.subject, key: String(r.topic_key), chapterEn: String(r.chapter_en), topicEn: String(r.title_en), title: pick(r.title_en, r.title_hi) };
  }
  const { rows } = await db.query(
    `select v.subject, c.chapter_key, c.title_en, c.title_hi
       from content.chapters c join content.syllabus_versions v on v.version_id = c.version_id
      where c.chapter_key = $1 and v.board_id = $2 and v.class_level = $3 and v.status = 'published' and v.audience = 'everyone'
      order by v.academic_year desc limit 1`,
    [input.key, syllabusBoardOf(child), child.classLevel]
  );
  const r = rows[0];
  if (!r || !isSubject(r.subject)) return null;
  return { subject: r.subject, key: String(r.chapter_key), chapterEn: String(r.title_en), topicEn: null, title: pick(r.title_en, r.title_hi) };
}

function toPublic(b: Block, ctx: Seal, topicKey: string, subject: string): PublicBlock {
  if (b.type !== 'check' && b.type !== 'practice') return b;
  return { type: b.type, items: b.items.map((i) => sealItem(i, { accountId: ctx.accountId, childId: ctx.child.childId, topicKey, subject, kind: b.type as 'check' | 'practice' })) };
}

// A complete response from the shared library for this child's class, language and style, as the events the phone
// draws (items sealed for this child), or null when there is none. Checked only (C300): any checked response in the
// child's language, their own style and the current prompt version first, so a new prompt version or another style
// never hides what a reviewer has checked.
async function libraryEvents(db: Db, ctx: Seal, line: Line, promptVersion: string, checkedOnly: boolean): Promise<ResolverEvent[] | null> {
  const child = ctx.child;
  const { rows } = await db.query(
    `select response_id, blocks, status from content.responses
      where board_id = $1 and class_level = $2 and subject = $3 and topic_key = $4 and language = $5 and status <> 'withdrawn'
        and case when $8::boolean then status = 'checked' else style = $6 and prompt_version = $7 end
      order by (style = $6) desc, (prompt_version = $7) desc, checked_at desc nulls last
      limit 1`,
    [syllabusBoardOf(child), child.classLevel, line.subject, line.key, child.language, child.style, promptVersion, checkedOnly]
  );
  const cached = rows[0];
  if (!cached || !Array.isArray(cached.blocks)) return null;
  const blocks = completeResponse((cached.blocks as unknown[]).map((b) => parseBlockLine(JSON.stringify(b))).filter((b): b is Block => b !== null));
  if (!blocks) return null;
  // One serving, counted for Control's review queue, most asked first (M2-12, C286), in this same transaction. Only the
  // count changes; a fresh AI answer is never counted here.
  await db.query(`select content.count_response_ask($1)`, [cached.response_id]);
  return [
    { t: 'meta', label: cached.status === 'checked' ? 'checked' : 'ai_made', cached: true, title: line.title, subject: line.subject, topicKey: line.key },
    ...blocks.map((b): ResolverEvent => ({ t: 'block', block: toPublic(b, ctx, line.key, line.subject) })),
    { t: 'done', complete: true },
  ];
}

// The Understand page draws a library response with the page itself (09 §4: the explanation is the largest paint, and
// waiting for the phone to ask first cost half a second on a 4G profile). Only when the subject is already the child's
// free one, or one open to every child (C298), so drawing the page never claims a subject; otherwise, or when the
// library has none, the phone asks. In a "checked explanations only" subject (C300) only a checked one is drawn.
export async function libraryResponse(db: Db, ctx: Seal, line: Line): Promise<ResolverEvent[] | null> {
  if (ctx.child.freeSubject !== line.subject && !(await openSubjects(db as never)).includes(line.subject)) return null;
  const promptVersion = resolverPrompt(await activePromptVersion(db as never, 'family.resolver'), false).version;
  return libraryEvents(db, ctx, line, promptVersion, (await reviewedOnlySubjects(db)).includes(line.subject));
}

// A chapter or topic from one syllabus version, whatever its status: only for staff preparing the library (C300).
async function versionLine(db: Db, versionId: string, child: FamilyChild, input: { kind: 'topic' | 'chapter'; key: string }): Promise<Line | null> {
  if (!KEY.test(input.key)) return null;
  const pick = (en: unknown, hi: unknown) => String(child.language === 'hi' && hi ? hi : en);
  const { rows } =
    input.kind === 'topic'
      ? await db.query(
          `select v.subject, t.topic_key as key, t.title_en, t.title_hi, c.title_en as chapter_en
             from content.topics t join content.chapters c on c.chapter_id = t.chapter_id join content.syllabus_versions v on v.version_id = t.version_id
            where v.version_id = $1 and t.topic_key = $2`,
          [versionId, input.key]
        )
      : await db.query(
          `select v.subject, c.chapter_key as key, c.title_en, c.title_hi, c.title_en as chapter_en
             from content.chapters c join content.syllabus_versions v on v.version_id = c.version_id
            where v.version_id = $1 and c.chapter_key = $2`,
          [versionId, input.key]
        );
  const r = rows[0];
  if (!r || !isSubject(r.subject)) return null;
  return { subject: r.subject, key: String(r.key), chapterEn: String(r.chapter_en), topicEn: input.kind === 'topic' ? String(r.title_en) : null, title: pick(r.title_en, r.title_hi) };
}

// What prepareResolve() hands on: everything generate() and keep() need, and no database client.
export type Pending = {
  ctx: ResolverContext;
  line: Line | null;
  // The subject when the server knows it (a syllabus line, a retry's sealed item); null when the model names it.
  known: Subject | null;
  open: Subject[];
  // The subjects of the child's class (C264): a named subject outside them is "another subject".
  classSubjects: Subject[];
  cacheable: boolean;
  promptVersion: string;
  text: PreparedText;
};

export type Generated = {
  sent: SentText;
  subject: Subject | null;
  // The blocks shown, in the order they passed.
  kept: Block[];
  refusedByModel: boolean;
  // A refusal already sent while streaming (a typed question in another subject): nothing more is said.
  stopped: boolean;
  // Drawing the answer failed (the phone went away, or a fault): the call is still metered by keep(), then this is
  // raised.
  error: unknown;
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
    return isSubject(v.subject) ? v.subject : 'other';
  } catch {
    return null;
  }
}

// A typed question's progress key: the syllabus board (lower case), the class and the subject.
const questionKey = (child: FamilyChild, subject: Subject) => `${syllabusBoardOf(child).toLowerCase()}.c${child.classLevel}.${subject}.question`;

// 1–2 and the AI platform's checks, in the caller's first transaction. null: answered already (a refusal, or the
// library's response); otherwise the call to make, which needs no database connection.
export async function prepareResolve(db: Db, ctx: ResolverContext, input: ResolveInput, followUp: FollowUp | null, emit: (e: ResolverEvent) => void, misconception: string | null = null): Promise<Pending | null> {
  const child = ctx.child;
  // Nursery, LKG and UKG learn through play and activities, not chapters (Wave B): nothing is explained to them here.
  if (isPrePrimary(child.classLevel)) {
    emit({ t: 'refused', reason: 'not_found', message: ctx.refusalWords('fam.study.prePrimary') });
    return null;
  }
  let line: Line | null = null;
  if (input.kind !== 'question') {
    line = ctx.preparing ? await versionLine(db, ctx.preparing.versionId, child, input) : await syllabusLine(db, child, input);
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
  const ofClass = await classSubjects(db as never, { board: syllabusBoardOf(child), classLevel: child.classLevel });
  const openToAll = await openSubjects(db as never);
  const open: Subject[] = known ? [known] : ofClass.filter((s) => !ctx.claimSubject || subjectAccess(child, s, openToAll).open);
  const profileId = ctx.preparing ? 'content.prepare' : 'family.resolver';
  const prompt = resolverPrompt(await activePromptVersion(db as never, profileId), known === null);
  const cacheable = input.kind !== 'question' && followUp === null && misconception === null;

  // 2. The shared library. In a "checked explanations only" subject (C300) a chapter or topic is served a checked
  // response or nothing: no AI-made one, and none made live.
  if (cacheable && line) {
    const checkedOnly = !ctx.preparing && (await reviewedOnlySubjects(db)).includes(line.subject);
    const cached = await libraryEvents(db, ctx, line, prompt.version, checkedOnly);
    if (cached) {
      for (const e of cached) emit(e);
      return null;
    }
    if (checkedOnly) {
      emit({ t: 'refused', reason: 'not_ready', message: ctx.refusalWords('fam.understand.notReady') });
      return null;
    }
  }

  // 3. The AI platform's checks (profile, minors, key, daily cap) and the cleaned request, still in this transaction.
  const ask: ResolverAsk = {
    board: boardNameOf(child),
    classLevel: child.classLevel,
    subject: known,
    openSubjects: open,
    classSubjects: ofClass,
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
    profileId,
    { system: prompt.system(ask), messages: [{ role: 'user', content: prompt.user(ask) }], responseFormat: undefined }
  );
  if (!prepared.ok) {
    emit({ t: 'refused', reason: prepared.reason, message: ctx.refusalWords(REFUSAL_MESSAGE[prepared.reason]) });
    return null;
  }
  return { ctx, line, known, open, classSubjects: ofClass, cacheable, promptVersion: prompt.version, text: prepared.text };
}

// 3–4. The model's answer, checked line by line as it arrives. No database connection is held while the model answers.
// `claim` makes a child with no free subject yet claim the subject of a typed question just before its first block is
// shown, in its own short transaction (milliseconds, never while waiting for the model); if another request claimed
// the other subject meanwhile, the answer is refused instead of shown.
export async function generate(p: Pending, emit: (e: ResolverEvent) => void, claim?: (subject: Subject) => Promise<boolean>): Promise<Generated> {
  const { ctx, line } = p;
  const words = ctx.refusalWords;
  let subject: Subject | null = p.known;
  let stopped = false;
  let refusedByModel = false;
  let mustClaim = p.known === null && !ctx.child.freeSubject && claim !== undefined;
  let error: unknown = null;
  const seen = new Set<BlockType>();
  const kept: Block[] = [];
  const refuseSubject = (named: Subject) => {
    stopped = true;
    const name = words(`fam.subject.${named}`);
    emit({ t: 'refused', reason: 'not_open', message: words('fam.understand.askInSubject', { subject: name }), goTo: { subject: named, label: words('fam.understand.goToSubject', { subject: name }) } });
  };
  const take = async (text: string) => {
    if (stopped) return;
    if (/"type"\s*:\s*"refuse"/.test(text)) refusedByModel = true;
    if (!subject) {
      // Nothing is shown until the subject is named, and only a subject this child may use is answered.
      const named = namedSubject(text);
      if (named === null) return;
      if (named === 'other' || !p.classSubjects.includes(named)) {
        stopped = true;
        emit({ t: 'refused', reason: 'other_subject', message: words('fam.understand.otherSubject') });
        return;
      }
      if (!p.open.includes(named)) return refuseSubject(named);
      subject = named;
      return;
    }
    const s: Subject = subject;
    const b = parseBlockLine(text);
    // One block of each type, and at most one interactive block (M2-8): the first that passed.
    if (!b || seen.has(b.type) || (isInteractive(b.type) && kept.some((k) => isInteractive(k.type)))) return;
    if (mustClaim && claim) {
      mustClaim = false;
      if (!(await claim(s))) return refuseSubject(s);
    }
    seen.add(b.type);
    kept.push(b);
    if (kept.length === 1) emit({ t: 'meta', label: 'ai_made', cached: false, title: line?.title ?? null, subject: s, topicKey: line?.key ?? null });
    // Progress and the sealed items are keyed to the syllabus line; a typed question is kept against its subject.
    emit({ t: 'block', block: toPublic(b, ctx, line?.key ?? questionKey(ctx.child, s), s) });
  };
  // Lines are checked one after another, in order; the model's stream never waits for them.
  let queue = Promise.resolve();
  const enqueue = (text: string) => {
    queue = queue.then(async () => {
      if (error !== null) return;
      try {
        await take(text);
      } catch (err) {
        error = err;
      }
    });
  };
  let pending = '';
  const sent = await p.text.send((delta) => {
    pending += delta;
    let nl = pending.indexOf('\n');
    while (nl >= 0) {
      enqueue(pending.slice(0, nl));
      pending = pending.slice(nl + 1);
      nl = pending.indexOf('\n');
    }
  });
  if (pending.trim()) enqueue(pending);
  await queue;
  return { sent, subject, kept, refusedByModel, stopped, error };
}

// 5. The writes after the call, in the caller's second transaction: the metering first, then the library line. Returns
// the last event to send once the transaction has committed (null: already said).
export async function keep(db: Db, p: Pending, g: Generated): Promise<ResolverEvent | null> {
  const { ctx, line } = p;
  await g.sent.record(db as never);
  if (g.stopped || g.error !== null) return null;
  const result = g.sent.result;
  if (!result.ok) return g.kept.length > 0 ? { t: 'done', complete: false } : { t: 'refused', reason: result.reason, message: ctx.refusalWords(REFUSAL_MESSAGE[result.reason]) };
  if (g.refusedByModel && g.kept.length === 0) return { t: 'refused', reason: 'not_school_study', message: ctx.refusalWords('fam.understand.notStudy') };
  // The model never named the subject: nothing was shown, and no subject is guessed.
  if (!g.subject) return { t: 'refused', reason: 'failed', message: ctx.refusalWords(REFUSAL_MESSAGE.failed) };
  const complete = completeResponse(g.kept);

  // A complete topic or chapter response is kept for the next child, as AI-made, until the founder approves it. One
  // staff prepared (C313) names who prepared it, and no child is served it before it is checked.
  if (complete && p.cacheable && line) {
    await db.query(
      `insert into content.responses (board_id, class_level, subject, topic_key, language, style, prompt_version, schema_version, blocks, status, provider, model, prepared_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, 'ai_made', $10, $11, $12)
       on conflict do nothing`,
      [syllabusBoardOf(ctx.child), ctx.child.classLevel, line.subject, line.key, ctx.child.language, ctx.child.style, p.promptVersion, BLOCK_SCHEMA_VERSION, JSON.stringify(complete), result.provider, result.model, ctx.preparing ? ctx.accountId : null]
    );
  }
  return { t: 'done', complete: complete !== null };
}
