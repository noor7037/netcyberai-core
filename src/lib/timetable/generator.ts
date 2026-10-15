import { MAX_PERIODS, type Slot } from './plan';

// The timetable generator (docs/28 slice 10f, C229): rules only, no database and no session, so the server and the
// screens read the same file. No language model and no randomness: the same constraints always give the same week.
//
// What it is given (the school's constraints, as src/lib/timetable/generator-store.ts reads them):
//   - the days the school works and its periods a day;
//   - the most periods in a row one teacher teaches (a setting of the module);
//   - for each class, the periods each subject needs in the week and the teacher who teaches it (a "load");
//   - the periods each teacher cannot teach (a whole day, or one period of a day);
//   - the periods of the classes it does not plan, kept as they are ("fixed"): their teachers are busy then.
//
// What it promises, for every week it proposes:
//   - no teacher in two places at once, and no class with two subjects in one period;
//   - no teacher in a period they cannot teach, and no teacher over the limit of periods in a row;
//   - each load's periods met, or the load listed as not placed in full, with how many were placed and why.
//     Never a silent partial: what is not placed is always in `unplaced`.
//
// How: one lesson at a time, the load with the least room left first (the fewest periods where its class and its
// teacher are both free, for the periods it still needs). A lesson goes where its subject is not yet taught that
// day if it can, then where its teacher has the lightest day. When a load has no room left, lessons already placed
// are moved out of its way, two steps deep at most, within a fixed number of tries. Every choice is taken in a fixed
// order (classes, subjects and teachers by id, days and periods in order), so nothing depends on chance.

export type Load = { classId: string; subjectId: string; teacherUserId: string | null; periods: number };
export type Unavailable = { teacherUserId: string; weekday: number; period: number | null };
export type GeneratorInput = {
  days: readonly number[];
  periods: number;
  maxConsecutive: number;
  loads: readonly Load[];
  unavailable: readonly Unavailable[];
  fixed: readonly Slot[];
};

// Why a load could not be placed in full, in the order they are tested:
//   no_teacher         the load names no active teacher;
//   class_week_full    the class's loads need more periods than its week has;
//   teacher_week_full  the teacher's loads need more periods than the teacher has free (their week, less the
//                      periods they cannot teach and the periods they keep in the classes not planned);
//   consecutive_limit  the only periods where the class and the teacher are both free would put the teacher over
//                      the limit of periods in a row;
//   no_common_period   no period is left where the class and the teacher are both free.
// And one the store gives before the generator runs (C231):
//   not_assigned       Setup assigns the class's subject to other teachers (teacher_subjects): the load is not given
//                      to the generator at all.
export const UNPLACED_REASONS = ['no_teacher', 'class_week_full', 'teacher_week_full', 'consecutive_limit', 'no_common_period', 'not_assigned'] as const;
export type UnplacedReason = (typeof UNPLACED_REASONS)[number];
export type Unplaced = { classId: string; subjectId: string; teacherUserId: string | null; wanted: number; placed: number; reason: UnplacedReason };
export type GeneratorResult = { entries: Slot[]; unplaced: Unplaced[] };

// How many tries moving placed lessons out of the way may take in all: a fixed number, so a hard week ends in the
// same place every time, and within a few seconds.
export const GENERATOR_TRIES = 400_000;
export const MAX_WEEK_PERIODS = 7 * MAX_PERIODS;

const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const validDay = (d: unknown): d is number => Number.isInteger(d) && (d as number) >= 1 && (d as number) <= 7;
const clampInt = (v: number, lo: number, hi: number) => (Number.isInteger(v) ? Math.min(hi, Math.max(lo, v)) : hi);

// The run of periods in a row that contains period `p`, for every day a teacher can have (one bit per period):
// RUN_AT[m * MAX_PERIODS + p], 0 when `p` is not in `m`. Only that run counts: a lesson never lengthens another run,
// so a longer run elsewhere in the day (periods kept in a class not planned) does not shut the rest of the day.
const RUN_AT = (() => {
  const t = new Uint8Array((1 << MAX_PERIODS) * MAX_PERIODS);
  for (let m = 1; m < 1 << MAX_PERIODS; m++)
    for (let p = 0; p < MAX_PERIODS; p++) {
      if (!(m & (1 << p))) continue;
      let lo = p;
      let hi = p;
      while (lo > 0 && m & (1 << (lo - 1))) lo -= 1;
      while (hi < MAX_PERIODS - 1 && m & (1 << (hi + 1))) hi += 1;
      t[m * MAX_PERIODS + p] = hi - lo + 1;
    }
  return t;
})();
const BITS = (() => {
  const t = new Uint8Array(1 << MAX_PERIODS);
  for (let m = 1; m < t.length; m++) t[m] = t[m >> 1] + (m & 1);
  return t;
})();

// The longest run of periods in a row that contains `period`, in a list of a teacher's periods of one day.
export function runThrough(periodsOfDay: readonly number[], period: number): number {
  const set = new Set(periodsOfDay);
  if (!set.has(period)) return 0;
  let lo = period;
  let hi = period;
  while (set.has(lo - 1)) lo -= 1;
  while (set.has(hi + 1)) hi += 1;
  return hi - lo + 1;
}

export function generateTimetable(input: GeneratorInput, tries: number = GENERATOR_TRIES): GeneratorResult {
  const days = [...new Set(input.days.filter(validDay))].sort((a, b) => a - b);
  const N = clampInt(input.periods, 1, MAX_PERIODS);
  const K = clampInt(input.maxConsecutive, 1, MAX_PERIODS);
  const D = days.length;
  const dayAt = new Map(days.map((d, i) => [d, i]));

  // One load per class and subject, in a fixed order.
  const seen = new Set<string>();
  const loads = input.loads
    .filter((l) => Number.isInteger(l.periods) && l.periods > 0)
    .slice()
    .sort((a, b) => byId(a.classId, b.classId) || byId(a.subjectId, b.subjectId))
    .filter((l) => {
      const key = `${l.classId}:${l.subjectId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const classIds = [...new Set(loads.map((l) => l.classId))].sort(byId);
  const planned = new Set(classIds);
  const teacherIds = [...new Set(loads.flatMap((l) => (l.teacherUserId ? [l.teacherUserId] : [])))].sort(byId);
  const ci = new Map(classIds.map((c, i) => [c, i]));
  const ti = new Map(teacherIds.map((t, i) => [t, i]));
  const C = classIds.length;
  const T = teacherIds.length;
  const G = loads.length;

  const gClass = Int32Array.from(loads, (l) => ci.get(l.classId)!);
  const gTeacher = Int32Array.from(loads, (l) => (l.teacherUserId ? ti.get(l.teacherUserId)! : -1));
  const gWant = Int32Array.from(loads, (l) => Math.min(l.periods, MAX_WEEK_PERIODS));
  const gPlaced = new Int32Array(G);
  const gDay = new Int32Array(G * Math.max(D, 1));

  const classMask = new Int32Array(C * D);
  const teacherMask = new Int32Array(T * D);
  const fixedMask = new Int32Array(T * D);
  const block = new Int32Array(T * D);
  const classAt = new Int32Array(C * D * N).fill(-1);
  const teacherAt = new Int32Array(T * D * N).fill(-1); // -2: a fixed period of a class not planned
  const FULL = (1 << N) - 1;

  for (const u of input.unavailable) {
    const t = ti.get(u.teacherUserId);
    const d = dayAt.get(u.weekday);
    if (t === undefined || d === undefined) continue;
    if (u.period === null) block[t * D + d] = FULL;
    else if (Number.isInteger(u.period) && u.period >= 1 && u.period <= N) block[t * D + d] |= 1 << (u.period - 1);
  }
  for (const f of input.fixed) {
    if (planned.has(f.classId)) continue; // a planned class's week is replaced
    const t = ti.get(f.teacherUserId);
    const d = dayAt.get(f.weekday);
    if (t === undefined || d === undefined || !(f.period >= 1 && f.period <= N)) continue;
    const b = 1 << (f.period - 1);
    teacherMask[t * D + d] |= b;
    fixedMask[t * D + d] |= b;
    teacherAt[(t * D + d) * N + f.period - 1] = -2;
  }

  // Every change is logged, so a try that fails is undone exactly.
  const log: number[] = [];
  const set = (g: number, d: number, p: number, on: boolean) => {
    const c = gClass[g];
    const t = gTeacher[g];
    const b = 1 << p;
    if (on) {
      classMask[c * D + d] |= b;
      teacherMask[t * D + d] |= b;
      classAt[(c * D + d) * N + p] = g;
      teacherAt[(t * D + d) * N + p] = g;
      gDay[g * D + d] += 1;
      gPlaced[g] += 1;
    } else {
      classMask[c * D + d] &= ~b;
      teacherMask[t * D + d] &= ~b;
      classAt[(c * D + d) * N + p] = -1;
      teacherAt[(t * D + d) * N + p] = -1;
      gDay[g * D + d] -= 1;
      gPlaced[g] -= 1;
    }
  };
  const place = (g: number, d: number, p: number) => {
    set(g, d, p, true);
    log.push(g, d, p, 1);
  };
  const unplace = (g: number, d: number, p: number) => {
    set(g, d, p, false);
    log.push(g, d, p, 0);
  };
  const rollback = (mark: number) => {
    while (log.length > mark) {
      const on = log.pop()!;
      const p = log.pop()!;
      const d = log.pop()!;
      const g = log.pop()!;
      set(g, d, p, on === 0);
    }
  };

  const feasible = (g: number, d: number, p: number) => {
    const b = 1 << p;
    if (classMask[gClass[g] * D + d] & b) return false;
    const i = gTeacher[g] * D + d;
    const tm = teacherMask[i];
    if (tm & b || block[i] & b) return false;
    return RUN_AT[(tm | b) * MAX_PERIODS + p] <= K;
  };
  const roomFor = (g: number) => {
    let n = 0;
    for (let d = 0; d < D; d++) for (let p = 0; p < N; p++) if (feasible(g, d, p)) n += 1;
    return n;
  };
  // Where a lesson goes: its subject not yet taught that day first, then the teacher's lightest day, then the
  // class's lightest day, then the shortest run for the teacher; then the first day and period.
  const bestSlot = (g: number): [number, number] | null => {
    let best: [number, number] | null = null;
    let bestScore = Infinity;
    const c = gClass[g];
    const t = gTeacher[g];
    for (let d = 0; d < D; d++) {
      const base = gDay[g * D + d] * 1000 + BITS[teacherMask[t * D + d]] * 8 + BITS[classMask[c * D + d]] * 2;
      for (let p = 0; p < N; p++) {
        if (!feasible(g, d, p)) continue;
        const score = base + RUN_AT[(teacherMask[t * D + d] | (1 << p)) * MAX_PERIODS + p];
        if (score < bestScore) {
          bestScore = score;
          best = [d, p];
        }
      }
    }
    return best;
  };

  let budget = Math.max(0, Math.floor(tries));
  // Make room for one more lesson of `g` by moving the lessons in its way (the class's lesson in that period, the
  // teacher's lesson in another class then) to other periods, `depth` steps deep. A lesson in `locked` stays put.
  const repair = (g: number, depth: number, locked: Set<number>): boolean => {
    const c = gClass[g];
    const t = gTeacher[g];
    const candidates: { d: number; p: number; blockers: number[][] }[] = [];
    for (let d = 0; d < D; d++) {
      for (let p = 0; p < N; p++) {
        if (block[t * D + d] & (1 << p)) continue;
        const tOwner = teacherAt[(t * D + d) * N + p];
        if (tOwner === -2) continue;
        const cOwner = classAt[(c * D + d) * N + p];
        const blockers: number[][] = [];
        if (cOwner >= 0) blockers.push([cOwner, d, p]);
        if (tOwner >= 0 && !(tOwner === cOwner)) blockers.push([tOwner, d, p]);
        if (blockers.length === 0) {
          // Free for both: only the limit of periods in a row is in the way (the run through `p`, as feasible()
          // counts it). Moving one of the teacher's lessons in that run (one that is not a fixed period) breaks it.
          const tm = teacherMask[t * D + d] | (1 << p);
          if (RUN_AT[tm * MAX_PERIODS + p] <= K) continue;
          let lo = p;
          let hi = p;
          while (lo > 0 && tm & (1 << (lo - 1))) lo -= 1;
          while (hi < N - 1 && tm & (1 << (hi + 1))) hi += 1;
          for (let q = lo; q <= hi; q++) {
            const owner = teacherAt[(t * D + d) * N + q];
            if (q === p || owner < 0 || locked.has((gClass[owner] * D + d) * N + q)) continue;
            candidates.push({ d, p, blockers: [[owner, d, q]] });
          }
          continue;
        }
        // In the way of itself: nothing to move.
        if (blockers.some(([bg]) => bg === g)) continue;
        if (blockers.some(([bg, bd, bp]) => locked.has((gClass[bg] * D + bd) * N + bp))) continue;
        candidates.push({ d, p, blockers });
      }
    }
    candidates.sort((a, b) => a.blockers.length - b.blockers.length);
    for (const { d, p, blockers } of candidates) {
      if (budget <= 0) return false;
      budget -= 1;
      const mark = log.length;
      for (const [bg, bd, bp] of blockers) unplace(bg, bd, bp);
      if (!feasible(g, d, p)) {
        rollback(mark);
        continue;
      }
      place(g, d, p);
      const key = (c * D + d) * N + p;
      locked.add(key);
      let ok = true;
      for (const [bg] of blockers) {
        const s = bestSlot(bg);
        if (s) place(bg, s[0], s[1]);
        else if (!(depth > 1 && repair(bg, depth - 1, locked))) {
          ok = false;
          break;
        }
      }
      locked.delete(key);
      if (ok) return true;
      rollback(mark);
    }
    return false;
  };

  // Make room for one more lesson of `g` by a chain of swaps between two periods: `a`, free in its class, and `b`,
  // free for its teacher. The teacher's lesson in `a` moves to `b`; the lesson its class has in `b` moves to `a`;
  // that lesson's teacher's lesson in `a` moves to `b`, and so on to the end of the chain. Every class and teacher
  // on the chain still has one lesson in each of the two periods, and the teacher of `g` is now free in `a`. A chain
  // through a fixed period, or that would put a teacher in a period they cannot teach or over the limit of periods
  // in a row, is undone.
  const chainSwap = (g: number): boolean => {
    const c = gClass[g];
    const t = gTeacher[g];
    const aSlots: number[] = [];
    const bSlots: number[] = [];
    for (let d = 0; d < D; d++)
      for (let p = 0; p < N; p++) {
        const b = 1 << p;
        if (block[t * D + d] & b) continue;
        if (!(classMask[c * D + d] & b) && teacherAt[(t * D + d) * N + p] >= 0) aSlots.push(d * N + p);
        if (!(teacherMask[t * D + d] & b) && classAt[(c * D + d) * N + p] >= 0) bSlots.push(d * N + p);
      }
    for (const a of aSlots) {
      for (const b of bSlots) {
        if (budget <= 0) return false;
        budget -= 1;
        const [ad, ap, bd, bp] = [Math.floor(a / N), a % N, Math.floor(b / N), b % N];
        // Walk the chain: teacher --a--> class --b--> teacher --a--> class ...
        const chain: number[][] = [];
        let teacher = t;
        let broken = false;
        for (let guard = 0; guard <= C + T; guard++) {
          const ga = teacherAt[(teacher * D + ad) * N + ap];
          if (ga === -2) broken = true;
          if (ga < 0) break;
          chain.push([ga, ad, ap, bd, bp]);
          const cls = gClass[ga];
          const gb = classAt[(cls * D + bd) * N + bp];
          if (gb < 0) break;
          chain.push([gb, bd, bp, ad, ap]);
          teacher = gTeacher[gb];
        }
        if (broken || chain.length === 0) continue;
        const mark = log.length;
        for (const [x, d, p] of chain) unplace(x, d, p);
        let ok = true;
        for (const [x, , , nd, np] of chain) {
          if (!feasible(x, nd, np)) {
            ok = false;
            break;
          }
          place(x, nd, np);
        }
        if (ok && feasible(g, ad, ap)) {
          place(g, ad, ap);
          return true;
        }
        rollback(mark);
      }
    }
    return false;
  };

  const left = (g: number) => gWant[g] - gPlaced[g];
  if (D > 0) {
    const stuck = new Uint8Array(G);
    for (;;) {
      let pick = -1;
      let pickSlack = Infinity;
      let pickRoom = 0;
      for (let g = 0; g < G; g++) {
        if (gTeacher[g] < 0 || stuck[g] || left(g) <= 0) continue;
        const room = roomFor(g);
        const slack = room - left(g);
        if (slack < pickSlack || (slack === pickSlack && left(g) > left(pick))) {
          pick = g;
          pickSlack = slack;
          pickRoom = room;
        }
      }
      if (pick < 0) break;
      if (pickRoom === 0) {
        if (!chainSwap(pick) && !repair(pick, 2, new Set())) stuck[pick] = 1;
        continue;
      }
      const s = bestSlot(pick)!;
      place(pick, s[0], s[1]);
    }
    // Deeper tries for what is still not placed, in order, while they place something. A lesson that fits is always
    // placed; moving others out of the way stops when the tries are used up. So a load left short has no period
    // that fits it, and the reason below is exact.
    for (let progress = true; progress; ) {
      progress = false;
      for (let g = 0; g < G; g++) {
        while (gTeacher[g] >= 0 && left(g) > 0) {
          const s = bestSlot(g);
          if (s) place(g, s[0], s[1]);
          else if (!chainSwap(g) && !repair(g, 3, new Set())) break;
          progress = true;
        }
      }
    }
  }

  const entries: Slot[] = [];
  for (let c = 0; c < C; c++)
    for (let d = 0; d < D; d++)
      for (let p = 0; p < N; p++) {
        const g = classAt[(c * D + d) * N + p];
        if (g >= 0) entries.push({ classId: classIds[c], weekday: days[d], period: p + 1, subjectId: loads[g].subjectId, teacherUserId: teacherIds[gTeacher[g]] });
      }

  // Why, for each load not placed in full: tested in the order of UNPLACED_REASONS.
  const classWant = new Int32Array(C);
  const teacherWant = new Int32Array(T);
  for (let g = 0; g < G; g++) {
    classWant[gClass[g]] += gWant[g];
    if (gTeacher[g] >= 0) teacherWant[gTeacher[g]] += gWant[g];
  }
  const teacherOpen = (t: number) => {
    let n = 0;
    for (let d = 0; d < D; d++) n += N - BITS[(block[t * D + d] | fixedMask[t * D + d]) & FULL];
    return n;
  };
  const reasonFor = (g: number): UnplacedReason => {
    const c = gClass[g];
    const t = gTeacher[g];
    if (t < 0) return 'no_teacher';
    if (classWant[c] > D * N) return 'class_week_full';
    if (teacherWant[t] > teacherOpen(t)) return 'teacher_week_full';
    for (let d = 0; d < D; d++)
      for (let p = 0; p < N; p++) {
        const b = 1 << p;
        if (!(classMask[c * D + d] & b) && !(teacherMask[t * D + d] & b) && !(block[t * D + d] & b)) return 'consecutive_limit';
      }
    return 'no_common_period';
  };
  const unplaced: Unplaced[] = [];
  for (let g = 0; g < G; g++)
    if (left(g) > 0) unplaced.push({ classId: loads[g].classId, subjectId: loads[g].subjectId, teacherUserId: loads[g].teacherUserId, wanted: gWant[g], placed: gPlaced[g], reason: reasonFor(g) });
  return { entries, unplaced };
}

// ---- Checking a week, a swap, and what changes ---------------------------------------------------------------

export type WeekRules = { days: readonly number[]; periods: number; maxConsecutive: number; unavailable: readonly Unavailable[]; fixed: readonly Slot[] };
export type WeekProblem = { code: 'outside_week' | 'class_clash' | 'teacher_clash' | 'unavailable' | 'consecutive_limit'; slot: Slot; with?: Slot };

const cannotTeach = (rules: WeekRules, s: { teacherUserId: string; weekday: number; period: number }) =>
  rules.unavailable.some((u) => u.teacherUserId === s.teacherUserId && u.weekday === s.weekday && (u.period === null || u.period === s.period));
const inWeek = (rules: WeekRules, s: { weekday: number; period: number }) => rules.days.includes(s.weekday) && Number.isInteger(s.period) && s.period >= 1 && s.period <= rules.periods;
// The periods kept in the classes not planned, as the generator counts them: only those inside the school's week. A
// period past the periods a day (left from before the setting was lowered) or on a day the school does not work is
// not taught, so it neither clashes nor makes a run (review of C229).
const keptInWeek = (rules: WeekRules, planned: ReadonlySet<string>) => rules.fixed.filter((f) => !planned.has(f.classId) && inWeek(rules, f));

// Every way a proposed week (with the periods kept as they are) breaks a rule. The generator's own weeks have none;
// a test holds that, and publishing asks it again of a week a person has changed.
export function weekProblems(entries: readonly Slot[], rules: WeekRules): WeekProblem[] {
  const problems: WeekProblem[] = [];
  const planned = new Set(entries.map((e) => e.classId));
  const all = [...entries, ...keptInWeek(rules, planned)];
  const classSlot = new Map<string, Slot>();
  const teacherSlot = new Map<string, Slot>();
  for (const e of entries) {
    if (!inWeek(rules, e)) problems.push({ code: 'outside_week', slot: e });
    const ck = `${e.classId}:${e.weekday}:${e.period}`;
    const other = classSlot.get(ck);
    if (other) problems.push({ code: 'class_clash', slot: e, with: other });
    else classSlot.set(ck, e);
    if (cannotTeach(rules, e)) problems.push({ code: 'unavailable', slot: e });
  }
  for (const e of all) {
    const tk = `${e.teacherUserId}:${e.weekday}:${e.period}`;
    const other = teacherSlot.get(tk);
    if (other && planned.has(e.classId)) problems.push({ code: 'teacher_clash', slot: e, with: other });
    else if (other && planned.has(other.classId)) problems.push({ code: 'teacher_clash', slot: other, with: e });
    else if (!other) teacherSlot.set(tk, e);
  }
  const byTeacherDay = new Map<string, number[]>();
  for (const e of all) {
    const k = `${e.teacherUserId}:${e.weekday}`;
    byTeacherDay.set(k, [...(byTeacherDay.get(k) ?? []), e.period]);
  }
  for (const e of entries) {
    const day = byTeacherDay.get(`${e.teacherUserId}:${e.weekday}`) ?? [];
    if (runThrough(day, e.period) > rules.maxConsecutive) problems.push({ code: 'consecutive_limit', slot: e });
  }
  return problems;
}

export type SwapResult = { ok: true; entries: Slot[] } | { ok: false; reason: 'outside_week' | 'same_slot' | 'nothing_to_move' | 'teacher_clash' | 'unavailable' | 'consecutive_limit'; with?: Slot };
type At = { weekday: number; period: number };

// A person swaps two periods of one class in a proposed week (either may be free: then it is a move). Refused when
// either lesson, in its new period, would break a rule: its teacher teaching elsewhere then, unable to teach then,
// or over the limit of periods in a row. The rules are the school's as they are now.
export function swapInWeek(entries: readonly Slot[], classId: string, a: At, b: At, rules: WeekRules): SwapResult {
  if (!inWeek(rules, a) || !inWeek(rules, b)) return { ok: false, reason: 'outside_week' };
  if (a.weekday === b.weekday && a.period === b.period) return { ok: false, reason: 'same_slot' };
  const here = (s: At) => entries.find((e) => e.classId === classId && e.weekday === s.weekday && e.period === s.period) ?? null;
  const atA = here(a);
  const atB = here(b);
  if (!atA && !atB) return { ok: false, reason: 'nothing_to_move' };
  const moved: Slot[] = [];
  if (atA) moved.push({ ...atA, weekday: b.weekday, period: b.period });
  if (atB) moved.push({ ...atB, weekday: a.weekday, period: a.period });
  const next = [...entries.filter((e) => e !== atA && e !== atB), ...moved].sort((x, y) => byId(x.classId, y.classId) || x.weekday - y.weekday || x.period - y.period);
  const planned = new Set(next.map((e) => e.classId));
  const all = [...next, ...keptInWeek(rules, planned)];
  for (const m of moved) {
    // The class has one lesson a period after the swap, so another lesson of the teacher then is in another class.
    const clash = all.find((e) => e !== m && e.teacherUserId === m.teacherUserId && e.weekday === m.weekday && e.period === m.period);
    if (clash) return { ok: false, reason: 'teacher_clash', with: clash };
    if (cannotTeach(rules, m)) return { ok: false, reason: 'unavailable' };
    const day = all.filter((e) => e.teacherUserId === m.teacherUserId && e.weekday === m.weekday).map((e) => e.period);
    if (runThrough(day, m.period) > rules.maxConsecutive) return { ok: false, reason: 'consecutive_limit' };
  }
  return { ok: true, entries: next };
}

export type Change = { classId: string; weekday: number; period: number; kind: 'added' | 'removed' | 'changed'; before: Slot | null; after: Slot | null };

// What a proposed week changes in the classes it plans: a period filled that was free, a period emptied, or a
// period whose subject or teacher is different. A period the same before and after is not a change.
export function diffWeeks(before: readonly Slot[], after: readonly Slot[], classIds: Iterable<string>): Change[] {
  const planned = new Set(classIds);
  const key = (s: Slot) => `${s.classId}:${s.weekday}:${s.period}`;
  const was = new Map(before.filter((s) => planned.has(s.classId)).map((s) => [key(s), s]));
  const now = new Map(after.filter((s) => planned.has(s.classId)).map((s) => [key(s), s]));
  const changes: Change[] = [];
  for (const k of new Set([...was.keys(), ...now.keys()])) {
    const b = was.get(k) ?? null;
    const a = now.get(k) ?? null;
    const at = (a ?? b)!;
    if (b && a && b.subjectId === a.subjectId && b.teacherUserId === a.teacherUserId) continue;
    changes.push({ classId: at.classId, weekday: at.weekday, period: at.period, kind: !b ? 'added' : !a ? 'removed' : 'changed', before: b, after: a });
  }
  return changes.sort((x, y) => byId(x.classId, y.classId) || x.weekday - y.weekday || x.period - y.period);
}
