import { NextRequest, NextResponse } from 'next/server';
import { isTrack } from '@/lib/family/english/course';
import { tracksAllowed } from '@/lib/family/english/progress';
import { englishError, withEnglish } from '@/lib/family/english/request';
import { updateEnrolment } from '@/lib/family/english/store';
import { jsonBody } from '@/lib/family/request';

// The parent's course settings for one child (docs/family-app/12 §2, §3, C274), in parent mode only:
// POST { childId, track?, weeklyGoal? }. The track may move one step down or up from the child's class, once; the
// weekly goal is 1–7 lessons. Moving the track starts it from unit 1 (its own progress is kept per track).
export async function POST(req: NextRequest) {
  const body = await jsonBody(req);
  const childId = typeof body.childId === 'string' ? body.childId : '';
  if (!/^[0-9a-f-]{36}$/.test(childId)) return englishError('bad_request', 400);
  const track = body.track;
  const goal = body.weeklyGoal;
  if (track !== undefined && !isTrack(track)) return englishError('bad_request', 400);
  if (goal !== undefined && !(Number.isInteger(goal) && (goal as number) >= 1 && (goal as number) <= 7)) return englishError('bad_request', 400);
  return withEnglish(
    req,
    async ({ db, child, enrolment }) => {
      if (isTrack(track) && track !== enrolment.track) {
        if (enrolment.trackChanged) return englishError('track_already_changed', 409);
        if (!tracksAllowed(child.classLevel).includes(track)) return englishError('track_not_allowed', 400);
        await updateEnrolment(db, child.childId, { track });
      }
      if (typeof goal === 'number') await updateEnrolment(db, child.childId, { weeklyGoal: goal });
      return NextResponse.json({ ok: true });
    },
    { parent: true, childId }
  );
}
