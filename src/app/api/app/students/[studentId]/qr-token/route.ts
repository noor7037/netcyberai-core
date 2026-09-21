import { NextRequest, NextResponse } from 'next/server';
import { requireAppSession, canWriteMasterData } from '@/lib/auth/require-app-session';
import { withTenantContext } from '@/lib/auth/db';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { writeAuditLog } from '@/lib/audit/log';
import { generateToken, generateQrSvg } from '@/lib/capture/qr';

// GET: the student's current active token (if any) + its QR SVG, for
// the ID-card print view.
export async function GET(req: NextRequest, { params }: { params: { studentId: string } }) {
  const guard = await requireAppSession(req);
  if ('error' in guard) return guard.error;

  try {
    const active = await withTenantContext(guard.claims, async (client) => {
      const { rows } = await client.query(
        `select token_id, token, issued_at from student_qr_tokens
         where school_id = $1 and student_id = $2 and revoked_at is null`,
        [guard.claims.schoolId, params.studentId]
      );
      return rows[0] ?? null;
    });
    if (!active) return NextResponse.json({ token: null });
    return NextResponse.json({ tokenId: active.token_id, issuedAt: active.issued_at, qrSvg: await generateQrSvg(active.token) });
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}

// POST: issue a fresh token. PRD Sec6.2: "reissue the card with a new
// token and revoke the old one -- the lost card becomes inert."
// Revocation happens in the SAME transaction as issuance, so there is
// never a moment where two tokens are simultaneously active for one
// student.
export async function POST(req: NextRequest, { params }: { params: { studentId: string } }) {
  const guard = await requireAppSession(req);
  if ('error' in guard) return guard.error;
  if (!canWriteMasterData(guard.claims.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  try {
    const outcome = await withTenantContext(guard.claims, async (client) => {
      const studentCheck = await client.query(`select 1 from students where school_id = $1 and student_id = $2`, [
        guard.claims.schoolId,
        params.studentId,
      ]);
      if (!studentCheck.rows[0]) return null;

      const revoked = await client.query(
        `update student_qr_tokens set revoked_at = now(), revoked_by = $1, revoke_reason = 'reissued'
         where school_id = $2 and student_id = $3 and revoked_at is null
         returning token_id`,
        [guard.claims.sub, guard.claims.schoolId, params.studentId]
      );

      const token = generateToken();
      const { rows } = await client.query(
        `insert into student_qr_tokens (school_id, student_id, token)
         values ($1, $2, $3)
         returning token_id, issued_at`,
        [guard.claims.schoolId, params.studentId, token]
      );
      const created = rows[0];

      await writeAuditLog(client, {
        schoolId: guard.claims.schoolId,
        actorUserId: guard.claims.sub,
        actorRole: guard.claims.role,
        eventAction: 'qr_token.issue',
        targetType: 'student_qr_tokens',
        targetId: created.token_id,
        beforeState: revoked.rows[0] ? { previousTokenId: revoked.rows[0].token_id } : null,
        afterState: { tokenId: created.token_id },
      });

      return { tokenId: created.token_id, issuedAt: created.issued_at, qrSvg: await generateQrSvg(token) };
    });

    if (!outcome) return NextResponse.json({ error: 'student not found' }, { status: 404 });
    return NextResponse.json(outcome, { status: 201 });
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}
