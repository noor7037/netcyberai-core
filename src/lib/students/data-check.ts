import { randomUUID } from 'crypto';
import type { PoolClient } from 'pg';
import { writeAuditLog } from '@/lib/audit/log';
import type { StaffRole } from '@/lib/auth/types';
import { classLabel } from '@/lib/frameworks/class-label';
import { t, type Lang, type MessageKey } from '@/lib/i18n';
import { indiaDate } from '@/lib/time/india';
import { languageFor, queueWhatsAppMessage } from '@/lib/whatsapp/gate';
import { normalizePhone } from '@/lib/whatsapp/phone';
import { renderTemplate, templateToSend } from '@/lib/whatsapp/templates';
import { MAX_CLOSING_NOTE, MAX_NOTE, compareDetails, hideAadhaarNumbers, isDataCheckField, readCorrection, readNote, readPrinted, sayDob, worstSeverity, type DataCheckField, type Details, type FieldFinding, type PrintedInput, type PrintedProblem } from './data-check-rules';

// The student data check (docs/28 section 2.2 and row 10b, C222): each child's name, date of birth and gender in the
// school record against the same details as printed on Aadhaar, typed by the office. For UDISE+ and APAAR; there is
// no APAAR API.
//
//   - The comparison is the website free tool's own rule, imported (data-check-rules.ts).
//   - NO AADHAAR NUMBER IS EVER STORED: the app refuses one before the database does (which refuses it too).
//   - "Ask the parent" is drafted, read by a person and sent by that person, ONLY through the send-gate
//     (queueWhatsAppMessage: consent, quiet hours, budget and approved words, read again when it goes).
//   - The guardian's reply in that WhatsApp conversation is kept with the request by the database
//     (data_check_link_reply); an answer that came another way is attached by the office.
//   - The office corrects the school record (audited, before and after) or closes the request with why.
//   - Who sees what is the database's rule: the office every child, a teacher the children of the class they are
//     class teacher of (read only), the accountant nothing. This file asks the same roles first.

type Sql = Pick<PoolClient, 'query'>;
type Queue = Parameters<typeof queueWhatsAppMessage>[1];
export type DataCheckActor = { schoolId: string; userId: string; role: StaffRole };
export const DATA_CHECK_TEMPLATE = 'data_check_request';
const OFFICE: readonly string[] = ['principal', 'school_admin'];
export const DATA_CHECK_READERS: readonly string[] = ['principal', 'school_admin', 'teacher'];
const isOffice = (role: string) => OFFICE.includes(role);
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
// What a parent wrote is shown with any twelve-digit run hidden: symbols, not words, so it reads the same in both languages.
const HIDDEN = '•••• •••• ••••';
const DOB = `to_char(%s, 'YYYY-MM-DD')`;

export type DataCheckRequest = {
  request_id: string;
  field: DataCheckField;
  school_value: string | null;
  printed_value: string | null;
  finding: string;
  guardian: string | null;
  asked_at: string;
  asked_by: string | null;
  has_message: boolean;
  message_status: string | null;
  reply_text: string | null;
  reply_at: string | null;
  office_note: string | null;
  office_note_by: string | null;
  office_note_at: string | null;
  outcome: 'corrected' | 'closed' | null;
  corrected_to: string | null;
  closing_note: string | null;
  decided_by: string | null;
  decided_at: string | null;
};
export type DataCheckChild = {
  student_id: string;
  name: string;
  admission_no: string | null;
  class_id: string | null;
  class_name: string | null;
  record: Details;
  printed: (Details & { typed_by: string | null; typed_at: string }) | null;
  // The free tool's findings, most serious first by `severity`; empty while nothing is typed (severity -1).
  fields: FieldFinding[];
  severity: number;
  guardians: { parent_id: string; name: string; last4: string | null }[];
  requests: DataCheckRequest[];
};
export type DataCheckList = {
  office: boolean;
  classes: { class_id: string; name: string }[];
  children: DataCheckChild[];
  counts: { total: number; typed: number; attention: number; open: number; answered: number };
};

// The children this person may see, with their findings and requests. Null for a role that reads none of it.
export async function listDataCheck(db: Sql, actor: DataCheckActor, opts: { classId: string | null }): Promise<DataCheckList | null> {
  if (!DATA_CHECK_READERS.includes(actor.role)) return null;
  const office = isOffice(actor.role);
  const classes = (await db.query(
    `select c.class_id, c.name, c.section from classes c where c.school_id = $1 and ($2::boolean or public.is_class_teacher_of(c.class_id)) order by c.name, c.class_id`,
    [actor.schoolId, office]
  )).rows.map((c) => ({ class_id: c.class_id as string, name: classLabel(c.name, c.section) ?? '' }));
  const students = (await db.query(
    `select s.student_id, s.name, s.admission_no, s.class_id, c.name as class_name, c.section, ${DOB.replace('%s', 's.dob')} as dob, s.gender,
            p.student_id is not null as typed, p.printed_name, ${DOB.replace('%s', 'p.printed_dob')} as printed_dob, p.printed_gender, u.display_name as typed_by, p.typed_at
       from students s
       left join classes c on c.school_id = s.school_id and c.class_id = s.class_id
       left join student_id_as_printed p on p.school_id = s.school_id and p.student_id = s.student_id
       left join users u on u.school_id = p.school_id and u.user_id = p.typed_by
      where s.school_id = $1 and s.status = 'active' and ($2::uuid is null or s.class_id = $2)
        and ($3::boolean or public.is_class_teacher_of(s.class_id))
      order by c.name nulls last, s.name, s.student_id`,
    [actor.schoolId, opts.classId, office]
  )).rows;
  const ids = students.map((s) => s.student_id as string);
  const requests = ids.length
    ? ((await db.query(
        `select r.request_id, r.student_id, r.field, r.school_value, r.printed_value, r.finding, g.name as guardian, r.asked_at, a.display_name as asked_by,
                r.message_log_id is not null as has_message, l.status::text as message_status, i.body as reply_text, r.reply_at,
                r.office_note, nb.display_name as office_note_by, r.office_note_at, r.outcome, r.corrected_to, r.closing_note, d.display_name as decided_by, r.decided_at
           from data_check_requests r
           left join parents g on g.school_id = r.school_id and g.parent_id = r.parent_id
           left join users a on a.school_id = r.school_id and a.user_id = r.asked_by
           left join users nb on nb.school_id = r.school_id and nb.user_id = r.office_note_by
           left join users d on d.school_id = r.school_id and d.user_id = r.decided_by
           left join communication_log l on l.school_id = r.school_id and l.log_id = r.message_log_id
           left join inbound_messages i on i.school_id = r.school_id and i.message_id = r.reply_message_id
          where r.school_id = $1 and r.student_id = any($2::uuid[])
          order by r.asked_at desc, r.field`,
        [actor.schoolId, ids]
      )).rows as (DataCheckRequest & { student_id: string })[])
    : [];
  const guardians = office && ids.length
    ? ((await db.query(
        `select m.student_id, p.parent_id, p.name, p.phone from parent_student_map m join parents p on p.school_id = m.school_id and p.parent_id = m.parent_id
          where m.school_id = $1 and m.student_id = any($2::uuid[]) and p.merged_into is null order by p.created_at, p.parent_id`,
        [actor.schoolId, ids]
      )).rows as { student_id: string; parent_id: string; name: string; phone: string | null }[])
    : [];
  const children: DataCheckChild[] = students.map((s) => {
    const record: Details = { name: s.name, dob: s.dob, gender: s.gender };
    const printed = s.typed ? { name: s.printed_name, dob: s.printed_dob, gender: s.printed_gender, typed_by: s.typed_by ?? null, typed_at: iso(s.typed_at) as string } : null;
    const fields = printed ? compareDetails(record, printed) : [];
    return {
      student_id: s.student_id,
      name: s.name,
      admission_no: s.admission_no ?? null,
      class_id: s.class_id ?? null,
      class_name: classLabel(s.class_name, s.section),
      record,
      printed,
      fields,
      severity: printed ? worstSeverity(fields) : -1,
      guardians: guardians.filter((g) => g.student_id === s.student_id).map((g) => ({ parent_id: g.parent_id, name: g.name, last4: normalizePhone(String(g.phone ?? ''))?.slice(-4) ?? null })),
      requests: requests
        .filter((r) => r.student_id === s.student_id)
        .map(({ student_id: _, ...r }) => ({
          ...r,
          reply_text: r.reply_text === null ? null : hideAadhaarNumbers(r.reply_text, HIDDEN),
          asked_at: iso(r.asked_at) as string,
          reply_at: iso(r.reply_at),
          office_note_at: iso(r.office_note_at),
          decided_at: iso(r.decided_at),
        })),
    };
  });
  // The most serious first (the free tool's own order), then by class and name; children not typed yet come last.
  children.sort((a, b) => b.severity - a.severity);
  const open = requests.filter((r) => r.outcome === null);
  return {
    office,
    classes,
    children,
    counts: {
      total: children.length,
      typed: children.filter((c) => c.printed).length,
      attention: children.filter((c) => c.severity > 0).length,
      open: open.length,
      answered: open.filter((r) => r.reply_at !== null || r.office_note !== null).length,
    },
  };
}

export type SaveResult = { ok: true } | { ok: false; reason: 'not_allowed' | 'not_found' | PrintedProblem };

// The name, date of birth and gender as printed on Aadhaar, typed by the office. Never the number.
export async function savePrinted(db: Sql, actor: DataCheckActor, studentId: string, input: PrintedInput): Promise<SaveResult> {
  if (!isOffice(actor.role)) return { ok: false, reason: 'not_allowed' };
  const read = readPrinted(input, indiaDate());
  if (!read.ok) return read;
  if (!(await db.query(`select 1 from students where school_id = $1 and student_id = $2 and status = 'active'`, [actor.schoolId, studentId])).rows[0]) return { ok: false, reason: 'not_found' };
  const before = (await db.query(`select printed_name is not null as name, printed_dob is not null as dob, printed_gender is not null as gender from student_id_as_printed where school_id = $1 and student_id = $2`, [actor.schoolId, studentId])).rows[0];
  const v = read.values;
  await db.query(
    `insert into student_id_as_printed (school_id, student_id, printed_name, printed_dob, printed_gender, typed_by) values ($1, $2, $3, $4::date, $5, $6)
     on conflict (school_id, student_id) do update set printed_name = excluded.printed_name, printed_dob = excluded.printed_dob, printed_gender = excluded.printed_gender, typed_by = excluded.typed_by`,
    [actor.schoolId, studentId, v.name, v.dob, v.gender, actor.userId]
  );
  // Which details were typed, never their values.
  const typed = (o: { name: unknown; dob: unknown; gender: unknown }) => (['name', 'dob', 'gender'] as const).filter((f) => Boolean(o[f]));
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'student.id_as_printed_saved', targetType: 'students', targetId: studentId, beforeState: before ? { typed: typed(before) } : undefined, afterState: { typed: typed(v) } });
  return { ok: true };
}

type AskInput = { parentId: string; fields: DataCheckField[] };
type AskProblem = 'not_allowed' | 'not_found' | 'not_typed' | 'fields' | 'nothing_to_ask' | 'already_open' | 'guardian';
type Prepared = { ok: true; child: string; guardian: { parent_id: string; phone: string | null }; asked: FieldFinding[]; lang: Lang; details: string; text: string | null } | { ok: false; reason: AskProblem };

// A value as the parent reads it, in their language.
function say(lang: Lang, field: DataCheckField, v: string | null): string {
  if (v === null || v === '' || (field === 'gender' && v === 'not_given')) return t(lang, 'sdc.value.none');
  if (field === 'dob') return sayDob(v) ?? v;
  if (field === 'gender') return t(lang, `sdc.gender.${v}` as MessageKey);
  return v;
}

// What would be asked, of whom, and in which words: the same for the draft a person reads and the message sent.
async function prepareAsk(db: Sql, actor: DataCheckActor, studentId: string, input: AskInput, lock: boolean): Promise<Prepared> {
  if (!isOffice(actor.role)) return { ok: false, reason: 'not_allowed' };
  const fields = [...new Set(input.fields)];
  if (fields.length === 0 || !fields.every(isDataCheckField)) return { ok: false, reason: 'fields' };
  const s = (await db.query(
    `select s.name, ${DOB.replace('%s', 's.dob')} as dob, s.gender, p.student_id is not null as typed, p.printed_name, ${DOB.replace('%s', 'p.printed_dob')} as printed_dob, p.printed_gender
       from students s left join student_id_as_printed p on p.school_id = s.school_id and p.student_id = s.student_id
      where s.school_id = $1 and s.student_id = $2 and s.status = 'active'${lock ? ' for update of s' : ''}`,
    [actor.schoolId, studentId]
  )).rows[0];
  if (!s) return { ok: false, reason: 'not_found' };
  if (!s.typed) return { ok: false, reason: 'not_typed' };
  const found = compareDetails({ name: s.name, dob: s.dob, gender: s.gender }, { name: s.printed_name, dob: s.printed_dob, gender: s.printed_gender });
  const asked = found.filter((f) => fields.includes(f.field));
  if (asked.some((f) => f.finding === 'exact')) return { ok: false, reason: 'nothing_to_ask' };
  const open = (await db.query(`select field from data_check_requests where school_id = $1 and student_id = $2 and outcome is null and field = any($3::text[])`, [actor.schoolId, studentId, fields])).rows;
  if (open.length > 0) return { ok: false, reason: 'already_open' };
  const guardian = (await db.query(
    `select p.parent_id, p.phone from parents p join parent_student_map m on m.school_id = p.school_id and m.parent_id = p.parent_id
      where p.school_id = $1 and p.parent_id = $2 and m.student_id = $3 and p.merged_into is null`,
    [actor.schoolId, input.parentId, studentId]
  )).rows[0] as { parent_id: string; phone: string | null } | undefined;
  if (!guardian) return { ok: false, reason: 'guardian' };
  // The words go in the language they will be sent in: the guardian's, or the school's, where those words are approved.
  const wanted = await languageFor(db, actor.schoolId, guardian.parent_id);
  const words = await templateToSend(db, actor.schoolId, DATA_CHECK_TEMPLATE, wanted, false);
  const lang: Lang = words?.language ?? wanted;
  const details = asked.map((f) => t(lang, 'sdc.msg.detail', { field: t(lang, `sdc.field.${f.field}` as MessageKey), school: say(lang, f.field, f.school), printed: say(lang, f.field, f.printed) })).join('; ');
  const school = (await db.query(`select name from schools where school_id = $1`, [actor.schoolId])).rows[0]?.name as string;
  const text = words?.body ? renderTemplate(words.body, { school, child: s.name, details }) : null;
  return { ok: true, child: s.name, guardian, asked, lang, details, text };
}

export type DraftResult = { ok: true; text: string | null; hasNumber: boolean } | { ok: false; reason: AskProblem };

// The draft a person reads before sending: the exact words, or null when they are not approved (it would be held).
export async function draftRequest(db: Sql, actor: DataCheckActor, studentId: string, input: AskInput): Promise<DraftResult> {
  const p = await prepareAsk(db, actor, studentId, input, false);
  if (!p.ok) return p;
  return { ok: true, text: p.text, hasNumber: normalizePhone(String(p.guardian.phone ?? '')) !== null };
}

export type AskResult = { ok: true; requestIds: string[]; message: string } | { ok: false; reason: AskProblem };

// "Ask the parent": the requests are kept, and the message goes ONLY through the send-gate. Without a WhatsApp
// number nothing is sent; the request is kept so that the office can ask in person and attach the answer.
export async function askParent(db: PoolClient, queue: Queue, actor: DataCheckActor, studentId: string, input: AskInput): Promise<AskResult> {
  const p = await prepareAsk(db, actor, studentId, input, true);
  if (!p.ok) return p;
  const phone = normalizePhone(String(p.guardian.phone ?? ''));
  let logId: string | null = null;
  let message = 'no_number';
  if (phone) {
    const sent = await queueWhatsAppMessage(db, queue, { schoolId: actor.schoolId, studentId, parentId: p.guardian.parent_id, purpose: 'operational_communication', toPhone: phone, templateName: DATA_CHECK_TEMPLATE, templateParams: { child: p.child, details: p.details }, dedupeKey: `data-check:${studentId}:${randomUUID()}`, language: p.lang });
    logId = sent.logId;
    message = sent.status;
  }
  const requestIds: string[] = [];
  for (const f of p.asked) {
    const id = randomUUID();
    await db.query(
      `insert into data_check_requests (request_id, school_id, student_id, field, school_value, printed_value, finding, parent_id, message_log_id, asked_by) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [id, actor.schoolId, studentId, f.field, f.school, f.printed, f.finding, p.guardian.parent_id, logId, actor.userId]
    );
    requestIds.push(id);
  }
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'student.data_check_asked', targetType: 'students', targetId: studentId, beforeState: undefined, afterState: { fields: p.asked.map((f) => f.field), findings: p.asked.map((f) => f.finding), parentId: p.guardian.parent_id, message, requestIds } });
  return { ok: true, requestIds, message };
}

type StepProblem = 'not_allowed' | 'not_found' | 'decided' | 'noted_already' | 'aadhaar_number' | 'value';
export type StepResult = { ok: true } | { ok: false; reason: StepProblem };

async function openRequest(db: Sql, actor: DataCheckActor, requestId: string): Promise<{ field: DataCheckField; student_id: string; office_note: string | null } | 'not_found' | 'decided'> {
  const r = (await db.query(`select field, student_id, office_note, outcome from data_check_requests where school_id = $1 and request_id = $2 for update`, [actor.schoolId, requestId])).rows[0];
  if (!r) return 'not_found';
  if (r.outcome !== null) return 'decided';
  return r;
}

// The guardian's answer, when it came another way (in person, by phone, on paper). Kept once, with who and when.
export async function noteAnswer(db: Sql, actor: DataCheckActor, requestId: string, text: string): Promise<StepResult> {
  if (!isOffice(actor.role)) return { ok: false, reason: 'not_allowed' };
  const note = readNote(text, MAX_NOTE);
  if (!note.ok) return note;
  const r = await openRequest(db, actor, requestId);
  if (typeof r === 'string') return { ok: false, reason: r };
  if (r.office_note !== null) return { ok: false, reason: 'noted_already' };
  await db.query(`update data_check_requests set office_note = $3, office_note_by = $4, office_note_at = now() where school_id = $1 and request_id = $2`, [actor.schoolId, requestId, note.value, actor.userId]);
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'student.data_check_answer_noted', targetType: 'data_check_requests', targetId: requestId, beforeState: undefined, afterState: { studentId: r.student_id, field: r.field } });
  return { ok: true };
}

// The student's column for each detail, and how it is read and written. Fixed names: nothing here comes from a request.
const COLUMN: Record<DataCheckField, { column: 'name' | 'dob' | 'gender'; cast: 'text' | 'date'; read: string }> = {
  name: { column: 'name', cast: 'text', read: 'name' },
  dob: { column: 'dob', cast: 'date', read: DOB.replace('%s', 'dob') },
  gender: { column: 'gender', cast: 'text', read: 'gender' },
};

// The school record is corrected: the child's detail is set, the request says to what, and the change is audited
// with the value before and after.
export async function correctRecord(db: Sql, actor: DataCheckActor, requestId: string, raw: string): Promise<StepResult> {
  if (!isOffice(actor.role)) return { ok: false, reason: 'not_allowed' };
  const r = await openRequest(db, actor, requestId);
  if (typeof r === 'string') return { ok: false, reason: r };
  const read = readCorrection(r.field, raw, indiaDate());
  if (!read.ok) return read;
  const col = COLUMN[r.field];
  const before = (await db.query(`select ${col.read} as v from students where school_id = $1 and student_id = $2 for update`, [actor.schoolId, r.student_id])).rows[0];
  if (!before) return { ok: false, reason: 'not_found' };
  await db.query(`update students set ${col.column} = $3::${col.cast}, updated_at = now() where school_id = $1 and student_id = $2`, [actor.schoolId, r.student_id, read.value]);
  await db.query(`update data_check_requests set outcome = 'corrected', corrected_to = $3, decided_by = $4, decided_at = now() where school_id = $1 and request_id = $2`, [actor.schoolId, requestId, read.value, actor.userId]);
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'student.data_check_corrected', targetType: 'students', targetId: r.student_id, beforeState: { [r.field]: before.v ?? null }, afterState: { [r.field]: read.value, requestId } });
  return { ok: true };
}

// Closed without a change to the record, with why.
export async function closeRequest(db: Sql, actor: DataCheckActor, requestId: string, text: string): Promise<StepResult> {
  if (!isOffice(actor.role)) return { ok: false, reason: 'not_allowed' };
  const note = readNote(text, MAX_CLOSING_NOTE);
  if (!note.ok) return note;
  const r = await openRequest(db, actor, requestId);
  if (typeof r === 'string') return { ok: false, reason: r };
  await db.query(`update data_check_requests set outcome = 'closed', closing_note = $3, decided_by = $4, decided_at = now() where school_id = $1 and request_id = $2`, [actor.schoolId, requestId, note.value, actor.userId]);
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'student.data_check_closed', targetType: 'data_check_requests', targetId: requestId, beforeState: undefined, afterState: { studentId: r.student_id, field: r.field } });
  return { ok: true };
}
