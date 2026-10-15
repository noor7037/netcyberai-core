import type { PoolClient } from 'pg';
import { writeAuditLog } from '@/lib/audit/log';
import type { StaffRole } from '@/lib/auth/types';
import { structureInForce } from '@/lib/fees/structures';
import { SETTINGS_SCHEMAS } from '@/lib/frameworks/settings-schemas';
import { readSettings } from '@/lib/frameworks/settings-store';
import { CLOSED_STAGES, ENQUIRY_MAX, QUIET_DAYS_DEFAULT, SOURCES, STAGES, followUps, isIsoDate, type Enquiry, type Source, type Stage } from '@/lib/free-tools/admissions-tracker';
import { hasAadhaarNumber } from '@/lib/students/data-check-rules';
import { indiaDate } from '@/lib/time/india';
import { normalizePhone } from '@/lib/whatsapp/phone';
import { classOrderSql } from '@/lib/classes/class-order';

// The admissions pipeline (docs/28 slice 10a, C221).
//
//   - An enquiry is a family asking about a place for a child: who, the class sought, how they asked, who in the
//     office follows it up, the next follow-up date and the stage.
//   - The SOURCES and STAGES are the website's Admissions Enquiry Tracker's own (src/lib/free-tools/
//     admissions-tracker.ts), and "follow up today" and "gone quiet" are its followUps(): imported, never copied.
//     The database keeps each as a code; the maps below give every one of the tool's labels a code, and a type
//     error appears here the day the tool adds one.
//   - "Gone quiet": no contact for the school's number of days (the setting 'quiet_days' of 'admissions', the
//     tool's QUIET_DAYS_DEFAULT unless the school changes it). A contact is the enquiry being recorded, a note of
//     what happened, or a move of stage; giving it to someone else or correcting a detail is not.
//   - "Admit" makes exactly one student record, waiting for consent as every new pupil does, in the class sought,
//     and marks the enquiry admitted, in the caller's one transaction. Fees are raised by class (src/lib/fees/
//     dues.ts raises a class's month for every child of the class, active or waiting for consent), so a child in
//     the class IS on the class's fee structure: the structure in force today is named on the admission and kept.
//   - THE OFFICE ONLY. Every function runs in the caller's own tenant transaction; row level security lets only
//     the principal and the school admin read or write an enquiry or its steps.
//   - Never an Aadhaar number: a field holding a run of twelve digits is refused, here by the app's one rule
//     (hasAadhaarNumber, src/lib/students/data-check-rules.ts) and in the database by its twin
//     (public.no_aadhaar_number), as everywhere in P7 (C223-A answer 6, C224).
//   - Deleted only by the office, and never an admitted one (C223-A answer 3, C224): an enquiry, or every enquiry of
//     a family that never joined (a parent's erasure request, found by the phone as the enquiries keep it), with its
//     steps, through the database's own functions; audited with ids and counts, never a name or a phone. An admitted
//     enquiry is the child's record: the erasure of the child's data blanks it (src/lib/consent/dsr.ts).

type Sql = Pick<PoolClient, 'query'>;
type Actor = { schoolId: string; userId: string; role: StaffRole };

export const ADMISSIONS_OFFICE: readonly string[] = ['principal', 'school_admin'];

// ---- The tool's lists, as the database keeps them -----------------------------------------------------------

export const SOURCE_CODES = {
  'Walk-in': 'walk_in',
  'Phone call': 'phone_call',
  WhatsApp: 'whatsapp',
  Website: 'website',
  Referral: 'referral',
  'Newspaper or hoarding': 'newspaper',
  Other: 'other',
} as const satisfies Record<Source, string>;
export type SourceCode = (typeof SOURCE_CODES)[Source];

export const STAGE_CODES = {
  Enquiry: 'enquiry',
  'Visit booked': 'visit_booked',
  Visited: 'visited',
  'Form taken': 'form_taken',
  'Form submitted': 'form_submitted',
  Admitted: 'admitted',
  'Not joining': 'not_joining',
} as const satisfies Record<Stage, string>;
export type StageCode = (typeof STAGE_CODES)[Stage];

// In the tool's order.
export const SOURCE_IDS: readonly SourceCode[] = SOURCES.map((s) => SOURCE_CODES[s]);
export const STAGE_IDS: readonly StageCode[] = STAGES.map((s) => STAGE_CODES[s]);
export const CLOSED_STAGE_IDS: readonly StageCode[] = CLOSED_STAGES.map((s) => STAGE_CODES[s]);
// The stages a person moves an enquiry to by hand: every stage but "Admitted", which only Admit sets.
export const MOVABLE_STAGE_IDS: readonly StageCode[] = STAGE_IDS.filter((s) => s !== 'admitted');
const stageLabel = (code: string): Stage => STAGES.find((s) => STAGE_CODES[s] === code) ?? 'Enquiry';
const sourceLabel = (code: string): Source => SOURCES.find((s) => SOURCE_CODES[s] === code) ?? 'Other';
export const isSourceCode = (v: unknown): v is SourceCode => typeof v === 'string' && (SOURCE_IDS as readonly string[]).includes(v);
export const isStageCode = (v: unknown): v is StageCode => typeof v === 'string' && (STAGE_IDS as readonly string[]).includes(v);
export const isOpenStage = (s: string) => !(CLOSED_STAGE_IDS as readonly string[]).includes(s);

export const NOTE_MAX = 500;
export const ADMISSION_NO_MAX = 40;
// A follow-up is today or later, within a year.
export const FOLLOW_UP_DAYS_MAX = 366;

// ---- The school's setting ------------------------------------------------------------------------------------

export async function quietDays(db: Sql, schoolId: string): Promise<number> {
  const schema = SETTINGS_SCHEMAS.find((s) => s.moduleId === 'admissions');
  const v = schema ? (await readSettings(db, schoolId, schema)).effective.quiet_days : undefined;
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 90 ? v : QUIET_DAYS_DEFAULT;
}

// ---- Reading ---------------------------------------------------------------------------------------------------

// An erased enquiry (the erasure of the child's data, C224) has no child's name, guardian's name or phone: they are
// null, and `erased_on` says when.
export type EnquiryRow = {
  enquiry_id: string;
  child_name: string | null;
  guardian_name: string | null;
  phone: string | null;
  class_id: string;
  class_name: string;
  source: SourceCode;
  stage: StageCode;
  owner_id: string;
  owner: string;
  next_follow_up: string | null;
  next_step: string | null;
  closed_reason: string | null;
  student_id: string | null;
  created_on: string; // India's date
  last_contact_on: string; // India's date of the last contact: recorded, a note, or a move of stage
  erased_on: string | null; // India's date of the erasure, or null
};

const ENQUIRIES = `
  select e.enquiry_id, e.child_name, e.guardian_name, e.phone, e.class_id, c.name as class_name, e.source, e.stage,
         e.owner_id, u.display_name as owner, e.next_follow_up::text as next_follow_up, e.next_step, e.closed_reason, e.student_id,
         (e.created_at at time zone 'Asia/Kolkata')::date::text as created_on,
         (e.erased_at at time zone 'Asia/Kolkata')::date::text as erased_on,
         coalesce((select (max(v.at) at time zone 'Asia/Kolkata')::date::text from admission_events v
                    where v.school_id = e.school_id and v.enquiry_id = e.enquiry_id and v.kind in ('recorded', 'note', 'stage')),
                  (e.created_at at time zone 'Asia/Kolkata')::date::text) as last_contact_on
    from admission_enquiries e
    join classes c on c.school_id = e.school_id and c.class_id = e.class_id
    join users u on u.school_id = e.school_id and u.user_id = e.owner_id`;

export async function listEnquiries(db: Sql, schoolId: string): Promise<EnquiryRow[]> {
  return (await db.query(`${ENQUIRIES} where e.school_id = $1 order by e.created_at desc, e.enquiry_id`, [schoolId])).rows as EnquiryRow[];
}

// An enquiry as the free tool reads one, so its own followUps() decides what is due and what has gone quiet.
export function asTrackerEnquiry(r: EnquiryRow): Enquiry {
  return {
    id: r.enquiry_id,
    parentName: r.guardian_name ?? '',
    phone: r.phone ?? '',
    childName: r.child_name ?? '',
    classWanted: r.class_name,
    source: sourceLabel(r.source),
    stage: stageLabel(r.stage),
    nextStep: r.next_step ?? '',
    followUp: r.next_follow_up ?? '',
    notes: '',
    notJoiningReason: r.closed_reason ?? '',
    added: r.created_on,
    updated: r.last_contact_on,
  };
}

export type FollowUpLists = { due: { enquiryId: string; overdueDays: number }[]; quiet: { enquiryId: string; quietDays: number }[] };

// "Follow up today" (due today, or overdue, the most overdue first) and "gone quiet" (no contact for `quietAfter`
// days or more and not already due, the longest silence first): the free tool's own rule.
export function followUpLists(rows: readonly EnquiryRow[], today: string, quietAfter: number): FollowUpLists {
  const f = followUps(rows.map(asTrackerEnquiry), today, quietAfter);
  return { due: f.due.map((d) => ({ enquiryId: d.e.id, overdueDays: d.overdueDays })), quiet: f.quiet.map((q) => ({ enquiryId: q.e.id, quietDays: q.quietDays })) };
}

export type Pipeline = {
  today: string;
  quietDays: number;
  enquiries: EnquiryRow[];
  lists: FollowUpLists;
  classes: { class_id: string; name: string }[];
  owners: { user_id: string; name: string }[];
};

export async function loadPipeline(db: Sql, schoolId: string, today: string = indiaDate()): Promise<Pipeline> {
  const enquiries = await listEnquiries(db, schoolId);
  const days = await quietDays(db, schoolId);
  const classes = (await db.query(`select class_id, name from classes where school_id = $1 order by ${classOrderSql('')}, class_id`, [schoolId])).rows as Pipeline['classes'];
  const owners = (await db.query(`select user_id, display_name as name from users where school_id = $1 and is_active and role::text = any($2::text[]) order by display_name, user_id`, [schoolId, ADMISSIONS_OFFICE])).rows as Pipeline['owners'];
  return { today, quietDays: days, enquiries, lists: followUpLists(enquiries, today, days), classes, owners };
}

// How many follow-ups are due today or overdue: the screen's own "follow up today" list, counted for My Day.
export async function followUpsDue(db: { query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }> }, schoolId: string, today: string = indiaDate()): Promise<number> {
  const open = (await db.query(`${ENQUIRIES} where e.school_id = $1 and e.stage <> all($2::text[]) and e.next_follow_up is not null and e.next_follow_up <= $3::date`, [schoolId, CLOSED_STAGE_IDS, today])).rows as EnquiryRow[];
  return followUpLists(open, today, Number.MAX_SAFE_INTEGER).due.length;
}

export type Step = { kind: string; note: string | null; stage_from: StageCode | null; stage_to: StageCode | null; follow_up: string | null; next_step: string | null; owner: string | null; student_id: string | null; changed: string[] | null; by: string; at: string };

export async function enquirySteps(db: Sql, schoolId: string, enquiryId: string): Promise<Step[] | null> {
  if (!(await db.query(`select 1 from admission_enquiries where school_id = $1 and enquiry_id = $2`, [schoolId, enquiryId])).rows[0]) return null;
  return (await db.query(
    `select v.kind, v.note, v.stage_from, v.stage_to, v.follow_up::text as follow_up, v.next_step, o.display_name as owner, v.student_id, v.changed, b.display_name as by, v.at
       from admission_events v
       join users b on b.school_id = v.school_id and b.user_id = v.by_user
       left join users o on o.school_id = v.school_id and o.user_id = v.owner_id
      where v.school_id = $1 and v.enquiry_id = $2
      order by v.n`,
    [schoolId, enquiryId]
  )).rows as Step[];
}

// The students waiting for consent, as this session may see them: the list behind the dashboard's number
// ('students.waiting_consent'), which reads the same rows the same way.
export const WAITING_ROWS_MAX = 200;
export type WaitingStudent = { student_id: string; name: string; admission_no: string | null; class_name: string | null };
export async function waitingForConsent(db: Sql, schoolId: string): Promise<{ total: number; rows: WaitingStudent[] }> {
  const total = Number((await db.query(`select count(*) as n from students where school_id = $1 and status = 'pending_consent'`, [schoolId])).rows[0]?.n ?? 0);
  const rows = (await db.query(
    `select s.student_id, s.name, s.admission_no, c.name as class_name
       from students s left join classes c on c.school_id = s.school_id and c.class_id = s.class_id
      where s.school_id = $1 and s.status = 'pending_consent'
      order by s.name, s.student_id
      limit $2`,
    [schoolId, WAITING_ROWS_MAX]
  )).rows as WaitingStudent[];
  return { total, rows };
}

// ---- Checking what a person typed ------------------------------------------------------------------------------

export type Problem = 'not_allowed' | 'not_found' | 'child_name' | 'guardian_name' | 'phone' | 'class' | 'source' | 'owner' | 'stage' | 'follow_up' | 'next_step' | 'reason' | 'note' | 'nothing' | 'aadhaar' | 'closed' | 'admitted' | 'admission_no' | 'admission_no_taken' | 'dob' | 'changed';
type Checked<T> = { ok: true; value: T } | { ok: false; reason: Problem };

const oneLine = (v: string) => v.replace(/\s+/g, ' ').trim();
function text(v: unknown, max: number, problem: Problem, required: boolean): Checked<string | null> {
  if (v === null || v === undefined || (typeof v === 'string' && !v.trim())) return required ? { ok: false, reason: problem } : { ok: true, value: null };
  if (typeof v !== 'string') return { ok: false, reason: problem };
  const t = oneLine(v);
  if (t.length > max) return { ok: false, reason: problem };
  if (hasAadhaarNumber(t)) return { ok: false, reason: 'aadhaar' };
  return { ok: true, value: t };
}

export function followUpProblem(date: string | null, today: string): boolean {
  if (date === null) return false;
  if (!isIsoDate(date) || date < today) return true;
  return Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`) > FOLLOW_UP_DAYS_MAX * 86_400_000;
}

async function ownerIsOffice(db: Sql, schoolId: string, userId: unknown): Promise<boolean> {
  if (typeof userId !== 'string' || !/^[0-9a-f-]{36}$/i.test(userId)) return false;
  return Boolean((await db.query(`select 1 from users where school_id = $1 and user_id = $2 and is_active and role::text = any($3::text[])`, [schoolId, userId, ADMISSIONS_OFFICE])).rows[0]);
}

async function classOfSchool(db: Sql, schoolId: string, classId: unknown): Promise<boolean> {
  if (typeof classId !== 'string' || !/^[0-9a-f-]{36}$/i.test(classId)) return false;
  return Boolean((await db.query(`select 1 from classes where school_id = $1 and class_id = $2`, [schoolId, classId])).rows[0]);
}

const audit = (db: Sql, actor: Actor, action: string, enquiryId: string, after: Record<string, unknown>, before?: Record<string, unknown>) =>
  writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: `admissions.${action}`, targetType: 'admission_enquiries', targetId: enquiryId, beforeState: before, afterState: after });

// ---- Recording an enquiry ------------------------------------------------------------------------------------

export type NewEnquiry = { childName: unknown; guardianName: unknown; phone: unknown; classId: unknown; source: unknown; ownerId: unknown; followUp: unknown; nextStep: unknown; note: unknown };
export type Result = { ok: true; enquiryId: string } | { ok: false; reason: Problem };

export async function recordEnquiry(db: Sql, actor: Actor, input: NewEnquiry, today: string = indiaDate()): Promise<Result> {
  if (!ADMISSIONS_OFFICE.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  const child = text(input.childName, ENQUIRY_MAX.childName, 'child_name', true);
  if (!child.ok) return child;
  const guardian = text(input.guardianName, ENQUIRY_MAX.parentName, 'guardian_name', true);
  if (!guardian.ok) return guardian;
  const phone = typeof input.phone === 'string' && input.phone.length <= ENQUIRY_MAX.phone ? normalizePhone(input.phone) : null;
  if (!phone) return { ok: false, reason: 'phone' };
  if (!isSourceCode(input.source)) return { ok: false, reason: 'source' };
  const followUp = input.followUp === null || input.followUp === undefined || input.followUp === '' ? null : input.followUp;
  if (followUp !== null && (typeof followUp !== 'string' || followUpProblem(followUp, today))) return { ok: false, reason: 'follow_up' };
  const nextStep = text(input.nextStep, ENQUIRY_MAX.nextStep, 'next_step', false);
  if (!nextStep.ok) return nextStep;
  const note = text(input.note, NOTE_MAX, 'note', false);
  if (!note.ok) return note;
  if (!(await classOfSchool(db, actor.schoolId, input.classId))) return { ok: false, reason: 'class' };
  if (!(await ownerIsOffice(db, actor.schoolId, input.ownerId))) return { ok: false, reason: 'owner' };
  const made = await db.query(
    `insert into admission_enquiries (school_id, child_name, guardian_name, phone, class_id, source, owner_id, next_follow_up, next_step, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning enquiry_id`,
    [actor.schoolId, child.value, guardian.value, phone, input.classId, input.source, input.ownerId, followUp, nextStep.value, actor.userId]
  );
  const enquiryId = made.rows[0].enquiry_id as string;
  if (note.value) await db.query(`insert into admission_events (school_id, enquiry_id, kind, note, by_user) values ($1, $2, 'note', $3, $4)`, [actor.schoolId, enquiryId, note.value, actor.userId]);
  await audit(db, actor, 'recorded', enquiryId, { classId: input.classId, source: input.source, ownerId: input.ownerId, followUp, noted: Boolean(note.value) });
  return { ok: true, enquiryId };
}

// ---- What happened: a note, a stage, the next step and date (the tool's "Record what happened") ------------------

export type Outcome = { note: unknown; stage: unknown; nextStep: unknown; followUp: unknown; reason: unknown };

type Locked = { stage: StageCode; class_id: string; child_name: string; owner_id: string; next_follow_up: string | null; next_step: string | null; closed_reason: string | null };
async function lockEnquiry(db: Sql, schoolId: string, enquiryId: string): Promise<Locked | null> {
  return ((await db.query(
    `select stage, class_id, child_name, owner_id, next_follow_up::text as next_follow_up, next_step, closed_reason from admission_enquiries where school_id = $1 and enquiry_id = $2 for update`,
    [schoolId, enquiryId]
  )).rows[0] as Locked | undefined) ?? null;
}

export async function recordOutcome(db: Sql, actor: Actor, enquiryId: string, o: Outcome, today: string = indiaDate()): Promise<Result> {
  if (!ADMISSIONS_OFFICE.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  const before = await lockEnquiry(db, actor.schoolId, enquiryId);
  if (!before) return { ok: false, reason: 'not_found' };
  if (before.stage === 'admitted') return { ok: false, reason: 'admitted' };
  if (!(MOVABLE_STAGE_IDS as readonly unknown[]).includes(o.stage)) return { ok: false, reason: 'stage' };
  const stage = o.stage as StageCode;
  const note = text(o.note, NOTE_MAX, 'note', false);
  if (!note.ok) return note;
  const closing = stage === 'not_joining';
  const reason = text(o.reason, ENQUIRY_MAX.notJoiningReason, 'reason', closing);
  if (!reason.ok) return reason;
  const nextStep = closing ? ({ ok: true, value: null } as const) : text(o.nextStep, ENQUIRY_MAX.nextStep, 'next_step', false);
  if (!nextStep.ok) return nextStep;
  const followUp = closing || o.followUp === null || o.followUp === undefined || o.followUp === '' ? null : o.followUp;
  // A date kept as it was is not checked again: an overdue follow-up stays where it is until it is moved.
  if (followUp !== null && (typeof followUp !== 'string' || (followUp !== before.next_follow_up && followUpProblem(followUp, today)))) return { ok: false, reason: 'follow_up' };
  const after = { stage, next_follow_up: followUp as string | null, next_step: nextStep.value, closed_reason: closing ? reason.value : null };
  const changes = after.stage !== before.stage || after.next_follow_up !== before.next_follow_up || after.next_step !== before.next_step || after.closed_reason !== before.closed_reason;
  if (!note.value && !changes) return { ok: false, reason: 'nothing' };
  if (note.value) await db.query(`insert into admission_events (school_id, enquiry_id, kind, note, by_user) values ($1, $2, 'note', $3, $4)`, [actor.schoolId, enquiryId, note.value, actor.userId]);
  if (changes) {
    await db.query(
      `update admission_enquiries set stage = $3, next_follow_up = $4, next_step = $5, closed_reason = $6 where school_id = $1 and enquiry_id = $2`,
      [actor.schoolId, enquiryId, after.stage, after.next_follow_up, after.next_step, after.closed_reason]
    );
  }
  await audit(db, actor, 'updated', enquiryId, { stage: after.stage, followUp: after.next_follow_up, noted: Boolean(note.value) }, { stage: before.stage, followUp: before.next_follow_up });
  return { ok: true, enquiryId };
}

// ---- Giving it to someone else in the office ---------------------------------------------------------------------

export async function giveEnquiry(db: Sql, actor: Actor, enquiryId: string, ownerId: unknown): Promise<Result> {
  if (!ADMISSIONS_OFFICE.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  const before = await lockEnquiry(db, actor.schoolId, enquiryId);
  if (!before) return { ok: false, reason: 'not_found' };
  if (!isOpenStage(before.stage)) return { ok: false, reason: before.stage === 'admitted' ? 'admitted' : 'closed' };
  if (!(await ownerIsOffice(db, actor.schoolId, ownerId))) return { ok: false, reason: 'owner' };
  if (ownerId === before.owner_id) return { ok: false, reason: 'nothing' };
  await db.query(`update admission_enquiries set owner_id = $3 where school_id = $1 and enquiry_id = $2`, [actor.schoolId, enquiryId, ownerId]);
  await audit(db, actor, 'given', enquiryId, { ownerId }, { ownerId: before.owner_id });
  return { ok: true, enquiryId };
}

// ---- Correcting what was written down -----------------------------------------------------------------------------

export type Details = { childName: unknown; guardianName: unknown; phone: unknown; classId: unknown; source: unknown };

export async function correctDetails(db: Sql, actor: Actor, enquiryId: string, d: Details): Promise<Result> {
  if (!ADMISSIONS_OFFICE.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  const before = await lockEnquiry(db, actor.schoolId, enquiryId);
  if (!before) return { ok: false, reason: 'not_found' };
  if (before.stage === 'admitted') return { ok: false, reason: 'admitted' };
  const child = text(d.childName, ENQUIRY_MAX.childName, 'child_name', true);
  if (!child.ok) return child;
  const guardian = text(d.guardianName, ENQUIRY_MAX.parentName, 'guardian_name', true);
  if (!guardian.ok) return guardian;
  const phone = typeof d.phone === 'string' && d.phone.length <= ENQUIRY_MAX.phone ? normalizePhone(d.phone) : null;
  if (!phone) return { ok: false, reason: 'phone' };
  if (!isSourceCode(d.source)) return { ok: false, reason: 'source' };
  if (!(await classOfSchool(db, actor.schoolId, d.classId))) return { ok: false, reason: 'class' };
  const changed = await db.query(
    `update admission_enquiries set child_name = $3, guardian_name = $4, phone = $5, class_id = $6, source = $7
      where school_id = $1 and enquiry_id = $2
        and (child_name, guardian_name, phone, class_id, source) is distinct from ($3, $4, $5, $6::uuid, $7)
      returning enquiry_id`,
    [actor.schoolId, enquiryId, child.value, guardian.value, phone, d.classId, d.source]
  );
  if (!changed.rows[0]) return { ok: false, reason: 'nothing' };
  await audit(db, actor, 'details_changed', enquiryId, { classId: d.classId, source: d.source }, { classId: before.class_id });
  return { ok: true, enquiryId };
}

// ---- Admit -------------------------------------------------------------------------------------------------------

export type AdmitInput = { admissionNo: unknown; dob: unknown };
export type FeePlan = { structure_id: string; academic_year: string; effective_from: string; heads: number } | null;
export type AdmitResult =
  | { ok: true; enquiryId: string; studentId: string; className: string; fees: FeePlan; monthRaised: boolean }
  | { ok: false; reason: Problem };

export async function admit(db: Sql, actor: Actor, enquiryId: string, input: AdmitInput, today: string = indiaDate()): Promise<AdmitResult> {
  if (!ADMISSIONS_OFFICE.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  const admissionNo = input.admissionNo === null || input.admissionNo === undefined || (typeof input.admissionNo === 'string' && !input.admissionNo.trim()) ? null : input.admissionNo;
  if (admissionNo !== null && (typeof admissionNo !== 'string' || admissionNo.trim().length > ADMISSION_NO_MAX || hasAadhaarNumber(admissionNo))) return { ok: false, reason: 'admission_no' };
  const dob = input.dob === null || input.dob === undefined || input.dob === '' ? null : input.dob;
  if (dob !== null && (typeof dob !== 'string' || !isIsoDate(dob) || dob > today)) return { ok: false, reason: 'dob' };
  // Every check before the first write: a refusal leaves nothing behind. The row lock makes a second press wait,
  // and then find the enquiry admitted.
  const e = await lockEnquiry(db, actor.schoolId, enquiryId);
  if (!e) return { ok: false, reason: 'not_found' };
  if (e.stage === 'admitted') return { ok: false, reason: 'admitted' };
  if (e.stage === 'not_joining') return { ok: false, reason: 'closed' };
  const no = admissionNo === null ? null : admissionNo.trim();
  if (no && (await db.query(`select 1 from students where school_id = $1 and lower(admission_no) = lower($2)`, [actor.schoolId, no])).rows[0]) return { ok: false, reason: 'admission_no_taken' };

  // The child's record, exactly as a new pupil enters today (POST /api/app/students): waiting for consent.
  const student = (await db.query(
    `insert into students (school_id, admission_no, name, class_id, dob, status)
     values ($1, $2, $3, $4, $5, 'pending_consent')
     returning student_id, class_id, status`,
    [actor.schoolId, no, e.child_name, e.class_id, dob]
  )).rows[0];
  // The record made, never the child's name or date of birth (C224): its class and state, and which details it has.
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'student.create', targetType: 'students', targetId: student.student_id, afterState: { classId: student.class_id, status: student.status, withAdmissionNo: no !== null, withDob: dob !== null, fromEnquiry: enquiryId } });

  // The class's fee structure in force today, in the session running today (the fees library's own "in force").
  const session = (await db.query(
    `select session_id from academic_sessions where school_id = $1 and start_date <= $2::date and end_date >= $2::date order by is_current desc, start_date desc limit 1`,
    [actor.schoolId, today]
  )).rows[0] as { session_id: string } | undefined;
  const structure = session ? await structureInForce(db as PoolClient, actor.schoolId, e.class_id, session.session_id, today) : null;
  const fees: FeePlan = structure ? { structure_id: structure.structure_id, academic_year: structure.academic_year, effective_from: structure.effective_from, heads: structure.items.length } : null;
  // Whether this month's dues are already raised for the class: the child's lines then come when the month is
  // raised again (raising a month twice adds only the lines that are missing).
  const monthRaised = Boolean((await db.query(
    `select 1 from fees_ledger l join students s on s.school_id = l.school_id and s.student_id = l.student_id
      where l.school_id = $1 and s.class_id = $2 and l.period_key = $3 limit 1`,
    [actor.schoolId, e.class_id, today.slice(0, 7)]
  )).rows[0]);

  await db.query(
    `update admission_enquiries set stage = 'admitted', student_id = $3, admitted_structure_id = $4, next_follow_up = null, next_step = null, closed_reason = null
      where school_id = $1 and enquiry_id = $2`,
    [actor.schoolId, enquiryId, student.student_id, fees?.structure_id ?? null]
  );
  await audit(db, actor, 'admitted', enquiryId, { studentId: student.student_id, classId: e.class_id, feeStructureId: fees?.structure_id ?? null }, { stage: e.stage });
  const className = (await db.query(`select name from classes where school_id = $1 and class_id = $2`, [actor.schoolId, e.class_id])).rows[0]?.name ?? '';
  return { ok: true, enquiryId, studentId: student.student_id, className, fees, monthRaised };
}

// ---- Deleting (C223-A answer 3, C224) ------------------------------------------------------------------------------
//
// The principal and the school admin delete an enquiry that was not admitted, with its steps; and, for a parent's
// erasure request about a family that never joined, every such enquiry with the family's phone. An admitted enquiry
// is the child's record and is never deleted (the erasure of the child's data blanks it). The database does the
// deleting (public.delete_admission_enquiry, public.delete_family_enquiries: the office only, the caller's school
// only); the app's role holds no DELETE. Audited with ids and counts, never a name or a phone. Nothing is deleted
// automatically: the retention period is the lawyer's (P8).

export type DeleteResult = { ok: true; enquiryId: string; steps: number } | { ok: false; reason: Problem };

export async function deleteEnquiry(db: Sql, actor: Actor, enquiryId: string): Promise<DeleteResult> {
  if (!ADMISSIONS_OFFICE.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  const before = await lockEnquiry(db, actor.schoolId, enquiryId);
  if (!before) return { ok: false, reason: 'not_found' };
  if (before.stage === 'admitted') return { ok: false, reason: 'admitted' };
  const steps = Number((await db.query(`select public.delete_admission_enquiry($1) as n`, [enquiryId])).rows[0]?.n ?? 0);
  await audit(db, actor, 'deleted', enquiryId, { steps }, { stage: before.stage, classId: before.class_id });
  return { ok: true, enquiryId, steps };
}

// The enquiries a family's phone finds, as the office reads them before deleting: those that would go (not admitted)
// and how many admitted ones stay (a child's record each).
export type FamilyEnquiries = { phone: string; enquiries: { enquiry_id: string; child_name: string; class_name: string; stage: StageCode; created_on: string }[]; admitted: number };
export type FamilyResult = { ok: true; family: FamilyEnquiries } | { ok: false; reason: Problem };

export async function familyEnquiries(db: Sql, actor: Actor, phoneRaw: unknown): Promise<FamilyResult> {
  if (!ADMISSIONS_OFFICE.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  // What the office types, read as the enquiries keep it (+ and digits), as recordEnquiry reads it.
  const phone = typeof phoneRaw === 'string' && phoneRaw.length <= ENQUIRY_MAX.phone ? normalizePhone(phoneRaw) : null;
  if (!phone) return { ok: false, reason: 'phone' };
  const rows = (await db.query(
    `select e.enquiry_id, e.child_name, c.name as class_name, e.stage, (e.created_at at time zone 'Asia/Kolkata')::date::text as created_on
       from admission_enquiries e join classes c on c.school_id = e.school_id and c.class_id = e.class_id
      where e.school_id = $1 and e.phone = $2
      order by e.created_at, e.enquiry_id`,
    [actor.schoolId, phone]
  )).rows as FamilyEnquiries['enquiries'];
  return { ok: true, family: { phone, enquiries: rows.filter((r) => r.stage !== 'admitted'), admitted: rows.filter((r) => r.stage === 'admitted').length } };
}

export type FamilyDeleteResult = { ok: true; enquiryIds: string[]; steps: number } | { ok: false; reason: Problem };

// `expected`: the enquiries the office was shown and confirmed. If the family's list has changed since (an enquiry
// recorded, moved or deleted meanwhile), nothing is deleted and the office looks again.
export async function deleteFamilyEnquiries(db: Sql, actor: Actor, phoneRaw: unknown, expected: unknown): Promise<FamilyDeleteResult> {
  const found = await familyEnquiries(db, actor, phoneRaw);
  if (!found.ok) return found;
  const now = found.family.enquiries.map((e) => e.enquiry_id).sort();
  if (!Array.isArray(expected) || !expected.every((x) => typeof x === 'string')) return { ok: false, reason: 'changed' };
  if ([...new Set(expected as string[])].sort().join(',') !== now.join(',')) return { ok: false, reason: 'changed' };
  if (now.length === 0) return { ok: false, reason: 'nothing' };
  // The database deletes exactly the list confirmed, under a lock, or nothing (the list changed in the meantime).
  const gone = (await db.query(`select deleted_enquiry, deleted_steps from public.delete_family_enquiries($1, $2::uuid[])`, [found.family.phone, now])).rows as { deleted_enquiry: string; deleted_steps: number }[];
  if (gone.length === 0) return { ok: false, reason: 'changed' };
  const enquiryIds = gone.map((g) => g.deleted_enquiry);
  const steps = gone.reduce((n, g) => n + Number(g.deleted_steps), 0);
  // Ids and counts only: never the phone, never a name.
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'admissions.family_deleted', targetType: 'admission_enquiries', afterState: { enquiryIds, enquiries: enquiryIds.length, steps, admittedKept: found.family.admitted } });
  return { ok: true, enquiryIds, steps };
}
