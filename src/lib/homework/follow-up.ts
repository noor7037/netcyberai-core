import type { PoolClient } from 'pg';
import { PermanentJobError, type JobHandler, type Sql } from '@/lib/jobs/types';
import { schoolCalendar, type WorkingCalendar } from '@/lib/payments/upi';
import { oneLine } from '@/lib/pulse/send';
import { indiaDate, isIsoDate } from '@/lib/time/india';
import { languageFor, queueWhatsAppMessage, type QueueLike } from '@/lib/whatsapp/gate';
import { normalizePhone } from '@/lib/whatsapp/phone';
import { templateToSend, type TemplateLanguage } from '@/lib/whatsapp/templates';

// Homework follow-up on WhatsApp (C544). Each morning in India, after quiet hours, for every school with Homework on:
// the homework due on the school day before today (the school's own working days and holidays) that the teacher
// marked "Not done" (homework_status.done = false, explicitly; homework nobody marked is never counted), one message
// per child and guardian, naming the child by first name, the subjects (at most three, then "and N more") and the
// day. Nothing else about the child: no title, no mark, no other child.
//
// Every message goes through the one send-gate's outbox (queueWhatsAppMessage, C185), which decides whether it may go
// and reads every rule again when it is sent: the pilot switch, consent for `operational_communication`, the
// number's STOP, quiet hours (held, not dropped), the budget, our approval and Meta's of `homework_follow_up`, and
// the test-school rule (the stand-in only). Its dedupe key is the child, the guardian and the day, so a second run,
// or a retry, sends nothing twice.

export const HOMEWORK_FOLLOW_UP_JOB = 'homework.follow_up';
export const HOMEWORK_FOLLOW_UP_TEMPLATE = 'homework_follow_up';
const MOST_SUBJECTS = 3;

// The school day before `today` (India dates): the latest earlier day the school works, sixty days back at the most.
export function previousSchoolDay(calendar: WorkingCalendar, today: string): string | null {
  const t = Date.parse(`${today}T00:00:00Z`);
  for (let back = 1; back <= 60; back += 1) {
    const d = new Date(t - back * 86_400_000);
    const iso = d.toISOString().slice(0, 10);
    if (calendar.weekdays.has(d.getUTCDay()) && !calendar.holidays.has(iso)) return iso;
  }
  return null;
}

// "Maths", "Maths and Hindi", "Maths, Hindi and English", "Maths, Hindi, English and 2 more", in the message's language.
export function subjectsPhrase(subjects: readonly string[], language: TemplateLanguage): string {
  const and = language === 'hi' ? 'और' : 'and';
  const names = subjects.map(oneLine).filter(Boolean);
  if (names.length <= 1) return names[0] ?? '';
  if (names.length <= MOST_SUBJECTS) return `${names.slice(0, -1).join(', ')} ${and} ${names[names.length - 1]}`;
  const more = names.length - MOST_SUBJECTS;
  return `${names.slice(0, MOST_SUBJECTS).join(', ')} ${and} ${more} ${language === 'hi' ? 'अन्य' : 'more'}`;
}

export type FollowUpRun = { day: string | null; children: number; queued: number; held: number; withoutNumber: number };

// One school, one morning, in the caller's transaction (the platform role).
export async function homeworkFollowUpForSchool(db: Sql, queue: QueueLike, schoolId: string, today: string): Promise<FollowUpRun> {
  const day = previousSchoolDay(await schoolCalendar(db, schoolId), today);
  const out: FollowUpRun = { day, children: 0, queued: 0, held: 0, withoutNumber: 0 };
  if (!day) return out;
  // Each active child of this school with homework due that day marked not done, and its subjects.
  const children = (await db.query(
    `select hs.student_id, split_part(btrim(st.name), ' ', 1) as child, to_char(t.due_date, 'DD-MM-YYYY') as due,
            array_agg(distinct sub.name order by sub.name) as subjects
       from homework_status hs
       join homework_targets t on t.school_id = hs.school_id and t.target_id = hs.target_id and t.class_id = hs.class_id
       join homework h on h.school_id = t.school_id and h.homework_id = t.homework_id
       join subjects sub on sub.school_id = h.school_id and sub.subject_id = h.subject_id
       join students st on st.school_id = hs.school_id and st.student_id = hs.student_id and st.status = 'active'
      where hs.school_id = $1 and hs.done = false and t.due_date = $2::date
      group by hs.student_id, st.name, t.due_date order by st.name, hs.student_id`,
    [schoolId, day]
  )).rows as { student_id: string; child: string; due: string; subjects: string[] }[];
  out.children = children.length;
  if (!children.length) return out;
  // Their guardians in this school only.
  const guardians = (await db.query(
    `select m.student_id, p.parent_id, p.phone from parent_student_map m join parents p on p.school_id = m.school_id and p.parent_id = m.parent_id
      where m.school_id = $1 and m.student_id = any($2::uuid[]) order by m.student_id, p.created_at, p.parent_id`,
    [schoolId, children.map((c) => c.student_id)]
  )).rows as { student_id: string; parent_id: string; phone: string | null }[];
  // Hindi only where its version is approved and its wording reviewed (C190); otherwise English, the subjects too.
  const hindiReady = (await templateToSend(db, schoolId, HOMEWORK_FOLLOW_UP_TEMPLATE, 'hi', false))?.language === 'hi';
  const told = new Set<string>();
  for (const c of children) {
    for (const g of guardians.filter((x) => x.student_id === c.student_id)) {
      const phone = normalizePhone(String(g.phone ?? ''));
      if (!phone) {
        out.withoutNumber += 1;
        continue;
      }
      // One message per child and number, however many guardian rows share the number.
      if (told.has(`${c.student_id}:${phone}`)) continue;
      told.add(`${c.student_id}:${phone}`);
      const language: TemplateLanguage = hindiReady && (await languageFor(db, schoolId, g.parent_id)) === 'hi' ? 'hi' : 'en';
      const r = await queueWhatsAppMessage(db as PoolClient, queue, {
        schoolId,
        studentId: c.student_id,
        parentId: g.parent_id,
        purpose: 'operational_communication',
        toPhone: phone,
        templateName: HOMEWORK_FOLLOW_UP_TEMPLATE,
        templateParams: { child: oneLine(c.child), subjects: subjectsPhrase(c.subjects, language), date: c.due },
        language,
        dedupeKey: `homework_follow_up:${c.student_id}:${g.parent_id}:${day}`,
      });
      if (r.status === 'queued') out.queued += 1;
      else out.held += 1;
    }
  }
  return out;
}

type Platform = <T>(fn: (db: Sql) => Promise<T>) => Promise<T>;
// The morning job: every school with Homework on, each in its own transaction, so one school's failure does not undo
// another's. A failure is retried by the queue; what was queued before is not queued again (the dedupe key).
export function homeworkFollowUpHandler(deps: { platform: Platform; queue: QueueLike; now?: () => Date }): JobHandler {
  return async (job) => {
    const today = indiaDate((deps.now ?? (() => new Date()))());
    const asked = job.payload.date;
    if (asked !== undefined && !isIsoDate(asked)) throw new PermanentJobError(`${HOMEWORK_FOLLOW_UP_JOB}: bad date`);
    // A job that waited in the queue runs for the day it is now, never for a day still to come.
    if (typeof asked === 'string' && asked > today) throw new Error(`${HOMEWORK_FOLLOW_UP_JOB}: that day has not begun in India`);
    const schools = await deps.platform(async (db) => (await db.query(`select school_id from school_module_entitlements where module_id = 'homework' and enabled order by school_id`)).rows.map((r) => r.school_id as string));
    let failed = 0;
    for (const schoolId of schools) {
      try {
        await deps.platform((db) => homeworkFollowUpForSchool(db, deps.queue, schoolId, today));
      } catch {
        failed += 1;
      }
    }
    if (failed > 0) throw new Error(`${HOMEWORK_FOLLOW_UP_JOB}: ${failed} of ${schools.length} schools failed; retried`);
  };
}
