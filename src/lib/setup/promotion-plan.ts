import { classRank, compareClasses, sectionKey, SCHOOL_GRADES } from '@/lib/classes/class-order';
import { classLabel } from '@/lib/frameworks/class-label';

// The dry run of a promotion to the next session (W21-M2), worked out from the rows alone, with no database: where
// each class goes and where each student goes. src/lib/setup/promotion.ts reads the rows and does it.
//
//   - A class goes to the class of the next grade with the same section (5-A -> 6-A; Nursery -> LKG -> UKG -> 1).
//     When the school has no such class, it is made (5-C -> a new 6-C).
//   - The school's top grade (the highest grade it has a class of) leaves: its students are marked as left.
//   - A class whose grade cannot be read (not Nursery, LKG, UKG or 1 to 12) has no successor: each of its students
//     needs the principal's decision (repeat or leave) before the promotion can run.
//   - The principal's per-student overrides: repeat (stays in the same class), leave, or move to another section
//     of the next grade.

export type PlanClass = { classId: string; name: string; grade: string | null; section: string | null };
export type PlanStudent = { studentId: string; name: string; rollNo: string | null; classId: string };
export type OverrideDecision = 'repeat' | 'leave' | 'move_section';
export type PlanOverride = { studentId: string; decision: OverrideDecision; toSection: string | null; reason: string };

// A class's place to go: an existing class, a class to make (by its key), leaving, or nowhere.
export type Destination = { kind: 'class'; classId: string; name: string } | { kind: 'make'; key: string; name: string } | { kind: 'leaving' } | { kind: 'none' };
export type ClassToMake = { key: string; name: string; grade: string; section: string | null };
export type MoveOutcome = 'promoted' | 'repeated' | 'moved_section' | 'left' | 'undecided';
export type StudentMove = { studentId: string; fromClassId: string; outcome: MoveOutcome; to: Destination; reason: string | null };
export type ClassPlan = { classId: string; name: string; students: number; to: Destination };
export type PromotionPlan = { classes: ClassPlan[]; toMake: ClassToMake[]; moves: StudentMove[]; undecided: number };

const keyOf = (rank: number, section: string) => `${rank}:${section}`;

export function planPromotion(classes: readonly PlanClass[], students: readonly PlanStudent[], overrides: readonly PlanOverride[]): PromotionPlan {
  const sorted = [...classes].sort(compareClasses);
  const rankOf = new Map(sorted.map((c) => [c.classId, classRank(c.grade, c.name)]));
  const known = [...rankOf.values()].filter((r) => r < SCHOOL_GRADES.length);
  const top = known.length ? Math.max(...known) : -1;
  const byKey = new Map<string, PlanClass>();
  for (const c of sorted) {
    const k = keyOf(rankOf.get(c.classId)!, sectionKey(c.section, c.name));
    if (!byKey.has(k)) byKey.set(k, c);
  }
  const toMake = new Map<string, ClassToMake>();

  // The class of the grade after `rank`, with this section: the school's own, or one to make.
  const next = (rank: number, section: string): Destination => {
    const k = keyOf(rank + 1, section);
    const own = byKey.get(k);
    if (own) return { kind: 'class', classId: own.classId, name: own.name };
    const grade = SCHOOL_GRADES[rank + 1];
    const name = classLabel(grade, section || null) ?? grade;
    if (!toMake.has(k)) toMake.set(k, { key: k, name, grade, section: section || null });
    return { kind: 'make', key: k, name };
  };
  const destinationOf = (c: PlanClass): Destination => {
    const rank = rankOf.get(c.classId)!;
    if (rank >= SCHOOL_GRADES.length) return { kind: 'none' };
    if (rank === top) return { kind: 'leaving' };
    return next(rank, sectionKey(c.section, c.name));
  };

  const classDest = new Map(sorted.map((c) => [c.classId, destinationOf(c)]));
  const own = new Map(sorted.map((c) => [c.classId, c]));
  const decided = new Map(overrides.map((o) => [o.studentId, o]));
  const counts = new Map<string, number>();
  const moves: StudentMove[] = [];
  for (const s of students) {
    const from = own.get(s.classId);
    if (!from) continue;
    counts.set(s.classId, (counts.get(s.classId) ?? 0) + 1);
    const o = decided.get(s.studentId);
    const base = classDest.get(s.classId)!;
    const reason = o?.reason ?? null;
    const move = (outcome: MoveOutcome, to: Destination) => moves.push({ studentId: s.studentId, fromClassId: s.classId, outcome, to, reason: outcome === 'promoted' ? null : reason });
    if (o?.decision === 'repeat') move('repeated', { kind: 'class', classId: from.classId, name: from.name });
    else if (o?.decision === 'leave' || (!o && base.kind === 'leaving')) move('left', { kind: 'leaving' });
    else if (o?.decision === 'move_section' && o.toSection && (base.kind === 'class' || base.kind === 'make')) move('moved_section', next(rankOf.get(s.classId)!, o.toSection));
    else if (base.kind === 'class' || base.kind === 'make') move('promoted', base);
    // No successor, or a section move with nowhere to go (the top grade, a class of no known grade): the principal decides.
    else move('undecided', { kind: 'none' });
  }
  return {
    classes: sorted.map((c) => ({ classId: c.classId, name: c.name, students: counts.get(c.classId) ?? 0, to: classDest.get(c.classId)! })),
    toMake: [...toMake.values()],
    moves,
    undecided: moves.filter((m) => m.outcome === 'undecided').length,
  };
}

// A section as the override list keeps it: letters and digits, upper case, up to 10.
export function cleanSection(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().toUpperCase();
  return /^[A-Z0-9]{1,10}$/.test(s) ? s : null;
}
