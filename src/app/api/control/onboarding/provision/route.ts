import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { withTenantContext } from '@/lib/auth/db';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { kickJobs } from '@/lib/jobs/handlers';
import { jobQueue } from '@/lib/jobs/pg-queue';
import { sendStates } from '@/lib/onboarding/invitations';
import { UUID_RE } from '@/lib/onboarding/public-http';
import { parseProvisionInput, provisionSchool, ProvisionDryRun, ProvisionRefused, type ProvisionOutcome } from '@/lib/onboarding/provision';

// Control → Onboarding → Provision a school (W6-E, C230-AU; Decision Log C399). NetCyberAI staff only. One
// transaction makes the school and everything in it (src/lib/onboarding/provision.ts); `dryRun` makes it and undoes
// it, so the screen can show what will be made and every problem first. The school is never taken from the request
// except as "add to the existing school", by its id; the tenant is set here.
//   POST { …ProvisionRequest }  → 201 made, 200 dry run, 400 problems, 409 a school of this name, 422 students list
export const dynamic = 'force-dynamic';

const STATUS: Record<Exclude<ProvisionOutcome, { ok: true }>['reason'], number> = { school_exists: 409, not_found: 404, board: 400, no_plan: 409, students: 422 };

export async function POST(req: NextRequest) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  const body = await req.json().catch(() => null);
  const parsed = parseProvisionInput(body);
  if (!parsed.ok) return NextResponse.json({ error: 'problems', problems: parsed.problems }, { status: 400 });
  const existing = typeof body?.existingSchoolId === 'string' ? body.existingSchoolId : null;
  if (existing !== null && !UUID_RE.test(existing)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const dryRun = body?.dryRun === true;
  const actor = { userId: guard.claims.sub, role: 'super_admin' as const };

  let outcome: ProvisionOutcome;
  try {
    outcome = await withTenantContext(guard.claims, async (db) => {
      const out = await provisionSchool(db, jobQueue, actor, parsed.value, { origin: req.nextUrl.origin, existingSchoolId: existing });
      if (dryRun && out.ok) throw new ProvisionDryRun(out);
      return out;
    });
  } catch (err) {
    if (err instanceof ProvisionDryRun) return NextResponse.json({ dryRun: true, ...err.outcome }, { status: 200 });
    if (err instanceof ProvisionRefused) return NextResponse.json({ dryRun, ...err.outcome }, { status: 422 });
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
  if (!outcome.ok) return NextResponse.json(outcome, { status: STATUS[outcome.reason] });

  // The invitations' jobs run now (the sweeper retries what does not finish), then their state is read back: with
  // their jobs, so a send that failed says so instead of "Waiting to send" (W11-B).
  await kickJobs(outcome.result.jobKeys);
  const ids = outcome.result.invitations.flatMap((i) => (i.invitationId ? [i.invitationId] : []));
  const byId = await withTenantContext(guard.claims, (db) => sendStates(db, ids)).catch(() => new Map<string, { state: string; setting: string | null }>());
  const invitations = outcome.result.invitations.map((i) => {
    const s = i.invitationId ? byId.get(i.invitationId) : undefined;
    return { ...i, sendStatus: i.invitationId ? (s?.state ?? 'waiting') : null, setting: s?.setting ?? null };
  });
  // The new school is on the dashboard, the schools list and its own page at once, not after a reload (W11-B).
  for (const path of ['/control', '/control/schools', `/control/schools/${outcome.result.schoolId}`]) revalidatePath(path);
  return NextResponse.json({ dryRun: false, ok: true, result: { ...outcome.result, invitations, jobKeys: undefined } }, { status: 201 });
}
