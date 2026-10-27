import { writeAuditLog } from '@/lib/audit/log';
import { log } from '@/lib/observability/log';
import type { FileStorage } from '@/lib/storage/file-storage';
import type { JobHandler, Sql } from '@/lib/jobs/types';

// How long answer-sheet pictures are kept (C230-AG, migration am_7_followups): the hourly sweep that deletes them.
//
// A paper's page pictures go the school's "script_days" (Exams settings, 30 to 365, else 90) after its class's
// publication in force; a page a teacher took out of its script goes at the next run. The database says which are due
// (marking_pictures_due, for the platform role only) and records each one deleted (marking_pictures_gone, also the
// platform's only). The store deletes first, then the row is marked: a picture is never marked gone while it is
// still stored, and one deleted but not yet marked is deleted again (nothing) and marked by the next run. The marks,
// each question's marks and the teacher's notes stay. Where pictures went, one audit row in that school with the
// count only: no page, no child, no key.
//
// While file storage does not work, the sweep does nothing and succeeds (as the pending sweep, C237): a failing job
// every hour would only bury Monitoring's real failures; the first run after the store is back catches up.

export const PICTURES_SWEEP_JOB = 'marking.pictures_sweep';
// Asked for at a time, and rounds a run: at most 1,000 pictures an hour, a few at a time, well inside a job's time.
export const SWEEP_BATCH = 200;
export const SWEEP_ROUNDS = 5;
const AT_ONCE = 8;

type Platform = <T>(fn: (db: Sql) => Promise<T>) => Promise<T>;
type Due = { school_id: string; page_id: string; storage_key: string };

export function picturesSweepHandler(deps: { platform: Platform; storage: Pick<FileStorage, 'remove'>; storageWorks?: () => Promise<boolean> }): JobHandler {
  return async () => {
    if (deps.storageWorks && !(await deps.storageWorks())) return;
    const bySchool = new Map<string, number>();
    let notDeleted = 0;
    for (let round = 0; round < SWEEP_ROUNDS; round++) {
      const due = await deps.platform(async (db) => (await db.query(`select school_id, page_id, storage_key from public.marking_pictures_due($1)`, [SWEEP_BATCH])).rows as Due[]);
      if (!due.length) break;
      const deleted: Due[] = [];
      let next = 0;
      const worker = async () => {
        while (next < due.length) {
          const d = due[next++];
          // The key is the database's own (<school>/marking/<paper>/<page>.jpg, held by a check); never another area's.
          if (!d.storage_key.startsWith(`${d.school_id}/marking/`)) {
            notDeleted += 1;
            continue;
          }
          try {
            await deps.storage.remove(d.storage_key);
            deleted.push(d);
          } catch {
            notDeleted += 1;
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(AT_ONCE, due.length) }, worker));
      if (deleted.length) {
        await deps.platform((db) => db.query(`select public.marking_pictures_gone($1::uuid[])`, [deleted.map((d) => d.page_id)]));
        for (const d of deleted) bySchool.set(d.school_id, (bySchool.get(d.school_id) ?? 0) + 1);
      }
      // Some were not deleted: the rest wait for the next hour rather than being asked for again now.
      if (deleted.length < due.length || due.length < SWEEP_BATCH) break;
    }
    for (const [schoolId, deleted] of bySchool) {
      try {
        await deps.platform((db) =>
          writeAuditLog(db, { schoolId, actorUserId: null, actorRole: null, eventAction: 'marking.pictures_deleted', targetType: 'marking_pages', targetId: undefined, beforeState: undefined, afterState: { deleted, by: PICTURES_SWEEP_JOB } })
        );
      } catch {
        // The pictures are gone and marked; the count goes to the log, with the school's id only.
        log('error', 'marking.pictures_sweep.not_audited', { schoolId, deleted });
      }
    }
    if (notDeleted > 0) throw new Error(`${PICTURES_SWEEP_JOB}: ${notDeleted} picture(s) not deleted`);
  };
}
