import { NextRequest, NextResponse } from 'next/server';
import { requireAppSession, canWriteMasterData } from '@/lib/auth/require-app-session';
import { withTenantContext } from '@/lib/auth/db';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { writeAuditLog } from '@/lib/audit/log';
import {
  ALL_CONSENT_PURPOSES,
  GuardianNotActiveError,
  getConsentEligibility,
  getConsentHistory,
  recordConsentDecision,
  type ConsentPurpose,
} from '@/lib/consent/gate';
import { ruleError } from '@/lib/frameworks/route';

const NOTICE_VERSION = 'v1'; // bumped when the consent notice text itself changes; static for now, no notice UI exists yet

// GET: current eligibility for all six purposes plus the full,
// append-only history -- proves grant/withdraw rows both survive
// (Task 1's own VERIFY requirement), never a mutated single row.
export async function GET(req: NextRequest, { params }: { params: { studentId: string } }) {
  const guard = await requireAppSession(req);
  if ('error' in guard) return guard.error;

  try {
    const { eligibility, history } = await withTenantContext(guard.claims, async (client) => ({
      eligibility: await getConsentEligibility(client, guard.claims.schoolId, params.studentId),
      history: await getConsentHistory(client, guard.claims.schoolId, params.studentId),
    }));
    return NextResponse.json({ eligibility, history });
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}

// POST: record a grant or withdrawal. Always an INSERT (consent_ledger
// no longer grants app_user UPDATE/DELETE at all, Decision Log C51) --
// a withdrawal is simply granted=false, a new row, same as a grant.
export async function POST(req: NextRequest, { params }: { params: { studentId: string } }) {
  const guard = await requireAppSession(req);
  if ('error' in guard) return guard.error;
  if (!canWriteMasterData(guard.claims.role)) {
    return ruleError(403, 'not_allowed');
  }

  const body = await req.json().catch(() => null);
  const purpose = body?.purpose;
  const granted = body?.granted;
  const parentId = body?.parentId;
  if (!(ALL_CONSENT_PURPOSES as readonly string[]).includes(purpose)) {
    return ruleError(400, 'choose_one', { field: 'purpose' });
  }
  if (typeof granted !== 'boolean') {
    return ruleError(400, 'choose_one', { field: 'decision' });
  }
  if (typeof parentId !== 'string') {
    return ruleError(400, 'choose_one', { field: 'guardian' });
  }

  try {
    const row = await withTenantContext(guard.claims, async (client) => {
      const result = await recordConsentDecision(client, {
        schoolId: guard.claims.schoolId,
        studentId: params.studentId,
        purpose: purpose as ConsentPurpose,
        granted,
        parentId,
        actorUserId: guard.claims.sub,
        noticeVersion: NOTICE_VERSION,
      });
      await writeAuditLog(client, {
        schoolId: guard.claims.schoolId,
        actorUserId: guard.claims.sub,
        actorRole: guard.claims.role,
        eventAction: granted ? 'consent.granted' : 'consent.withdrawn',
        targetType: 'consent_ledger',
        targetId: result.consent_id,
        afterState: { studentId: params.studentId, purpose, parentId },
      });
      return result;
    });
    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    if (err instanceof GuardianNotActiveError) {
      return ruleError(409, 'guardian_not_verified');
    }
    if (err instanceof Error && err.message === 'this guardian is not linked to this student') {
      return ruleError(400, 'guardian_not_linked');
    }
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}
