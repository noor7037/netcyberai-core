import { withPlatformService } from '@/lib/auth/db';
import { requestEmailCode } from '@/lib/auth/account';
import { inviteUserToSchool } from '@/lib/auth/admin-actions';
import { emailSenderFromEnv } from '@/lib/email/sender';
import { markProvisioned } from '@/lib/onboarding/applications';
import { inviteSendHandler } from '@/lib/onboarding/invitations';
import { emailSendHandler } from './email-handler';
import { jobQueue } from './pg-queue';
import { runJobs, KICK_BUDGET_MS, RUN_BATCH_CAP, type RunSummary } from './runner';
import type { JobHandler, Sql } from './types';

// Every job type and its handler, wired to production services (C97).
// There is no WhatsApp job yet; when there is, its handler calls
// sendWhatsAppMessage (src/lib/whatsapp/gate.ts) and nothing else, which
// scripts/check_whatsapp_send_gate.py already enforces for all of src/.

const platform = withPlatformService as <T>(fn: (db: Sql) => Promise<T>) => Promise<T>;

export function productionHandlers(): Record<string, JobHandler> {
  return {
    'email.send': emailSendHandler({ sender: emailSenderFromEnv, platform }),
    'invite.send': inviteSendHandler({
      platform,
      queue: jobQueue,
      inviteUser: inviteUserToSchool,
      sendPasswordEmail: (email, redirectTo) => requestEmailCode(email, 'reset', redirectTo),
      markProvisioned,
    }),
  };
}

export function runDueJobs(): Promise<RunSummary> {
  return runJobs({ handlers: productionHandlers(), limit: RUN_BATCH_CAP });
}

// Right after a request commits: run the jobs it just enqueued, within a
// short budget. Never throws; whatever is not done here the sweeper does.
export async function kickJobs(idempotencyKeys: string[]): Promise<void> {
  if (!idempotencyKeys.length) return;
  try {
    await runJobs({ handlers: productionHandlers(), onlyKeys: idempotencyKeys, limit: idempotencyKeys.length, budgetMs: KICK_BUDGET_MS });
  } catch (err) {
    console.error('[jobs] kick failed; the sweeper will retry', err instanceof Error ? err.name : 'error');
  }
}
