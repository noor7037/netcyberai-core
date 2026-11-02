import type { Block } from '@/lib/family/blocks';
import type { Sql } from '@/lib/jobs/types';

// The quality check on the tutor's hot path (W16-A5; the proposal's M11). Pure rules over a finished answer, so the
// orchestrator can run them for nothing before an answer is kept, and the Lab's rules grader can reuse the band test.
// Rules look at the shape and the timing of an answer, never at a child's words: nothing here reads or keeps a name,
// a question or the text of an answer beyond counting its words.
//
// Codes (what is wrong, in the words the Control screens map to):
//   no_citation               passages from the library were given and the answer has no sources block
//   citation_without_passages a sources block with no passages given (a citation with nothing behind it)
//   block_invalid             the parser dropped a block, or a line never closed (its own report is taken)
//   board_invalid             a registered `board` validator found a problem in a drawing
//   late_first_text           the first words came after the profile's first-text time
//   hung                      no text, and no end, within the profile's whole-call time
//   too_short                 too little to teach with
//   off_band                  the depth does not suit the class band (docs/39 §3), a cheap heuristic

export const QC_CODES = ['no_citation', 'citation_without_passages', 'block_invalid', 'board_invalid', 'late_first_text', 'hung', 'too_short', 'off_band'] as const;
export type QcCode = (typeof QC_CODES)[number];
export type QcProblem = { code: QcCode; detail?: string };
export type QcResult = { ok: boolean; problems: QcProblem[] };

export type Band = 'lkg_1' | 'c2_5' | 'c6_8' | 'c9_10' | 'c11_12';

// What the block parser reported for this answer (the scanner's `dropped()` and the count of lines checkBlock refused).
export type ParserReport = { dropped?: number; unclosed?: boolean; droppedForSize?: number };

export type QcAnswer = {
  blocks: readonly Block[];
  passagesGiven: boolean;
  // Milliseconds from the call to the first answer words; null when no words arrived.
  firstTextMs: number | null;
  // Milliseconds from the call to the end of the answer; null when it had not ended.
  wholeMs: number | null;
  // The profile's whole-call time (callMs).
  deadlineMs: number;
  // The profile's first-text time (firstTextMs); none: lateness is not judged.
  firstTextDeadlineMs?: number | null;
  parser?: ParserReport;
  band?: Band | null;
};

// A validator the orchestrator registers by name; it returns the problems it found (empty: fine). `board` is the
// drawing block's (W16-A2), registered by whoever owns it; this module depends on none.
export type BlockValidator = (blocks: readonly Block[]) => string[];
const validators = new Map<string, BlockValidator>();
export function registerQcValidator(name: string, fn: BlockValidator): void {
  validators.set(name, fn);
}
export function unregisterQcValidator(name: string): void {
  validators.delete(name);
}

// The text an answer teaches with (the words a child reads), for counting.
export function answerText(blocks: readonly Block[]): string {
  const out: string[] = [];
  for (const b of blocks) {
    switch (b.type) {
      case 'explanation':
        out.push(b.idea, ...(b.paragraphs ?? []), b.example, ...b.steps);
        break;
      case 'worked_example':
        out.push(b.problem, ...b.steps.map((s) => s.text), b.answer);
        break;
      case 'key_points':
        out.push(...b.points);
        break;
      case 'steps':
        out.push(...b.items.map((i) => i.text));
        break;
      default:
        break;
    }
  }
  return out.filter((s) => typeof s === 'string' && s.trim()).join(' ');
}

const wordsOf = (text: string): string[] => text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? [];
const sentencesOf = (text: string): string[] => text.split(/(?<=[.!?।])\s+/).filter((s) => wordsOf(s).length > 0);

// The least words a teaching answer may have. Anything shorter has not taught.
export const MIN_ANSWER_WORDS = 15;

// Depth by class band (docs/39 §3): lkg_1 at most 60 words and one picture idea; c2_5 at most 150; c6_8 150 to 350 with
// reasoning; c9_10 formulas and worked problems; c11_12 rigour. The limits here allow half as much again above a
// ceiling and a little below a floor, because a count is a blunt tool: this catches an answer pitched at the wrong
// class, not one a few words off.
type BandShape = { minWords: number; maxWords: number; maxAvgSentence: number };
const SHAPE: Record<Band, BandShape> = {
  lkg_1: { minWords: 0, maxWords: 90, maxAvgSentence: 10 },
  c2_5: { minWords: 0, maxWords: 225, maxAvgSentence: 17 },
  c6_8: { minWords: 100, maxWords: 525, maxAvgSentence: 30 },
  c9_10: { minWords: 80, maxWords: 800, maxAvgSentence: 40 },
  c11_12: { minWords: 120, maxWords: 1100, maxAvgSentence: 50 },
};
// Words that belong to a later band. An answer for a younger child that leans on them is pitched too high.
const ABOVE_C2_5 = ['molecule', 'molecules', 'atom', 'atoms', 'electron', 'electrons', 'nucleus', 'chromosome', 'chromosomes', 'metabolism', 'mitochondria', 'enzyme', 'enzymes', 'hypothesis', 'equation', 'coefficient', 'derivative', 'integral', 'electrolysis', 'covalent', 'ionic', 'stoichiometry', 'quadratic', 'logarithm'];
const ABOVE_C6_8 = ['derivative', 'derivation', 'integral', 'integration', 'differentiate', 'differentiation', 'stoichiometry', 'stoichiometric', 'logarithm', 'quadratic', 'eigenvalue', 'thermodynamics', 'electronegativity', 'covalent', 'ionic', 'enthalpy', 'entropy'];
const ABOVE: Partial<Record<Band, { words: readonly string[]; most: number }>> = {
  lkg_1: { words: ABOVE_C2_5, most: 0 },
  c2_5: { words: ABOVE_C2_5, most: 1 },
  c6_8: { words: ABOVE_C6_8, most: 1 },
};

// What is off in this text for this band (empty: it suits). Each is a short phrase for the detail line.
export function bandProblems(text: string, band: Band): string[] {
  const shape = SHAPE[band];
  const words = wordsOf(text);
  const out: string[] = [];
  if (words.length > shape.maxWords) out.push(`long: ${words.length} words, a ${band} answer is at most ${shape.maxWords}`);
  if (words.length < shape.minWords) out.push(`thin: ${words.length} words, a ${band} answer is at least ${shape.minWords}`);
  const sentences = sentencesOf(text);
  if (sentences.length > 0) {
    const avg = words.length / sentences.length;
    if (avg > shape.maxAvgSentence) out.push(`sentences too long: ${Math.round(avg)} words on average, at most ${shape.maxAvgSentence}`);
  }
  const above = ABOVE[band];
  if (above) {
    const seen = new Set(words.filter((w) => above.words.includes(w)));
    if (seen.size > above.most) out.push(`vocabulary for a later band: ${Array.from(seen).sort().join(', ')}`);
  }
  return out;
}

// The rules. A hung answer has nothing else to judge, so it is the only problem reported.
export function qcRules(a: QcAnswer): QcResult {
  const problems: QcProblem[] = [];
  const hung = a.firstTextMs === null && (a.wholeMs === null || a.wholeMs >= a.deadlineMs);
  if (hung) return { ok: false, problems: [{ code: 'hung', detail: `no text within ${a.deadlineMs} ms` }] };

  if (a.firstTextDeadlineMs && a.firstTextMs !== null && a.firstTextMs > a.firstTextDeadlineMs) {
    problems.push({ code: 'late_first_text', detail: `${a.firstTextMs} ms, the profile allows ${a.firstTextDeadlineMs} ms` });
  }

  const cited = a.blocks.some((b) => b.type === 'sources');
  if (a.passagesGiven && !cited) problems.push({ code: 'no_citation', detail: 'passages were given and the answer has no sources block' });
  if (!a.passagesGiven && cited) problems.push({ code: 'citation_without_passages', detail: 'a sources block with no passages given' });

  const p = a.parser;
  if (p && ((p.dropped ?? 0) > 0 || p.unclosed || (p.droppedForSize ?? 0) > 0)) {
    const parts = [p.dropped ? `${p.dropped} refused` : '', p.droppedForSize ? `${p.droppedForSize} too big` : '', p.unclosed ? 'one never closed' : ''].filter(Boolean);
    problems.push({ code: 'block_invalid', detail: parts.join(', ') });
  }

  for (const [name, fn] of validators) {
    // A validator is asked only about an answer that carries the kind of block it checks (`board` for a drawing).
    if (name === 'board' && !a.blocks.some((b) => (b.type as string) === 'board')) continue;
    let found: string[] = [];
    try {
      found = fn(a.blocks);
    } catch {
      found = ['the validator failed'];
    }
    if (found.length > 0) problems.push({ code: name === 'board' ? 'board_invalid' : 'block_invalid', detail: `${name}: ${found.slice(0, 3).join('; ')}` });
  }

  const text = answerText(a.blocks);
  const count = wordsOf(text).length;
  if (count < MIN_ANSWER_WORDS) problems.push({ code: 'too_short', detail: `${count} words` });
  else if (a.band) {
    const off = bandProblems(text, a.band);
    if (off.length > 0) problems.push({ code: 'off_band', detail: off.join('; ') });
  }
  return { ok: problems.length === 0, problems };
}

// The shape W16-A1's orchestrator accepts: the answer in, the problem codes out (empty: the answer passes).
export const qcValidator = async (answer: QcAnswer): Promise<string[]> => qcRules(answer).problems.map((p) => p.code);

// ---- recording -------------------------------------------------------------------------------------------------------

export type QcContext = {
  // The India day, as the usage ledger's.
  day: string;
  profileId: string;
  answer: Pick<QcAnswer, 'firstTextMs' | 'wholeMs' | 'passagesGiven'> & { band?: Band | null };
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const PROFILE = /^[a-z][a-z0-9_.]{2,59}$/;
const ms = (v: number | null) => (v === null || !Number.isFinite(v) ? null : Math.max(0, Math.round(v)));

// Writes one row to control.ai_qc_results in the caller's transaction: the codes, the times and the band, nothing the
// child wrote or read. Before the migration is applied it writes nothing and says so (false), so the hot path never
// fails on a missing table.
export async function recordQc(db: Sql, ctx: QcContext, result: QcResult): Promise<boolean> {
  if (!DAY.test(ctx.day) || !PROFILE.test(ctx.profileId)) return false;
  const have = await db.query(`select to_regprocedure('control.record_qc_result(date, text, text[], integer, integer, boolean, text)') is not null as ok`);
  if (have.rows[0]?.ok !== true) return false;
  const codes = Array.from(new Set(result.problems.map((p) => p.code))).slice(0, 12);
  await db.query(`select control.record_qc_result($1::date, $2::text, $3::text[], $4::int, $5::int, $6::boolean, $7::text)`, [
    ctx.day,
    ctx.profileId,
    codes,
    ms(ctx.answer.firstTextMs),
    ms(ctx.answer.wholeMs),
    ctx.answer.passagesGiven,
    ctx.answer.band ?? null,
  ]);
  return true;
}
