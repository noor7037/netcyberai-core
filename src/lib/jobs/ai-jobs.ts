import { prepareSmokeTest } from '@/lib/ai/platform';
import { writeAuditLog } from '@/lib/audit/log';
import { SMOKE_PHOTO_JPEG, SMOKE_SPEECH } from '@/demo-fixture/ai-smoke/inputs';
import { prepareJobStep, preparePayload, type PrepareJobPayload } from '@/lib/family/prepare';
import { indiaDate } from '@/lib/time/india';
import { PermanentJobError, type JobHandler, type JobQueue, type Sql } from './types';

// Two jobs NetCyberAI staff start without a browser open (W2, C316), each summed up in the audit log for Control:
//   ai.smoke         one live call to each children's AI feature with made-up inputs (C316)
//   content.prepare  prepare a set of chapters' explanations for review, one line per run (C300, C313)
// The payload names the staff member (`by`, a super admin's user id) the work and the audit row are recorded under.
export const AI_SMOKE_JOB = 'ai.smoke';
export const CONTENT_PREPARE_JOB = 'content.prepare';

type Platform = <T>(fn: (db: Sql) => Promise<T>) => Promise<T>;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function activeStaff(platform: Platform, by: unknown): Promise<string> {
  if (typeof by !== 'string' || !UUID_RE.test(by)) throw new PermanentJobError('payload needs by');
  const ok = await platform(async (db) => (await db.query(`select 1 from users where user_id = $1 and role = 'super_admin' and is_active`, [by])).rows.length === 1);
  if (!ok) throw new PermanentJobError('by is not active NetCyberAI staff');
  return by;
}

export function aiSmokeHandler({ platform }: { platform: Platform }): JobHandler {
  return async (job) => {
    const by = await activeStaff(platform, job.payload.by);
    const ctx = { accountId: by, childFirstNames: [], day: indiaDate() };
    const prepared = await platform((db) => prepareSmokeTest(db, ctx, { photoJpegBase64: SMOKE_PHOTO_JPEG, speech: SMOKE_SPEECH }));
    const checks = await prepared.send();
    await platform(async (db) => {
      await prepared.record(db);
      await writeAuditLog(db, { schoolId: null, actorUserId: by, actorRole: 'super_admin', eventAction: 'ai.smoke_test', targetType: 'ai_platform', targetId: 'smoke', afterState: { checks } });
    });
  };
}

export function contentPrepareHandler({ platform, queue }: { platform: Platform; queue: JobQueue }): JobHandler {
  return async (job) => {
    const payload = preparePayload(job.payload);
    if (!payload) throw new PermanentJobError('bad content.prepare payload');
    await activeStaff(platform, payload.by);
    const runId = payload.runId ?? job.idempotencyKey;
    const step = await prepareJobStep(platform as never, payload);
    if (step.next) {
      const next: PrepareJobPayload = { ...step.next, runId };
      await platform((db) => queue.enqueue(db, { type: CONTENT_PREPARE_JOB, payload: next, idempotencyKey: `${runId}:${next.outcomes.length}`, maxAttempts: 2 }));
      return;
    }
    const kept = step.outcomes.filter((o) => o.outcome === 'kept').length;
    await platform((db) =>
      writeAuditLog(db, {
        schoolId: null,
        actorUserId: payload.by,
        actorRole: 'super_admin',
        eventAction: 'content.prepare_run',
        targetType: 'syllabus_version',
        targetId: payload.versionId,
        afterState: { runId, chapterKeys: payload.chapterKeys, tried: step.outcomes.length, kept, outcomes: step.outcomes, state: step.state },
      })
    );
  };
}
