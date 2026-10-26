import type { ErrorType, SheetChangeInput, SheetDetail, SheetFlag, SheetQuestion, SheetRow } from '@/lib/contracts/marking';
import { countedQuestions, partTotals, round1 } from './rollup';

// What the teacher's screens work out from the server's answers (C347): which list a script belongs in, how sure the
// AI was in words, a mark kept within its question, and what the teacher has changed on a script. Pure and free of
// the server's code, so it is safe in the browser and tested (test/marking/review-view.test.ts). Nothing here ranks a
// child or compares one with another: a list is always in roll order, as the server sends it.

// ---- the review list ----------------------------------------------------------------------------------------------

// needs: a person must look (a flag, a failure, a script of nobody, or an approved one changed since);
// ready: marked, a child, no flag: it may be approved with the others; approved: done; working: still being read or marked.
export type Bucket = 'needs' | 'ready' | 'approved' | 'working' | 'aside';

export function bucketOf(s: Pick<SheetRow, 'state' | 'flags' | 'student'>): Bucket {
  if (s.state === 'set_aside') return 'aside';
  if (s.state === 'waiting' || s.state === 'marking') return 'working';
  if (s.state === 'failed' || s.flags.length > 0 || (s.state === 'marked' && !s.student)) return 'needs';
  if (s.state === 'approved') return 'approved';
  return 'ready';
}

export function bucketCounts(sheets: readonly SheetRow[]): Record<Exclude<Bucket, 'aside'>, number> {
  const out = { needs: 0, ready: 0, approved: 0, working: 0 };
  for (const s of sheets) {
    const b = bucketOf(s);
    if (b !== 'aside') out[b] += 1;
  }
  return out;
}

export type ReviewFilter = 'all' | 'needs' | 'ready' | 'approved';
export function filterSheets<T extends Pick<SheetRow, 'state' | 'flags' | 'student'>>(sheets: readonly T[], filter: ReviewFilter): T[] {
  if (filter === 'all') return [...sheets];
  return sheets.filter((s) => bucketOf(s) === filter);
}

// The scripts "Approve all ready" would approve: the same as the server's rule (marked, a child, no flag).
export const readyIds = (sheets: readonly SheetRow[]): string[] => sheets.filter((s) => bucketOf(s) === 'ready').map((s) => s.sheetId);

// Something is still being read or marked, so the page asks again (and stops when nothing is).
export function inProgress(o: { uploads: readonly { closed: boolean }[]; pages: { new: number }; sheets: readonly { state: string }[] }): boolean {
  const closed = o.uploads.some((u) => u.closed);
  return (closed && o.pages.new > 0) || o.sheets.some((s) => s.state === 'waiting' || s.state === 'marking');
}

// ---- how sure the AI was --------------------------------------------------------------------------------------------

// "Check this" below the school's line; "Sure" from 0.9 up and above the line; otherwise "Fairly sure".
export type Sureness = 'check' | 'fair' | 'sure' | 'none';
export function sureness(confidence: number | null, line: number): Sureness {
  if (confidence === null || confidence === undefined || !Number.isFinite(confidence)) return 'none';
  if (confidence < line) return 'check';
  return confidence >= Math.max(line, 0.9) ? 'sure' : 'fair';
}

// ---- marks --------------------------------------------------------------------------------------------------------

// A mark kept within its question, to a tenth.
export const clampMark = (n: number, max: number): number => Math.min(max, Math.max(0, Math.round(n * 10) / 10));

// The mark after a tap on − or +: half a mark at a time (from no mark, as from 0), landing on the half marks (3.2
// becomes 3.5 or 3), never below 0 or above the question's marks.
export function stepMark(current: number | null, delta: 0.5 | -0.5, max: number): number {
  const base = current ?? 0;
  const next = delta > 0 ? Math.floor(base * 2 + 1e-9) / 2 + 0.5 : Math.ceil(base * 2 - 1e-9) / 2 - 0.5;
  return clampMark(next, max);
}

// What a typed mark means: nothing typed (empty), a number within the question (ok), more than the question's marks
// (over), or not a number with at most one decimal place (bad).
export type TypedMark = { kind: 'empty' } | { kind: 'ok'; value: number } | { kind: 'over' } | { kind: 'bad' };
export function parseMark(text: string, max: number): TypedMark {
  const t = text.trim().replace(',', '.');
  if (t === '') return { kind: 'empty' };
  if (!/^(\d+\.?\d?|\.\d)$/.test(t)) return { kind: 'bad' };
  const n = Number(t);
  if (!Number.isFinite(n)) return { kind: 'bad' };
  return n > max ? { kind: 'over' } : { kind: 'ok', value: Math.round(n * 10) / 10 };
}

// ---- the teacher's changes ----------------------------------------------------------------------------------------

export type QuestionDraft = { marks?: number | null; note?: string; errorType?: ErrorType | null };
export type SheetDraft = {
  questions: Record<string, QuestionDraft>;
  strengths?: string;
  improve?: string;
  practice?: { unitId: string | null; text: string }[];
};
export const emptyDraft = (): SheetDraft => ({ questions: {} });

// A question's mark as it stands: the draft (null: back to the AI's mark), else the teacher's saved mark, else the AI's.
export function finalOf(q: Pick<SheetQuestion, 'questionId' | 'final' | 'ai'>, draft: SheetDraft): number | null {
  const d = draft.questions[q.questionId];
  return d && d.marks !== undefined ? (d.marks === null ? q.ai.marks : d.marks) : q.final;
}

// The note shown for a question: the draft, else the teacher's, else the AI's.
export const noteOf = (q: Pick<SheetQuestion, 'questionId' | 'teacher' | 'ai'>, draft: SheetDraft): string => draft.questions[q.questionId]?.note ?? q.teacher.note ?? q.ai.note ?? '';

export function totalsOf(detail: Pick<SheetDetail, 'questions' | 'totals'>, choiceCounts: Readonly<Record<string, number>>, draft: SheetDraft): { component: string; name: string; score: number; max: number }[] {
  const marks = new Map(detail.questions.map((q) => [q.questionId, finalOf(q, draft)]));
  const computed = partTotals(detail.totals.map((t) => ({ key: t.component, max: t.max })), detail.questions, marks, choiceCounts);
  return detail.totals.map((t) => ({ ...t, score: computed.find((c) => c.component === t.component)?.score ?? t.score }));
}

// Which questions count while the teacher changes marks (internal choice is worked out again from the marks as typed).
export function countedOf(detail: Pick<SheetDetail, 'questions'>, choiceCounts: Readonly<Record<string, number>>, draft: SheetDraft): Set<string> {
  return countedQuestions(detail.questions, new Map(detail.questions.map((q) => [q.questionId, finalOf(q, draft)])), choiceCounts);
}

export const grandTotal = (totals: readonly { score: number; max: number }[]) => ({ score: round1(totals.reduce((s, t) => s + t.score, 0)), max: round1(totals.reduce((s, t) => s + t.max, 0)) });

// What to send: only the fields that differ from what the server holds.
export function changesOf(detail: SheetDetail, draft: SheetDraft): SheetChangeInput | null {
  const out: SheetChangeInput = {};
  const questions: NonNullable<SheetChangeInput['questions']> = [];
  for (const q of detail.questions) {
    const d = draft.questions[q.questionId];
    if (!d) continue;
    const one: NonNullable<SheetChangeInput['questions']>[number] = { questionId: q.questionId };
    if (d.marks !== undefined && d.marks !== q.teacher.marks) one.marks = d.marks;
    if (d.note !== undefined && (d.note.trim() || null) !== (q.teacher.note ?? null)) one.note = d.note.trim() || null;
    if (d.errorType !== undefined && d.errorType !== q.errorType) one.errorType = d.errorType;
    if (Object.keys(one).length > 1) questions.push(one);
  }
  if (questions.length) out.questions = questions;
  if (draft.strengths !== undefined && (draft.strengths.trim() || null) !== (detail.strengths ?? null)) out.strengths = draft.strengths.trim() || null;
  if (draft.improve !== undefined && (draft.improve.trim() || null) !== (detail.improve ?? null)) out.improve = draft.improve.trim() || null;
  if (draft.practice !== undefined) {
    const clean = draft.practice.map((p) => ({ unitId: p.unitId, text: p.text.trim() })).filter((p) => p.text);
    if (JSON.stringify(clean) !== JSON.stringify(detail.practice.map((p) => ({ unitId: p.unitId, text: p.text })))) out.practice = clean;
  }
  return Object.keys(out).length ? out : null;
}

// The flags in the order a person should meet them: who it is first.
export const FLAG_ORDER: readonly SheetFlag[] = ['identity', 'check_child', 'two_scripts', 'missing_page', 'unreadable', 'not_all_read', 'unsure', 'changed'];
export const flagsInOrder = (flags: readonly SheetFlag[]): SheetFlag[] => FLAG_ORDER.filter((f) => flags.includes(f));
