import { REFUSAL_MESSAGE, activePromptVersion, streamText, type AiRefusal } from '@/lib/ai/platform';
import { RESOLVER_PROMPT_VERSION, resolverSystem, resolverUser, type ResolverAsk } from '@/lib/ai/prompts/family.resolver/v1';
import { BLOCK_SCHEMA_VERSION, completeResponse, parseBlockLine, type Block, type BlockType } from './blocks';
import type { FamilyChild } from './children';
import { sealItem, type PublicItem } from './items';

// The Concept Resolver, "Understand" (docs/family-app/02 §4, 03 §6; M1-5, C251): a chapter, a topic or a typed
// question in, typed blocks out, streamed one by one as each passes its checks.
//   1. context   the syllabus line from the catalog released to everyone, for the child's class (never a draft)
//   2. cache     a topic or chapter response already made for this class, language, style and prompt version is
//                served from the shared library (content.responses): "checked by NetCyberAI" once the founder approved
//                it, "AI-made" until then. A typed question is never cached: it is the child's own words.
//   3. generate  through the AI platform (profile family.resolver): the minors check, the pre-processor that removes
//                every child identifier, the daily cap and the metering all happen there
//   4. verify    each line is checked against its block's shape; arithmetic is recomputed; links come from the
//                allowlist; only the first block of each type is kept
//   5. keep      a complete topic or chapter response (explanation, check and practice all passed) goes into the
//                library as AI-made for the next child; a follow-up or a typed question does not
// Check and practice items reach the phone without their answers: each carries a sealed token (items.ts).

export type FollowUp = NonNullable<ResolverAsk['followUp']>;
export const FOLLOW_UPS: readonly FollowUp[] = ['simpler', 'another_example', 'differently', 'practise_more'];
export type ResolveInput = { kind: 'topic' | 'chapter'; key: string } | { kind: 'question'; text: string; subject: 'mathematics' | 'science' };

export type PublicBlock = Exclude<Block, { type: 'check' } | { type: 'practice' }> | { type: 'check' | 'practice'; items: PublicItem[] };
export type ResolverEvent =
  | { t: 'meta'; label: 'ai_made' | 'checked'; cached: boolean; title: string | null; subject: string; topicKey: string | null }
  | { t: 'block'; block: PublicBlock }
  | { t: 'done'; complete: boolean }
  | { t: 'refused'; reason: AiRefusal | 'not_found' | 'not_school_study' | 'not_open'; message: string };

type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };
export type ResolverContext = {
  accountId: string;
  child: FamilyChild;
  childFirstNames: string[];
  parentEmail: string;
  day: string;
  refusalWords: (key: string) => string;
  // The subject's entitlement (M1-6): the child's free subject, claimed on first use. Absent: every subject is open.
  allowSubject?: (subject: 'mathematics' | 'science') => Promise<boolean>;
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
  const promptVersion = (await activePromptVersion(db as never, 'family.resolver')) ?? RESOLVER_PROMPT_VERSION;
  return libraryEvents(db, ctx, line, promptVersion);
}

export async function resolve(db: Db, ctx: ResolverContext, input: ResolveInput, followUp: FollowUp | null, emit: (e: ResolverEvent) => void, misconception: string | null = null): Promise<void> {
  const child = ctx.child;
  let line: Line | null = null;
  if (input.kind !== 'question') {
    line = await syllabusLine(db, child, input);
    if (!line) {
      emit({ t: 'refused', reason: 'not_found', message: ctx.refusalWords('fam.understand.notFound') });
      return;
    }
  }
  const subject = line?.subject ?? (input.kind === 'question' ? input.subject : 'science');
  if (ctx.allowSubject && !(await ctx.allowSubject(subject))) {
    emit({ t: 'refused', reason: 'not_open', message: ctx.refusalWords('fam.subject.notOpen') });
    return;
  }
  // Progress and the sealed items are keyed to the syllabus line; a typed question is kept against its subject.
  const topicKey = line?.key ?? `cbse.c${child.classLevel}.${subject}.question`;
  const promptVersion = (await activePromptVersion(db as never, 'family.resolver')) ?? RESOLVER_PROMPT_VERSION;
  const cacheable = input.kind !== 'question' && followUp === null && misconception === null;

  // 2. The shared library.
  if (cacheable && line) {
    const cached = await libraryEvents(db, ctx, line, promptVersion);
    if (cached) {
      for (const e of cached) emit(e);
      return;
    }
  }

  // 3–4. Generate, checking each line as it arrives.
  const ask: ResolverAsk = {
    board: child.board,
    classLevel: child.classLevel,
    subject,
    chapter: line?.chapterEn ?? null,
    topic: line?.topicEn ?? null,
    question: input.kind === 'question' ? input.text : null,
    language: child.language,
    style: child.style,
    followUp,
    misconception,
  };
  const seen = new Set<BlockType>();
  const kept: Block[] = [];
  let pending = '';
  let refusedByModel = false;
  let metaSent = false;
  const take = (text: string) => {
    if (/"type"\s*:\s*"refuse"/.test(text)) refusedByModel = true;
    const b = parseBlockLine(text);
    if (!b || seen.has(b.type)) return;
    seen.add(b.type);
    kept.push(b);
    if (!metaSent) {
      emit({ t: 'meta', label: 'ai_made', cached: false, title: line?.title ?? null, subject, topicKey: line?.key ?? null });
      metaSent = true;
    }
    emit({ t: 'block', block: toPublic(b, ctx, topicKey, subject) });
  };
  const result = await streamText(
    db as never,
    { accountId: ctx.accountId, childFirstNames: ctx.childFirstNames, parentEmail: ctx.parentEmail, day: ctx.day },
    'family.resolver',
    { system: resolverSystem(ask), messages: [{ role: 'user', content: resolverUser(ask) }], responseFormat: undefined },
    (delta) => {
      pending += delta;
      let nl = pending.indexOf('\n');
      while (nl >= 0) {
        take(pending.slice(0, nl));
        pending = pending.slice(nl + 1);
        nl = pending.indexOf('\n');
      }
    }
  );
  if (pending.trim()) take(pending);
  if (!result.ok) {
    if (!metaSent) {
      emit({ t: 'refused', reason: result.reason, message: ctx.refusalWords(REFUSAL_MESSAGE[result.reason]) });
      return;
    }
    emit({ t: 'done', complete: false });
    return;
  }
  if (refusedByModel && kept.length === 0) {
    emit({ t: 'refused', reason: 'not_school_study', message: ctx.refusalWords('fam.understand.notStudy') });
    return;
  }
  const complete = completeResponse(kept);

  // 5. A complete topic or chapter response is kept for the next child, as AI-made, until the founder approves it.
  if (complete && cacheable && line) {
    await db.query(
      `insert into content.responses (board_id, class_level, subject, topic_key, language, style, prompt_version, schema_version, blocks, status, provider, model)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, 'ai_made', $10, $11)
       on conflict do nothing`,
      [child.board, child.classLevel, subject, line.key, child.language, child.style, promptVersion, BLOCK_SCHEMA_VERSION, JSON.stringify(complete), result.provider, result.model]
    );
  }
  emit({ t: 'done', complete: complete !== null });
}
