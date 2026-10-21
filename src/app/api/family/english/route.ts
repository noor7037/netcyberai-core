import { NextRequest, NextResponse } from 'next/server';
import { ASSESSMENT_KINDS } from '@/lib/family/english/course';
import { addDays, assessmentOpen, lessonStates } from '@/lib/family/english/progress';
import { withEnglish } from '@/lib/family/english/request';
import { assessmentResults, courseUnits, doneSet, dueReviewKeys, lessonsDone, newLessonsOn, settingNumber } from '@/lib/family/english/store';

// The child's course (docs/family-app/12 §8, C274): the units with every lesson's state and stars, today's new lessons
// against the day's limit, the week against the parent's goal, the review items due, and the assessments.
export async function GET(req: NextRequest) {
  return withEnglish(req, async ({ db, child, enrolment, track, versionId, today }) => {
    const units = await courseUnits(db, versionId);
    const done = await lessonsDone(db, child.childId, track);
    const perDay = await settingNumber(db, 'family.english.new_lessons_per_day', 2);
    const newToday = await newLessonsOn(db, child.childId, today);
    const finished = doneSet(done);
    const states = lessonStates(track, finished, enrolment.placedUnit, newToday, perDay);
    const weekFrom = addDays(today, -6);
    const thisWeek = [...done.values()].filter((d) => d.doneOn !== null && d.doneOn >= weekFrom).length;
    const due = await dueReviewKeys(db, child.childId, track, today, 50);
    const results = await assessmentResults(db, child.childId);
    return NextResponse.json({
      child: { firstName: child.firstName },
      track,
      trackChanged: enrolment.trackChanged,
      placedUnit: enrolment.placedUnit,
      today: { newLessons: newToday, perDay },
      week: { done: thisWeek, goal: enrolment.weeklyGoal },
      reviewDue: due.length,
      units: units.map((u) => ({
        ...u,
        lessons: u.lessons.map((l) => ({ ...l, state: states[l.key] ?? 'locked', stars: done.get(l.key)?.stars ?? 0 })),
      })),
      assessments: ASSESSMENT_KINDS.map((kind) => ({ kind, open: assessmentOpen(track, kind, finished), result: results.find((r) => r.kind === kind) ?? null })),
    });
  });
}
