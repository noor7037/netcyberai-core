import type { Assessment, AssessmentKind, CheckItem, Lesson, LessonKind, Track, Word } from './course';
import { lessonOfItem, nextReview, wordReviewItem, type ReviewRow } from './progress';

// The English course's reads and writes (docs/family-app/12, C274), on the family's own transaction (family_app role:
// the course versions families may read are only those published to everyone, and progress rows are the account's
// own, enforced by the database's policies).

type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

export async function settingNumber(db: Db, key: string, fallback: number): Promise<number> {
  const { rows } = await db.query(`select value from control.settings where key = $1`, [key]);
  const v = Number(rows[0]?.value);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}

// ---- the course (content) ----

export async function publishedVersion(db: Db, track: Track): Promise<string | null> {
  const { rows } = await db.query(`select version_id from content.english_versions where track = $1 and status = 'published' and audience = 'everyone'`, [track]);
  return rows[0] ? String(rows[0].version_id) : null;
}

export type CourseLesson = { key: string; position: number; kind: LessonKind; titleEn: string; titleHi: string; minutes: number };
export type CourseUnit = { key: string; position: number; titleEn: string; titleHi: string; canDoEn: string; canDoHi: string; pic: string; lessons: CourseLesson[] };

export async function courseUnits(db: Db, versionId: string): Promise<CourseUnit[]> {
  const units = await db.query(
    `select unit_key, position, title_en, title_hi, can_do_en, can_do_hi, pic from content.english_units where version_id = $1 order by position`,
    [versionId]
  );
  const lessons = await db.query(
    `select lesson_key, unit_key, position, kind, title_en, title_hi, minutes from content.english_lessons where version_id = $1 order by unit_key, position`,
    [versionId]
  );
  return units.rows.map((u) => ({
    key: String(u.unit_key),
    position: Number(u.position),
    titleEn: String(u.title_en),
    titleHi: String(u.title_hi),
    canDoEn: String(u.can_do_en),
    canDoHi: String(u.can_do_hi),
    pic: String(u.pic),
    lessons: lessons.rows
      .filter((l) => l.unit_key === u.unit_key)
      .map((l) => ({ key: String(l.lesson_key), position: Number(l.position), kind: l.kind as LessonKind, titleEn: String(l.title_en), titleHi: String(l.title_hi), minutes: Number(l.minutes) })),
  }));
}

export async function lessonBodies(db: Db, versionId: string, keys: string[]): Promise<Map<string, Lesson>> {
  if (keys.length === 0) return new Map();
  const { rows } = await db.query(`select lesson_key, body from content.english_lessons where version_id = $1 and lesson_key = any($2::text[])`, [versionId, keys]);
  return new Map(rows.map((r) => [String(r.lesson_key), r.body as Lesson]));
}

export async function assessmentBody(db: Db, versionId: string, kind: AssessmentKind): Promise<Assessment | null> {
  const { rows } = await db.query(`select body from content.english_assessments where version_id = $1 and kind = $2`, [versionId, kind]);
  return (rows[0]?.body as Assessment) ?? null;
}

// The words a lesson teaches, from its Words steps.
export const lessonWords = (l: Lesson): Word[] => l.steps.flatMap((s) => (s.type === 'words' ? s.words : []));

// A review item by its key: a word (asked as "tap its picture", options fixed by the day) or a check item.
export function reviewItem(lesson: Lesson, itemKey: string, day: string): CheckItem | null {
  const words = lessonWords(lesson);
  const word = words.find((w) => w.key === itemKey);
  if (word) return wordReviewItem(word, words, day);
  return lesson.check.find((c) => c.key === itemKey) ?? null;
}
export const isWordOf = (lesson: Lesson, itemKey: string) => lessonWords(lesson).some((w) => w.key === itemKey);

// ---- the child's progress (family) ----

export type Enrolment = { track: Track; trackChanged: boolean; placedUnit: number; weeklyGoal: number; startedOn: string };

export async function readEnrolment(db: Db, childId: string): Promise<Enrolment | null> {
  const { rows } = await db.query(`select track, track_changed, placed_unit, weekly_goal, started_on::text as started_on from family.english_enrolments where child_id = $1`, [childId]);
  const r = rows[0];
  if (!r) return null;
  return { track: r.track as Track, trackChanged: r.track_changed === true, placedUnit: Number(r.placed_unit), weeklyGoal: Number(r.weekly_goal), startedOn: String(r.started_on).slice(0, 10) };
}

export async function enrol(db: Db, accountId: string, childId: string, track: Track, today: string): Promise<void> {
  await db.query(
    `insert into family.english_enrolments (account_id, child_id, track, started_on) values ($1, $2, $3, $4) on conflict (child_id) do nothing`,
    [accountId, childId, track, today]
  );
}

export async function updateEnrolment(db: Db, childId: string, change: { track?: Track; weeklyGoal?: number; placedUnit?: number }): Promise<void> {
  if (change.track) await db.query(`update family.english_enrolments set track = $2, track_changed = true, placed_unit = 1, updated_at = now() where child_id = $1`, [childId, change.track]);
  if (change.weeklyGoal) await db.query(`update family.english_enrolments set weekly_goal = $2, updated_at = now() where child_id = $1`, [childId, change.weeklyGoal]);
  if (change.placedUnit) await db.query(`update family.english_enrolments set placed_unit = $2, updated_at = now() where child_id = $1`, [childId, change.placedUnit]);
}

export type DoneRow = { key: string; stars: number; bestScore: number; tries: number; doneOn: string | null; lastOn: string };
export async function lessonsDone(db: Db, childId: string, track: Track): Promise<Map<string, DoneRow>> {
  const { rows } = await db.query(
    `select lesson_key, stars, best_score, tries, done_on::text as done_on, last_on::text as last_on from family.english_lessons_done where child_id = $1 and lesson_key like $2`,
    [childId, `${track}.%`]
  );
  return new Map(
    rows.map((r) => [
      String(r.lesson_key),
      { key: String(r.lesson_key), stars: Number(r.stars), bestScore: Number(r.best_score), tries: Number(r.tries), doneOn: r.done_on ? String(r.done_on).slice(0, 10) : null, lastOn: String(r.last_on).slice(0, 10) },
    ])
  );
}
export const doneSet = (m: Map<string, DoneRow>) => new Set([...m.values()].filter((r) => r.stars > 0).map((r) => r.key));

export async function newLessonsOn(db: Db, childId: string, day: string): Promise<number> {
  const { rows } = await db.query(`select new_lessons from family.english_days where child_id = $1 and day = $2::date`, [childId, day]);
  return Number(rows[0]?.new_lessons ?? 0);
}

// One try of a lesson: the best score and stars are kept; the day it was first done is set once. Returns whether this
// try is the one that made it done (it then counts against the day's new lessons) and the try's number.
export async function recordTry(
  db: Db,
  accountId: string,
  childId: string,
  key: string,
  score: number,
  starsFor: (tryNo: number) => number,
  today: string
): Promise<{ newlyDone: boolean; tryNo: number; stars: number }> {
  const prev = await db.query(`select tries, done_on::text as done_on from family.english_lessons_done where child_id = $1 and lesson_key = $2`, [childId, key]);
  const wasDone = Boolean(prev.rows[0]?.done_on);
  const tryNo = Number(prev.rows[0]?.tries ?? 0) + 1;
  const stars = starsFor(tryNo);
  await db.query(
    `insert into family.english_lessons_done (account_id, child_id, lesson_key, tries, best_score, stars, done_on, last_on)
     values ($1, $2, $3, 1, $4::smallint, $5::smallint, case when $5::smallint > 0 then $6::date end, $6::date)
     on conflict (child_id, lesson_key) do update set
       tries = family.english_lessons_done.tries + 1,
       best_score = greatest(family.english_lessons_done.best_score, excluded.best_score),
       stars = greatest(family.english_lessons_done.stars, excluded.stars),
       done_on = coalesce(family.english_lessons_done.done_on, excluded.done_on),
       last_on = excluded.last_on`,
    [accountId, childId, key, score, stars, today]
  );
  return { newlyDone: stars > 0 && !wasDone, tryNo, stars };
}

export async function countNewLesson(db: Db, accountId: string, childId: string, today: string): Promise<void> {
  await db.query(
    `insert into family.english_days (account_id, child_id, day, new_lessons) values ($1, $2, $3, 1)
     on conflict (child_id, day) do update set new_lessons = family.english_days.new_lessons + 1`,
    [accountId, childId, today]
  );
}

export async function reviewRows(db: Db, childId: string, keys: string[]): Promise<Map<string, ReviewRow>> {
  if (keys.length === 0) return new Map();
  const { rows } = await db.query(
    `select item_key, box, due_on::text as due_on, first_right_on::text as first_right_on, last_right_on::text as last_right_on, learned_on::text as learned_on, misses from family.english_reviews where child_id = $1 and item_key = any($2::text[])`,
    [childId, keys]
  );
  const day = (v: unknown) => (v ? String(v).slice(0, 10) : null);
  return new Map(
    rows.map((r) => [
      String(r.item_key),
      { box: Number(r.box), due_on: String(r.due_on).slice(0, 10), first_right_on: day(r.first_right_on), last_right_on: day(r.last_right_on), learned_on: day(r.learned_on), misses: Number(r.misses) },
    ])
  );
}

export async function dueReviewKeys(db: Db, childId: string, track: Track, today: string, max = 3): Promise<string[]> {
  const { rows } = await db.query(
    `select item_key from family.english_reviews where child_id = $1 and item_key like $2 and due_on <= $3 order by due_on, item_key limit $4`,
    [childId, `${track}.%`, today, max]
  );
  return rows.map((r) => String(r.item_key));
}

export async function writeReview(db: Db, accountId: string, childId: string, key: string, kind: 'word' | 'item', r: ReviewRow): Promise<void> {
  await db.query(
    `insert into family.english_reviews (account_id, child_id, item_key, kind, box, due_on, first_right_on, last_right_on, learned_on, misses)
     values ($1, $2, $3, $10, $4, $5, $6, $7, $8, $9)
     on conflict (child_id, item_key) do update set box = excluded.box, due_on = excluded.due_on, first_right_on = excluded.first_right_on,
       last_right_on = excluded.last_right_on, learned_on = excluded.learned_on, misses = excluded.misses`,
    [accountId, childId, key, r.box, r.due_on, r.first_right_on, r.last_right_on, r.learned_on, r.misses, kind]
  );
}

// Results of answered items move their review boxes; new words of a done lesson enter box 0, due tomorrow.
// `wordKeys`: which of the keys are words (the rest are check items).
export async function applyReviews(
  db: Db,
  accountId: string,
  childId: string,
  results: { key: string; correct: boolean }[],
  newWords: string[],
  wordKeys: ReadonlySet<string>,
  today: string
): Promise<void> {
  const keys = [...new Set([...results.map((r) => r.key), ...newWords])];
  const prev = await reviewRows(db, childId, keys);
  const kind = (k: string) => (wordKeys.has(k) ? 'word' : 'item');
  for (const r of results) await writeReview(db, accountId, childId, r.key, kind(r.key), nextReview(prev.get(r.key) ?? null, r.correct, today));
  for (const w of newWords) {
    if (!prev.has(w) && !results.some((r) => r.key === w)) await writeReview(db, accountId, childId, w, 'word', { ...nextReview(null, false, today), misses: 0 });
  }
}

export type AssessmentRow = { kind: AssessmentKind; takenOn: string; listening: number | null; words: number | null; grammar: number | null; reading: number | null; speaking: number | null; total: number };
export async function assessmentResults(db: Db, childId: string): Promise<AssessmentRow[]> {
  const { rows } = await db.query(
    `select kind, taken_on::text as taken_on, listening, words, grammar, reading, speaking, total from family.english_assessment_results where child_id = $1 order by kind`,
    [childId]
  );
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return rows.map((r) => ({ kind: r.kind as AssessmentKind, takenOn: String(r.taken_on).slice(0, 10), listening: n(r.listening), words: n(r.words), grammar: n(r.grammar), reading: n(r.reading), speaking: n(r.speaking), total: Number(r.total) }));
}

export async function writeAssessment(db: Db, accountId: string, childId: string, row: AssessmentRow): Promise<void> {
  await db.query(
    `insert into family.english_assessment_results (account_id, child_id, kind, taken_on, listening, words, grammar, reading, speaking, total)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     on conflict (child_id, kind) do update set taken_on = excluded.taken_on, listening = excluded.listening, words = excluded.words,
       grammar = excluded.grammar, reading = excluded.reading, speaking = excluded.speaking, total = excluded.total`,
    [accountId, childId, row.kind, row.takenOn, row.listening, row.words, row.grammar, row.reading, row.speaking, row.total]
  );
}
