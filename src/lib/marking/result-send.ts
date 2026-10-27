import type { PoolClient } from 'pg';
import { writeAuditLog } from '@/lib/audit/log';
import type { ConsentPurpose } from '@/lib/consent/gate';
import { ON_ROLL, ROLL_ORDER } from '@/lib/exams/papers';
import { publicationInForce } from '@/lib/exams/publish';
import { isUuid } from '@/lib/frameworks/custom-fields';
import type { Sql } from '@/lib/jobs/types';
import { gateWouldQueue, languageFor, queueWhatsAppMessage, type GateRule, type QueueLike } from '@/lib/whatsapp/gate';
import { normalizePhone } from '@/lib/whatsapp/phone';
import { templateToSend, type TemplateLanguage } from '@/lib/whatsapp/templates';
import type { Actor } from './context';
import { linksOf, makeReportLink, MAX_LINKS, recordsConsented, reportLinkUrl, sealedLink } from './report-links';

// "Tell parents on WhatsApp" (C351): once a class's result is published, the office sends each family a private link
// to their own child's result (src/lib/marking/report-links.ts), one message per child and guardian per publication,
// only after seeing who will get it. Everything goes through the send-gate's outbox (queueWhatsAppMessage): consent,
// the parent's STOP, quiet hours, the budget and the approved words are read again when each message goes, and nothing
// here calls a provider (scripts/check_whatsapp_send_gate.py). The preview asks the gate itself, recording nothing
// (gateWouldQueue), so it never promises what the gate would refuse at that moment. No marks are in the message (the
// template), no rank anywhere (C76).

export const RESULT_TEMPLATE = 'exam_result_ready';
export const RESULT_PURPOSE: ConsentPurpose = 'operational_communication';
// Who may tell parents: the principal and the school admin. Of the office that runs exams (EXAM_RUNNERS), they are the
// ones the school's own rules show a parent's STOP to (whatsapp_opt_outs_staff) and the message log (C210): for the
// academic coordinator the gate's STOP check would pass unseen when queueing (it is read again, as the platform, when
// the message goes), so its preview would promise a message the gate then refuses.
export const TELL_ROLES: readonly Actor['role'][] = ['principal', 'school_admin'];
// One message per child, guardian and link per publication: a second press, or a retry, finds it and sends nothing. A
// link made again after the office ended one (C230-AG) is a message of its own: its number ends the key (the first
// link's key has none, as before).
export const resultDedupeKey = (examId: string, classId: string, version: number, studentId: string, parentId: string, linkNo = 1) =>
  `exam-result:${examId}:${classId}:${version}:${studentId}:${parentId}${linkNo > 1 ? `:${linkNo}` : ''}`;

// Why a guardian will not get it: the school holds no consent for the child's records (School Link's rule) or for
// messages; no mobile number; the number asked to stop; another guardian of the child has the same number (one message
// reaches it); or, by the gate, the school's WhatsApp is not switched on, its budget is used up or not set, the
// message's words are not approved yet, or quiet hours would hold it past the time it is worth sending; or the child
// has had every link a publication allows (MAX_LINKS).
export type NotSentWhy = 'no_records' | 'no_consent' | 'no_number' | 'opted_out' | 'same_number' | 'whatsapp_off' | 'budget' | 'not_approved' | 'quiet_hours' | 'link_limit';
export type ResultMessageState = 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'held' | 'uncertain';
export type GuardianLine = { parentId: string; name: string; relation: string | null; last4: string | null; will: boolean; why: NotSentWhy | null; state: ResultMessageState | null };
// `sent`: the child has a live link for this publication. `ended`: links of theirs the office ended (each made again
// only by Send). `mayEnd`: the live link may be ended (the principal or the school admin, who alone see this list).
export type ChildLine = { studentId: string; name: string; rollNo: string | null; sent: boolean; ended: number; mayEnd: boolean; guardians: GuardianLine[] };
export type TellParents = { examId: string; classId: string; version: number; children: ChildLine[]; will: number; wont: number; sent: number };
export type TellProblem = 'not_allowed' | 'not_found' | 'not_published';

const RULE_WHY: Record<GateRule, NotSentWhy> = { pilot: 'whatsapp_off', consent: 'no_consent', opted_out: 'opted_out', quiet_hours: 'quiet_hours', budget: 'budget', template: 'not_approved' };
const stateOf = (status: string): ResultMessageState => (status.startsWith('blocked_') ? 'held' : (['queued', 'sent', 'delivered', 'read', 'failed', 'uncertain'] as const).find((s) => s === status) ?? 'failed');

type Guardian = { parent_id: string; name: string; relation: string | null; phone: string | null };
type Child = { student_id: string; name: string; roll_no: string | null };
// What the server keeps of a guardian between the preview and Send, never sent to the screen: the number and language.
type Line = GuardianLine & { phone: string | null; language: TemplateLanguage };
type Plan = { examName: string; version: number; children: (Omit<ChildLine, 'guardians'> & { guardians: Line[] })[] };

async function classRoll(db: Sql, schoolId: string, classId: string): Promise<Child[]> {
  return (await db.query(`select s.student_id, s.name, s.roll_no from students s where s.school_id = $1 and s.class_id = $2 and ${ON_ROLL} order by ${ROLL_ORDER}`, [schoolId, classId])).rows as Child[];
}
async function guardiansOf(db: Sql, schoolId: string, studentId: string): Promise<Guardian[]> {
  return (
    await db.query(
      `select p.parent_id, p.name, p.relation, p.phone from parent_student_map m join parents p on p.school_id = m.school_id and p.parent_id = m.parent_id
        where m.school_id = $1 and m.student_id = $2 and p.merged_into is null and m.verification_status::text not in ('tombstoned', 'withdrawn', 'expired')
        order by p.name, p.parent_id`,
      [schoolId, studentId]
    )
  ).rows as Guardian[];
}
// The message already queued for this child and guardian for this publication, by its key (communication_log_dedupe
// answers with the state only).
async function messageState(db: Sql, schoolId: string, key: string): Promise<ResultMessageState | null> {
  const r = (await db.query(`select status from public.communication_log_dedupe($1, $2)`, [schoolId, key])).rows[0] as { status: string } | undefined;
  return r ? stateOf(r.status) : null;
}

async function publishedExam(db: Sql, actor: Actor, examId: string, classId: string): Promise<{ version: number; examName: string } | TellProblem> {
  if (!TELL_ROLES.includes(actor.role)) return 'not_allowed';
  if (!isUuid(examId) || !isUuid(classId)) return 'not_found';
  const exam = (await db.query(`select name from exams where school_id = $1 and exam_id = $2`, [actor.schoolId, examId])).rows[0] as { name: string } | undefined;
  if (!exam) return 'not_found';
  const pub = await publicationInForce(db, actor.schoolId, examId, classId);
  if (!pub) return 'not_published';
  return { version: pub.version, examName: exam.name };
}

// Every child of the class in roll order, each guardian as the gate would take them now.
async function plan(db: PoolClient, actor: Actor, examId: string, classId: string): Promise<Plan | TellProblem> {
  const p = await publishedExam(db, actor, examId, classId);
  if (typeof p === 'string') return p;
  const links = await linksOf(db, actor.schoolId, examId, classId, p.version);
  const children: Plan['children'] = [];
  for (const c of await classRoll(db, actor.schoolId, classId)) {
    const consented = await recordsConsented(db, actor.schoolId, c.student_id);
    const l = links.get(c.student_id) ?? { live: null, made: 0 };
    // The messages of the live link, or of the link Send would make next.
    const linkNo = l.live ?? l.made + 1;
    const used = l.live === null && l.made >= MAX_LINKS;
    const guardians: Line[] = [];
    const numbers = new Set<string>();
    for (const g of await guardiansOf(db, actor.schoolId, c.student_id)) {
      const key = resultDedupeKey(examId, classId, p.version, c.student_id, g.parent_id, linkNo);
      const phone = g.phone ? normalizePhone(String(g.phone)) : null;
      const language = await languageFor(db, actor.schoolId, g.parent_id);
      const line = { parentId: g.parent_id, name: g.name, relation: g.relation ?? null, last4: phone ? phone.slice(-4) : null, state: await messageState(db, actor.schoolId, key), phone, language };
      if (used) guardians.push({ ...line, will: false, why: 'link_limit' });
      else if (!consented) guardians.push({ ...line, will: false, why: 'no_records' });
      else if (!phone) guardians.push({ ...line, will: false, why: 'no_number' });
      else if (numbers.has(phone)) guardians.push({ ...line, will: false, why: 'same_number' });
      else {
        const gate = await gateWouldQueue(db, {
          schoolId: actor.schoolId,
          studentId: c.student_id,
          parentId: g.parent_id,
          purpose: RESULT_PURPOSE,
          toPhone: phone,
          templateName: RESULT_TEMPLATE,
          // The link is made only when the office presses Send; for the gate's check any value stands in for it.
          templateParams: { child: c.name, exam: p.examName, link: reportLinkUrl('preview') },
          dedupeKey: key,
          language,
        });
        if (gate.ok) numbers.add(phone);
        guardians.push(gate.ok ? { ...line, will: true, why: null } : { ...line, will: false, why: RULE_WHY[gate.rule] });
      }
    }
    children.push({ studentId: c.student_id, name: c.name, rollNo: c.roll_no ?? null, sent: l.live !== null, ended: l.made - (l.live === null ? 0 : 1), mayEnd: l.live !== null, guardians });
  }
  return { examName: p.examName, version: p.version, children };
}

// Who will get it, child by child in roll order, and the state of every message already queued for this publication.
// A child is "sent" while their live link for this publication exists: only Send makes one, and never without
// queueing; once the office ends it, the child waits for Send again.
export async function tellParentsPreview(db: PoolClient, actor: Actor, examId: string, classId: string): Promise<TellParents | TellProblem> {
  const p = await plan(db, actor, examId, classId);
  if (typeof p === 'string') return p;
  const children: ChildLine[] = p.children.map((c) => ({ ...c, guardians: c.guardians.map(({ phone: _phone, language: _language, ...shown }) => shown) }));
  const open = children.filter((c) => !c.sent);
  return {
    examId,
    classId,
    version: p.version,
    children,
    will: open.reduce((n, c) => n + c.guardians.filter((g) => g.will).length, 0),
    wont: open.reduce((n, c) => n + c.guardians.filter((g) => !g.will).length, 0),
    sent: children.length - open.length,
  };
}

export type SendResult = { ok: true; queued: number; children: number } | { ok: false; reason: TellProblem };

// Send: for each child not yet sent for this publication with at least one guardian the gate takes, the child's private
// link is made and one message per such guardian is queued through the outbox. A child already sent is not sent again,
// and a second press finds every key it already queued. A child for whom no message could be queued after all keeps no
// link (a savepoint takes it back), so a later press can still reach them.
export async function tellParentsSend(db: PoolClient, queue: QueueLike, actor: Actor, examId: string, classId: string): Promise<SendResult> {
  const p = await plan(db, actor, examId, classId);
  if (typeof p === 'string') return { ok: false, reason: p };
  let queued = 0;
  let children = 0;
  for (const c of p.children) {
    const takers = c.guardians.filter((g) => g.will && g.state === null && g.phone);
    if (c.sent || takers.length === 0) continue;
    await db.query('savepoint tell_parents_child');
    const link = await makeReportLink(db, actor, examId, classId, c.studentId);
    if (!link.ok) {
      await db.query('release savepoint tell_parents_child');
      continue; // made by another press a moment ago, or no longer allowed: never a second link
    }
    let mine = 0;
    for (const g of takers) {
      const lang = (await templateToSend(db, actor.schoolId, RESULT_TEMPLATE, g.language, false))?.language ?? g.language;
      const r = await queueWhatsAppMessage(db, queue, {
        schoolId: actor.schoolId,
        studentId: c.studentId,
        parentId: g.parentId,
        purpose: RESULT_PURPOSE,
        toPhone: g.phone as string,
        templateName: RESULT_TEMPLATE,
        // Sealed in the log; the send-gate opens it into the link only as it asks the provider (review of AM-5).
        templateParams: { child: c.name, exam: p.examName, link: sealedLink(link.ref, lang) },
        dedupeKey: resultDedupeKey(examId, classId, link.version, c.studentId, g.parentId, link.linkNo),
        language: lang,
      });
      if (r.status === 'queued' && !r.idempotent) mine += 1;
    }
    if (mine === 0) {
      await db.query('rollback to savepoint tell_parents_child');
      continue;
    }
    await db.query('release savepoint tell_parents_child');
    queued += mine;
    children += 1;
  }
  // Counts and ids only: never a link, a number or a child's name.
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'marking.results_sent', targetType: 'exams', targetId: examId, beforeState: undefined, afterState: { classId, version: p.version, children, queued } });
  return { ok: true, queued, children };
}
