// The Curriculum Gap Detector's one rule (docs/27 row 9d and section 5, C216). For a class and a subject, every unit
// of the syllabus map is in exactly one state, worked out when the screen is read from three recorded things and
// nothing else:
//
//   taught    a lesson for the unit was marked "Taught" in Taught today (syllabus_progress.unit_id, status
//             'taught': the rule the syllabus map's own "taught" already uses);
//   assessed  the unit is one of the chapters an exam paper of that class and subject assesses (exam_papers.unit_ids),
//             whatever the exam's state and whether or not its date has come;
//   the map   the units' order (their place, then when each was added).
//
// The states, each checked in this order, the first that holds:
//
//   1. assessed-before-taught  on a paper, and either never taught, or the paper's date is before the first day it
//                              was taught. A paper with no date yet is not counted as before the lessons.
//   2. taught-assessed         taught, and on a paper (none of them before the first lesson).
//   3. taught-not-assessed     taught, and on no paper.
//   4. skipped                 never taught and on no paper, while a unit after it in the map was taught (docs/27
//                              section 5: "a unit before the latest taught unit, by its place in the map, that was
//                              never taught").
//   5. not-yet-taught          never taught, on no paper, and no unit after it was taught: the class has not reached
//                              it. Not one of the four states of the plan, which leaves the units still ahead out;
//                              every unit is shown once, so they have their own.
//
// A unit never taught that is on a paper is "assessed before it was taught" even when a later unit was taught: the
// heavier gap is the one shown, and its "skipped" fact is still given with it (`laterTaught`).
//
// Rules only: nothing here is a model, a score or a comparison of classes, teachers or children.

export const GAP_STATES = ['assessed-before-taught', 'taught-assessed', 'taught-not-assessed', 'skipped', 'not-yet-taught'] as const;
export type GapState = (typeof GAP_STATES)[number];

// `kind`: the exam's type in both languages as the school names it (C230-AJ part 2), added when the screen is read; a label
// only, it changes no state and no count.
export type GapPaper = { paperId: string; examId: string; examName: string; date: string | null; kind?: { key: string; en: string; hi: string } };

// What the database says about one unit (public.curriculum_gap_units): days are 'YYYY-MM-DD'.
export type UnitFacts = {
  unitId: string;
  place: number;
  chapter: string;
  topic: string;
  addedAt: string;
  taughtFirst: string | null;
  taughtLast: string | null;
  lessons: number;
  papers: GapPaper[];
};

export type UnitGap = UnitFacts & {
  state: GapState;
  // The papers dated before the first lesson, or every paper when the unit was never taught.
  papersBefore: GapPaper[];
  // For a unit never taught: the unit after it in the map that was first taught earliest, and that day. It is what
  // makes the unit "skipped".
  laterTaught: { unitId: string; chapter: string; topic: string; day: string } | null;
};

export type GapCounts = Record<GapState, number>;

const before = (a: string, b: string) => a < b; // 'YYYY-MM-DD' strings compare as days

export function mapOrder<T extends Pick<UnitFacts, 'place' | 'addedAt' | 'unitId'>>(units: readonly T[]): T[] {
  return [...units].sort((a, b) => a.place - b.place || (a.addedAt < b.addedAt ? -1 : a.addedAt > b.addedAt ? 1 : 0) || (a.unitId < b.unitId ? -1 : a.unitId > b.unitId ? 1 : 0));
}

export function unitState(unit: UnitFacts, laterTaught: UnitGap['laterTaught']): { state: GapState; papersBefore: GapPaper[] } {
  const taught = unit.taughtFirst !== null;
  const papersBefore = unit.papers.filter((p) => !taught || (p.date !== null && before(p.date, unit.taughtFirst as string)));
  if (papersBefore.length > 0) return { state: 'assessed-before-taught', papersBefore };
  if (taught) return { state: unit.papers.length > 0 ? 'taught-assessed' : 'taught-not-assessed', papersBefore };
  return { state: laterTaught ? 'skipped' : 'not-yet-taught', papersBefore };
}

// Every unit of one class and subject's map, once, in the map's order, with its state; and the count of each state.
export function gapStates(facts: readonly UnitFacts[]): { units: UnitGap[]; counts: GapCounts } {
  const units = mapOrder(facts);
  const counts = Object.fromEntries(GAP_STATES.map((s) => [s, 0])) as GapCounts;
  // Walking back from the end of the map: the unit after this one that was first taught earliest.
  const later: UnitGap['laterTaught'][] = new Array(units.length).fill(null);
  let earliest: UnitGap['laterTaught'] = null;
  for (let i = units.length - 1; i >= 0; i--) {
    later[i] = earliest;
    const u = units[i];
    if (u.taughtFirst !== null && (earliest === null || !before(earliest.day, u.taughtFirst))) {
      earliest = { unitId: u.unitId, chapter: u.chapter, topic: u.topic, day: u.taughtFirst };
    }
  }
  const out = units.map((u, i) => {
    const laterTaught = u.taughtFirst === null ? later[i] : null;
    const { state, papersBefore } = unitState(u, laterTaught);
    counts[state] += 1;
    return { ...u, state, papersBefore, laterTaught };
  });
  return { units: out, counts };
}
