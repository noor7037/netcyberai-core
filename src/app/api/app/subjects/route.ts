import { NextRequest, NextResponse } from 'next/server';
import { requireAppSession, canWriteMasterData } from '@/lib/auth/require-app-session';
import { withTenantContext } from '@/lib/auth/db';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { writeAuditLog } from '@/lib/audit/log';
import { isUniqueViolation } from '@/lib/db/pg-errors';
import { parseSubjectName } from '@/lib/academics/syllabus';
import { classOrderSql } from '@/lib/classes/class-order';

// Subjects and who teaches them. GET is open to every signed-in school
// role (RLS scopes it to the school); creating a subject is a master-data
// write for the office roles only.
export async function GET(req: NextRequest) {
  const guard = await requireAppSession(req);
  if ('error' in guard) return guard.error;

  try {
    const subjects = await withTenantContext(guard.claims, async (client) => {
      const { rows } = await client.query(
        `select s.subject_id, s.name,
                coalesce(json_agg(json_build_object(
                  'teacherId', t.teacher_id, 'teacherName', t.name, 'classId', c.class_id, 'className', c.name
                ) order by ${classOrderSql('c')}, t.name) filter (where ts.teacher_id is not null), '[]') as assignments
         from subjects s
         left join teacher_subjects ts on ts.school_id = s.school_id and ts.subject_id = s.subject_id
         left join teachers t on t.school_id = ts.school_id and t.teacher_id = ts.teacher_id
         left join classes c on c.school_id = ts.school_id and c.class_id = ts.class_id
         where s.school_id = $1
         group by s.subject_id, s.name
         order by s.name asc`,
        [guard.claims.schoolId]
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

  const parsed = parseSubjectName(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const created = await withTenantContext(guard.claims, async (client) => {
      const { rows } = await client.query(
        `insert into subjects (school_id, name) values ($1, $2) returning subject_id, name`,
        [guard.claims.schoolId, parsed.value]
      );
      const row = rows[0];
      await writeAuditLog(client, {
        schoolId: guard.claims.schoolId,
        actorUserId: guard.claims.sub,
        actorRole: guard.claims.role,
        eventAction: 'subject.create',
        targetType: 'subjects',
        targetId: row.subject_id,
        afterState: row,
      });
      return row;
    });
    return NextResponse.json({ subject: created }, { status: 201 });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return NextResponse.json({ error: `A subject called "${parsed.value}" already exists at this school.` }, { status: 409 });
    }
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}
