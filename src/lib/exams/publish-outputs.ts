import type { PoolClient } from 'pg';
import { writeAuditLog } from '@/lib/audit/log';
import { isUuid } from '@/lib/frameworks/custom-fields';
import type { Sql } from '@/lib/jobs/types';
import { TELL_ROLES, tellParentsSend } from '@/lib/marking/result-send';
import type { QueueLike } from '@/lib/whatsapp/gate';
import type { Actor } from './exams';
import { publicationInForce } from './publish';

// "Publish and notify" (C230-AJ part 5, slice E): after the class's marks are approved and the principal (or the office)
// has published the class, ONE action on the class result queues one WhatsApp message per guardian, lets the Family
// app's push job tell the families, and records that it was done, once per publication. The progress reports reach
// families at publication without it (C230-AK). Nothing here changes who approves or publishes: it needs a publication
// in force and does not touch it.
//
//   - Report cards and progress reports are drawn from the publication when they are asked for (report-card.ts,
//     progress-report.ts); the action is recorded (exam_outputs, one row a publication, never changed), which is what
//     the push job counts the class as news by, and what keeps the messages to once a publication.
//   - The WhatsApp messages are the previewed send of AM-5 (result-send.ts, unchanged): the same preview (who will get
//     it and why the others will not, by the send-gate's own rules), the same approved template (exam_result_ready, no
//     mark in the words), one message per guardian and publication, only through the send-gate's outbox. A second press
//     finds every message it queued and queues none. Nothing here calls a provider.
//   - Who: the principal and the school admin (TELL_ROLES), as telling parents is. A teacher and the academic
//     coordinator cannot; the database says the same (exam_outputs_made_by_office).
//   - The audit row holds ids and counts.

export const OUTPUT_ROLES = TELL_ROLES;

export type OutputsState = { version: number; made: boolean; madeAt: string | null };
export type OutputsProblem = 'not_allowed' | 'not_found' | 'not_published';

async function inForce(db: Sql, actor: Actor, examId: string, classId: string) {
  if (!OUTPUT_ROLES.includes(actor.role as never)) return 'not_allowed' as const;
  if (!isUuid(examId) || !isUuid(classId)) return 'not_found' as const;
  const exam = (await db.query(`select 1 from exams where school_id = $1 and exam_id = $2`, [actor.schoolId, examId])).rows[0];
  if (!exam) return 'not_found' as const;
  return (await publicationInForce(db, actor.schoolId, examId, classId)) ?? ('not_published' as const);
}

// Whether the outputs of the publication in force were made, and when.
export async function outputsState(db: Sql, actor: Actor, examId: string, classId: string): Promise<OutputsState | OutputsProblem> {
  const pub = await inForce(db, actor, examId, classId);
  if (typeof pub === 'string') return pub;
  const made = (await db.query(`select made_at from exam_outputs where school_id = $1 and publication_id = $2`, [actor.schoolId, pub.publicationId])).rows[0] as { made_at: Date | string } | undefined;
  return { version: pub.version, made: Boolean(made), madeAt: made ? new Date(made.made_at).toISOString() : null };
}

export type OutputsResult = { ok: true; version: number; first: boolean; queued: number; children: number } | { ok: false; reason: OutputsProblem };

// The action. The first press records the outputs and queues the messages; a later press (a double click, a retry, a child
// whose guardian was added since) records nothing again and queues only what is still unsent.
export async function publishAndNotify(db: PoolClient, queue: QueueLike, actor: Actor, examId: string, classId: string): Promise<OutputsResult> {
  const pub = await inForce(db, actor, examId, classId);
  if (typeof pub === 'string') return { ok: false, reason: pub };
  // The send first: a send the office may not make leaves no outputs behind, so families never see the progress
  // report of a class whose parents were not told (security review of AJ-5).
  const sent = await tellParentsSend(db, queue, actor, examId, classId);
  if (!sent.ok) return { ok: false, reason: sent.reason };
  const made = await db.query(
    `insert into exam_outputs (school_id, publication_id, made_by) values ($1, $2, $3) on conflict (school_id, publication_id) do nothing returning output_id`,
    [actor.schoolId, pub.publicationId, actor.userId]
  );
  const first = (made.rowCount ?? 0) > 0;
  if (first) {
    await writeAuditLog(db, {
      schoolId: actor.schoolId,
      actorUserId: actor.userId,
      actorRole: actor.role,
      eventAction: 'exam.outputs_made',
      targetType: 'exam_outputs',
      targetId: (made.rows[0] as { output_id: string }).output_id,
      afterState: { exam_id: examId, class_id: classId, version: pub.version, children: sent.children, queued: sent.queued },
    });
  }
  return { ok: true, version: pub.version, first, queued: sent.queued, children: sent.children };
}
