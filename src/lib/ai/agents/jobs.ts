import { log } from '@/lib/observability/log';
import type { JobHandler } from '@/lib/jobs/types';

// The Tutor's slow work (W16-A1, the proposal's M3): job types on the one job queue (src/lib/jobs), never a second
// runner. A1 registers them as stubs that only say they ran; W16-B fills them:
//   tutor.quiz           a short quiz made from a tutor session at its end, kept with review dates (B1, src/lib/family/quiz.ts;
//                        enqueued by public.family_quiz_enqueue(), the sweep that finds sessions that ended)
//   tutor.parent_report  a child's weekly report for the parent (B3): one AI call a child, so a long job
//                        (src/lib/jobs/runner.ts LONG_JOB_TYPES), started only by the sweeper
//   ai.ops_daily         the AI platform's daily look at latency, failures and spend (B4, A5)
// Their payloads carry ids and dates only, never a child's words or a name. They are enqueued by the platform
// (nca_super): no family or school session enqueues them, so the jobs_enqueue policy is unchanged.
export const TUTOR_QUIZ_JOB = 'tutor.quiz';
export const TUTOR_PARENT_REPORT_JOB = 'tutor.parent_report';
export const AI_OPS_DAILY_JOB = 'ai.ops_daily';
export const TUTOR_JOB_TYPES = [TUTOR_QUIZ_JOB, TUTOR_PARENT_REPORT_JOB, AI_OPS_DAILY_JOB] as const;
export type TutorJobType = (typeof TUTOR_JOB_TYPES)[number];

// The stub: it logs its type and attempt (never the payload) and finishes, removing nothing.
export function tutorStubHandler(type: TutorJobType): JobHandler {
  return async (job) => {
    log('info', 'tutor.job_ran', { type, attempts: job.attempts, stub: true });
    return { redact: [] };
  };
}
