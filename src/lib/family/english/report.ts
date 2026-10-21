import { addDays, daysBetween } from './progress';
import type { AssessmentRow, CourseUnit, DoneRow } from './store';

// The parent's progress report (docs/family-app/12 §8, C274), from the child's own rows: lessons by week against the
// goal, the check scores' trend, words learned and still learning, the can-do statements reached, voice practice
// minutes, and the day-0, day-45 and day-90 results side by side. No ranks and no comparison with other children.

export type ReportWeek = { from: string; lessons: number; meanScore: number | null; voiceMinutes: number };
export type Report = {
  weeks: ReportWeek[];
  totals: { lessons: number; units: number; wordsLearned: number; wordsLearning: number; itemsLearned: number; voiceMinutes: number };
  canDos: { unitKey: string; en: string; hi: string; on: string }[];
  assessments: AssessmentRow[];
  thisWeek: { done: number; goal: number };
};

export function buildReport(input: {
  startedOn: string;
  today: string;
  weeklyGoal: number;
  done: DoneRow[];
  reviews: { kind: 'word' | 'item'; learnedOn: string | null }[];
  days: { day: string; voiceSeconds: number }[];
  units: CourseUnit[];
  results: AssessmentRow[];
  maxWeeks?: number;
}): Report {
  const maxWeeks = input.maxWeeks ?? 13;
  const span = Math.max(1, Math.min(maxWeeks, Math.floor(daysBetween(input.startedOn, input.today) / 7) + 1));
  const first = addDays(input.today, -(7 * span - 1));
  const weeks: ReportWeek[] = Array.from({ length: span }, (_, i) => ({ from: addDays(first, 7 * i), lessons: 0, meanScore: null, voiceMinutes: 0 }));
  const weekOf = (day: string) => Math.floor(daysBetween(first, day) / 7);
  const scores: number[][] = weeks.map(() => []);
  for (const d of input.done) {
    if (!d.doneOn) continue;
    const w = weekOf(d.doneOn);
    if (w < 0 || w >= span) continue;
    weeks[w].lessons += 1;
    scores[w].push(d.bestScore);
  }
  weeks.forEach((w, i) => (w.meanScore = scores[i].length ? Math.round(scores[i].reduce((a, b) => a + b, 0) / scores[i].length) : null));
  let voiceSeconds = 0;
  for (const d of input.days) {
    voiceSeconds += d.voiceSeconds;
    const w = weekOf(d.day);
    if (w >= 0 && w < span) weeks[w].voiceMinutes += Math.round(d.voiceSeconds / 60);
  }
  const doneKeys = new Map(input.done.filter((d) => d.doneOn).map((d) => [d.key, d.doneOn as string]));
  const canDos = input.units
    .filter((u) => doneKeys.has(`${u.key}.l5`))
    .map((u) => ({ unitKey: u.key, en: u.canDoEn, hi: u.canDoHi, on: doneKeys.get(`${u.key}.l5`) as string }));
  const weekFrom = addDays(input.today, -6);
  return {
    weeks,
    totals: {
      lessons: doneKeys.size,
      units: canDos.length,
      wordsLearned: input.reviews.filter((r) => r.kind === 'word' && r.learnedOn).length,
      wordsLearning: input.reviews.filter((r) => r.kind === 'word' && !r.learnedOn).length,
      itemsLearned: input.reviews.filter((r) => r.kind === 'item' && r.learnedOn).length,
      voiceMinutes: Math.round(voiceSeconds / 60),
    },
    canDos,
    assessments: input.results,
    thisWeek: { done: [...doneKeys.values()].filter((d) => d >= weekFrom).length, goal: input.weeklyGoal },
  };
}
