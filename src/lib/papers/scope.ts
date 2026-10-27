import { DIFFICULTIES, type Difficulty, type QuestionKind } from '@/lib/contracts/marking';
import { blueprintTotal, type Blueprint, type ScopeRule, type WeightRule } from './blueprint';

// What a paper covers and how its marks are shared (docs/36 §1.1, C362), as rules only: the class's "taught today" log
// (syllabus_progress, P2 5d) decides the chapters by the exam type's scope rule, the periods (or equal shares, or the
// teacher's own marks) decide each chapter's marks, and the blueprint's sections are spread over the chapters so each
// chapter's marks follow its share. The AI only writes questions to fill the slots this makes. Pure and deterministic:
// the same log, map and blueprint always make the same plan (test/papers/scope.test.ts).

export type MapUnit = { unitId: string; chapter: string; topic: string; position: number };
// One period logged as taught: its day (yyyy-mm-dd) and its topic in the map, when the teacher chose one.
export type TaughtRow = { unitId: string | null; date: string };

// Which rows of the log count: after `after` (the day of the class's last paper of the same type; none: from `from`),
// from `from` (the session's first day), up to `to` (the paper's day, or today when it has none).
export type ScopeWindow = { after: string | null; from: string; to: string };

// Which rule decided the chapters: the log, the paper's own chapters (nothing was logged), or the whole map (the rule
// says so, or neither the log nor the paper names a chapter).
export type ScopeUsed = 'log' | 'paper_units' | 'whole_map';
export type ScopeChapter = { chapter: string; periods: number; units: { unitId: string; topic: string; periods: number }[] };
export type Scope = { rule: ScopeRule; used: ScopeUsed; after: string | null; from: string | null; to: string | null; unlinked: number; chapters: ScopeChapter[] };

const inWindow = (date: string, w: ScopeWindow) => (w.after ? date > w.after : date >= w.from) && date <= w.to;

// The chapters a paper covers, each with its periods logged in the window and its topics, in the map's order.
//   since_last_of_type, session: the topics taught in the window; nothing taught there: the paper's own chapters, then
//                                the whole map.
//   whole_map:                   every topic of the map, with the periods taught in the session (`sessionTaught`).
// A period logged without a topic is not counted (`unlinked` says how many).
export function chooseScope(rule: ScopeRule, units: readonly MapUnit[], taught: readonly TaughtRow[], window: ScopeWindow, paperUnitIds: readonly string[]): Scope {
  const map = [...units].sort((a, b) => a.position - b.position || a.unitId.localeCompare(b.unitId));
  const known = new Map(map.map((u) => [u.unitId, u]));
  const counted = rule === 'whole_map' ? taught.filter((r) => r.date >= window.from && r.date <= window.to) : taught.filter((r) => inWindow(r.date, window));
  const periods = new Map<string, number>();
  let unlinked = 0;
  for (const r of counted) {
    if (r.unitId && known.has(r.unitId)) periods.set(r.unitId, (periods.get(r.unitId) ?? 0) + 1);
    else unlinked++;
  }
  const base = { rule, after: rule === 'whole_map' ? null : window.after, from: rule === 'whole_map' ? null : window.after ? null : window.from, to: rule === 'whole_map' ? null : window.to, unlinked };
  if (rule === 'whole_map') return { ...base, used: 'whole_map', chapters: chaptersOf(map, periods) };
  const taughtUnits = map.filter((u) => (periods.get(u.unitId) ?? 0) > 0);
  if (taughtUnits.length) return { ...base, used: 'log', chapters: chaptersOf(taughtUnits, periods) };
  const own = map.filter((u) => paperUnitIds.includes(u.unitId));
  if (own.length) return { ...base, used: 'paper_units', chapters: chaptersOf(own, periods) };
  return { ...base, used: 'whole_map', chapters: chaptersOf(map, periods) };
}

function chaptersOf(units: readonly MapUnit[], periods: ReadonlyMap<string, number>): ScopeChapter[] {
  const out: ScopeChapter[] = [];
  for (const u of units) {
    const name = u.chapter.trim();
    let c = out.find((x) => x.chapter === name);
    if (!c) out.push((c = { chapter: name, periods: 0, units: [] }));
    const p = periods.get(u.unitId) ?? 0;
    c.periods += p;
    c.units.push({ unitId: u.unitId, topic: u.topic.trim(), periods: p });
  }
  return out;
}

// ---- weights and marks -------------------------------------------------------------------------------------------------

// Each chapter's weight: the periods spent on it (a chapter in the paper with none logged counts as one, so every
// chapter covered has a share), or the same for each.
export function weightsOf(chapters: readonly Pick<ScopeChapter, 'periods'>[], rule: WeightRule): number[] {
  return chapters.map((c) => (rule === 'equal' ? 1 : Math.max(1, c.periods)));
}

// `total` shared in proportion to `weights`, in steps of `step` (1 mark, or a tenth when the total has a decimal), by
// the largest remainder: each takes its whole steps, then the steps left go to the largest remainders, the earlier one
// on a tie. The parts add up to `total` exactly.
export function largestRemainder(total: number, weights: readonly number[], step = Number.isInteger(total) ? 1 : 0.1): number[] {
  const sum = weights.reduce((a, w) => a + Math.max(0, w), 0);
  if (!weights.length || sum <= 0) return weights.map(() => 0);
  const units = Math.round(total / step);
  const exact = weights.map((w) => (Math.max(0, w) / sum) * units);
  const whole = exact.map((x) => Math.floor(x + 1e-9));
  let left = units - whole.reduce((a, b) => a + b, 0);
  const order = exact.map((x, i) => ({ i, r: x - whole[i] })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (const o of order) {
    if (left <= 0) break;
    whole[o.i] += 1;
    left -= 1;
  }
  return whole.map((n) => Math.round(n * step * 10) / 10);
}

// ---- the slots ---------------------------------------------------------------------------------------------------------

export type PlanSlot = {
  n: number; // 1, 2, 3… in print order: the question's number
  section: string;
  kind: QuestionKind;
  marks: number;
  difficulty: Difficulty;
  chapter: string;
  unitId: string;
  topic: string;
  choiceGroup: string | null; // the section's letter when it has an internal choice
};
export type PlanChapter = { chapter: string; periods: number; marks: number; planned: number; topics: string[] };
export type Allocation = { slots: PlanSlot[]; chapters: PlanChapter[]; choiceCounts: Record<string, number> };

const round1 = (n: number) => Math.round(n * 10) / 10;

// How many of `count` questions are easy, medium and hard by the mix, by the largest remainder, then spread through
// the section so neither end is all hard: each question takes the difficulty furthest behind its share so far.
export function difficultiesOf(count: number, mix: Blueprint['mix']): Difficulty[] {
  const n = largestRemainder(count, [mix.easy, mix.medium, mix.hard], 1);
  const out: Difficulty[] = [];
  const given = [0, 0, 0];
  for (let i = 0; i < count; i++) {
    let best = -1;
    let gap = -Infinity;
    for (let d = 0; d < 3; d++) {
      if (given[d] >= n[d]) continue;
      const g = (n[d] * (i + 1)) / count - given[d];
      if (g > gap + 1e-9) {
        gap = g;
        best = d;
      }
    }
    given[best] += 1;
    out.push(DIFFICULTIES[best]);
  }
  return out;
}

// The paper's questions as slots. `targets`: each chapter's marks (the shares above, or the teacher's own), adding up
// to the blueprint's total. A question counts its marks, or its share of an internal choice (5 marks, answer any 4 of
// 5: 4 each). The questions with the most marks are placed first, each in the chapter furthest below its target (the
// earlier chapter on a tie), so the small ones fill what is left and every chapter ends near its marks. Then each
// section is printed in the map's chapter order, a chapter's questions take its topics in turn (the most taught first),
// and the section's difficulties are spread through it.
export function allocate(blueprint: Blueprint, chapters: readonly ScopeChapter[], targets: readonly number[]): Allocation {
  const placed = chapters.map(() => 0);
  type Q = { section: string; i: number; kind: QuestionKind; marks: number; worth: number; chapter: number };
  const questions: Q[] = [];
  for (const s of blueprint.sections) {
    const worth = s.answerAny > 0 ? (s.marksEach * s.answerAny) / s.count : s.marksEach;
    for (let i = 0; i < s.count; i++) questions.push({ section: s.section, i, kind: s.kind, marks: s.marksEach, worth, chapter: -1 });
  }
  const open = targets.map((t) => t > 0);
  if (!open.some(Boolean)) open.fill(true);
  const byWeight = [...questions].sort((a, b) => b.worth - a.worth || a.section.localeCompare(b.section) || a.i - b.i);
  for (const q of byWeight) {
    let best = -1;
    let deficit = -Infinity;
    chapters.forEach((_, c) => {
      if (!open[c]) return;
      const d = targets[c] - placed[c];
      if (d > deficit + 1e-9) {
        deficit = d;
        best = c;
      }
    });
    q.chapter = best;
    placed[best] += q.worth;
  }
  // Topics: each chapter's in turn, the most taught first (then the map's order).
  const topicOrder = chapters.map((c) => [...c.units].map((u, k) => ({ ...u, k })).sort((a, b) => b.periods - a.periods || a.k - b.k));
  const nextTopic = chapters.map(() => 0);
  const slots: PlanSlot[] = [];
  const choiceCounts: Record<string, number> = {};
  for (const s of blueprint.sections) {
    const qs = questions.filter((q) => q.section === s.section).sort((a, b) => a.chapter - b.chapter || a.i - b.i);
    const levels = difficultiesOf(qs.length, blueprint.mix);
    if (s.answerAny > 0) choiceCounts[s.section] = s.answerAny;
    qs.forEach((q, k) => {
      const topics = topicOrder[q.chapter];
      const unit = topics[nextTopic[q.chapter]++ % topics.length];
      slots.push({
        n: slots.length + 1,
        section: s.section,
        kind: q.kind,
        marks: q.marks,
        difficulty: levels[k],
        chapter: chapters[q.chapter].chapter,
        unitId: unit.unitId,
        topic: unit.topic,
        choiceGroup: s.answerAny > 0 ? s.section : null,
      });
    });
  }
  return {
    slots,
    choiceCounts,
    chapters: chapters.map((c, i) => ({ chapter: c.chapter, periods: c.periods, marks: targets[i], planned: round1(placed[i]), topics: c.units.map((u) => u.topic) })),
  };
}

// ---- the plan ----------------------------------------------------------------------------------------------------------

export type Part = { key: string; name: string; max: number };
export type PlanProblem =
  | { kind: 'no_map' } // the class has no syllabus map for the subject: there are no chapters to cover
  | { kind: 'total'; blueprint: number; part: string; max: number } // the blueprint's marks are not the paper's part's
  | { kind: 'typed' } // the teacher's marks per chapter do not add up to the total
  | { kind: 'blueprint' }; // the sections as changed for this paper are not a blueprint (see blueprintCheck)
export type PaperPlan = Allocation & {
  blueprint: Blueprint;
  part: Part | null;
  scope: Omit<Scope, 'chapters'>;
  weight: WeightRule | 'typed';
  problems: PlanProblem[];
};

// The part of the paper the questions count to: its largest (a written paper's theory), the first on a tie. When its
// maximum is not the blueprint's total the plan says so, for the teacher to change the sections or the paper's marks:
// the questions are never stretched to fit, nor moved to another part that happens to match.
export function markedPart(parts: readonly Part[]): Part | null {
  if (!parts.length) return null;
  return parts.reduce((best, p) => (p.max > best.max ? p : best), parts[0]);
}

// The teacher's marks per chapter, as sent ({ chapter: marks }): each from 0, one decimal place, the chapters the scope
// covers only, adding up to the total. Null: not given; false: given wrongly.
export function typedTargets(raw: unknown, chapters: readonly ScopeChapter[], total: number): number[] | null | false {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) return false;
  const given = raw as Record<string, unknown>;
  if (Object.keys(given).some((k) => !chapters.some((c) => c.chapter === k))) return false;
  const out = chapters.map((c) => (Object.prototype.hasOwnProperty.call(given, c.chapter) ? given[c.chapter] : 0));
  if (!out.every((m): m is number => typeof m === 'number' && Number.isFinite(m) && m >= 0 && Math.abs(Math.round(m * 10) - m * 10) < 1e-9)) return false;
  return round1(out.reduce((a, b) => a + b, 0)) === round1(total) ? out : false;
}

export function makePlan(input: { blueprint: Blueprint; parts: readonly Part[]; scope: Scope; typed?: unknown; blueprintOk?: boolean }): PaperPlan {
  const { blueprint, scope } = input;
  const { chapters: scoped, ...scopeInfo } = scope;
  const total = blueprintTotal(blueprint.sections);
  const part = markedPart(input.parts);
  const problems: PlanProblem[] = [];
  if (input.blueprintOk === false) problems.push({ kind: 'blueprint' });
  if (!scoped.length) problems.push({ kind: 'no_map' });
  if (part && part.max !== total) problems.push({ kind: 'total', blueprint: total, part: part.key, max: part.max });
  const typed = scoped.length ? typedTargets(input.typed, scoped, total) : null;
  if (typed === false) problems.push({ kind: 'typed' });
  const weight: PaperPlan['weight'] = Array.isArray(typed) ? 'typed' : blueprint.weight;
  const targets = Array.isArray(typed) ? typed : largestRemainder(total, weightsOf(scoped, blueprint.weight));
  const allocation = scoped.length ? allocate(blueprint, scoped, targets) : { slots: [], chapters: [], choiceCounts: {} };
  return { ...allocation, blueprint: { ...blueprint, totalMarks: total }, part, scope: scopeInfo, weight, problems };
}
