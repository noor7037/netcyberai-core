import { NextRequest, NextResponse } from 'next/server';
import { nextAdmissionNumbers, nextRollNumbers } from '@/lib/numbering/allocate';
import { requireAppSession, canWriteMasterData } from '@/lib/auth/require-app-session';
import { withTenantContext } from '@/lib/auth/db';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { writeAuditLog } from '@/lib/audit/log';
import { isForeignKeyViolation } from '@/lib/db/pg-errors';
import { findRollClash, isRollClashViolation, ROLL_RACE_TEXT } from '@/lib/students/roll-clash';
import { checkDate, checkText, validationError } from '@/lib/errors/catalogue';
import { ruleError } from '@/lib/frameworks/route';
import { mayRecordGender, readGender } from '@/lib/students/gender';

const STUDENT_STATUSES = ['pending_consent', 'active', 'inactive', 'transferred'] as const;
// `left` is the list's own word for the two states of a child no longer at the school (W14-H).
const LEFT_STATUSES = ['inactive', 'transferred'];
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

  if (status && status !== 'left' && !STUDENT_STATUSES.includes(status as (typeof STUDENT_STATUSES)[number])) {
    return NextResponse.json({ error: `status must be one of ${STUDENT_STATUSES.join(', ')}, left` }, { status: 400 });
  }

  try {
    const { students, total, counts } = await withTenantContext(guard.claims, async (client) => {
      const params: unknown[] = [guard.claims.schoolId];
      const conditions = [`s.school_id = $${params.length}`];
      if (classId) {
        params.push(classId);
        conditions.push(`s.class_id = $${params.length}`);
      }
      if (search) {
        params.push(`%${search}%`);
        conditions.push(`(s.name ilike $${params.length} or s.admission_no ilike $${params.length})`);
      }
      // One query counts the students of each status for this class and search; the heading's numbers and the total
      // come from it, so they cannot differ from the rows (W14-H).
      const { rows: countRows } = await client.query(
        `select s.status, count(*)::int as n from students s where ${conditions.join(' and ')} group by s.status`,
        params
      );
      const counts = { active: 0, pending_consent: 0, left: 0, inactive: 0, transferred: 0 };
      for (const r of countRows as { status: keyof typeof counts; n: number }[]) {
        counts[r.status] = r.n;
        if (LEFT_STATUSES.includes(r.status)) counts.left += r.n;
      }
      if (status === 'left') {
        conditions.push(`s.status in ('inactive', 'transferred')`);
      } else if (status) {
        params.push(status);
        conditions.push(`s.status = $${params.length}`);
      }
      const where = conditions.join(' and ');
      const total = status ? counts[status as keyof typeof counts] : counts.active + counts.pending_consent + counts.left;

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
      return { students: rows, total, counts };
    });
    // `office`: whether this person records a gender and opens the student data check (the principal and the school
    // admin), so the screen offers them only to the office (C224).
    return NextResponse.json({ students, total, counts: { active: counts.active, pending_consent: counts.pending_consent, left: counts.left }, limit, offset, office: mayRecordGender(guard.claims.role) });
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
      // A roll number is one student's in a class (W14-H): say who has it.
      const clash = await findRollClash(client, guard.claims.schoolId, classId, rollNo);
      if (clash) return { clash: `The roll number was not saved: ${clash}.` };
      if (admissionNo && (await client.query(`select 1 from students where school_id = $1 and lower(btrim(admission_no)) = lower($2)`, [guard.claims.schoolId, admissionNo])).rows[0]) {
        return { clash: `The student was not saved: admission number ${admissionNo} is already another student's. Leave it blank to get the next one.` };
      }
      // Left blank, the next admission number and the class's next roll number are given (C554).
      const givenAdmissionNo = admissionNo ?? (await nextAdmissionNumbers(client, guard.claims.schoolId))[0];
      const givenRollNo = rollNo ?? (classId ? (await nextRollNumbers(client, guard.claims.schoolId, classId))[0] : null);
      const { rows } = await client.query(
        `insert into students (school_id, admission_no, name, class_id, roll_no, dob, gender, status)
         values ($1, $2, $3, $4, $5, $6, $7, 'pending_consent')
         returning student_id, admission_no, name, class_id, roll_no, dob::text as dob, gender, status, created_at`,
        [guard.claims.schoolId, givenAdmissionNo, name, classId, givenRollNo, dob, gender.value ?? 'not_given']
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
    if ('clash' in student) return NextResponse.json({ error: student.clash }, { status: 409 });
    return NextResponse.json({ student }, { status: 201 });
  } catch (err) {
    if (isRollClashViolation(err)) return NextResponse.json({ error: ROLL_RACE_TEXT }, { status: 409 });
    if ((err as { code?: string; constraint?: string })?.constraint === 'students_admission_no_per_school') {
      return NextResponse.json({ error: 'The student was not saved: that admission number is already another student\'s. Leave it blank to get the next one.' }, { status: 409 });
    }
    if (isForeignKeyViolation(err)) {
      return NextResponse.json(validationError('class_not_in_school'), { status: 400 });
    }
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}
