import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { withTenantContext } from '@/lib/auth/db';
import { computeConsentSummary } from '@/lib/onboarding/consent-summary';
import { REQUIRED_CONSENT_PURPOSES } from '@/lib/onboarding/stages';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';

// Backs the onboarding wizard's consent-completion meter. Reads only --
// this prompt's own scope explicitly excludes the consent request/
// verification flows themselves (Prompt G). No endpoint here can ever
// write a consent_ledger row; there is deliberately no bulk-mark action,
// because a bulk "mark as consented" defeats the entire point of the
// gate and creates worse exposure than an honest incomplete state (PRD
// §7.2's own warning, restated in this prompt).
export async function GET(req: NextRequest, { params }: { params: { schoolId: string } }) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;

  let summary;
  try {
    summary = await withTenantContext(guard.claims, (client) => computeConsentSummary(client, params.schoolId));
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }

  return NextResponse.json({
    totalStudents: summary.totalStudents,
    requiredPurposes: REQUIRED_CONSENT_PURPOSES,
    grantedByPurpose: summary.grantedByPurpose,
    requiredComplete: summary.requiredComplete,
    percentComplete:
      summary.totalStudents === 0
        ? 0
        : Math.round(
            (REQUIRED_CONSENT_PURPOSES.reduce((sum, p) => sum + summary.grantedByPurpose[p], 0) /
              (REQUIRED_CONSENT_PURPOSES.length * summary.totalStudents)) *
              100
          ),
  });
}
