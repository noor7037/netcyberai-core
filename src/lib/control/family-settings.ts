import { writeAuditLog } from '@/lib/audit/log';
import type { Sql } from '@/lib/jobs/types';
import { SUBJECT_IDS, type Subject } from '@/lib/contracts/subjects';

// Control → Family's one setting (C298): subjects open to every child, whatever their free subject is (the first
// pilot opens EVS to its 50 Class 5 children, C230-S). The founder with the authenticator sets it; every change writes
// an audit row with the list before and after. Only known subject ids are kept.

export const OPEN_SUBJECTS_KEY = 'family.open_subjects';

export async function readOpenSubjects(db: Sql): Promise<Subject[]> {
  const v = (await db.query(`select value from control.settings where key = $1`, [OPEN_SUBJECTS_KEY])).rows[0]?.value;
  return Array.isArray(v) ? v.filter((s): s is Subject => (SUBJECT_IDS as readonly unknown[]).includes(s)) : [];
}

export type OpenSubjectsResult = { ok: true; subjects: Subject[] } | { ok: false; code: 'bad_subjects' };

export async function setOpenSubjects(db: Sql, by: { userId: string }, raw: unknown): Promise<OpenSubjectsResult> {
  if (!Array.isArray(raw) || raw.length > SUBJECT_IDS.length || !raw.every((s) => (SUBJECT_IDS as readonly unknown[]).includes(s))) return { ok: false, code: 'bad_subjects' };
  const subjects = SUBJECT_IDS.filter((s) => raw.includes(s));
  const before = await readOpenSubjects(db);
  await db.query(
    `insert into control.settings (key, value, updated_by) values ($1, $2::jsonb, $3) on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`,
    [OPEN_SUBJECTS_KEY, JSON.stringify(subjects), by.userId]
  );
  await writeAuditLog(db, {
    schoolId: null,
    actorUserId: by.userId,
    actorRole: 'super_admin',
    eventAction: 'family.open_subjects_set',
    targetType: 'control_setting',
    targetId: OPEN_SUBJECTS_KEY,
    beforeState: { subjects: before },
    afterState: { subjects },
  });
  return { ok: true, subjects };
}
