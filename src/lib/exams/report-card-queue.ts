import type { Sql } from '@/lib/jobs/types';
import { ON_ROLL, ROLL_ORDER } from './papers';

// Report cards made on publish (W14-F): one job a child of the class ('exam.report_card'), queued in the publishing
// transaction, so a result that is published has its cards made with nothing more to press. The key is the exam, the
// class, the child and the publication's version: publishing again (after a reopening) is a new version and queues
// them again; queuing the same version twice (a double press, "make them now") queues nothing twice. The job itself
// is ./report-card-files.ts (it imports the publication, so this file stays free of it for publish.ts to import).

export const REPORT_CARD_JOB = 'exam.report_card';
export const REPORT_CARD_ATTEMPTS = 5;

export type EnqueueLike = { enqueue: (db: Sql, spec: { type: string; payload: Record<string, unknown>; idempotencyKey: string; schoolId?: string | null; maxAttempts?: number }) => Promise<unknown> };

export const reportCardJobKey = (examId: string, classId: string, studentId: string, version: number) => `${REPORT_CARD_JOB}:${examId}:${classId}:${studentId}:v${version}`;

// Queues one job for each child on the class's roll, in roll order; the keys, for running them at once after commit.
export async function queueReportCards(
  db: Sql,
  queue: EnqueueLike,
  schoolId: string,
  examId: string,
  classId: string,
  pub: { publicationId: string; version: number }
): Promise<string[]> {
  const roll = (await db.query(`select s.student_id from students s where s.school_id = $1 and s.class_id = $2 and ${ON_ROLL} order by ${ROLL_ORDER}`, [schoolId, classId])).rows as { student_id: string }[];
  const keys: string[] = [];
  for (const r of roll) {
    const idempotencyKey = reportCardJobKey(examId, classId, r.student_id, pub.version);
    await queue.enqueue(db, {
      type: REPORT_CARD_JOB,
      payload: { examId, classId, studentId: r.student_id, publicationId: pub.publicationId, version: pub.version },
      idempotencyKey,
      schoolId,
      maxAttempts: REPORT_CARD_ATTEMPTS,
    });
    keys.push(idempotencyKey);
  }
  return keys;
}
