import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { withTenantContext } from '@/lib/auth/db';
import { writeAuditLog } from '@/lib/audit/log';
import { ONBOARDING_STAGES, isValidStageAdvance, type OnboardingStage } from '@/lib/onboarding/stages';
import { computeConsentSummary } from '@/lib/onboarding/consent-summary';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';

// Task 1's gate, enforced server-side, not just described in UI copy:
// leaving consent_collection requires the required purposes to actually
// be complete for every student at this school -- re-checked here, from
// the real consent_ledger state, not trusted from whatever the client
// last rendered. "A consent-completion meter" that the server doesn't
// itself believe before letting the stage move on isn't a gate.
export async function POST(req: NextRequest, { params }: { params: { schoolId: string } }) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;

  const body = await req.json().catch(() => null);
  const toStage = body?.toStage as OnboardingStage | undefined;
  if (!toStage || !ONBOARDING_STAGES.includes(toStage)) {
    return NextResponse.json({ error: 'toStage must be a valid onboarding stage' }, { status: 400 });
  }

  try {
    const result = await withTenantContext(guard.claims, async (client) => {
      const { rows } = await client.query(
        `select school_id, onboarding_stage from schools where school_id = $1 for update`,
        [params.schoolId]
      );
      const school = rows[0];
      if (!school) {
        throw new Error('school not found');
      }
      const fromStage = school.onboarding_stage as OnboardingStage;
      if (!isValidStageAdvance(fromStage, toStage)) {
        throw new StageTransitionError(`cannot advance from ${fromStage} to ${toStage} (must be the next stage in sequence)`);
      }

      if (fromStage === 'consent_collection') {
        const summary = await computeConsentSummary(client, params.schoolId);
        if (!summary.requiredComplete) {
          throw new StageTransitionError(
            `consent collection is not complete for every required purpose across all ${summary.totalStudents} student(s) -- cannot advance to configuration`
          );
        }
      }

      const { rows: updated } = await client.query(
        `update schools set onboarding_stage = $2, onboarding_stage_updated_at = now()
         where school_id = $1
         returning school_id, onboarding_stage`,
        [params.schoolId, toStage]
      );
      await writeAuditLog(client, {
        schoolId: params.schoolId,
        actorUserId: guard.claims.sub,
        actorRole: guard.claims.role,
        eventAction: 'school.onboarding_stage_changed',
        targetType: 'schools',
        targetId: params.schoolId,
        beforeState: { onboarding_stage: fromStage },
        afterState: { onboarding_stage: toStage },
      });
      return updated[0];
    });

    return NextResponse.json({ school: result });
  } catch (err) {
    if (err instanceof StageTransitionError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    if (err instanceof Error && err.message === 'school not found') {
      return NextResponse.json({ error: 'school not found' }, { status: 404 });
    }
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}

class StageTransitionError extends Error {}
