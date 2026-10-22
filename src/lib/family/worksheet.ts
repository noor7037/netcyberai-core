import { parseBlockLine, type Block, type QuizItem } from './blocks';
import { syllabusBoardOf, type FamilyChild } from './children';
import { familyModuleOn } from './flags';
import { sealItem, type PublicItem } from './items';
import { claimSubject, reviewedOnlySubjects } from './learning';
import { syllabusLine, type Line } from './resolver';
import type { Subject } from './subjects';

// Worksheets (M2-4, C278; feature map L7): the check and practice items of a topic's (or chapter's) response already in
// the shared library, as one practice set on screen and on paper. Nothing is made here: no AI call, no new content. A
// response the founder checked comes before an AI-made one; a withdrawn one never. The phone gets the items sealed
// (items.ts) and answers them through POST /api/family/check, so progress, revisits and attempts work as for any
// practice. The printout carries no answers. The answer key is built only for the parent (parent PIN), as the last
// page of the parent's print.

export const WORKSHEET_MAX = 10;

type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

export type Worksheet = { state: 'not_found'; line: null } | { state: 'off'; line: Line } | { state: 'not_open'; line: Line } | { state: 'none'; line: Line } | { state: 'ok'; line: Line; label: 'ai_made' | 'checked'; items: QuizItem[] };
export type OkWorksheet = Extract<Worksheet, { state: 'ok' }>;

// The items of one response's blocks that are not already in `have`: check items first, then practice, one of each
// question (de-duplicated by its text), until `have` holds ten. A response holds at most 3 check and 3 practice items
// (blocks.ts), so a full sheet comes from several responses (other prompt versions of the same topic).
export function pickItems(blocks: unknown[], have: QuizItem[] = []): QuizItem[] {
  const parsed = blocks.map((b) => parseBlockLine(JSON.stringify(b))).filter((b): b is Block => b !== null);
  const seen = new Set(have.map((i) => i.question.trim().toLowerCase()));
  const out: QuizItem[] = [];
  for (const type of ['check', 'practice'] as const) {
    for (const b of parsed) {
      if (b.type !== type) continue;
      for (const item of b.items) {
        const q = item.question.trim().toLowerCase();
        if (seen.has(q) || have.length + out.length >= WORKSHEET_MAX) continue;
        seen.add(q);
        out.push(item);
      }
    }
  }
  return out;
}

// The server-side worksheet for a topic or chapter key, for this child: the module's switch, the subject's entitlement
// (as Understand checks it: the first subject a child studies becomes their free one), then the best cached response.
export async function loadWorksheet(db: Db, ctx: { accountId: string; child: FamilyChild }, key: string): Promise<Worksheet> {
  const child = ctx.child;
  const line = (await syllabusLine(db, child, { kind: 'topic', key })) ?? (await syllabusLine(db, child, { kind: 'chapter', key }));
  if (!line) return { state: 'not_found', line: null };
  if (!(await familyModuleOn(db, 'worksheets', ctx.accountId))) return { state: 'off', line };
  if (!(await claimSubject(db, ctx.accountId, child.childId, line.subject))) return { state: 'not_open', line };
  const { rows } = await db.query(
    `select blocks, status from content.responses
      where board_id = $1 and class_level = $2 and subject = $3 and topic_key = $4 and language = $5 and style = $6 and status <> 'withdrawn'
        and (status = 'checked' or not $7::boolean)
      order by (status = 'checked') desc, prompt_version desc`,
    [syllabusBoardOf(child), child.classLevel, line.subject, line.key, child.language, child.style, (await reviewedOnlySubjects(db)).includes(line.subject)]
  );
  // Checked responses first, then AI-made ones (checked only, in a "checked explanations only" subject, C300); the sheet
  // is "checked" only when every response it draws on is.
  const items: QuizItem[] = [];
  let allChecked = true;
  for (const r of rows) {
    if (!Array.isArray(r.blocks) || items.length >= WORKSHEET_MAX) continue;
    const more = pickItems(r.blocks as unknown[], items);
    if (more.length === 0) continue;
    items.push(...more);
    if (r.status !== 'checked') allChecked = false;
  }
  if (items.length > 0) return { state: 'ok', line, label: allChecked ? 'checked' : 'ai_made', items };
  return { state: 'none', line };
}

// What the phone gets on screen: the questions and options with sealed tokens, no key.
export type ScreenWorksheet = { state: 'ok'; title: string; subject: Subject; topicKey: string; label: 'ai_made' | 'checked'; items: PublicItem[] };
export function screenItems(w: OkWorksheet, ctx: { accountId: string; childId: string }): ScreenWorksheet {
  return {
    state: 'ok',
    title: w.line.title,
    subject: w.line.subject,
    topicKey: w.line.key,
    label: w.label,
    items: w.items.map((i) => sealItem(i, { ...ctx, topicKey: w.line.key, subject: w.line.subject, kind: 'practice' })),
  };
}

// What the printout holds: the questions and options only.
export type PrintItem = { question: string; options: string[] };
export const printItems = (w: OkWorksheet): PrintItem[] => w.items.map((i) => ({ question: i.question, options: i.options }));

// The answer key: each question number and the right option. Parent mode only (the caller checks it).
export type KeyRow = { n: number; letter: string; option: string };
export const optionLetter = (i: number) => String.fromCharCode(65 + i);
export const answerKey = (w: OkWorksheet): KeyRow[] => w.items.map((i, n) => ({ n: n + 1, letter: optionLetter(i.answer), option: i.options[i.answer] ?? '' }));
