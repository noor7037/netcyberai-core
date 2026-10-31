import { createHash } from 'crypto';
import { writeAuditLog } from '@/lib/audit/log';
import { classKey, currentSessionId, existingClassKeys, lockSchoolClasses } from '@/lib/classes/standard-classes';
import { readGrade, readSection } from '@/lib/classes/class-csv';
import { isIndianState, INDIAN_STATES } from '@/lib/contracts/indian-states';
import { checkPhone } from '@/lib/errors/catalogue';
import { emailKey, phoneKey } from '@/lib/families/families';
import { setSchoolBoard } from '@/lib/exams/boards';
import { applyPlan, listPlans } from '@/lib/frameworks/plans';
import { importStudentRecords, readStudentCsv, ImportFileError, type RowError } from '@/lib/import/run-import';
import type { JobQueue, Sql } from '@/lib/jobs/types';
import { addSession, makeSessionCurrent } from '@/lib/setup/sessions';
import { parseSessionInput } from '@/lib/setup/session-input';
import { createInvitation, InvitationExistsError } from './invitations';
import {
  MAX_SECTIONS,
  MAX_STUDENT_CSV_CHARS,
  MAX_TEACHERS,
  PROVISION_GRADES,
  provisionClassNames,
  type ProvisionSession,
} from './provision-input';

// One-screen school provisioning (W6-E, founder's decision C230-AU; Decision Log C399). One transaction, as the
// platform role (Control), makes everything a school needs to start, through the paths that already make each part:
//   the school row (as POST /api/control/schools), its board (setSchoolBoard), the widest plan for real schools from
//   the plans table (applyPlan: every module that plan gives is on), the academic session (addSession and
//   makeSessionCurrent), the classes and sections (the standard-classes lock and keys), the syllabus of every class
//   from the published board catalog (content.*) into syllabus_units, the principal's and the teachers' login
//   invitations (createInvitation: the invitation row and its invite.send job), the students (importStudentRecords:
//   all or nothing, pending consent) and one guardian a phone number, linked to that number's students.
// Idempotent: a school of the same name is never made twice (the caller is told, and may add to it); classes,
// subjects, syllabus units, invitations and a byte-identical students list are each made once. Every step writes its
// audit row, with ids and counts only (C56). A dry run makes all of it and then undoes it (ProvisionDryRun).

export type Actor = { userId: string; role: 'super_admin' };

export type ProvisionField = 'school_name' | 'board' | 'state' | 'city' | 'grades' | 'sections' | 'session' | 'principal_name' | 'principal_email' | 'teacher' | 'students';
// `options`: the class names a teacher's class could mean, for the screen to list ("use 6-A or 6-B").
export type ProvisionProblem = { field: ProvisionField; code: string; line?: number; options?: string[] };

export type ProvisionInput = {
  schoolName: string;
  boardId: string;
  stateCode: string;
  city: string;
  grades: string[];
  sections: number;
  session: ProvisionSession;
  principal: { name: string; email: string };
  teachers: { line: number; name: string; email: string; className: string | null }[];
  students: { records: Record<string, string>[]; rowErrors: Map<number, string[]>; hash: string } | null;
};

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');
const BOARD_ID = /^[a-z][a-z0-9-]{1,39}$/;

// The students list as the importer reads it: "class" and "section" become the class's name ("5-A"), the other
// columns pass as they are. A row whose class or section cannot be read, or whose guardian phone is not a phone
// number, is a row error, said with the importer's own.
function readStudents(raw: string): NonNullable<ProvisionInput['students']> | ProvisionProblem {
  if (raw.length > MAX_STUDENT_CSV_CHARS) return { field: 'students', code: 'too_long' };
  let read: ReturnType<typeof readStudentCsv>;
  try {
    read = readStudentCsv(raw);
  } catch (err) {
    if (err instanceof ImportFileError) return { field: 'students', code: 'file' };
    throw err;
  }
  const rowErrors = new Map(read.rowErrors);
  const add = (row: number, why: string) => rowErrors.set(row, [...(rowErrors.get(row) ?? []), why]);
  const records = read.records.map((rec, i) => {
    const row = i + 1;
    const grade = readGrade(rec.class ?? '');
    const section = readSection(rec.section ?? '');
    if (!grade) add(row, 'class must be Nursery, LKG, UKG or 1 to 12');
    if (!section) add(row, 'section must be one letter, A to Z');
    const phone = (rec.guardian_phone ?? '').trim();
    const checked = phone ? checkPhone(phone) : null;
    if (checked && !checked.ok) add(row, 'guardian phone is not a 10-digit phone number');
    const out: Record<string, string> = { name: rec.name ?? '', class_name: grade && section ? `${grade}-${section}` : '' };
    for (const k of ['admission_no', 'roll_no', 'dob', 'gender', 'guardian_name'] as const) if (rec[k]) out[k] = rec[k];
    if (checked?.ok) out.guardian_phone = checked.digits;
    return out;
  });
  return { records, rowErrors, hash: createHash('sha256').update(raw).digest('hex') };
}

// The request, checked. Every problem is listed at once, so the screen can show them all.
export function parseProvisionInput(body: unknown): { ok: true; value: ProvisionInput } | { ok: false; problems: ProvisionProblem[] } {
  const b = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  const problems: ProvisionProblem[] = [];
  const schoolName = text(b.schoolName, 200);
  if (schoolName.length < 2) problems.push({ field: 'school_name', code: 'required' });
  const boardId = typeof b.boardId === 'string' && BOARD_ID.test(b.boardId) ? b.boardId : '';
  if (!boardId) problems.push({ field: 'board', code: 'required' });
  const stateCode = isIndianState(b.stateCode) ? (b.stateCode as string) : '';
  if (!stateCode) problems.push({ field: 'state', code: 'required' });
  const city = text(b.city, 100);
  if (!city) problems.push({ field: 'city', code: 'required' });
  const asked = Array.isArray(b.grades) ? b.grades : [];
  const grades = PROVISION_GRADES.filter((g) => asked.includes(g));
  if (grades.length === 0) problems.push({ field: 'grades', code: 'required' });
  const sections = Number(b.sections);
  if (!Number.isInteger(sections) || sections < 1 || sections > MAX_SECTIONS) problems.push({ field: 'sections', code: 'range' });
  const session = parseSessionInput(b.session);
  if (!session.ok) problems.push({ field: 'session', code: session.code });

  const p = (typeof b.principal === 'object' && b.principal !== null ? b.principal : {}) as Record<string, unknown>;
  const principalName = text(p.name, 200);
  const principalEmail = emailKey(p.email);
  if (principalName.length < 2) problems.push({ field: 'principal_name', code: 'required' });
  if (!principalEmail) problems.push({ field: 'principal_email', code: 'email' });

  const chosenClasses = provisionClassNames(grades, Number.isInteger(sections) ? sections : 1);
  const seen = new Set<string>(principalEmail ? [principalEmail] : []);
  const rawTeachers = Array.isArray(b.teachers) ? b.teachers : [];
  if (rawTeachers.length > MAX_TEACHERS) problems.push({ field: 'teacher', code: 'too_many' });
  const teachers: ProvisionInput['teachers'] = [];
  rawTeachers.slice(0, MAX_TEACHERS).forEach((t, i) => {
    const r = (typeof t === 'object' && t !== null ? t : {}) as Record<string, unknown>;
    const line = i + 1;
    const name = text(r.name, 200);
    const email = emailKey(r.email);
    const typed = text(r.className, 20) || null;
    if (!name && !text(r.email, 254) && !typed) return; // an empty row on the screen
    const cls = typed ? teacherClass(typed, chosenClasses) : null;
    const className = cls?.ok ? cls.name : typed;
    if (name.length < 2) problems.push({ field: 'teacher', code: 'name', line });
    if (!email) problems.push({ field: 'teacher', code: 'email', line });
    else if (seen.has(email)) problems.push({ field: 'teacher', code: 'email_twice', line });
    if (cls && !cls.ok) problems.push({ field: 'teacher', code: cls.code, line, options: cls.options });
    if (email) seen.add(email);
    teachers.push({ line, name, email: email ?? '', className });
  });

  let students: ProvisionInput['students'] = null;
  if (typeof b.studentsCsv === 'string' && b.studentsCsv.trim()) {
    const read = readStudents(b.studentsCsv);
    if ('field' in read) problems.push(read);
    else students = read;
  }

  if (problems.length > 0 || !session.ok) return { ok: false, problems };
  return {
    ok: true,
    value: { schoolName, boardId, stateCode, city, grades, sections, session: session.value, principal: { name: principalName, email: principalEmail! }, teachers, students },
  };
}

// A teacher's class as typed, read against the classes chosen (W11-B): its exact name in any spelling ("6a", "6 A",
// "6-A"), or a bare grade when that grade has exactly one chosen section ("6" is 6-A when only 6-A is made). A bare
// grade with several sections is refused with those names; a class not chosen, with every chosen name.
export function teacherClass(typed: string, chosen: readonly string[]): { ok: true; name: string } | { ok: false; code: 'class' | 'class_which'; options: string[] } {
  const key = classKey(typed);
  const exact = chosen.find((c) => classKey(c) === key);
  if (exact) return { ok: true, name: exact };
  const ofGrade = chosen.filter((c) => classKey(c.slice(0, c.lastIndexOf('-'))) === key);
  if (ofGrade.length === 1) return { ok: true, name: ofGrade[0] };
  if (ofGrade.length > 1) return { ok: false, code: 'class_which', options: ofGrade };
  return { ok: false, code: 'class', options: chosen.length > 12 ? [...chosen.slice(0, 12), '…'] : [...chosen] };
}

// ---- the database ---------------------------------------------------------------------------------------------

export type InvitationOutcome = { invitationId: string | null; displayName: string; role: 'principal' | 'teacher'; status: 'queued' | 'already_invited'; className: string | null };
export type ProvisionResult = {
  schoolId: string;
  schoolName: string;
  newSchool: boolean;
  plan: { planId: string; name: string; modules: number } | null;
  session: { label: string; created: boolean };
  classes: { created: number; alreadyThere: number };
  syllabus: { classesMapped: number; subjects: number; units: number; classesWithoutCatalog: number };
  invitations: InvitationOutcome[];
  students: { imported: number; alreadyImported: boolean; onRecordGuardians: number };
  guardians: { created: number; linked: number };
  jobKeys: string[];
};

export type ProvisionOutcome =
  | { ok: true; result: ProvisionResult }
  | { ok: false; reason: 'school_exists'; schoolId: string; schoolName: string }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'board' }
  | { ok: false; reason: 'no_plan' }
  | { ok: false; reason: 'students'; errors: RowError[] };

// Thrown to undo a dry run's transaction: it carries what the real run would make.
export class ProvisionDryRun extends Error {
  constructor(readonly outcome: ProvisionOutcome) {
    super('dry run: undone');
    this.name = 'ProvisionDryRun';
  }
}
// Thrown to undo a run that cannot finish (the students list has errors): nothing of it is kept.
export class ProvisionRefused extends Error {
  constructor(readonly outcome: ProvisionOutcome) {
    super('provisioning refused: undone');
    this.name = 'ProvisionRefused';
  }
}

// A school's name, the same however it is spaced or capitalised.
export async function findSchoolByName(db: Sql, name: string): Promise<{ schoolId: string; name: string } | null> {
  const { rows } = await db.query(`select school_id, name from schools where lower(btrim(regexp_replace(name, '\\s+', ' ', 'g'))) = lower($1) order by created_at limit 1`, [name]);
  return rows[0] ? { schoolId: rows[0].school_id as string, name: rows[0].name as string } : null;
}

// The plan that gives a real school the most: every working module, else the most modules and plan features. Read
// from the plans table (no plan is named in the code); a retired plan or one for test schools only is never chosen.
export async function widestPlan(db: Sql): Promise<{ planId: string; name: string } | null> {
  const usable = (await listPlans(db)).filter((p) => !p.retired && !p.testSchoolsOnly);
  usable.sort((a, b) => Number(b.allWorkingModules) - Number(a.allWorkingModules) || b.moduleIds.length - a.moduleIds.length || b.features.length - a.features.length || a.planId.localeCompare(b.planId));
  return usable[0] ? { planId: usable[0].planId, name: usable[0].name } : null;
}

// The old board column the school row still carries, from the board chosen.
const BOARD_TYPE: Record<string, string> = { cbse: 'CBSE', cisce: 'ICSE', ib: 'IB' };
// The content catalog's class level of a grade: Nursery -2, LKG -1, UKG 0, then 1 to 12.
const LEVEL: Record<string, number> = { Nursery: -2, LKG: -1, UKG: 0 };
const levelOf = (grade: string) => LEVEL[grade] ?? Number(grade);
// A catalog subject id as a school's subject name: social_science → Social Science.
const subjectName = (id: string) => id.split('_').map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');

async function ensureSession(db: Sql, schoolId: string, actor: Actor, wanted: ProvisionSession): Promise<{ sessionId: string; label: string; created: boolean }> {
  const setup = { schoolId, userId: actor.userId, role: actor.role };
  const current = await currentSessionId(db, schoolId);
  if (current) {
    const { rows } = await db.query(`select label from academic_sessions where session_id = $1`, [current]);
    return { sessionId: current, label: rows[0].label as string, created: false };
  }
  const added = await addSession(db, setup, wanted);
  let sessionId: string;
  let created = false;
  if (added.ok) {
    sessionId = added.session.sessionId;
    created = true;
  } else {
    const { rows } = await db.query(`select session_id from academic_sessions where school_id = $1 and lower(btrim(label)) = lower($2)`, [schoolId, wanted.label]);
    sessionId = rows[0].session_id as string;
  }
  await makeSessionCurrent(db, setup, sessionId);
  return { sessionId, label: wanted.label, created };
}

async function ensureClasses(db: Sql, schoolId: string, actor: Actor, names: string[], sessionId: string): Promise<{ created: number; alreadyThere: number }> {
  await lockSchoolClasses(db, schoolId);
  const existing = existingClassKeys((await db.query(`select name, grade, section from classes where school_id = $1`, [schoolId])).rows);
  const missing = names.filter((n) => !existing.has(classKey(n))).map((name) => {
    const cut = name.lastIndexOf('-');
    return { name, grade: name.slice(0, cut), section: name.slice(cut + 1) };
  });
  if (missing.length > 0) {
    await db.query(
      `insert into classes (school_id, name, grade, section, session_id)
       select $1, n.name, n.grade, n.section, $2::uuid from unnest($3::text[], $4::text[], $5::text[]) as n(name, grade, section)`,
      [schoolId, sessionId, missing.map((c) => c.name), missing.map((c) => c.grade), missing.map((c) => c.section)]
    );
  }
  await writeAuditLog(db, {
    schoolId,
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventAction: 'class.provisioned',
    targetType: 'classes',
    afterState: { created: missing.length, already_there: names.length - missing.length, session_id: sessionId },
  });
  return { created: missing.length, alreadyThere: names.length - missing.length };
}

// Every class of the school whose grade the catalog has a published syllabus for (for everyone, the latest year and
// version of each subject) gets that syllabus's chapters and topics as its syllabus units, under a subject of the
// same name. A class and subject that already have units keep them and get none added. The catalog's board is the
// school board's id in capitals (cbse is CBSE, cisce is CISCE, a state's st-up is ST-UP).
async function mapSyllabus(db: Sql, schoolId: string, actor: Actor, boardId: string): Promise<ProvisionResult['syllabus']> {
  const classes = (await db.query(`select class_id, grade from classes where school_id = $1 and grade is not null`, [schoolId])).rows as { class_id: string; grade: string }[];
  const levels = [...new Set(classes.map((c) => levelOf(c.grade)).filter((n) => Number.isInteger(n)))];
  const versions = (
    await db.query(
      `select distinct on (v.class_level, v.subject) v.version_id, v.class_level, v.subject
         from content.syllabus_versions v
        where v.board_id = upper($1) and v.status = 'published' and v.audience = 'everyone' and v.class_level = any($2::smallint[])
        order by v.class_level, v.subject, v.academic_year desc, v.version_no desc`,
      [boardId, levels]
    )
  ).rows as { version_id: string; class_level: number; subject: string }[];
  const covered = classes.filter((c) => versions.some((v) => v.class_level === levelOf(c.grade)));
  const result = { classesMapped: 0, subjects: 0, units: 0, classesWithoutCatalog: classes.length - covered.length };
  if (versions.length === 0) return result;

  const subjects = [...new Set(versions.map((v) => subjectName(v.subject)))];
  await db.query(`insert into subjects (school_id, name) select $1, n from unnest($2::text[]) as n on conflict do nothing`, [schoolId, subjects]);
  const subjectId = new Map<string, string>(
    (await db.query(`select subject_id, lower(btrim(name)) as k from subjects where school_id = $1 and lower(btrim(name)) = any($2::text[])`, [schoolId, subjects.map((s) => s.toLowerCase())])).rows.map((r) => [r.k as string, r.subject_id as string])
  );
  const lines = (
    await db.query(
      `select c.version_id, left(c.title_en, 120) as chapter, left(coalesce(t.title_en, c.title_en), 200) as topic
         from content.chapters c left join content.topics t on t.chapter_id = c.chapter_id
        where c.version_id = any($1::uuid[])
        order by c.version_id, c.position, t.position nulls first`,
      [versions.map((v) => v.version_id)]
    )
  ).rows as { version_id: string; chapter: string; topic: string }[];

  const cls: string[] = [], sub: string[] = [], pos: number[] = [], chap: string[] = [], top: string[] = [];
  for (const c of covered) {
    for (const v of versions.filter((x) => x.class_level === levelOf(c.grade))) {
      const sid = subjectId.get(subjectName(v.subject).toLowerCase());
      if (!sid) continue;
      lines.filter((l) => l.version_id === v.version_id).forEach((l, i) => {
        cls.push(c.class_id);
        sub.push(sid);
        pos.push(i + 1);
        chap.push(l.chapter);
        top.push(l.topic);
      });
    }
  }
  const added = cls.length
    ? (
        await db.query(
          `insert into syllabus_units (school_id, class_id, subject_id, position, chapter, topic)
           select $1, n.class_id, n.subject_id, n.position, n.chapter, n.topic
             from unnest($2::uuid[], $3::uuid[], $4::int[], $5::text[], $6::text[]) as n(class_id, subject_id, position, chapter, topic)
            where not exists (select 1 from syllabus_units u where u.school_id = $1 and u.class_id = n.class_id and u.subject_id = n.subject_id)
           returning class_id`,
          [schoolId, cls, sub, pos, chap, top]
        )
      ).rows
    : [];
  result.classesMapped = new Set(added.map((r) => r.class_id as string)).size;
  result.subjects = subjects.length;
  result.units = added.length;
  await writeAuditLog(db, {
    schoolId,
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventAction: 'syllabus.mapped_from_board',
    targetType: 'syllabus_units',
    afterState: { board_id: boardId, versions: versions.map((v) => v.version_id), classes: result.classesMapped, units: result.units },
  });
  return result;
}

// One guardian a phone number in the list, linked to every student of the list with that number. A number a guardian
// of the school already has is not given a second guardian: the importer suggested the match for the office to
// confirm (C116), and nothing is linked by phone here.
async function linkGuardians(db: Sql, schoolId: string, actor: Actor, records: Record<string, string>[], created: { row: number; studentId: string }[]): Promise<{ created: number; linked: number; onRecord: number }> {
  const byPhone = new Map<string, { phone: string; name: string; studentIds: string[] }>();
  for (const c of created) {
    const rec = records[c.row - 1];
    const key = phoneKey(rec?.guardian_phone);
    if (!key) continue;
    const entry = byPhone.get(key) ?? { phone: rec.guardian_phone, name: (rec.guardian_name ?? '').trim().replace(/\s+/g, ' ').slice(0, 200) || `Guardian of ${rec.name.trim()}`, studentIds: [] };
    entry.studentIds.push(c.studentId);
    byPhone.set(key, entry);
  }
  if (byPhone.size === 0) return { created: 0, linked: 0, onRecord: 0 };
  const onRecord = new Set(
    (await db.query(`select right(regexp_replace(coalesce(phone, ''), '\\D', '', 'g'), 10) as k from parents where school_id = $1 and merged_into is null`, [schoolId])).rows.map((r) => r.k as string)
  );
  const fresh = [...byPhone.entries()].filter(([k]) => !onRecord.has(k)).map(([, v]) => v);
  if (fresh.length === 0) return { created: 0, linked: 0, onRecord: byPhone.size };
  const parentIds = (
    await db.query(
      `insert into parents (school_id, name, phone) select $1, n.name, n.phone from unnest($2::text[], $3::text[]) with ordinality as n(name, phone, ord) order by n.ord returning parent_id, phone`,
      [schoolId, fresh.map((f) => f.name), fresh.map((f) => f.phone)]
    )
  ).rows as { parent_id: string; phone: string }[];
  const idByPhone = new Map(parentIds.map((r) => [phoneKey(r.phone)!, r.parent_id]));
  const pairs = fresh.flatMap((f) => f.studentIds.map((s) => [idByPhone.get(phoneKey(f.phone)!)!, s] as const));
  await db.query(`insert into parent_student_map (school_id, parent_id, student_id) select $1, p, s from unnest($2::uuid[], $3::uuid[]) as x(p, s)`, [schoolId, pairs.map((p) => p[0]), pairs.map((p) => p[1])]);
  await writeAuditLog(db, {
    schoolId,
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventAction: 'guardian.provisioned',
    targetType: 'parent_student_map',
    afterState: { guardians: parentIds.map((r) => r.parent_id), links: pairs.length, on_record: byPhone.size - fresh.length },
  });
  return { created: parentIds.length, linked: pairs.length, onRecord: byPhone.size - fresh.length };
}

// In the caller's platform transaction (withTenantContext for the founder). The caller commits, then runs the jobs.
export async function provisionSchool(db: Sql, queue: JobQueue, actor: Actor, input: ProvisionInput, opts: { origin: string; existingSchoolId: string | null; today?: string }): Promise<ProvisionOutcome> {
  // Two founders provisioning the same name at once take turns, so the second finds the first's school.
  await db.query(`select pg_advisory_xact_lock(hashtext($1))`, [`provision:${input.schoolName.toLowerCase()}`]);
  if (!(await db.query(`select 1 from boards where board_id = $1`, [input.boardId])).rows[0]) return { ok: false, reason: 'board' };

  let schoolId: string;
  let schoolName = input.schoolName;
  let plan: ProvisionResult['plan'] = null;
  const newSchool = !opts.existingSchoolId;
  if (opts.existingSchoolId) {
    const { rows } = await db.query(`select school_id, name, board_id from schools where school_id = $1`, [opts.existingSchoolId]);
    if (!rows[0]) return { ok: false, reason: 'not_found' };
    schoolId = rows[0].school_id as string;
    schoolName = rows[0].name as string;
    // A board the school already records is not changed from here (Control → Boards changes it).
    if (!rows[0].board_id) await setSchoolBoard(db, actor, schoolId, input.boardId);
  } else {
    const same = await findSchoolByName(db, input.schoolName);
    if (same) return { ok: false, reason: 'school_exists', schoolId: same.schoolId, schoolName: same.name };
    const widest = await widestPlan(db);
    if (!widest) return { ok: false, reason: 'no_plan' };
    const stateName = INDIAN_STATES.find((s) => s.code === input.stateCode)?.name ?? '';
    const { rows } = await db.query(
      `insert into schools (name, address, board, tenant_type, jurisdiction) values ($1, $2, $3::board_type, 'school', $4) returning school_id`,
      [input.schoolName, `${input.city}, ${stateName}`, BOARD_TYPE[input.boardId] ?? 'OTHER', input.stateCode]
    );
    schoolId = rows[0].school_id as string;
    await writeAuditLog(db, { schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'school.create', targetType: 'schools', targetId: schoolId, afterState: { provisioned: true } });
    await setSchoolBoard(db, actor, schoolId, input.boardId);
    const applied = await applyPlan(db, schoolId, widest.planId, actor, 'school provisioned in Control');
    if (!applied.ok) return { ok: false, reason: 'no_plan' };
    plan = { planId: widest.planId, name: widest.name, modules: applied.modules.length };
  }

  const session = await ensureSession(db, schoolId, actor, input.session);
  const classes = await ensureClasses(db, schoolId, actor, provisionClassNames(input.grades, input.sections), session.sessionId);
  // The board the school records (for an existing school, possibly not the one on the screen).
  const recorded = (await db.query(`select board_id from schools where school_id = $1`, [schoolId])).rows[0]?.board_id as string | null;
  const syllabus = await mapSyllabus(db, schoolId, actor, recorded ?? input.boardId);

  const invitations: InvitationOutcome[] = [];
  const jobKeys: string[] = [];
  const people = [
    { name: input.principal.name, email: input.principal.email, role: 'principal' as const, className: null },
    ...input.teachers.map((t) => ({ name: t.name, email: t.email, role: 'teacher' as const, className: t.className })),
  ];
  for (const p of people) {
    try {
      const made = await createInvitation(db, queue, { schoolId, email: p.email, displayName: p.name, role: p.role, source: 'staff', invitedBy: actor, redirectTo: `${opts.origin}/login` });
      jobKeys.push(...made.jobKeys);
      invitations.push({ invitationId: made.invitationId, displayName: p.name, role: p.role, status: 'queued', className: p.className });
    } catch (err) {
      if (!(err instanceof InvitationExistsError)) throw err;
      invitations.push({ invitationId: null, displayName: p.name, role: p.role, status: 'already_invited', className: p.className });
    }
  }

  const students = { imported: 0, alreadyImported: false, onRecordGuardians: 0 };
  const guardians = { created: 0, linked: 0 };
  if (input.students) {
    const imported = await importStudentRecords(db, { schoolId, sub: actor.userId, role: actor.role }, input.students.records, input.students.hash, 'provisioning.csv', {
      rowErrors: input.students.rowErrors,
      withIds: true,
      // No account of this school exists yet to name (C399): the file is recorded with no importer.
      importedBy: null,
      ...(opts.today ? { today: opts.today } : {}),
    });
    if (imported.refused) throw new ProvisionRefused({ ok: false, reason: 'students', errors: imported.errors });
    students.imported = imported.importedCount;
    students.alreadyImported = imported.alreadyImported;
    if (imported.created) {
      const linked = await linkGuardians(db, schoolId, actor, input.students.records, imported.created);
      guardians.created = linked.created;
      guardians.linked = linked.linked;
      students.onRecordGuardians = linked.onRecord;
    }
  }

  const result: ProvisionResult = { schoolId, schoolName, newSchool, plan, session: { label: session.label, created: session.created }, classes, syllabus, invitations, students, guardians, jobKeys };
  await writeAuditLog(db, {
    schoolId,
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventAction: 'school.provisioned',
    targetType: 'schools',
    targetId: schoolId,
    afterState: {
      new_school: newSchool,
      plan: plan?.planId ?? null,
      classes_created: classes.created,
      syllabus_units: syllabus.units,
      invitations: invitations.filter((i) => i.status === 'queued').map((i) => i.invitationId),
      students: students.imported,
      guardians: guardians.created,
    },
  });
  return { ok: true, result };
}
