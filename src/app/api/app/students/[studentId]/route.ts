import { NextRequest, NextResponse } from 'next/server';
import { requireAppSession, canWriteMasterData } from '@/lib/auth/require-app-session';
import { withTenantContext } from '@/lib/auth/db';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { writeAuditLog } from '@/lib/audit/log';
import { assertRowsAffected, NoRowsAffectedError } from '@/lib/db/rows';
import { isForeignKeyViolation } from '@/lib/db/pg-errors';
import { checkDate, validationError } from '@/lib/errors/catalogue';

export async function GET(req: NextRequest, { params }: { params: { studentId: string } }) {
  const guard = await requireAppSession(req);
  if ('error' in guard) return guard.error;

  try {
    const student = await withTenantContext(guard.claims, async (client) => {
      const { rows } = await client.query(
        `select s.student_id, s.admission_no, s.name, s.class_id, c.name as class_name,
                s.roll_no, s.dob::text as dob, s.status, s.created_at, s.updated_at
         from students s
         left join classes c on c.school_id = s.school_id and c.class_id = s.class_id
         where s.school_id = $1 and s.student_id = $2`,
        [guard.claims.schoolId, params.studentId]
      );
      return rows[0] ?? null;
    });
    if (!student) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({ student });
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}

const EDITABLE_FIELDS = ['name', 'admissionNo', 'classId', 'rollNo', 'dob'] as const;
const COLUMN_FOR: Record<(typeof EDITABLE_FIELDS)[number], string> = {
  name: 'name',
  admissionNo: 'admission_no',
  classId: 'class_id',
  rollNo: 'roll_no',
  dob: 'dob',
};

// Status is deliberately not accepted here -- same reason as POST /students:
// consent-driven activation is Prompt G's job, not general-purpose CRUD.
export async function PATCH(req: NextRequest, { params }: { params: { studentId: string } }) {
  const guard = await requireAppSession(req);
  if ('error' in guard) return guard.error;
  if (!canWriteMasterData(guard.claims.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  const setClauses: string[] = [];
  const values: unknown[] = [];
  for (const field of EDITABLE_FIELDS) {
    if (field in body) {
      if (field === 'name' && !String(body.name ?? '').trim()) {
        return NextResponse.json(validationError('required', { field: 'student_name' }), { status: 400 });
      }
      if (field === 'dob' && typeof body.dob === 'string' && body.dob) {
        const problem = checkDate(body.dob, 'dob', { notAfter: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()) });
        if (problem) return NextResponse.json(problem, { status: 400 });
      }
      values.push(body[field] === '' ? null : body[field]);
      setClauses.push(`${COLUMN_FOR[field]} = $${values.length}`);
    }
  }
  if (setClauses.length === 0) {
    return NextResponse.json(validationError('nothing_to_save'), { status: 400 });
  }
  setClauses.push('updated_at = now()');

  try {
    const student = await withTenantContext(guard.claims, async (client) => {
      const before = await client.query(
        `select student_id, admission_no, name, class_id, roll_no, dob from students where school_id = $1 and student_id = $2`,
        [guard.claims.schoolId, params.studentId]
      );
      if (!before.rows[0]) return null;

      values.push(guard.claims.schoolId, params.studentId);
      const result = await client.query(
        `update students set ${setClauses.join(', ')}
         where school_id = $${values.length - 1} and student_id = $${values.length}
         returning student_id, admission_no, name, class_id, roll_no, dob::text as dob, status, updated_at`,
        values
      );
      assertRowsAffected(result, `student ${params.studentId} update matched 0 rows`);
      const row = result.rows[0];
      await writeAuditLog(client, {
        schoolId: guard.claims.schoolId,
        actorUserId: guard.claims.sub,
        actorRole: guard.claims.role,
        eventAction: 'student.update',
        targetType: 'students',
        targetId: row.student_id,
        beforeState: before.rows[0],
        afterState: row,
      });
      return row;
    });
    if (!student) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({ student });
  } catch (err) {
    if (isForeignKeyViolation(err)) {
      return NextResponse.json(validationError('class_not_in_school'), { status: 400 });
    }
    if (err instanceof NoRowsAffectedError) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}
