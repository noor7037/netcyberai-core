import { withPlatformService } from '@/lib/auth/db';
import { requestEmailCode } from '@/lib/auth/account';
import { inviteUserToSchool } from '@/lib/auth/admin-actions';
import { emailSenderFromEnv } from '@/lib/email/sender';
import { markProvisioned } from '@/lib/onboarding/applications';
import { inviteSendHandler } from '@/lib/onboarding/invitations';
import { feesNightlyHandler } from '@/lib/fees/nightly';
import { PTM_REMIND_JOB, ptmRemindHandler } from '@/lib/ptm/ptm';
import { bulkRunHandler } from '@/lib/frameworks/bulk-engine';
import { ticketNotifyHandler } from '@/lib/support/tickets';
import { whatsappSendHandler, WHATSAPP_SEND_JOB } from '@/lib/whatsapp/gate';
import { emailSendHandler } from './email-handler';
import { jobQueue } from './pg-queue';
import { runJobs, KICK_BUDGET_MS, RUN_BATCH_CAP, type RunSummary } from './runner';
import type { JobHandler, Sql } from './types';

// Every job type and its handler, wired to production services (C97).
// The WhatsApp job's handler lives in the send-gate itself
// (src/lib/whatsapp/gate.ts): nothing else may call a provider, which
// scripts/check_whatsapp_send_gate.py enforces for all of src/.

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
    // Bulk actions above their syncLimit (C112).
    'bulk.run': bulkRunHandler({ platform }),
    // A new support ticket: the founder's email (C127).
    'ticket.notify': ticketNotifyHandler({ platform, queue: jobQueue }),
    // One queued WhatsApp message (C185): every rule read again at the moment of sending, through the one gate.
    [WHATSAPP_SEND_JOB]: whatsappSendHandler({ platform: withPlatformService, queue: jobQueue }),
    // Each night after midnight in India: overdue dues, late fees where a school has them on, the reconciliation check (C163).
    'fees.nightly': feesNightlyHandler({ platform, queue: jobQueue }),
    // The day before a parent-teacher meeting: each booked parent is reminded (C193).
    [PTM_REMIND_JOB]: ptmRemindHandler({ platform: withPlatformService, queue: jobQueue }),
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
