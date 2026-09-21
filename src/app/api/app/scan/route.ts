import { NextRequest, NextResponse } from 'next/server';
import { requireAppSession } from '@/lib/auth/require-app-session';
import { withSuperAdminBypass, withTenantContext } from '@/lib/auth/db';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { qrPayloadToToken } from '@/lib/capture/qr';
import { signedDocumentUrl } from '@/lib/capture/storage';

const PURPOSES = ['lookup', 'gate_entry', 'exam_verify', 'event_checkin', 'library', 'lab'] as const;
type Purpose = (typeof PURPOSES)[number];
type Result = 'resolved' | 'revoked_token' | 'unknown_token' | 'unauthorized' | 'cross_tenant_denied';

// PRD Sec6.2's resolution flow, exactly: token -> server lookup -> verify
// scanner authenticated -> verify same tenant -> verify role permits
// viewing THIS student -> scoped view. Every step logged, denials
// included -- a record of who looked up which child, when, is both an
// audit requirement and a safeguarding one, per the PRD's own framing.
//
// A cross-tenant scan is logged under the SCANNER'S OWN school_id with
// token_id/student_id left NULL, never the token's real school --
// found live while building this route: qr_scan_log's own composite
// FKs (school_id, scanned_by) -> users and (school_id, token_id) ->
// student_qr_tokens each require school_id to match THAT row's own
// tenant, and for a genuinely cross-tenant scan those two tenants are,
// by definition, different. There is no single school_id that
// satisfies both FKs at once for a cross-tenant row with both columns
// populated -- so this is the one case where the log necessarily
// carries less detail (no token/student reference), by construction,
// not by choice. It still fully answers the safeguarding question this
// log exists for: which authenticated user, at which school, attempted
// a cross-tenant scan, and when.
export async function POST(req: NextRequest) {
  const guard = await requireAppSession(req);
  if ('error' in guard) return guard.error;

  const body = await req.json().catch(() => null);
  const payload = typeof body?.payload === 'string' ? body.payload : '';
  const purpose: Purpose = PURPOSES.includes(body?.purpose) ? body.purpose : 'lookup';
  const deviceHint = typeof body?.deviceHint === 'string' ? body.deviceHint.slice(0, 200) : null;

  const token = qrPayloadToToken(payload);

  try {
    const outcome = await (async () => {
      if (!token) {
        await logScan(guard.claims.schoolId, guard.claims.sub, null, null, purpose, 'unknown_token', deviceHint);
        return { result: 'unknown_token' as Result };
      }

      const tokenRow = await withSuperAdminBypass(async (client) => {
        const { rows } = await client.query(
          `select token_id, school_id, student_id, revoked_at from student_qr_tokens where token = $1`,
          [token]
        );
        return rows[0] ?? null;
      });

      if (!tokenRow) {
        await logScan(guard.claims.schoolId, guard.claims.sub, null, null, purpose, 'unknown_token', deviceHint);
        return { result: 'unknown_token' as Result };
      }

      if (tokenRow.school_id !== guard.claims.schoolId) {
        await logScan(guard.claims.schoolId, guard.claims.sub, null, null, purpose, 'cross_tenant_denied', deviceHint);
        return { result: 'cross_tenant_denied' as Result };
      }

      if (tokenRow.revoked_at) {
        await logScan(guard.claims.schoolId, guard.claims.sub, tokenRow.token_id, tokenRow.student_id, purpose, 'revoked_token', deviceHint);
        return { result: 'revoked_token' as Result };
      }

      return withTenantContext(guard.claims, async (client) => {
        const { rows } = await client.query(
          `select s.student_id, s.name, s.admission_no, s.roll_no, s.class_id, s.status, c.name as class_name
           from students s left join classes c on c.school_id = s.school_id and c.class_id = s.class_id
           where s.school_id = $1 and s.student_id = $2`,
          [guard.claims.schoolId, tokenRow.student_id]
        );
        const student = rows[0];
        if (!student) {
          // Token row exists but its student was deleted -- shouldn't
          // happen (composite FK), treated as unknown rather than a 500.
          await logScan(guard.claims.schoolId, guard.claims.sub, tokenRow.token_id, null, purpose, 'unknown_token', deviceHint);
          return { result: 'unknown_token' as Result };
        }

        const authorized = await isAuthorizedToView(client, guard.claims.schoolId, guard.claims.sub, guard.claims.role, student.class_id);
        if (!authorized) {
          await logScan(guard.claims.schoolId, guard.claims.sub, tokenRow.token_id, student.student_id, purpose, 'unauthorized', deviceHint);
          return { result: 'unauthorized' as Result };
        }

        await logScan(guard.claims.schoolId, guard.claims.sub, tokenRow.token_id, student.student_id, purpose, 'resolved', deviceHint);

        const photo = await client.query(
          `select storage_path from captured_documents
           where school_id = $1 and student_id = $2 and doc_type = 'student_photograph'
           order by uploaded_at desc limit 1`,
          [guard.claims.schoolId, student.student_id]
        );
        const photoUrl = photo.rows[0] ? await signedDocumentUrl(photo.rows[0].storage_path) : null;

        return {
          result: 'resolved' as Result,
          student: {
            studentId: student.student_id,
            name: student.name,
            admissionNo: student.admission_no,
            rollNo: student.roll_no,
            className: student.class_name,
            status: student.status,
            photoUrl,
          },
        };
      });
    })();

    const status = outcome.result === 'resolved' ? 200 : outcome.result === 'unauthorized' || outcome.result === 'cross_tenant_denied' ? 403 : 404;
    return NextResponse.json(outcome, { status });
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}

async function isAuthorizedToView(
  client: Parameters<Parameters<typeof withTenantContext>[1]>[0],
  schoolId: string,
  scannerUserId: string,
  role: string,
  studentClassId: string | null
): Promise<boolean> {
  // Office-adjacent roles: whole school. PRD Sec6.2 names only
  // "teacher: own classes" and "principal/admin: whole school"
  // explicitly -- accountant/academic_coordinator are treated the same
  // as principal/admin here (whole-school read), matching how those
  // two roles already read whole-school data elsewhere in this schema
  // (e.g. fee tables); not separately specified by the PRD, so flagged
  // here rather than silently assumed.
  if (role !== 'teacher') return true;
  if (!studentClassId) return false;

  const { rows } = await client.query(
    `select 1 from teachers t
     where t.school_id = $1 and t.user_id = $2
       and (
         exists (select 1 from classes c where c.school_id = $1 and c.class_id = $3 and c.class_teacher_id = t.teacher_id)
         or exists (select 1 from teacher_subjects ts where ts.school_id = $1 and ts.teacher_id = t.teacher_id and ts.class_id = $3)
       )`,
    [schoolId, scannerUserId, studentClassId]
  );
  return rows.length > 0;
}

async function logScan(
  schoolId: string,
  scannedBy: string,
  tokenId: string | null,
  studentId: string | null,
  purpose: Purpose,
  result: Result,
  deviceHint: string | null
): Promise<void> {
  await withSuperAdminBypass(async (client) => {
    await client.query(
      `insert into qr_scan_log (school_id, token_id, student_id, scanned_by, purpose, result, device_hint)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [schoolId, tokenId, studentId, scannedBy, purpose, result, deviceHint]
    );
  });
}
