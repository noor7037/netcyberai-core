import { LESSON_KINDS, UNITS_PER_TRACK, lessonKey, shuffleByKey, type CheckItem, type Track, type Word } from './course';

// The course's rules as pure functions (docs/family-app/12 §2, §3, §7): which track a class takes, which lessons are
// open, the review boxes, and where the day-0 check places a child. The routes call these; nothing here reads a table.

// Nursery, LKG and UKG (-2, -1, 0) take track A; Classes 1–3 B; 4–7 C; 8 and above D (12 §2).
export function trackForClass(classLevel: number): Track {
  if (classLevel <= 0) return 'a';
  if (classLevel <= 3) return 'b';
  if (classLevel <= 7) return 'c';
  return 'd';
}
const ORDER: readonly Track[] = ['a', 'b', 'c', 'd'];
// The parent may move a child one track down or up (12 §2).
export function tracksAllowed(classLevel: number): Track[] {
  const i = ORDER.indexOf(trackForClass(classLevel));
  return ORDER.filter((_, j) => Math.abs(j - i) <= 1);
}

// Every lesson of a track, in course order.
export function courseLessons(track: Track): string[] {
  const keys: string[] = [];
  for (let u = 1; u <= UNITS_PER_TRACK; u++) for (let l = 1; l <= LESSON_KINDS.length; l++) keys.push(lessonKey(track, u, l));
  return keys;
}
export const unitOf = (lessonKeyOrItem: string): number => Number(lessonKeyOrItem.split('.')[1].slice(1));
export const lessonOfItem = (itemKey: string): string => itemKey.split('.').slice(0, 3).join('.');

// done: open in order; placed: before the unit the day-0 check placed the child at, open and not needed; open: the next
// lesson; rest: the next lesson, but today's new lessons are used up; locked: later.
export type LessonState = 'done' | 'placed' | 'open' | 'rest' | 'locked';
export function lessonStates(track: Track, done: ReadonlySet<string>, placedUnit: number, newToday: number, perDay: number): Record<string, LessonState> {
  const states: Record<string, LessonState> = {};
  let nextFound = false;
  for (const key of courseLessons(track)) {
    if (done.has(key)) states[key] = 'done';
    else if (unitOf(key) < placedUnit) states[key] = 'placed';
    else if (!nextFound) {
      states[key] = newToday >= perDay ? 'rest' : 'open';
      nextFound = true;
    } else states[key] = 'locked';
  }
  return states;
}
// A lesson the child may open now: done and placed ones to revise, and the open one.
export const mayOpen = (s: LessonState | undefined) => s === 'done' || s === 'placed' || s === 'open';

// The assessments open after units 9 and 18's review lessons (or a placement beyond them); day 0 before anything is
// done. The next unit never waits for an assessment's result (12 §7).
export function assessmentOpen(track: Track, kind: 'day0' | 'day45' | 'day90', done: ReadonlySet<string>): boolean {
  if (kind === 'day0') return ![...done].some((k) => k.startsWith(`${track}.`));
  return done.has(lessonKey(track, kind === 'day45' ? 9 : 18, 5));
}

// The day-0 check places tracks B–D at unit 1, 4 or 7 (12 §2). Track A always starts at unit 1.
export function placedUnitFor(track: Track, total: number): 1 | 4 | 7 {
  if (track === 'a') return 1;
  if (total >= 80) return 7;
  if (total >= 60) return 4;
  return 1;
}

// ---- dates (India days, YYYY-MM-DD) ----
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

// ---- the review boxes (12 §7) ----
export const REVIEW_DAYS = [1, 3, 7, 21] as const;
export type ReviewRow = { box: number; due_on: string; first_right_on: string | null; last_right_on: string | null; learned_on: string | null; misses: number };

// After one answer on `today`: right moves the item up a box and out to its next day; a miss sends it back to box 0,
// due tomorrow. Learned when right again at least 7 days after it was first right.
export function nextReview(prev: ReviewRow | null, right: boolean, today: string): ReviewRow {
  const base: ReviewRow = prev ?? { box: 0, due_on: today, first_right_on: null, last_right_on: null, learned_on: null, misses: 0 };
  if (!right) return { ...base, box: 0, due_on: addDays(today, 1), misses: base.misses + 1 };
  const box = Math.min(base.box + 1, REVIEW_DAYS.length);
  const first = base.first_right_on ?? today;
  const learned = base.learned_on ?? (daysBetween(first, today) >= 7 ? today : null);
  return { box, due_on: addDays(today, REVIEW_DAYS[box - 1]), first_right_on: first, last_right_on: today, learned_on: learned, misses: base.misses };
}

// A word comes back as "listen and tap its picture", with two other pictures from its lesson. The options' order is
// fixed by the word and the day, so the server can score what the phone showed without keeping it.
export function wordReviewItem(word: Word, lessonWords: readonly Word[], day: string): CheckItem {
  const others = lessonWords.filter((w) => w.key !== word.key && w.pic !== word.pic).slice(0, 2);
  const options = shuffleByKey([word, ...others], `${word.key}@${day}`);
  return {
    key: word.key,
    type: 'choose',
    prompt: { en: 'Listen. Tap the picture.', hi: 'सुनो। चित्र पर टैप करो।', say: word.en },
    options: options.map((w) => ({ pic: w.pic })),
    answer: options.findIndex((w) => w.key === word.key),
  };
}

// The warm-up (12 §4): up to `max` items whose day has come, the oldest first.
export function dueItems(rows: { item_key: string; due_on: string }[], today: string, max = 3): string[] {
  return rows
    .filter((r) => r.due_on <= today)
    .sort((a, b) => (a.due_on === b.due_on ? a.item_key.localeCompare(b.item_key) : a.due_on.localeCompare(b.due_on)))
    .slice(0, max)
    .map((r) => r.item_key);
}

// ---- assessments ----
export type SkillScores = { listening: number | null; words: number | null; grammar: number | null; reading: number | null; speaking: number | null };
// The total is the mean of the skills the track has (speaking included when rated).
export function assessmentTotal(s: SkillScores): number {
  const xs = Object.values(s).filter((v): v is number => typeof v === 'number');
  return xs.length === 0 ? 0 : Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
}
// Speaking is rated 0–2 on each criterion (by the child, or the grown-up in track A) until voice feedback is measured.
export function speakingScore(ratings: number[], criteria: number): number | null {
  if (criteria === 0) return null;
  const sum = ratings.slice(0, criteria).reduce((a, r) => a + (Number.isInteger(r) && r >= 0 && r <= 2 ? r : 0), 0);
  return Math.round((100 * sum) / (2 * criteria));
}
