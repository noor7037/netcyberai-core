import { NextRequest, NextResponse } from 'next/server';
import type { PoolClient } from 'pg';
import { activeChild, listChildren, type FamilyChild } from '@/lib/family/children';
import { consentState } from '@/lib/family/consent';
import { readFamilySwitches, switchOn } from '@/lib/family/flags';
import { familyRun, requireFamily, requireParent } from '@/lib/family/request';
import { FAMILY_CHILD_COOKIE } from '@/lib/family/session';
import { indiaDate } from '@/lib/time/india';
import type { Track } from './course';
import { trackForClass } from './progress';
import { enrol, publishedVersion, readEnrolment, type Enrolment } from './store';

// The guard of every /api/family/english/** route (docs/family-app/12, C274), in this order:
// a family session (and parent mode for the parent's routes) → the child (the active one, or the parent's choice) →
// Control's switch for the course (module `english_programme`) → the parent's `english_programme` consent → the child's
// place in the course (made on first use, from the child's class) → the published course for the track.

export type EnglishCtx = {
  db: PoolClient;
  accountId: string;
  child: FamilyChild;
  enrolment: Enrolment;
  track: Track;
  versionId: string;
  today: string;
};

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function withEnglish(
  req: NextRequest,
  fn: (ctx: EnglishCtx) => Promise<NextResponse>,
  opts: { parent?: boolean; childId?: string } = {}
): Promise<NextResponse> {
  const g = opts.parent ? await requireParent(req) : await requireFamily(req);
  if (g.error) return g.error;
  const session = g.session;
  return familyRun(session, async (db) => {
    const children = await listChildren(db, session.accountId);
    const child = opts.childId ? children.find((c) => c.childId === opts.childId) ?? null : activeChild(children, req.cookies.get(FAMILY_CHILD_COOKIE)?.value);
    if (!child) return fail('no_child', 404);
    if (!switchOn(await readFamilySwitches(db, session.accountId), 'english_programme')) return fail('off', 403);
    if (!(await consentState(db, session.accountId)).english_programme) return fail('consent_needed', 403);
    const today = indiaDate();
    let enrolment = await readEnrolment(db, child.childId);
    if (!enrolment) {
      await enrol(db, session.accountId, child.childId, trackForClass(child.classLevel), today);
      enrolment = await readEnrolment(db, child.childId);
    }
    if (!enrolment) return fail('not_enrolled', 409);
    const versionId = await publishedVersion(db, enrolment.track);
    if (!versionId) return fail('no_course', 404);
    return fn({ db, accountId: session.accountId, child, enrolment, track: enrolment.track, versionId, today });
  });
}

export const englishError = fail;
