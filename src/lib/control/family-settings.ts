import { writeAuditLog } from '@/lib/audit/log';
import type { Sql } from '@/lib/jobs/types';
import { SUBJECT_IDS, SUBJECT_LIST_KEYS, subjectListOf, type Subject, type SubjectList } from '@/lib/contracts/subjects';

// Control → Family's settings: two lists of subjects. `open` (C298): open to every child, whatever their free subject
// is. `reviewed_only` (C300): a chapter or topic shows only an explanation NetCyberAI has checked. The first pilot sets
// both to EVS for its 50 Class 5 children (C230-S). The founder with the authenticator sets them; every change writes
// an audit row with the list before and after. Only known subject ids are kept.

const AUDIT_ACTION: Record<SubjectList, string> = { open: 'family.open_subjects_set', reviewed_only: 'family.reviewed_only_set' };

export async function readSubjectList(db: Sql, list: SubjectList): Promise<Subject[]> {
  return subjectListOf((await db.query(`select value from control.settings where key = $1`, [SUBJECT_LIST_KEYS[list]])).rows[0]?.value);
}

export type SubjectListResult = { ok: true; subjects: Subject[] } | { ok: false; code: 'bad_subjects' };

export async function setSubjectList(db: Sql, by: { userId: string }, list: SubjectList, raw: unknown): Promise<SubjectListResult> {
  if (!Array.isArray(raw) || raw.length > SUBJECT_IDS.length || !raw.every((s) => (SUBJECT_IDS as readonly unknown[]).includes(s))) return { ok: false, code: 'bad_subjects' };
  const subjects = SUBJECT_IDS.filter((s) => raw.includes(s));
  const before = await readSubjectList(db, list);
  await db.query(
    `insert into control.settings (key, value, updated_by) values ($1, $2::jsonb, $3) on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`,
    [SUBJECT_LIST_KEYS[list], JSON.stringify(subjects), by.userId]
  );
  await writeAuditLog(db, {
    schoolId: null,
    actorUserId: by.userId,
    actorRole: 'super_admin',
    eventAction: AUDIT_ACTION[list],
    targetType: 'control_setting',
    targetId: SUBJECT_LIST_KEYS[list],
    beforeState: { subjects: before },
    afterState: { subjects },
  });
  return { ok: true, subjects };
}
