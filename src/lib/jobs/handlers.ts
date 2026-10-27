import { withPlatformService } from '@/lib/auth/db';
import { requestEmailCode } from '@/lib/auth/account';
import { inviteUserToSchool } from '@/lib/auth/admin-actions';
import { emailSenderFromEnv } from '@/lib/email/sender';
import { markProvisioned } from '@/lib/onboarding/applications';
import { inviteSendHandler } from '@/lib/onboarding/invitations';
import { COMPLAINT_ESCALATE_JOB, complaintEscalateHandler } from '@/lib/complaints/complaints';
import { BILLING_NIGHTLY_JOB, billingNightlyHandler } from '@/lib/control/billing-nightly';
import { EVENT_REMIND_JOB, eventRemindHandler } from '@/lib/events/events';
import { feesNightlyHandler } from '@/lib/fees/nightly';
import { PTM_REMIND_JOB, ptmRemindHandler } from '@/lib/ptm/ptm';
import { bulkRunHandler } from '@/lib/frameworks/bulk-engine';
import { ticketNotifyHandler } from '@/lib/support/tickets';
import { whatsappSendHandler, WHATSAPP_SEND_JOB } from '@/lib/whatsapp/gate';
import { AI_SMOKE_JOB, CONTENT_PREPARE_JOB, aiSmokeHandler, contentPrepareHandler } from './ai-jobs';
import { DEMO_SETUP_JOB, demoSetupHandler } from './demo-setup';
import { PUSH_SCAN_JOB, pushScanHandler } from '@/lib/family/push';
import { markingGroupHandler, markingMarkHandler, markingReadHandler } from '@/lib/marking/pipeline';
import { MARKING_GROUP_JOB, MARKING_MARK_JOB, MARKING_READ_JOB } from '@/lib/marking/queue';
import { PICTURES_SWEEP_JOB, picturesSweepHandler } from '@/lib/marking/retention';
import { ONLINE_MARK_JOB, ONLINE_SWEEP_JOB, onlineMarkHandler, onlineSweepHandler } from '@/lib/online/mark';
import { emailSendHandler } from './email-handler';
import { recordHandledTypes } from './handled-types';
import { jobQueue } from './pg-queue';
import { runJobs, KICK_BUDGET_MS, RUN_BATCH_CAP, type RunSummary } from './runner';
import { NIGHTLY_CHECK_JOB, WEEKLY_CHECK_UP_JOB, auditorWeeklyHandler, earlyWarningNightlyHandler } from './school-checks';
import { asSchool } from './school-context';
import { PENDING_SWEEP_JOB, pendingSweepHandler } from './pending-sweep';
import { supabaseFileStorage } from '@/lib/storage/supabase-file-storage';
import { storageHealth } from '@/lib/observability/storage-health';
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
    // The day before a school event: everyone invited who did not say no (C194).
    [EVENT_REMIND_JOB]: eventRemindHandler({ platform: withPlatformService, queue: jobQueue }),
    // A complaint still open at its due time is passed to the principal (C195).
    [COMPLAINT_ESCALATE_JOB]: complaintEscalateHandler({ platform: withPlatformService, queue: jobQueue }),
    // Each night after midnight in India: a school past its paid-until day goes into grace, then read-only (C204).
    [BILLING_NIGHTLY_JOB]: billingNightlyHandler({ platform }),
    // Each night after midnight in India, one job a school with Early Warning on: the check "Check now" runs, in the
    // school's own session as its office sees it, with no person (C210).
    [NIGHTLY_CHECK_JOB]: earlyWarningNightlyHandler({ asSchool }),
    // Early each Monday in India, one job a school with the auditor on: the week's check-up, the same way (C210).
    [WEEKLY_CHECK_UP_JOB]: auditorWeeklyHandler({ asSchool }),
    // Each hour: every school's record documents sent and never confirmed, older than 15 minutes, are removed (C237).
    [PENDING_SWEEP_JOB]: pendingSweepHandler({ platform, storage: supabaseFileStorage, storageWorks: async () => (await storageHealth()) === 'ok' }),
    // W2 (C316): the AI smoke test, and preparing chapters' explanations for review one line per run.
    [AI_SMOKE_JOB]: aiSmokeHandler({ platform }),
    [CONTENT_PREPARE_JOB]: contentPrepareHandler({ platform, queue: jobQueue }),
    // W2 item 1 (C324): the internal demo pilot's school on the test database, built through the app's own functions.
    [DEMO_SETUP_JOB]: demoSetupHandler({ platform, queue: jobQueue }),
    // Every ten minutes: a linked family's browsers hear of new homework, notices and results, and tonight's practice
    // or plan once an evening, each account inside its own family session (M3-8b, C339).
    [PUSH_SCAN_JOB]: pushScanHandler({ platform }),
    // AM-2 (C347): AI answer-sheet marking, in the school's own session as its office sees it, with no person (the
    // 'marking.pipeline' school job). Reading a run of pages and marking a script wait for the AI: the runner starts at
    // most one of those a run (./runner.ts, LONG_JOB_TYPES). Making the scripts is quick.
    [MARKING_READ_JOB]: markingReadHandler({ asSchool, queue: jobQueue, storage: supabaseFileStorage }),
    [MARKING_GROUP_JOB]: markingGroupHandler({ asSchool, queue: jobQueue }),
    [MARKING_MARK_JOB]: markingMarkHandler({ asSchool, queue: jobQueue, storage: supabaseFileStorage }),
    // C230-AG: answer-sheet pictures deleted after the school's days (and pages taken out), hourly, as the platform.
    [PICTURES_SWEEP_JOB]: picturesSweepHandler({ platform, storage: supabaseFileStorage, storageWorks: async () => (await storageHealth()) === 'ok' }),
    // AQ-4 (C365): an online test's script, made and marked in the school's marking session (its written answers wait
    // for the AI, so it is a long job: ./runner.ts); and every two minutes, as the platform, attempts past their
    // deadline are timed out and ended attempts without a script are queued.
    [ONLINE_MARK_JOB]: onlineMarkHandler({ asSchool }),
    [ONLINE_SWEEP_JOB]: onlineSweepHandler({ platform }),
  };
}

// The sweeper. First it writes down the job types this deployed code can run (C210, ./handled-types.ts): the
// database queues a scheduled school check only once its type is on that list, so nothing is queued before the code
// that runs it is deployed. A write is made only when the list changed. If it fails, the jobs still run.
export async function runDueJobs(): Promise<RunSummary> {
  const handlers = productionHandlers();
  try {
    await recordHandledTypes(platform, Object.keys(handlers));
  } catch (err) {
    console.error('[jobs] could not record the job types this code runs', err instanceof Error ? err.name : 'error');
  }
  return runJobs({ handlers, limit: RUN_BATCH_CAP, longJobs: true });
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
