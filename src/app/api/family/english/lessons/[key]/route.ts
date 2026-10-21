import { NextRequest, NextResponse } from 'next/server';
import { TRACK_RULES, forChild, lessonForChild, lessonStars, scoreItems, type CheckItem } from '@/lib/family/english/course';
import { addDays, courseLessons, lessonOfItem, lessonStates, mayOpen } from '@/lib/family/english/progress';
import { englishError, withEnglish, type EnglishCtx } from '@/lib/family/english/request';
import {
  applyReviews,
  countNewLesson,
  doneSet,
  dueReviewKeys,
  isWordOf,
  lessonBodies,
  lessonWords,
  lessonsDone,
  newLessonsOn,
  recordTry,
  reviewItem,
  reviewRows,
} from '@/lib/family/english/store';
import { setting } from '@/lib/family/learning';
import { jsonBody } from '@/lib/family/request';

// One lesson (docs/family-app/12 §4, §7, C274).
// GET: the lesson as the phone may hold it (check items without answers) and up to three review items due today.
// POST { answers: { [itemKey]: choice | sentence }, warmup: { [itemKey]: … }, done: true }: scored here, never on the
// phone. The lesson is done at a score of 80 or more, PASS_SCORE (track A: the grown-up's "we did it", `done: true`); the review boxes move;
// the next lesson opens. A lesson opens only in order and within the day's new lessons.

const KEY = /^[a-d]\.u[0-9]{2}\.l[1-5]$/;

async function gate(ctx: EnglishCtx, key: string) {
  const done = await lessonsDone(ctx.db, ctx.child.childId, ctx.track);
  const perDay = await setting(ctx.db, 'family.english.new_lessons_per_day', 2);
  const states = lessonStates(ctx.track, doneSet(done), ctx.enrolment.placedUnit, await newLessonsOn(ctx.db, ctx.child.childId, ctx.today), perDay);
  return { done, states, state: states[key] };
}

async function warmupItems(ctx: EnglishCtx, exclude: string): Promise<CheckItem[]> {
  const keys = (await dueReviewKeys(ctx.db, ctx.child.childId, ctx.track, ctx.today, 6)).filter((k) => lessonOfItem(k) !== exclude).slice(0, 3);
  const bodies = await lessonBodies(ctx.db, ctx.versionId, [...new Set(keys.map(lessonOfItem))]);
  return keys.map((k) => (bodies.get(lessonOfItem(k)) ? reviewItem(bodies.get(lessonOfItem(k))!, k, ctx.today) : null)).filter((x): x is CheckItem => x !== null);
}

export async function GET(req: NextRequest, { params }: { params: { key: string } }) {
  const key = params.key;
  if (!KEY.test(key)) return englishError('bad_request', 400);
  return withEnglish(req, async (ctx) => {
    if (!key.startsWith(`${ctx.track}.`)) return englishError('not_found', 404);
    const { state } = await gate(ctx, key);
    if (state === 'rest') return englishError('rest', 403);
    if (!mayOpen(state)) return englishError('locked', 403);
    const lesson = (await lessonBodies(ctx.db, ctx.versionId, [key])).get(key);
    if (!lesson) return englishError('not_found', 404);
    const warmup = await warmupItems(ctx, key);
    // `day` comes back with the answers: a warm-up word's options are fixed by the day it was shown.
    return NextResponse.json({ track: ctx.track, state, day: ctx.today, lesson: lessonForChild(lesson), warmup: warmup.map(forChild) });
  });
}

export async function POST(req: NextRequest, { params }: { params: { key: string } }) {
  const key = params.key;
  if (!KEY.test(key)) return englishError('bad_request', 400);
  const body = await jsonBody(req);
  const answers = body.answers && typeof body.answers === 'object' && !Array.isArray(body.answers) ? (body.answers as Record<string, unknown>) : {};
  const warmupAnswers = body.warmup && typeof body.warmup === 'object' && !Array.isArray(body.warmup) ? (body.warmup as Record<string, unknown>) : {};
  return withEnglish(req, async (ctx) => {
    if (!key.startsWith(`${ctx.track}.`)) return englishError('not_found', 404);
    const { done, state } = await gate(ctx, key);
    if (state === 'rest') return englishError('rest', 403);
    if (!mayOpen(state)) return englishError('locked', 403);
    const lesson = (await lessonBodies(ctx.db, ctx.versionId, [key])).get(key);
    if (!lesson) return englishError('not_found', 404);
    // The day the warm-up was shown: today, or yesterday for a lesson opened before midnight.
    const shown = body.day === addDays(ctx.today, -1) ? addDays(ctx.today, -1) : ctx.today;
    const reads = TRACK_RULES[ctx.track].reads;
    if (!reads && body.done !== true) return englishError('bad_request', 400);

    // The lesson's own check.
    const scored = scoreItems(lesson.check, answers);
    const score = reads ? scored.score : 100;
    const tr = await recordTry(ctx.db, ctx.accountId, ctx.child.childId, key, score, (tryNo) => lessonStars(ctx.track, score, tryNo), ctx.today);
    // Only the next lesson in order is new; revising a placed unit's lesson never uses the day's new lessons.
    if (tr.newlyDone && state === 'open') await countNewLesson(ctx.db, ctx.accountId, ctx.child.childId, ctx.today);

    // The warm-up: only items that are the child's own and due today are scored.
    const warmKeys = Object.keys(warmupAnswers).filter((k) => k.startsWith(`${ctx.track}.`)).slice(0, 6);
    const due = await reviewRows(ctx.db, ctx.child.childId, warmKeys);
    const dueKeys = warmKeys.filter((k) => (due.get(k)?.due_on ?? '9999-12-31') <= shown);
    const bodies = await lessonBodies(ctx.db, ctx.versionId, [...new Set(dueKeys.map(lessonOfItem))]);
    const warmItems = dueKeys.map((k) => (bodies.get(lessonOfItem(k)) ? reviewItem(bodies.get(lessonOfItem(k))!, k, shown) : null)).filter((x): x is CheckItem => x !== null);
    const warm = scoreItems(warmItems, warmupAnswers);

    // Review boxes: every answered item moves; a done lesson's new words enter the boxes.
    const answered = [...scored.results.filter((r) => r.key in answers), ...warm.results];
    const newWords = tr.stars > 0 && lesson.kind === 'words' ? lessonWords(lesson).map((w) => w.key) : [];
    const wordKeys = new Set([...newWords, ...dueKeys.filter((k) => bodies.get(lessonOfItem(k)) && isWordOf(bodies.get(lessonOfItem(k))!, k))]);
    await applyReviews(ctx.db, ctx.accountId, ctx.child.childId, answered, newWords, wordKeys, ctx.today);

    const order = courseLessons(ctx.track);
    const next = order[order.indexOf(key) + 1] ?? null;
    // The next lesson's state from what is already read, with this lesson's result added.
    const perDay = await setting(ctx.db, 'family.english.new_lessons_per_day', 2);
    const nowDone = new Set(doneSet(done));
    if (tr.stars > 0) nowDone.add(key);
    const newToday = await newLessonsOn(ctx.db, ctx.child.childId, ctx.today);
    const after = next ? lessonStates(ctx.track, nowDone, ctx.enrolment.placedUnit, newToday, perDay)[next] : null;
    return NextResponse.json({
      score,
      stars: tr.stars,
      passed: tr.stars > 0,
      tryNo: tr.tryNo,
      results: reads ? scored.results : [],
      warmup: warm.results,
      next: next ? { key: next, state: after } : null,
    });
  });
}
