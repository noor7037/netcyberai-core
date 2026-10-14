import { NextRequest, NextResponse } from 'next/server';
import { requireAppSession, canWriteMasterData } from '@/lib/auth/require-app-session';
import { withTenantContext } from '@/lib/auth/db';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { writeAuditLog } from '@/lib/audit/log';
import { isForeignKeyViolation } from '@/lib/db/pg-errors';
import { checkDate, checkText, validationError } from '@/lib/errors/catalogue';
import { ruleError } from '@/lib/frameworks/route';
import { mayRecordGender, readGender } from '@/lib/students/gender';

const STUDENT_STATUSES = ['pending_consent', 'active', 'inactive', 'transferred'] as const;
const LIST_LIMIT_DEFAULT = 50;
const LIST_LIMIT_MAX = 200;

export async function GET(req: NextRequest) {
  const guard = await requireAppSession(req);
  if ('error' in guard) return guard.error;

  const { searchParams } = req.nextUrl;
  const classId = searchParams.get('classId');
  const status = searchParams.get('status');
  const search = searchParams.get('search')?.trim();
  const limit = Math.min(Number(searchParams.get('limit')) || LIST_LIMIT_DEFAULT, LIST_LIMIT_MAX);
  const offset = Math.max(Number(searchParams.get('offset')) || 0, 0);

  if (status && !STUDENT_STATUSES.includes(status as (typeof STUDENT_STATUSES)[number])) {
    return NextResponse.json({ error: `status must be one of ${STUDENT_STATUSES.join(', ')}` }, { status: 400 });
  }

  try {
    const { students, total } = await withTenantContext(guard.claims, async (client) => {
      const params: unknown[] = [guard.claims.schoolId];
      const conditions = [`s.school_id = $${params.length}`];
      if (classId) {
        params.push(classId);
        conditions.push(`s.class_id = $${params.length}`);
      }
      if (status) {
        params.push(status);
        conditions.push(`s.status = $${params.length}`);
      }
      if (search) {
        params.push(`%${search}%`);
        conditions.push(`(s.name ilike $${params.length} or s.admission_no ilike $${params.length})`);
      }
      const where = conditions.join(' and ');

      const { rows: countRows } = await client.query(
        `select count(*)::int as n from students s where ${where}`,
        params
      );

      params.push(limit, offset);
      const { rows } = await client.query(
        `select s.student_id, s.admission_no, s.name, s.class_id, c.name as class_name,
                s.roll_no, s.dob::text as dob, s.status, s.created_at
         from students s
         left join classes c on c.school_id = s.school_id and c.class_id = s.class_id
         where ${where}
         order by s.name asc
         limit $${params.length - 1} offset $${params.length}`,
        params
      );
      return { students: rows, total: countRows[0].n as number };
    });
    // `office`: whether this person records a gender and opens the student data check (the principal and the school
    // admin), so the screen offers them only to the office (C224).
    return NextResponse.json({ students, total, limit, offset, office: mayRecordGender(guard.claims.role) });
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}

// Enrolment always lands in pending_consent, never active -- PRD §3.1:
// "Enrolment creates the student record in pending_consent, never
// active." The student becomes active when the required consents are
// granted (C142, src/lib/consent/student-status.ts), never through this
// route -- status is deliberately not a client-settable field here, and
// the database refuses an app insert with status 'active'.
export async function POST(req: NextRequest) {
  const guard = await requireAppSession(req);
  if ('error' in guard) return guard.error;
  if (!canWriteMasterData(guard.claims.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const admissionNo = typeof body?.admissionNo === 'string' ? body.admissionNo.trim() || null : null;
  const classId = typeof body?.classId === 'string' ? body.classId : null;
  const rollNo = typeof body?.rollNo === 'string' ? body.rollNo.trim() || null : null;
  const dob = typeof body?.dob === 'string' ? body.dob : null;

  // Plain-language answers from the error catalogue (docs/19 rule 9).
  const nameCheck = checkText(name, 'student_name', 1, 200);
  if (!nameCheck.ok) return NextResponse.json(nameCheck.error, { status: 400 });
  const dobProblem = dob ? checkDate(dob, 'dob', { notAfter: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()) }) : null;
  if (dobProblem) return NextResponse.json(dobProblem, { status: 400 });
  // Gender: the office only, Aadhaar's set or "not given" (C222, C224).
  const gender = readGender(body?.gender, guard.claims.role);
  if (!gender.ok) return gender.reason === 'not_allowed' ? ruleError(403, 'not_allowed') : ruleError(400, 'not_sent_properly');

  try {
    const student = await withTenantContext(guard.claims, async (client) => {
      const { rows } = await client.query(
        `insert into students (school_id, admission_no, name, class_id, roll_no, dob, gender, status)
         values ($1, $2, $3, $4, $5, $6, $7, 'pending_consent')
         returning student_id, admission_no, name, class_id, roll_no, dob::text as dob, gender, status, created_at`,
        [guard.claims.schoolId, admissionNo, name, classId, rollNo, dob, gender.value ?? 'not_given']
      );
      const row = rows[0];
      // The record made, never the child's name, date of birth or gender (C224): its class and state, and which
      // details it has.
      await writeAuditLog(client, {
        schoolId: guard.claims.schoolId,
        actorUserId: guard.claims.sub,
        actorRole: guard.claims.role,
        eventAction: 'student.create',
        targetType: 'students',
        targetId: row.student_id,
        afterState: { classId: row.class_id, status: row.status, withAdmissionNo: row.admission_no !== null, withDob: row.dob !== null, withGender: row.gender !== 'not_given' },
      });
      return row;
    });
    return NextResponse.json({ student }, { status: 201 });
  } catch (err) {
    if (isForeignKeyViolation(err)) {
      return NextResponse.json(validationError('class_not_in_school'), { status: 400 });
    }
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}
