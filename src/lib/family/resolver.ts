import { type Persona, withPersona } from './persona';
import { REFUSAL_MESSAGE, activePromptVersion, prepareModeration, prepareText, type AiRefusal, type AiRequest, type PreparedModeration, type PreparedText, type SentText } from '@/lib/ai/platform';
import { resolverPrompt, type ChatMemory, type ResolverAsk } from '@/lib/ai/prompts/family.resolver';
import { checkSearchQuery } from './check-work';
import { checkMarkSystem, checkMarkUser, questionOfReading } from '@/lib/ai/prompts/family.homework';
import { logCheckVerdict, logPlan, planAnswer, preparePlan } from '@/lib/ai/teaching/plan';
import { defaultPlan, isInteractiveBlock, type Plan, type PlanContext } from '@/lib/ai/teaching/plan-shape';
import { verdictsFromReading, verifyVerdicts } from './arithmetic-check';
import { sceneSimFits, simFits } from './interactive';
import { modelFits } from './models/fit';
import { retrievePassages, type Passage } from '@/lib/ai/teaching/retrieve';
import { bookPassages, bookSubjects } from './book-search';
import { BLOCK_SCHEMA_VERSION, completeResponse, coreBlocks, isInteractive, isSimScene, jsonObjectScanner, parseBlockLine, parseStoredBlockLine, type Block, type BlockType } from './blocks';
import { boardNameOf, isPrePrimary, syllabusBoardOf, type FamilyChild } from './children';
import { sealItem, type PublicItem } from './items';
import { classSubjects } from './catalog';
import { openSubjects, reviewedOnlySubjects } from './learning';
import { subjectAccess } from './modules';
import { isSubject, nearSubject, type Subject } from './subjects';
import { nameFiller, withoutName } from './name-token';

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
// Safety (W2, C314): every live answer for a child passes the safety check (profile family.moderation, Llama Guard):
// a typed question before it is sent, and each block before it is shown. If the check is switched off or cannot be
// made, nothing is answered or shown: the child is told plainly. Library responses were checked when they were made
// (and in a "checked explanations only" subject by a person); staff preparing the library skip it.
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
// `about`: where a question was asked from (the chapter reader's chapter and section, S2, C375), decided on the server
// from NetCyber's own chapter, never the child's words: the tutor is told it beside the question; the safety check and
// the history see the question alone.
// `attached`: what the files sent with a tutor question say (W4-1, C385: src/lib/family/tutor-read.ts), read on the
// server; it joins the question, so the safety check and the scrub read it like the child's own words.
// A question asked in the tutor window (W9-B) may carry the reader's open chapter and the window's subject: both only
// steer the library's passages and the teaching plan; the answer's subject is still decided on the server. `memory`
// (9A): the chat's summary and last turns, for the prompt's "Earlier in this chat".
// `check` (W16-B2, "Check my work"): the attached photo is the child's own handwritten working, already read line by line
// (tutor-read.ts); the answer is that working marked step by step (family.homework prompt v2). The library's passages
// are searched on the question the photo showed (the first line of the reading), not on the child's words, and no
// planning call is made.
// `sketch` (W18-P3): the attached picture is a drawing the child made on the sketch pad (one PNG or JPEG, checked by the
// route); it reaches the prompt as `ResolverAsk.sketch`, so the tutor answers with a board that marks up the drawing.
// W23-C: where the tutor was opened, built on the server from our own content (src/lib/family/tutor-context.ts): the short
// line the planner reads, the text the tutor is told, and the labs it may show.
export type QuestionScope = { about: string; text: string; labs: readonly { id: string; title: string; aim: string }[] };
export type ResolveInput =
  | { kind: 'topic' | 'chapter'; key: string }
  | { kind: 'question'; text: string; subject: Subject | null; about?: string; attached?: string; chapterKey?: string; windowSubject?: string; memory?: ChatMemory; check?: true; sketch?: true; scope?: QuestionScope };

const withAttached = (text: string, attached: string | undefined) => (attached ? `${text}\n\nThe student attached files. What they say:\n${attached}` : text);

export type PublicBlock = Exclude<Block, { type: 'check' } | { type: 'practice' }> | { type: 'check' | 'practice'; items: PublicItem[] };
export type ResolverEvent =
  | { t: 'meta'; label: 'ai_made' | 'checked'; cached: boolean; title: string | null; subject: string; topicKey: string | null }
  | { t: 'block'; block: PublicBlock }
  // W10 (C411): `missing`, the core blocks the plan asked for that never came (coreBlocks); `cut`, the answer ended
  // early (the call failed or timed out after some blocks, or the model stopped inside a block). `complete`: neither.
  // `chat`: the tutor chat the answer was kept in, and that chat's subject (the tutor window lists it there).
  // W18-P1: `messageId`, the kept tutor answer's own message id (this child's, just written), so the window's read-aloud
  // and "Teach me" can ask the server voice for it without a reload.
  | { t: 'done'; complete: boolean; missing: BlockType[]; cut: boolean; chat?: { chatId: string; subject: Subject }; messageId?: string }
  // W4-1 (C385): what became of the files sent with a tutor question, said before the answer.
  | { t: 'files'; message: string }
  // W16-A4: only in a call's answer (`call: true`): the sentences of the block just sent that are spoken, each with the
  // seal the server voice reads it from (src/lib/family/call-say.ts). The words are the block's own, cleaned.
  | { t: 'say'; lines: { text: string; token: string }[] }
  | { t: 'refused'; reason: AiRefusal | 'not_found' | 'not_school_study' | 'not_open' | 'other_subject' | 'not_ready' | 'unsafe'; message: string; goTo?: { subject: Subject; label: string } };

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
  // W16-A3: the tutor the child chose in the Tutor Hall; one line in the system prompt (src/lib/family/persona.ts).
  persona?: Persona;
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
  // A kept response is complete for the class's whole plan (a Class 1 one has no practice by design, W10 C411).
  const core = coreBlocks(defaultPlan({ classLevel: child.classLevel, subject: line.subject, lang: child.language === 'hi' ? 'hi' : 'en' }, 'full').blocks);
  // A kept simulation shows only where its syllabus line is about what it models (simFits); without it the answer is incomplete and made afresh.
  const blocks = completeResponse(
    (cached.blocks as unknown[])
      .map((b) => parseStoredBlockLine(JSON.stringify(b)))
      .filter((b): b is Block => b !== null && (b.type !== 'simulation' || simFits(b.sim, line.title)) && (!isSimScene(b) || sceneSimFits(b.sim, line.title)) && (b.type !== 'model' || modelFits(b.model, line.title)) && b.type !== 'lab'),
    core
  );
  if (!blocks) return null;
  // One serving, counted for Control's review queue, most asked first (M2-12, C286), in this same transaction. Only the
  // count changes; a fresh AI answer is never counted here.
  await db.query(`select content.count_response_ask($1)`, [cached.response_id]);
  return [
    { t: 'meta', label: cached.status === 'checked' ? 'checked' : 'ai_made', cached: true, title: line.title, subject: line.subject, topicKey: line.key },
    ...blocks.map((b): ResolverEvent => ({ t: 'block', block: toPublic(b, ctx, line.key, line.subject) })),
    { t: 'done', complete: true, missing: [], cut: false },
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
  // C503: the subject tab the question was typed in (null: none).
  tab?: Subject | null;
  cacheable: boolean;
  promptVersion: string;
  text: PreparedText;
  // The safety check (C314) and what the child asked, in words it can judge an answer against; null when staff prepare.
  moderation: PreparedModeration | null;
  asked: string;
  question: string | null;
  // W23-C: the ids of the labs offered for this question; a lab block names one of them or is dropped.
  labs?: readonly string[];
  // W9-B: the plan the prompt is written from (v8 on; null under an earlier prompt), and for a live answer the planning
  // call and the passages, the prompt rebuilt from the plan once it comes (null: the default plan stands).
  plan: Plan | null;
  teach: Teach | null;
  // W16-B2: the answer is a child's own working marked (ResolveInput.check); its core blocks are CHECK_CORE.
  check?: true;
  // W18-Q3: that working as read ("Line N: …"), for the verdicts our own arithmetic gives when the model's do not pass.
  reading?: string;
};

// The core blocks of a marked working: the verdicts and the similar question to try. The corrected working is added
// only when a step was wrong, and the chapter's name only when passages were found.
export const CHECK_CORE: readonly BlockType[] = ['steps', 'check'];
// Every block a marked working may show: the chapter, the verdicts, the corrected working and the similar question.
const CHECK_TYPES: readonly BlockType[] = ['sources', 'steps', 'worked_example', 'check'];

// Where the child opened the tutor, as one block in any prompt version's system text, before its closing rules (or at the
// end when a version has none). The text is our own content, never the phone's.
export function withScope(system: string, scope: string | undefined): string {
  if (!scope) return system;
  const line = `Where the student opened the tutor (our own lesson content: answer the question asked, teach from this and stay consistent with it, and do not read it out as a list): ${scope.replace(/\n/g, '\n   ')}`;
  const at = system.indexOf('\nRules: ');
  return at < 0 ? `${system}\n${line}` : `${system.slice(0, at)}\n${line}${system.slice(at)}`;
}

// The planning call (null: no route, the default plan), the library's passages, and the answer's request written from
// a plan.
type Teach = { ctx: PlanContext; call: PreparedText | null; passages: Passage[]; build: (plan: Plan) => AiRequest };

export type Generated = {
  sent: SentText;
  subject: Subject | null;
  // The blocks shown, in the order they passed. W22-S3: with the child's first name where a v12 answer addressed the
  // learner by the token {{name}} (name-token.ts); these go to the child's own conversation.
  kept: Block[];
  // The same blocks with no name in them: what a response kept for other children is made of.
  shared: Block[];
  // For staff measuring the model (C318): how many JSON objects came, and the type of each one our checks refused
  // (or "unknown"). Types only, never the words.
  objects: number;
  rejected: string[];
  // What the scanner dropped (C330): the answer ended inside an object that never closed, and how many objects grew
  // past its size limit. A flag and a count, never the words.
  unclosed: boolean;
  droppedForSize: number;
  refusedByModel: boolean;
  // A refusal already sent while streaming (a typed question in another subject): nothing more is said.
  stopped: boolean;
  // Drawing the answer failed (the phone went away, or a fault): the call is still metered by keep(), then this is
  // raised.
  error: unknown;
  // The plan the answer was written from (W9-B); null under a prompt that takes none.
  plan: Plan | null;
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

// Why a steps line was refused, in a word (W18-Q3's log): never its text.
function stepsRejectReason(text: string): string {
  let o: { title?: unknown; items?: unknown };
  try {
    o = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as typeof o;
  } catch {
    return 'not_json';
  }
  if (typeof o.title !== 'string' || o.title.trim().length === 0 || o.title.length > 120) return 'title';
  if (!Array.isArray(o.items)) return 'no_items';
  if (o.items.length > 5) return 'too_many_items';
  const items = o.items as { label?: unknown; text?: unknown }[];
  if (items.some((i) => typeof i?.label !== 'string' || i.label.trim().length === 0 || i.label.length > 30)) return 'label';
  if (items.some((i) => typeof i?.text !== 'string' || i.text.trim().length === 0 || i.text.length > 120)) return 'text';
  if (o.items.length < 3) return 'too_few_items';
  return 'other';
}

// The "type" a JSON object names, for staff diagnostics (C318); "unknown" when it names none it could be.
const typeOf = (text: string) => {
  try {
    const t = (JSON.parse(text) as { type?: unknown })?.type;
    return typeof t === 'string' && /^[a-z_]{1,30}$/.test(t) ? t : 'unknown';
  } catch {
    return 'unknown';
  }
};
const isRefusal = (text: string) => {
  try {
    return (JSON.parse(text) as { type?: unknown })?.type === 'refuse';
  } catch {
    return false;
  }
};

// The words of a block, for the safety check: every text it holds, in order, one per line (C314).
export function blockText(b: Block): string {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => k !== 'type' && walk(x));
  };
  walk(b);
  return out.join('\n');
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

  // The safety check must be ready before anything is asked for a child (C314), so a call it could not check never
  // takes the family's daily place.
  let moderation: PreparedModeration | null = null;
  if (!ctx.preparing) {
    const ready = await prepareModeration(db as never, { accountId: ctx.accountId, childFirstNames: ctx.childFirstNames, parentEmail: ctx.parentEmail, day: ctx.day }, profileId);
    if (!ready.ok) {
      emit({ t: 'refused', reason: ready.reason, message: ctx.refusalWords('fam.understand.safetyOff') });
      return null;
    }
    moderation = ready.moderation;
  }

  // W9-B (docs/39 §3): the library's passages and the planning call, for a live answer under a prompt that takes a plan.
  // Neither ever refuses: no passage is a general answer, no planner is the band's default plan.
  const isCheck = input.kind === 'question' && input.check === true;
  const teach = (prompt.usesPlan || isCheck) && !ctx.preparing ? await prepareTeach(db, ctx, input, line, known, misconception, ofClass, prompt.visualFirst === true) : null;
  // 3. The AI platform's checks (profile, minors, key, daily cap) and the cleaned request, still in this transaction.
  const tab = input.kind === 'question' && isSubject(input.windowSubject) ? input.windowSubject : null;
  const ask: ResolverAsk = {
    board: boardNameOf(child),
    classLevel: child.classLevel,
    subject: known,
    openSubjects: open,
    classSubjects: ofClass,
    ...(tab ? { tab } : {}),
    chapter: line?.chapterEn ?? null,
    topic: line?.topicEn ?? null,
    question: input.kind === 'question' ? withAttached(input.about ? `${input.text} (asked while reading: ${input.about})` : input.text, input.attached) : null,
    ...(input.kind === 'question' && input.scope ? { scope: input.scope.text, labs: input.scope.labs } : {}),
    language: child.language,
    style: child.style,
    followUp,
    misconception,
    ...(teach ? { passages: teach.passages } : {}),
    ...(input.kind === 'question' && input.memory ? { memory: input.memory } : {}),
    ...(input.kind === 'question' && input.sketch ? { sketch: true } : {}),
    // C509: which of the class's subjects have a published book, so the answer says "not from your book" only where one exists.
    ...(input.kind === 'question' ? { bookSubjects: bookSubjects({ classLevel: child.classLevel, board: syllabusBoardOf(child), subjects: ofClass }) } : {}),
  };
  // The default plan (v8's own rule: a question at medium depth, a chapter or topic whole) until the planner answers.
  const plan = prompt.usesPlan || isCheck ? defaultPlan({ classLevel: child.classLevel, subject: teach?.ctx.subject ?? known, lang: child.language, ...(prompt.visualFirst ? { visualFirst: true } : {}) }, input.kind === 'question' ? 'medium' : 'full') : null;
  const build = (p: Plan | null): AiRequest => {
    const a: ResolverAsk = p ? { ...ask, plan: p } : ask;
    if (isCheck) {
      const system = checkMarkSystem(a);
      return { system: withPersona(system, ctx.persona), messages: [{ role: 'user', content: checkMarkUser(a) }], responseFormat: undefined };
    }
    return { system: withPersona(withScope(prompt.system(a), a.scope), ctx.persona), messages: [{ role: 'user', content: prompt.user(a) }], responseFormat: undefined };
  };
  const prepared = await prepareText(db as never, { accountId: ctx.accountId, childFirstNames: ctx.childFirstNames, parentEmail: ctx.parentEmail, day: ctx.day, childId: ctx.child.childId }, profileId, build(plan)); // w16-b4
  if (!prepared.ok) {
    emit({ t: 'refused', reason: prepared.reason, message: ctx.refusalWords(REFUSAL_MESSAGE[prepared.reason]) });
    return null;
  }
  const question = input.kind === 'question' ? withAttached(input.text, input.attached) : null;
  const asked = question ?? `Explain "${line?.topicEn ?? line?.chapterEn ?? ''}" to a Class ${child.classLevel} student.`;
  return { ctx, line, known, open, classSubjects: ofClass, tab, cacheable, promptVersion: prompt.version, text: prepared.text, moderation, asked, question, labs: input.kind === 'question' && input.scope ? input.scope.labs.map((l) => l.id) : [], plan, teach: teach ? { ...teach, build } : null, ...(isCheck ? { check: true as const, reading: input.kind === 'question' ? (input.attached ?? '') : '' } : {}) };
}

// The planner reads the question and the start of what attached files say: enough to plan, not to answer.
const PLAN_QUESTION_MAX = 2000;

// The passages and the planning call for a live answer (W9-B), in the first transaction. The child's own syllabus
// chapters (family.child_syllabus_items, by title) lead the passages after the open chapter. A typed question's plan is
// asked for; a chapter or topic, and a wrong answer's retry, are taught on the band's default plan.
async function prepareTeach(db: Db, ctx: ResolverContext, input: ResolveInput, line: Line | null, known: Subject | null, misconception: string | null, ofClass: readonly Subject[], visualFirst = false): Promise<Omit<Teach, 'build'>> {
  const child = ctx.child;
  const hint: Subject | null = known ?? (input.kind === 'question' && isSubject(input.windowSubject) ? input.windowSubject : null);
  // C509: under a prompt that draws first (v15), the youngest children's plan is the board, the explanation and the check.
  const planCtx: PlanContext = { classLevel: child.classLevel, subject: hint, lang: child.language, ...(visualFirst ? { visualFirst: true } : {}) };
  const titles = (
    await db.query(
      `select i.title from family.child_syllabus_items i join family.child_syllabi s on s.syllabus_id = i.syllabus_id
        where s.child_id = $1 and s.status = 'confirmed' and i.kind = 'chapter' and ($2::text is null or s.subject = $2)
        order by i.position limit 200`,
      [child.childId, hint]
    )
  ).rows.map((r) => String(r.title));
  // "Check my work": the chapter is searched on the question the photo showed (the reading's first line), so the passages
  // match the chapter the working belongs to (its content words, check-work.ts); none when the reading has no question line.
  const checkQuestion = input.kind === 'question' && input.check ? questionOfReading(input.attached ?? '') : null;
  const library = await retrievePassages(db, {
    question: input.kind === 'question' ? (input.check ? checkSearchQuery(checkQuestion ?? '') : input.text) : (line?.topicEn ?? line?.chapterEn ?? ''),
    subject: hint,
    classLevel: child.classLevel,
    boardId: syllabusBoardOf(child),
    lang: child.language,
    chapterKey: input.kind === 'question' ? (input.chapterKey ?? null) : (line?.key ?? null),
    syllabusTitles: titles,
    childId: child.childId,
  });
  // C505: a question typed with no chapter open, which the library did not answer, is searched in the child's own
  // published book (book-search.ts): only the books their board and class read, in the subjects their class has. Its
  // passages reach the prompt exactly as the library's do, as quoted data, each named by its chapter and topic.
  const typedFree = input.kind === 'question' && !input.check && !input.chapterKey && !input.scope;
  const passages =
    library.length === 0 && typedFree
      ? await bookPassages({ question: input.text, classLevel: child.classLevel, board: syllabusBoardOf(child), subject: hint, lang: child.language, subjects: ofClass })
      : library;
  const ai = { accountId: ctx.accountId, childFirstNames: ctx.childFirstNames, parentEmail: ctx.parentEmail, day: ctx.day };
  const call = input.kind === 'question' && !input.check && misconception === null ? await preparePlan(db as never, ai, { ...planCtx, board: boardNameOf(child), chapter: input.about ?? (input.kind === 'question' ? input.scope?.about : undefined) ?? null, passageTitles: passages.map((p) => p.title) }, withAttached(input.text, input.attached).slice(0, PLAN_QUESTION_MAX)) : null;
  return { ctx: planCtx, call, passages };
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
  const shared: Block[] = [];
  // W22-S3: the name goes in here, on our server, after the safety check (which is the last call that sends words out).
  const addName = nameFiller(ctx.child.firstName);
  // The plan the answer is written from (W9-B): the prepared default until the planner answers.
  let plan: Plan | null = p.plan;
  let objects = 0;
  const rejected: string[] = [];
  // A safety check that failed, or found the words unsafe, stops the answer here; what was already shown had passed.
  const safe = async (turns: { user: string; assistant?: string }): Promise<boolean> => {
    const verdict = await p.moderation!.check(turns);
    if (verdict?.safe) return true;
    stopped = true;
    emit(verdict ? { t: 'refused', reason: 'unsafe', message: words('fam.understand.unsafe') } : { t: 'refused', reason: 'failed', message: words('fam.understand.safetyFailed') });
    return false;
  };
  const refuseSubject = (named: Subject) => {
    stopped = true;
    const name = words(`fam.subject.${named}`);
    emit({ t: 'refused', reason: 'not_open', message: words('fam.understand.askInSubject', { subject: name }), goTo: { subject: named, label: words('fam.understand.goToSubject', { subject: name }) } });
  };
  // Check my work (W18-Q3): blocks that came before the verdicts, held until they are shown; and why the model's verdicts
  // were refused (a reason, never the words), for the log.
  const held: Block[] = [];
  let stepsRejected: string | null = null;
  const show = (unnamed: Block, s: Subject) => {
    const b = addName(unnamed);
    kept.push(b);
    shared.push(withoutName(unnamed));
    if (kept.length === 1) emit({ t: 'meta', label: 'ai_made', cached: false, title: line?.title ?? null, subject: s, topicKey: line?.key ?? null });
    // Progress and the sealed items are keyed to the syllabus line; a typed question is kept against its subject.
    emit({ t: 'block', block: toPublic(b, ctx, line?.key ?? questionKey(ctx.child, s), s) });
  };
  const take = async (text: string) => {
    if (stopped) return;
    // The model's own refusal is a whole block of type "refuse" (a nested field of that name is not).
    if (/"type"\s*:\s*"refuse"/.test(text) && isRefusal(text)) refusedByModel = true;
    if (!subject) {
      // Nothing is shown until the subject is named, and only a subject this child may use is answered.
      const said = namedSubject(text);
      if (said === null) return;
      // C503: a subject this class does not list is taught as the nearest one it has (Science as EVS in Class 4).
      const named = said === 'other' ? said : (nearSubject(said, p.classSubjects, p.tab) ?? said);
      if (named === 'other' || !p.classSubjects.includes(named)) {
        stopped = true;
        emit({ t: 'refused', reason: 'other_subject', message: words('fam.understand.otherSubject', { subjects: p.classSubjects.map((x) => words(`fam.subject.${x}`)).join(', ') }) });
        return;
      }
      if (!p.open.includes(named)) return refuseSubject(named);
      subject = named;
      return;
    }
    const s: Subject = subject;
    const parsedBlock = parseBlockLine(text);
    objects += 1;
    if (!parsedBlock) {
      const type = typeOf(text);
      rejected.push(type);
      if (p.check && type === 'steps' && stepsRejected === null) stepsRejected = stepsRejectReason(text);
      return;
    }
    // A marked working (Check my work): a verdict that restates a plain sum is settled by our own arithmetic (2 Nov).
    const b = p.check && parsedBlock.type === 'steps' ? verifyVerdicts(parsedBlock, ctx.child.language === 'hi' ? 'hi' : 'en') : parsedBlock;
    // A marked working is only what the marking prompt asks for (W18-Q3): a lesson the model adds is not shown.
    if (p.check && !CHECK_TYPES.includes(b.type)) return;
    // One block of each type, and at most one interactive block (M2-8): the first that passed. Under a plan (W9-B), an
    // interactive block only where the plan names one: a biology answer never shows a pendulum, whatever the model wrote.
    if (seen.has(b.type) || (isInteractive(b.type) && kept.some((k) => isInteractive(k.type)))) return;
    if (plan && isInteractive(b.type) && !plan.blocks.some(isInteractiveBlock)) return;
    // A simulation only where the question, its syllabus line or the block's own title is about what it models (2 Nov).
    if (b.type === 'simulation' && !simFits(b.sim, `${p.asked} ${line?.title ?? ''} ${b.title}`)) return;
    // The same for a scene simulation of Classes 6 to 10 (W18-P2): a circuit under a question about the heart is dropped.
    if (isSimScene(b) && !sceneSimFits(b.sim, `${p.asked} ${line?.title ?? ''} ${b.title}`)) return;
    // A 3D model only where the question or its syllabus line is about that thing (W19-D): a heart under a question about
    // friction is dropped. Not the block's own title, which always names the model.
    if (b.type === 'model' && !modelFits(b.model, `${p.asked} ${line?.title ?? ''}`)) return;
    // A lab only from the labs offered for this question (W23-C): an id the model made up is never shown.
    if (b.type === 'lab' && !(p.labs ?? []).includes(b.id)) return;
    // The safety check, before the block is shown or a subject is claimed (C314).
    if (p.moderation && !(await safe({ user: p.asked, assistant: blockText(b) }))) return;
    if (mustClaim && claim) {
      mustClaim = false;
      if (!(await claim(s))) return refuseSubject(s);
    }
    seen.add(b.type);
    // A marked working shows its verdicts first (W18-Q3): the corrected working and the similar question wait for them.
    if (p.check && b.type !== 'steps' && b.type !== 'sources' && !seen.has('steps')) {
      held.push(b);
      return;
    }
    show(b, s);
    if (p.check && b.type === 'steps') for (const h of held.splice(0)) show(h, s);
  };
  // Check my work always gives a verdict (W18-Q3). When the model's verdicts never passed (no steps line, or one our checks
  // refused), our own arithmetic marks every working line that is a plain equation, and that block is shown first. Its
  // words are our arithmetic on the child's own lines, which already passed the safety check as the question, so it
  // needs no second check. With no line we can mark, the child is told so plainly, and the lesson the model wrote
  // instead is not shown: a check that teaches without marking is what this replaces.
  const markWithoutModel = async () => {
    if (stopped || error !== null || refusedByModel || !subject) return;
    let from: 'model' | 'arithmetic' | 'none' = seen.has('steps') ? 'model' : 'none';
    try {
      if (!seen.has('steps')) {
        const s: Subject = subject;
        const built = verdictsFromReading(p.reading ?? '', ctx.child.language === 'hi' ? 'hi' : 'en', words('fam.check.verdictTitle'));
        if (!built) {
          stopped = true;
          emit({ t: 'refused', reason: 'not_found', message: words('fam.check.err.noVerdict') });
        } else {
          // Shown first in this answer: a child with no free subject claims it now, as for the model's first block.
          let claimed = true;
          if (mustClaim && claim) {
            mustClaim = false;
            claimed = await claim(s);
          }
          if (!claimed) refuseSubject(s);
          else {
            from = 'arithmetic';
            seen.add('steps');
            show(built, s);
            for (const h of held.splice(0)) show(h, s);
          }
        }
      }
    } catch (err) {
      error = err;
    }
    // Counts and reasons only, never the child's words: how often the model's verdicts fail and why.
    logCheckVerdict({ from, stepsRejected, held: held.length });
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
  // A typed question is checked before it is sent: one found unsafe is never sent to the model (C314).
  if (p.moderation && p.question !== null && !(await safe({ user: p.question }))) {
    return { sent: { result: { ok: false, reason: 'failed' }, record: async () => {} }, subject, kept, shared, refusedByModel, stopped, error, objects, rejected, unclosed: false, droppedForSize: 0, plan };
  }
  // W9-B: the teaching plan, one short call after the question passed the safety check and before the answer; the
  // answer's prompt is rewritten from it. Never blocks: the default plan stands when it cannot be had.
  let late: AiRequest | undefined;
  let planSent: SentText | null = null;
  if (p.teach) {
    const planned = await planAnswer(p.teach.ctx, p.teach.call);
    logPlan(planned, p.teach.passages.length > 0);
    planSent = planned.sent;
    plan = planned.plan;
    if (planned.fromModel) late = p.teach.build(planned.plan);
  }
  // Each JSON object is checked as soon as it closes, however the model laid it out (C316).
  const scan = jsonObjectScanner();
  const answered = await p.text.send((delta) => {
    for (const o of scan(delta)) enqueue(o);
  }, late);
  await queue;
  if (p.check) await markWithoutModel();
  // The plan's call is metered with the answer's, in the same transaction.
  const both = planSent;
  const sent: SentText = both
    ? {
        result: answered.result,
        record: async (tx) => {
          await both.record(tx);
          await answered.record(tx);
        },
      }
    : answered;
  return { sent, subject, kept, shared, refusedByModel, stopped, error, objects, rejected, ...scan.dropped(), plan };
}

// 5. The writes after the call, in the caller's second transaction: the metering first, then the library line. Returns
// the last event to send once the transaction has committed (null: already said).
export async function keep(db: Db, p: Pending, g: Generated): Promise<ResolverEvent | null> {
  const { ctx, line } = p;
  await g.sent.record(db as never);
  await p.moderation?.record(db as never);
  if (g.stopped || g.error !== null) return null;
  const result = g.sent.result;
  // W10 (C411): the core blocks this answer's plan asked for (all three under a prompt that takes no plan), and those
  // that never came. The notice names them; an answer missing none and not cut shows none.
  const core = p.check ? [...CHECK_CORE] : coreBlocks(g.plan?.blocks ?? null);
  const missing = core.filter((t) => !g.kept.some((k) => k.type === t));
  // W10-4 (C413): `cut` says the child's answer stopped inside a block (the scanner ended in an object that never
  // closed), never how the call ended. A call that fails after its last block closed (the route's deadline reached by a
  // backup that took over from a Primary given up at its first-text time, a stream that closes without its end mark)
  // shows every block it sent whole: that answer is not cut, and a block it never sent is named by `missing`.
  if (!result.ok) return g.kept.length > 0 ? { t: 'done', complete: false, missing, cut: g.unclosed } : { t: 'refused', reason: result.reason, message: ctx.refusalWords(REFUSAL_MESSAGE[result.reason]) };
  if (g.refusedByModel && g.kept.length === 0) return { t: 'refused', reason: 'not_school_study', message: ctx.refusalWords('fam.understand.notStudy') };
  // The model never named the subject: nothing was shown, and no subject is guessed.
  if (!g.subject) return { t: 'refused', reason: 'failed', message: ctx.refusalWords(REFUSAL_MESSAGE.failed) };
  const cut = g.unclosed;
  const complete = cut ? null : completeResponse(g.shared, core);

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
  // Under a plan (W9-B), an answer is complete when every one of the explanation, check and practice it asked for came:
  // a Class 3 answer has no practice by design, and is not "incomplete" for it.
  return { t: 'done', complete: missing.length === 0 && !cut, missing, cut };
}
