import { NextRequest, NextResponse } from 'next/server';
import { isUuid, parseSubjectName } from '@/lib/academics/syllabus';
import { canWriteMasterData } from '@/lib/auth/require-app-session';
import { appRoute, readJson, ruleError } from '@/lib/frameworks/route';
import { renameSubject, setSubjectRetired } from '@/lib/setup/subjects';

// PATCH: change one subject (docs/28 slice 10g, C244). The principal and the school admin only.
//   { name }              rename it (the same rules as adding: 1 to 80 characters, not a name the school already has)
//   { retired: true }     retire it: it keeps its marks, homework, timetable periods and who-teaches-what, and leaves
//                         the pickers of the screens that follow. Never deleted.
//   { retired: false }    bring it back
// There is no DELETE: a subject is retired, never deleted.
// One of the two in a request. Doing a change that is already made changes nothing and is not audited again.
export async function PATCH(req: NextRequest, { params }: { params: { subjectId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    if (!canWriteMasterData(claims.role)) return ruleError(403, 'not_allowed');
    if (!isUuid(params.subjectId)) return ruleError(400, 'not_sent_properly');
    const body = await readJson(req);
    if (!body) return ruleError(400, 'not_sent_properly');
    const actor = { schoolId: claims.schoolId, userId: claims.sub, role: claims.role };
    const renaming = 'name' in body;
    const retiring = 'retired' in body;
    if (renaming === retiring) return ruleError(400, 'not_sent_properly');

    if (renaming) {
      const parsed = parseSubjectName(body);
      if (!parsed.ok) {
        const have = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ').length : 0;
        return have > 80 ? ruleError(400, 'too_long', { field: 'subject', have, max: 80 }) : ruleError(400, 'required', { field: 'subject' });
      }
      const done = await renameSubject(db, actor, params.subjectId, parsed.value);
      if (!done.ok) return done.reason === 'not_found' ? ruleError(404, 'not_found', { field: 'subject' }) : ruleError(409, 'already_exists', { field: 'subject', value: parsed.value });
      return NextResponse.json({ subjectId: params.subjectId, changed: done.changed });
    }

    if (typeof body.retired !== 'boolean') return ruleError(400, 'not_sent_properly');
    const done = await setSubjectRetired(db, actor, params.subjectId, body.retired);
    if (!done.ok) return ruleError(404, 'not_found', { field: 'subject' });
    return NextResponse.json({ subjectId: params.subjectId, retired: body.retired, changed: done.changed });
  });
}
