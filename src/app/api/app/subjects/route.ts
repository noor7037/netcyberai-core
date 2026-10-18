import { NextRequest, NextResponse } from 'next/server';
import { requireAppSession, canWriteMasterData } from '@/lib/auth/require-app-session';
import { withTenantContext } from '@/lib/auth/db';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { writeAuditLog } from '@/lib/audit/log';
import { isUniqueViolation } from '@/lib/db/pg-errors';
import { parseSubjectName } from '@/lib/academics/syllabus';
import { classOrderSql } from '@/lib/classes/class-order';
import { ruleError } from '@/lib/frameworks/route';
import { subjectWithName } from '@/lib/setup/subjects';

// Subjects and who teaches them. GET is open to every signed-in school
// role (RLS scopes it to the school); creating a subject is a master-data
// write for the office roles only.
//
// A subject the school no longer teaches is retired, never deleted (C244, Setup -> Subjects): GET lists the subjects
// in use, which is what a picker wants; `?include=retired` lists the retired ones too. The shape is the same either
// way (retired_at is null for a subject in use).
export async function GET(req: NextRequest) {
  const guard = await requireAppSession(req);
  if ('error' in guard) return guard.error;

  const includeRetired = req.nextUrl.searchParams.get('include') === 'retired';
  try {
    const subjects = await withTenantContext(guard.claims, async (client) => {
      const { rows } = await client.query(
        `select s.subject_id, s.name, s.retired_at,
                coalesce(json_agg(json_build_object(
                  'teacherId', t.teacher_id, 'teacherName', t.name, 'classId', c.class_id, 'className', c.name
                ) order by ${classOrderSql('c')}, t.name) filter (where ts.teacher_id is not null), '[]') as assignments
         from subjects s
         left join teacher_subjects ts on ts.school_id = s.school_id and ts.subject_id = s.subject_id
         left join teachers t on t.school_id = ts.school_id and t.teacher_id = ts.teacher_id
         left join classes c on c.school_id = ts.school_id and c.class_id = ts.class_id
         where s.school_id = $1 and ($2::boolean or s.retired_at is null)
         group by s.subject_id, s.name, s.retired_at
         order by s.name asc`,
        [guard.claims.schoolId, includeRetired]
      );
      return rows;
    });
    return NextResponse.json({ subjects });
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireAppSession(req);
  if ('error' in guard) return guard.error;
  if (!canWriteMasterData(guard.claims.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = parseSubjectName(body);
  if (!parsed.ok) {
    // Said by the error catalogue, in the person's language: nothing typed, or more than the 80 characters allowed.
    const typed = typeof body?.name === 'string' ? body.name.trim().replace(/\s+/g, ' ').length : 0;
    return typed > 80 ? ruleError(400, 'too_long', { field: 'subject', have: typed, max: 80 }) : ruleError(400, 'required', { field: 'subject' });
  }

  try {
    const created = await withTenantContext(guard.claims, async (client) => {
      // A name the school already has is refused before anything is written, and says whether that subject is
      // retired (then it is brought back on Setup, not made again).
      const same = await subjectWithName(client, guard.claims.schoolId, parsed.value);
      if (same) return { kind: 'clash' as const, same };
      const { rows } = await client.query(
        `insert into subjects (school_id, name) values ($1, $2) returning subject_id, name`,
        [guard.claims.schoolId, parsed.value]
      );
      const row = rows[0];
      await writeAuditLog(client, {
        schoolId: guard.claims.schoolId,
        actorUserId: guard.claims.sub,
        actorRole: guard.claims.role,
        eventAction: 'setup.subject_added',
        targetType: 'subjects',
        targetId: row.subject_id,
        afterState: { subject_id: row.subject_id },
      });
      return { kind: 'made' as const, row };
    });
    if (created.kind === 'clash') {
      return created.same.retired
        ? NextResponse.json({ error: `A subject called "${parsed.value}" is retired. Bring it back instead.`, code: 'subject_retired', subjectId: created.same.subjectId }, { status: 409 })
        : ruleError(409, 'already_exists', { field: 'subject', value: parsed.value });
    }
    return NextResponse.json({ subject: created.row }, { status: 201 });
  } catch (err) {
    if (isUniqueViolation(err)) {
      // Two people adding the same name at once: the second is refused by the database.
      return ruleError(409, 'already_exists', { field: 'subject', value: parsed.value });
    }
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}
