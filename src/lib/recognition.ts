/**
 * NetCyberAI — Recognition Engine
 *
 * Fixes a real bug in the original Constitution's formula:
 *   improvement_score = (new - old) / (100 - old)   ["headroom normalization"]
 *
 * That formula rewards the ALREADY-STRONGEST student, the opposite of its
 * stated purpose. Proof with the Constitution's own numbers:
 *   85 -> 90 :  (90-85)/(100-85) =  5/15 = 33.3%
 *   40 -> 55 :  (55-40)/(100-40) = 15/60 = 25.0%
 * The small, already-high-scoring gain beats the large turnaround. As the
 * baseline approaches 100, the denominator shrinks toward zero and even a
 * 1-point gain scores near-infinite — the formula degenerates exactly
 * where it should be most conservative.
 *
 * Replacement: two separate mechanisms, not one formula.
 *   1. Personal Best  — threshold-based, non-competitive, primary tier.
 *      No ranking. Any student clearing a noise floor gets recognised.
 *      This is what actually delivers "60-70% of parents get a positive
 *      message" — a promise no ranking formula can keep, since ranking
 *      is zero-sum by construction.
 *   2. Most Improved   — competitive, secondary/opt-in tier. Uses
 *      logit-delta (symmetric at both ends of the scale, unlike raw
 *      delta which favours low baselines or headroom which favours
 *      high ones) WITHIN baseline quartile bands, so a 40%-baseline
 *      student is only ever compared to peers who started near 40%.
 */

export interface AssessmentPoint {
  studentId: string;
  classId: string;
  /** 0-100 scale. Marks, attendance %, or homework completion %. */
  score: number;
  attendanceInWindow: number; // 0-1, used as a sample-size/reliability guard
  assessmentCount: number;    // number of graded events in this window
}

export interface RecognitionInput {
  fortnightId: string;
  current: AssessmentPoint[];
  baseline: AssessmentPoint[]; // previous fortnight, same students
}

export interface RecognitionEvent {
  studentId: string;
  type: 'personal_best' | 'most_improved';
  score: number; // logit-delta or raw improvement, kept for audit
  band?: number; // baseline quartile, for most_improved only
}

const PERSONAL_BEST_THRESHOLD = 0.05; // 5 percentage points, matches original brief
const MIN_ASSESSMENTS = 2;
const MIN_ATTENDANCE = 0.6; // exclude students whose "delta" is really an absence artefact

function clamp01(p: number): number {
  return Math.min(0.999, Math.max(0.001, p));
}

/** Symmetric at both ends of the 0-100 scale — the standard fix for the
 *  headroom formula's blow-up near the ceiling and raw-delta's bias
 *  toward low baselines. */
export function logitDelta(oldScore: number, newScore: number): number {
  const logit = (p: number) => Math.log(p / (1 - p));
  return logit(clamp01(newScore / 100)) - logit(clamp01(oldScore / 100));
}

/** @deprecated Kept only to demonstrate the bug — do not call in production. */
export function headroomScoreDeprecated(newScore: number, oldScore: number): number {
  return (newScore - oldScore) / (100 - oldScore);
}

function qualifies(point: AssessmentPoint): boolean {
  return point.assessmentCount >= MIN_ASSESSMENTS && point.attendanceInWindow >= MIN_ATTENDANCE;
}

function baselineBand(score: number): number {
  // Quartile bands: 0-25, 25-50, 50-75, 75-100
  return Math.min(3, Math.floor(score / 25));
}

export function computeRecognition(input: RecognitionInput): RecognitionEvent[] {
  const baselineMap = new Map(input.baseline.map((b) => [b.studentId, b]));
  const events: RecognitionEvent[] = [];

  const mostImprovedCandidates: (RecognitionEvent & { classId: string })[] = [];

  for (const cur of input.current) {
    const base = baselineMap.get(cur.studentId);
    if (!base || !qualifies(cur) || !qualifies(base)) continue;

    const rawDelta = (cur.score - base.score) / 100;

    // Tier 1: Personal Best — non-competitive, every qualifying student gets it.
    if (rawDelta >= PERSONAL_BEST_THRESHOLD) {
      events.push({ studentId: cur.studentId, type: 'personal_best', score: rawDelta });
    }

    // Tier 2 candidate pool: Most Improved, banded by baseline quartile.
    const delta = logitDelta(base.score, cur.score);
    if (delta > 0) {
      mostImprovedCandidates.push({
        studentId: cur.studentId,
        classId: cur.classId,
        type: 'most_improved',
        score: delta,
        band: baselineBand(base.score),
      });
    }
  }

  // One Most Improved winner per class per baseline band — up to 4 per
  // class of 40, not a single class-wide "second topper" prize.
  const byClassBand = new Map<string, typeof mostImprovedCandidates>();
  for (const c of mostImprovedCandidates) {
    const key = `${c.classId}:${c.band}`;
    const arr = byClassBand.get(key) ?? [];
    arr.push(c);
    byClassBand.set(key, arr);
  }
  for (const arr of byClassBand.values()) {
    arr.sort((a, b) => b.score - a.score);
    if (arr[0]) events.push(arr[0]);
  }

  return events;
}
