import { NextRequest, NextResponse } from 'next/server';
import { buildReport } from '@/lib/family/english/report';
import { englishError, withEnglish } from '@/lib/family/english/request';
import { assessmentResults, courseUnits, lessonBodies, lessonsDone } from '@/lib/family/english/store';

// The parent's progress report for one child (docs/family-app/12 §8, C274), in parent mode only:
// GET ?childId=… → the report, and one English line to use at home from the last lesson done.
export async function GET(req: NextRequest) {
  const childId = req.nextUrl.searchParams.get('childId') ?? '';
  if (!/^[0-9a-f-]{36}$/.test(childId)) return englishError('bad_request', 400);
  return withEnglish(
    req,
    async ({ db, child, enrolment, track, versionId, today }) => {
      const done = [...(await lessonsDone(db, child.childId, track)).values()];
      const { rows: reviews } = await db.query(`select kind, learned_on::text as learned_on from family.english_reviews where child_id = $1 and item_key like $2`, [child.childId, `${track}.%`]);
      const { rows: days } = await db.query(`select day::text as day, voice_seconds from family.english_days where child_id = $1`, [child.childId]);
      const report = buildReport({
        startedOn: enrolment.startedOn,
        today,
        weeklyGoal: enrolment.weeklyGoal,
        done,
        reviews: reviews.map((r) => ({ kind: r.kind === 'word' ? 'word' : 'item', learnedOn: r.learned_on ? String(r.learned_on).slice(0, 10) : null })),
        days: days.map((r) => ({ day: String(r.day).slice(0, 10), voiceSeconds: Number(r.voice_seconds) })),
        units: await courseUnits(db, versionId),
        results: await assessmentResults(db, child.childId),
      });
      const last = done.filter((d) => d.doneOn).sort((a, b) => (a.lastOn < b.lastOn ? 1 : -1))[0];
      const home = last ? (await lessonBodies(db, versionId, [last.key])).get(last.key)?.home ?? null : null;
      return NextResponse.json({ child: { firstName: child.firstName }, track, report, home });
    },
    { parent: true, childId }
  );
}
