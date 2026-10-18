import { writeAuditLog } from '@/lib/audit/log';
import { PENDING_DEAD_SECONDS } from '@/lib/contracts/record-documents';
import { recordPendingFolder } from '@/lib/documents/record-documents';
import type { DirectUploadStorage } from '@/lib/storage/file-storage';
import type { JobHandler, Sql } from './types';

// The hourly sweep of record documents sent and never confirmed (C237, migration c237_pending_sweep).
//
// For every school, the files directly under "<school>/record-documents/pending/" stored more than
// PENDING_DEAD_SECONDS ago are removed: their tickets have all stopped working, so no confirm can reach them, and
// nothing checked them. A kept file (under its record's own folder) is never listed, so never touched. Where
// something went, one audit row in that school with the count only: no file name, no key. A second run finds
// nothing and writes nothing.
//
// The store removes at most 100 files a call on Supabase (oldest first), so a school is asked again while files
// keep going, up to SWEEP_ROUNDS times; what is left waits for the next hour. One school failing does not stop the
// others; the job fails at the end (and is retried) if any school was not done.
//
// While file storage does not work (C236: the key is missing, another project's, or refused), the sweep does
// nothing and succeeds: nothing can be removed from a store that refuses the key, a failing job every hour would only
// bury Monitoring's real failures, and the red line and /api/health already say what is wrong. The first run after the
// key is fixed removes everything over 15 minutes old.

export const PENDING_SWEEP_JOB = 'record_documents.pending_sweep';
export const SWEEP_ROUNDS = 10;

type Platform = <T>(fn: (db: Sql) => Promise<T>) => Promise<T>;

export function pendingSweepHandler(deps: { platform: Platform; storage: DirectUploadStorage; storageWorks?: () => Promise<boolean>; now?: () => number }): JobHandler {
  return async () => {
    if (deps.storageWorks && !(await deps.storageWorks())) return;
    const before = new Date((deps.now ?? Date.now)() - PENDING_DEAD_SECONDS * 1000);
    const schools = await deps.platform(async (db) => (await db.query(`select school_id from schools order by school_id`)).rows.map((r) => r.school_id as string));
    let failed = 0;
    for (const schoolId of schools) {
      try {
        let removed = 0;
        for (let round = 0; round < SWEEP_ROUNDS; round++) {
          const gone = await deps.storage.removeOlderThan(recordPendingFolder(schoolId), before);
          removed += gone;
          if (gone === 0) break;
        }
        if (removed > 0)
          await deps.platform((db) =>
            writeAuditLog(db, { schoolId, actorUserId: null, actorRole: null, eventAction: 'record_document.pending_swept', targetType: 'record_documents', targetId: undefined, beforeState: undefined, afterState: { removed, by: PENDING_SWEEP_JOB } })
          );
      } catch {
        failed += 1;
      }
    }
    if (failed > 0) throw new Error(`${PENDING_SWEEP_JOB}: ${failed} school(s) not done`);
  };
}
