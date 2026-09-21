import { NextRequest, NextResponse } from 'next/server';
import { requireAppSession, canWriteMasterData } from '@/lib/auth/require-app-session';
import { withTenantContext } from '@/lib/auth/db';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { writeAuditLog } from '@/lib/audit/log';
import { assertRowsAffected, NoRowsAffectedError } from '@/lib/db/rows';

// Revocation without reissue -- a card reported lost with no
// replacement printed yet. "Inert on reissue, not on a timer" (PRD
// Sec6.2): this route makes a token inert immediately, on demand, with
// no expiry window either way.
export async function POST(req: NextRequest, { params }: { params: { tokenId: string } }) {
  const guard = await requireAppSession(req);
  if ('error' in guard) return guard.error;
  if (!canWriteMasterData(guard.claims.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const reason = typeof body?.reason === 'string' && body.reason.trim() ? body.reason.trim() : 'lost';

  try {
    await withTenantContext(guard.claims, async (client) => {
      const result = await client.query(
        `update student_qr_tokens set revoked_at = now(), revoked_by = $1, revoke_reason = $2
         where school_id = $3 and token_id = $4 and revoked_at is null`,
        [guard.claims.sub, reason, guard.claims.schoolId, params.tokenId]
      );
      assertRowsAffected(result, `qr token ${params.tokenId} revoke matched 0 rows`);
      await writeAuditLog(client, {
        schoolId: guard.claims.schoolId,
        actorUserId: guard.claims.sub,
        actorRole: guard.claims.role,
        eventAction: 'qr_token.revoke',
        targetType: 'student_qr_tokens',
        targetId: params.tokenId,
        afterState: { reason },
      });
    });
    return NextResponse.json({ status: 'revoked' });
  } catch (err) {
    if (err instanceof NoRowsAffectedError) {
      return NextResponse.json({ error: 'token not found or already revoked' }, { status: 404 });
    }
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}
