import type { PoolClient } from 'pg';
import { writtenForms } from '@/lib/whatsapp/phone';

// A parent answers the day's Pulse (docs/25 slice 7h, C189): "1" (understood) or "2" (my child needs help).
//
// The answer is tied to a Pulse only when it is plain whose it is: the
// number was sent the Pulse of exactly ONE child in the last 24 hours. A
// parent of two children who answers "2" is not guessed at: the message is
// in the school's thread for a person to read, and nothing is recorded here.
// "Needs help" opens a follow-up for that child, in that child's class, so
// it reaches that child's teacher and nobody else's.

type Sql = Pick<PoolClient, 'query'>;
export type PulseAnswer = 'understood' | 'needs_help';
export function pulseAnswer(text: string): PulseAnswer | null {
  const t = text.trim().toLowerCase().replace(/[.!।]+$/, '');
  if (['1', 'understood', 'yes', 'samajh gaye', 'समझ गए', 'समझ गया', 'हाँ'].includes(t)) return 'understood';
  if (['2', 'help', 'needs help', 'need help', 'madad', 'मदद', 'मदद चाहिए'].includes(t)) return 'needs_help';
  return null;
}

export type PulseReply = { recorded: false } | { recorded: true; answer: PulseAnswer; followupOpened: boolean };
// As the platform role, in the webhook's transaction, after the message is in its thread.
export async function notePulseReply(db: Sql, r: { schoolId: string; phone: string; text: string; at: string; providerMessageId: string }): Promise<PulseReply> {
  const answer = pulseAnswer(r.text);
  if (!answer) return { recorded: false };
  const sent = (await db.query(
    `select distinct on (student_id) student_id, parent_id, dedupe_key from communication_log
      where school_id = $1 and template_name = 'daily_pulse' and status::text in ('sent', 'delivered', 'read') and student_id is not null
        and regexp_replace(to_phone, '[^0-9]', '', 'g') = any($2::text[]) and created_at > $3::timestamptz - interval '24 hours' and created_at <= $3::timestamptz
      order by student_id, created_at desc`,
    [r.schoolId, writtenForms(r.phone), r.at]
  )).rows as { student_id: string; parent_id: string | null; dedupe_key: string }[];
  if (sent.length !== 1 || !sent[0].parent_id) return { recorded: false };
  const pulseId = /^pulse:([0-9a-f-]{36}):/.exec(sent[0].dedupe_key)?.[1];
  if (!pulseId) return { recorded: false };
  const made = await db.query(`insert into pulse_response_log (school_id, pulse_id, student_id, parent_id, tier, responded_at, provider_message_id) values ($1, $2, $3, $4, $5, $6, $7) on conflict (provider_message_id) where provider_message_id is not null do nothing`, [r.schoolId, pulseId, sent[0].student_id, sent[0].parent_id, answer === 'understood' ? 1 : 2, r.at, r.providerMessageId]);
  if (made.rowCount !== 1) return { recorded: false };
  if (answer === 'understood') return { recorded: true, answer, followupOpened: false };
  // One open item per child and kind: a second "needs help" does not open a second.
  const opened = await db.query(
    `insert into pulse_followups (school_id, student_id, class_id, kind, reason, source)
     select s.school_id, s.student_id, s.class_id, 'did_not_understand', 'A parent replied to the day''s message that the child needs help.', 'parent_reply'
       from students s where s.school_id = $1 and s.student_id = $2 and s.class_id is not null
        and not exists (select 1 from pulse_followups f where f.school_id = s.school_id and f.student_id = s.student_id and f.kind = 'did_not_understand' and f.status = 'open')`,
    [r.schoolId, sent[0].student_id]
  );
  return { recorded: true, answer, followupOpened: opened.rowCount === 1 };
}
