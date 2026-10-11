import type { PoolClient } from 'pg';
import { writeAuditLog } from '@/lib/audit/log';
import type { StaffRole } from '@/lib/auth/types';
import { FileStorageUnavailableError, sniffImageType, type FileStorage } from '@/lib/storage/file-storage';

// Homework (docs/20 5e, C150). The teacher writes it once and copies it to
// the sections it is for. Each copy is an assignment of its own: its own
// text, its own due date, checked separately. Changing the original changes
// only the copies the person names.
//
// Every function runs in the caller's own tenant transaction; RLS limits a
// teacher to their own classes.

export const MAX_TITLE = 120;
export const MAX_DETAILS = 2000;
export const MAX_SECTIONS = 12;
export const MAX_DUE_DAYS_AHEAD = 60;
export const HOMEWORK_FILE_MAX_BYTES = 4 * 1024 * 1024;
export const MAX_FILES = 3;
const SIGNED_LINK_SECONDS = 300;
const STAFF: readonly string[] = ['principal', 'school_admin', 'academic_coordinator', 'teacher'];

export type Actor = { schoolId: string; userId: string; role: StaffRole };
export type Assignment = {
  target_id: string;
  homework_id: string;
  class_id: string;
  class_name: string;
  subject_id: string;
  subject_name: string;
  title: string;
  details: string | null;
  due_date: string;
  students: number;
  checked: number;
  done: number;
  files: number;
  // The other sections the same homework was copied to.
  siblings: { target_id: string; class_name: string }[];
};

const dayNumber = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
const clean = (v: unknown) => (typeof v === 'string' ? v.trim().replace(/[ \t]+/g, ' ') : '');

export type HomeworkText = { title: string; details: string | null; dueDate: string };
export function parseHomeworkText(body: Record<string, unknown> | null, today: string): { ok: true; value: HomeworkText } | { ok: false; reason: 'title' | 'details' | 'due_date' } {
  const title = clean(body?.title).replace(/\s+/g, ' ');
  const details = clean(body?.details);
  const dueDate = typeof body?.dueDate === 'string' ? body.dueDate : '';
  if (!title || title.length > MAX_TITLE) return { ok: false, reason: 'title' };
  if (details.length > MAX_DETAILS) return { ok: false, reason: 'details' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || Number.isNaN(Date.parse(`${dueDate}T00:00:00Z`))) return { ok: false, reason: 'due_date' };
  const ahead = dayNumber(dueDate) - dayNumber(today);
  if (ahead < 0 || ahead > MAX_DUE_DAYS_AHEAD) return { ok: false, reason: 'due_date' };
  return { ok: true, value: { title, details: details || null, dueDate } };
}

async function ownClassIds(db: PoolClient): Promise<Set<string>> {
  return new Set(((await db.query(`select unnest(public.teacher_own_class_ids()) as class_id`)).rows as { class_id: string }[]).map((r) => r.class_id));
}

export type CreateResult = { ok: true; homeworkId: string; targetIds: string[] } | { ok: false; reason: 'not_allowed' | 'not_your_class' | 'unknown_class' | 'unknown_subject' | 'no_sections' };

// Sets one homework and copies it to each section named: one assignment per section.
export async function createHomework(db: PoolClient, actor: Actor, input: HomeworkText & { subjectId: string; classIds: readonly string[] }): Promise<CreateResult> {
  if (!STAFF.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  const classIds = [...new Set(input.classIds)].slice(0, MAX_SECTIONS);
  if (classIds.length === 0) return { ok: false, reason: 'no_sections' };
  if (!(await db.query(`select 1 from subjects where school_id = $1 and subject_id = $2`, [actor.schoolId, input.subjectId])).rows[0]) return { ok: false, reason: 'unknown_subject' };
  const known = new Set(((await db.query(`select class_id from classes where school_id = $1 and class_id = any($2::uuid[])`, [actor.schoolId, classIds])).rows as { class_id: string }[]).map((r) => r.class_id));
  if (classIds.some((c) => !known.has(c))) return { ok: false, reason: 'unknown_class' };
  // A teacher sets homework only for a class that is theirs. RLS holds the same rule.
  if (actor.role === 'teacher') {
    const own = await ownClassIds(db);
    if (classIds.some((c) => !own.has(c))) return { ok: false, reason: 'not_your_class' };
  }
  const made = await db.query(`insert into homework (school_id, subject_id, title, details, due_date, created_by) values ($1, $2, $3, $4, $5, $6) returning homework_id`, [actor.schoolId, input.subjectId, input.title, input.details, input.dueDate, actor.userId]);
  const homeworkId = made.rows[0].homework_id as string;
  const targets = await db.query(
    `insert into homework_targets (school_id, homework_id, class_id, title, details, due_date)
     select $1, $2, c, $4, $5, $6 from unnest($3::uuid[]) as c returning target_id`,
    [actor.schoolId, homeworkId, classIds, input.title, input.details, input.dueDate]
  );
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'homework.set', targetType: 'homework', targetId: homeworkId, beforeState: undefined, afterState: { subjectId: input.subjectId, dueDate: input.dueDate, sections: classIds.length } });
  return { ok: true, homeworkId, targetIds: targets.rows.map((r) => r.target_id as string) };
}

export type EditResult = { ok: true; changedTargets: string[]; leftAsSent: string[] } | { ok: false; reason: 'not_allowed' | 'not_found' | 'not_a_copy' };

// Changes the original. A copy already given to a section changes only if
// the person names it (`applyTo`); the others stay as they were sent.
export async function editHomework(db: PoolClient, actor: Actor, homeworkId: string, input: HomeworkText & { applyTo: readonly string[] }): Promise<EditResult> {
  if (!STAFF.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  const before = (await db.query(`select title, details, due_date::text as due_date from homework where school_id = $1 and homework_id = $2 for update`, [actor.schoolId, homeworkId])).rows[0];
  if (!before) return { ok: false, reason: 'not_found' };
  const copies = ((await db.query(`select target_id from homework_targets where school_id = $1 and homework_id = $2`, [actor.schoolId, homeworkId])).rows as { target_id: string }[]).map((r) => r.target_id);
  const applyTo = [...new Set(input.applyTo)];
  if (applyTo.some((t) => !copies.includes(t))) return { ok: false, reason: 'not_a_copy' };
  await db.query(`update homework set title = $3, details = $4, due_date = $5, updated_at = now() where school_id = $1 and homework_id = $2`, [actor.schoolId, homeworkId, input.title, input.details, input.dueDate]);
  if (applyTo.length) await db.query(`update homework_targets set title = $3, details = $4, due_date = $5, updated_at = now() where school_id = $1 and target_id = any($2::uuid[])`, [actor.schoolId, applyTo, input.title, input.details, input.dueDate]);
  const leftAsSent = copies.filter((c) => !applyTo.includes(c));
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'homework.edit', targetType: 'homework', targetId: homeworkId, beforeState: before, afterState: { title: input.title, details: input.details, due_date: input.dueDate, changedCopies: applyTo.length, leftAsSent: leftAsSent.length } });
  return { ok: true, changedTargets: applyTo, leftAsSent };
}

const ASSIGNMENTS = `select t.target_id, t.homework_id, t.class_id, c.name as class_name, h.subject_id, s.name as subject_name, t.title, t.details, t.due_date::text as due_date,
         (select count(*)::int from students st where st.school_id = t.school_id and st.class_id = t.class_id and st.status in ('active', 'pending_consent')) as students,
         (select count(*)::int from homework_status hs join students st on st.school_id = hs.school_id and st.student_id = hs.student_id and st.class_id = t.class_id and st.status in ('active', 'pending_consent') where hs.target_id = t.target_id) as checked,
         (select count(*)::int from homework_status hs join students st on st.school_id = hs.school_id and st.student_id = hs.student_id and st.class_id = t.class_id and st.status in ('active', 'pending_consent') where hs.target_id = t.target_id and hs.done) as done,
         (select count(*)::int from homework_attachments a where a.school_id = t.school_id and a.homework_id = t.homework_id) as files,
         coalesce((select jsonb_agg(jsonb_build_object('target_id', o.target_id, 'class_name', oc.name) order by oc.name)
                     from homework_targets o join classes oc on oc.school_id = o.school_id and oc.class_id = o.class_id
                    where o.school_id = t.school_id and o.homework_id = t.homework_id and o.target_id <> t.target_id), '[]'::jsonb) as siblings
    from homework_targets t
    join homework h on h.school_id = t.school_id and h.homework_id = t.homework_id
    join classes c on c.school_id = t.school_id and c.class_id = t.class_id
    join subjects s on s.school_id = h.school_id and s.subject_id = h.subject_id`;

// The assignments due from two weeks back onward, the nearest due date first.
export async function listAssignments(db: PoolClient, schoolId: string, today: string): Promise<Assignment[]> {
  return (await db.query(`${ASSIGNMENTS} where t.school_id = $1 and t.due_date >= $2::date - 14 order by t.due_date, c.name, t.assigned_at`, [schoolId, today])).rows;
}

export type CheckRow = { student_id: string; name: string; roll_no: string | null; done: boolean | null };
export async function assignmentRoster(db: PoolClient, schoolId: string, targetId: string): Promise<{ assignment: Assignment; roster: CheckRow[]; files: { attachment_id: string; file_name: string; mime_type: string }[] } | null> {
  const assignment = (await db.query(`${ASSIGNMENTS} where t.school_id = $1 and t.target_id = $2`, [schoolId, targetId])).rows[0] as Assignment | undefined;
  if (!assignment) return null;
  const roster = (await db.query(
    `select st.student_id, st.name, st.roll_no, hs.done
       from students st left join homework_status hs on hs.target_id = $2 and hs.student_id = st.student_id
      where st.school_id = $1 and st.class_id = $3 and st.status in ('active', 'pending_consent') order by st.name`,
    [schoolId, targetId, assignment.class_id]
  )).rows;
  const files = (await db.query(`select attachment_id, file_name, mime_type from homework_attachments where school_id = $1 and homework_id = $2 order by created_at`, [schoolId, assignment.homework_id])).rows;
  return { assignment, roster, files };
}

export type CompletionResult = { ok: true; saved: number; notInClass: string[] } | { ok: false; reason: 'not_allowed' | 'not_found' };

// Done or not done, per student of one assignment. Sent twice, it is the
// same answer; sent from two phones, the later one stands. Each submission
// is in the audit log.
export async function setCompletion(db: PoolClient, actor: Actor, targetId: string, entries: readonly { studentId: string; done: boolean }[]): Promise<CompletionResult> {
  if (!STAFF.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  const target = (await db.query(`select class_id from homework_targets where school_id = $1 and target_id = $2`, [actor.schoolId, targetId])).rows[0];
  if (!target) return { ok: false, reason: 'not_found' };
  const members = new Set(((await db.query(`select student_id from students where school_id = $1 and class_id = $2 and status in ('active', 'pending_consent') and student_id = any($3::uuid[])`, [actor.schoolId, target.class_id, entries.map((e) => e.studentId)])).rows as { student_id: string }[]).map((r) => r.student_id));
  const mine = [...new Map(entries.filter((e) => members.has(e.studentId)).map((e) => [e.studentId, e])).values()];
  if (mine.length) {
    await db.query(
      `insert into homework_status (school_id, target_id, class_id, student_id, done, checked_by)
       select $1, $2, $3, n.student_id, n.done, $4 from unnest($5::uuid[], $6::boolean[]) as n(student_id, done)
       on conflict (target_id, student_id) do update set done = excluded.done, checked_by = excluded.checked_by, checked_at = now()`,
      [actor.schoolId, targetId, target.class_id, actor.userId, mine.map((e) => e.studentId), mine.map((e) => e.done)]
    );
    await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'homework.checked', targetType: 'homework_targets', targetId, beforeState: undefined, afterState: { students: mine.length, done: mine.filter((e) => e.done).length } });
  }
  return { ok: true, saved: mine.length, notInClass: entries.filter((e) => !members.has(e.studentId)).map((e) => e.studentId) };
}

// ---- Files --------------------------------------------------------------

// What a file really is, from its first bytes: a photo, or a PDF.
export function sniffHomeworkFile(bytes: Uint8Array): 'image/png' | 'image/jpeg' | 'image/webp' | 'application/pdf' | null {
  const image = sniffImageType(bytes);
  if (image) return image;
  return bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d ? 'application/pdf' : null;
}

const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'application/pdf': 'pdf' } as const;
export type FileResult = { ok: true; attachmentId: string } | { ok: false; reason: 'not_allowed' | 'not_found' | 'not_a_photo_or_pdf' | 'too_large' | 'too_many' | 'storage_unavailable' };

export async function addHomeworkFile(db: PoolClient, storage: FileStorage, actor: Actor, homeworkId: string, file: { name: string; bytes: Uint8Array }, newId: () => string = () => crypto.randomUUID()): Promise<FileResult> {
  if (!STAFF.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  if (!(await db.query(`select 1 from homework where school_id = $1 and homework_id = $2`, [actor.schoolId, homeworkId])).rows[0]) return { ok: false, reason: 'not_found' };
  if (file.bytes.length === 0 || file.bytes.length > HOMEWORK_FILE_MAX_BYTES) return { ok: false, reason: 'too_large' };
  const mime = sniffHomeworkFile(file.bytes);
  if (!mime) return { ok: false, reason: 'not_a_photo_or_pdf' };
  const count = (await db.query(`select count(*)::int as n from homework_attachments where school_id = $1 and homework_id = $2`, [actor.schoolId, homeworkId])).rows[0].n as number;
  if (count >= MAX_FILES) return { ok: false, reason: 'too_many' };
  // The key starts with the school of the verified session; the name the browser sent is kept only as a label.
  const key = `${actor.schoolId}/homework/${homeworkId}/${newId()}.${EXT[mime]}`;
  try {
    await storage.put(key, file.bytes, mime);
  } catch (err) {
    if (err instanceof FileStorageUnavailableError) return { ok: false, reason: 'storage_unavailable' };
    throw err;
  }
  try {
    const label = file.name.replace(/[^\p{L}\p{N} ._-]/gu, '').trim().slice(0, 120) || `homework.${EXT[mime]}`;
    const made = await db.query(`insert into homework_attachments (school_id, homework_id, storage_key, file_name, mime_type, size_bytes, uploaded_by) values ($1, $2, $3, $4, $5, $6, $7) returning attachment_id`, [actor.schoolId, homeworkId, key, label, mime, file.bytes.length, actor.userId]);
    await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'homework.file_added', targetType: 'homework', targetId: homeworkId, beforeState: undefined, afterState: { attachmentId: made.rows[0].attachment_id, mime, sizeBytes: file.bytes.length } });
    return { ok: true, attachmentId: made.rows[0].attachment_id };
  } catch (err) {
    await storage.remove(key).catch(() => undefined);
    throw err;
  }
}

// A short-lived link, only after the row was read under row level security.
export async function homeworkFileUrl(db: PoolClient, storage: FileStorage, schoolId: string, homeworkId: string, attachmentId: string): Promise<string | null> {
  const row = (await db.query(`select storage_key from homework_attachments where school_id = $1 and homework_id = $2 and attachment_id = $3`, [schoolId, homeworkId, attachmentId])).rows[0];
  return row ? storage.signedUrl(row.storage_key, SIGNED_LINK_SECONDS) : null;
}
