import { activePromptVersion } from '@/lib/ai/platform';
import { resolverPrompt } from '@/lib/ai/prompts/family.resolver';
import { completeResponse, parseBlockLine, type Block } from './blocks';
import { readFamilyCatalog, type CatalogLang } from './catalog';
import { syllabusBoardOf, type FamilyChild } from './children';
import { indiaDate } from '@/lib/time/india';
import { DAY_MS, issuedAt, sealItem, type ItemSecret, type PublicItem } from './items';
import { reviewedOnlySubjects, setting } from './learning';
import type { PublicBlock } from './resolver';

// An offline chapter pack (docs/family-app/11 L9; M2-9, C283): for each line of a chapter (the chapter itself, then its
// topics), the response already in the shared library for the child's class, language and style: its text blocks
// (explanation, worked example, key points, English moment) and its check and practice items, sealed for the pack's
// life (Control: family.offline_pack_days) instead of the usual day. Checked responses before AI-made; a withdrawn one
// never. No AI call: a line with no library response is listed as "not in this pack". The pack states its size.

type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

export const PACK_TEXT_BLOCKS = ['explanation', 'worked_example', 'key_points', 'english_moment'] as const;
export type PackTextBlock = Extract<PublicBlock, { type: (typeof PACK_TEXT_BLOCKS)[number] }>;

export type PackTopic = { key: string; kind: 'chapter' | 'topic'; title: string; label: 'checked' | 'ai_made'; blocks: PackTextBlock[]; check: PublicItem[]; practice: PublicItem[] };
export type ChapterPack = {
  v: 1;
  childId: string;
  subject: string;
  chapter: { key: string; title: string };
  madeAt: string;
  expiresAt: string;
  topics: PackTopic[];
  missing: { key: string; title: string }[];
  bytes: number;
};

export const PACK_DAYS_FALLBACK = 14;
// The longest life Control may give a pack, and how long after its token ends a queued answer may still arrive.
export const PACK_MAX_DAYS = 30;
export const SYNC_GRACE_DAYS = 7;

// The pack's life in days, as Control sets it (1 to 30).
export async function packDays(db: Db): Promise<number> {
  return Math.min(PACK_MAX_DAYS, Math.max(1, Math.round(await setting(db, 'family.offline_pack_days', PACK_DAYS_FALLBACK))));
}

// The size of the pack as the phone receives it, in bytes (the JSON text, UTF-8), its own `bytes` included.
export function withSize(p: Omit<ChapterPack, 'bytes'>): ChapterPack {
  const base = Buffer.byteLength(JSON.stringify({ ...p, bytes: 0 }), 'utf8');
  let bytes = base;
  for (let i = 0; i < 3; i++) bytes = base - 1 + String(bytes).length;
  return { ...p, bytes };
}

const isText = (b: Block): b is Extract<Block, { type: (typeof PACK_TEXT_BLOCKS)[number] }> => (PACK_TEXT_BLOCKS as readonly string[]).includes(b.type);

// The packs of a subject's chapters (all of them, or the keys given), for one child. Items are sealed for this child.
export async function chapterPacks(
  db: Db,
  ctx: { accountId: string; child: FamilyChild },
  subject: string,
  opts: { chapterKeys?: string[]; now?: number; today?: string } = {}
): Promise<ChapterPack[]> {
  const child = ctx.child;
  const lang: CatalogLang = child.language === 'hi' ? 'hi' : 'en';
  const board = syllabusBoardOf(child);
  const catalog = await readFamilyCatalog(db, { board, classLevel: child.classLevel, subject, lang, today: opts.today });
  if (!catalog) return [];
  const chapters = opts.chapterKeys ? catalog.chapters.filter((c) => opts.chapterKeys!.includes(c.key)) : catalog.chapters;
  if (!chapters.length) return [];
  const lines = chapters.flatMap((c) => [{ key: c.key, kind: 'chapter' as const, title: c.title, chapter: c.key }, ...c.topics.map((t) => ({ key: t.key, kind: 'topic' as const, title: t.title, chapter: c.key }))]);
  const promptVersion = resolverPrompt(await activePromptVersion(db as never, 'family.resolver'), false).version;
  const { rows } = await db.query(
    `select topic_key, blocks, status from content.responses
      where board_id = $1 and class_level = $2 and subject = $3 and language = $4 and status <> 'withdrawn' and topic_key = any($7::text[])
        and case when $8::boolean then status = 'checked' else style = $5 and prompt_version = $6 end
      order by (status = 'checked') desc, (style = $5) desc, (prompt_version = $6) desc, created_at desc`,
    // In a "checked explanations only" subject (C300) a pack carries checked responses only, of any style or prompt
    // version (the child's own first), as Understand serves them.
    [board, child.classLevel, subject, child.language, child.style, promptVersion, lines.map((l) => l.key), (await reviewedOnlySubjects(db)).some((s) => s === subject)]
  );
  const library = new Map<string, { blocks: Block[]; label: 'checked' | 'ai_made' }>();
  for (const r of rows) {
    const key = String(r.topic_key);
    if (library.has(key) || !Array.isArray(r.blocks)) continue;
    const blocks = completeResponse((r.blocks as unknown[]).map((b) => parseBlockLine(JSON.stringify(b))).filter((b): b is Block => b !== null));
    if (blocks) library.set(key, { blocks, label: r.status === 'checked' ? 'checked' : 'ai_made' });
  }
  const days = await packDays(db);
  const now = opts.now ?? Date.now();
  const life = days * DAY_MS;
  return chapters.map((c) => {
    const mine = lines.filter((l) => l.chapter === c.key);
    const topics: PackTopic[] = [];
    const missing: { key: string; title: string }[] = [];
    for (const l of mine) {
      const found = library.get(l.key);
      if (!found) {
        // A chapter line with topics is only an overview: its absence is not "missing" when its topics are there.
        if (l.kind === 'topic' || c.topics.length === 0) missing.push({ key: l.key, title: l.title });
        continue;
      }
      const seal = (kind: 'check' | 'practice') =>
        found.blocks
          .filter((b): b is Extract<Block, { type: 'check' | 'practice' }> => b.type === kind)
          .flatMap((b) => b.items.map((i) => sealItem(i, { accountId: ctx.accountId, childId: child.childId, topicKey: l.key, subject, kind }, now, life)));
      topics.push({ key: l.key, kind: l.kind, title: l.title, label: found.label, blocks: found.blocks.filter(isText) as PackTextBlock[], check: seal('check'), practice: seal('practice') });
    }
    return withSize({
      v: 1,
      childId: child.childId,
      subject,
      chapter: { key: c.key, title: c.title },
      madeAt: new Date(now).toISOString(),
      expiresAt: new Date(now + life).toISOString(),
      topics,
      missing,
    });
  });
}

// The India day an answer counts on (M2-9). An answer made offline says the day it was made (`answeredOn`); the server
// takes it only when it is a real date, not after today, and within the token's life (not before the day it was issued,
// not after the day it ends). Anything else counts today.
export function answerDay(claimed: unknown, item: Pick<ItemSecret, 'exp' | 'iat'>, today: string): string {
  if (typeof claimed !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(claimed)) return today;
  const at = new Date(`${claimed}T00:00:00Z`);
  if (Number.isNaN(at.getTime()) || at.toISOString().slice(0, 10) !== claimed) return today;
  if (claimed > today) return today;
  if (claimed < indiaDate(new Date(issuedAt(item))) || claimed > indiaDate(new Date(item.exp))) return today;
  return claimed;
}

// An answer sent from the phone's offline queue carries a key of its own, so it is recorded once however often the
// phone sends it. The key is kept in the attempt's item key (no table of its own): "<topic>#<item>~<key>".
export const ANSWER_KEY = /^[A-Za-z0-9-]{16,40}$/;
export function offlineItemKey(item: Pick<ItemSecret, 'k' | 'i'>, key: string): string {
  return `${`${item.k}#${item.i}`.slice(0, 120 - key.length - 1)}~${key}`;
}
