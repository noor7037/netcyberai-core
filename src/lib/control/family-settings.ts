import { writeAuditLog } from '@/lib/audit/log';
import type { Sql } from '@/lib/jobs/types';
import { VOICE_CHARS_SETTING, voiceCharLimit } from '@/lib/ai/daily-cap';
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

// Family Plus for a pilot (C337): Plus has no checkout before P3 and no school sponsors it yet, so its modules (the home
// plan after a parent-teacher meeting) are used only when Control opens Plus to every family. Off until set; audited.
export const PLUS_OPEN_KEY = 'family.plus_open';

export async function readPlusOpen(db: Sql): Promise<boolean> {
  return (await db.query(`select value from control.settings where key = $1`, [PLUS_OPEN_KEY])).rows[0]?.value === true;
}

export async function setPlusOpen(db: Sql, by: { userId: string }, raw: unknown): Promise<{ ok: true; open: boolean } | { ok: false; code: 'bad_value' }> {
  if (typeof raw !== 'boolean') return { ok: false, code: 'bad_value' };
  const before = await readPlusOpen(db);
  await db.query(
    `insert into control.settings (key, value, updated_by) values ($1, $2::jsonb, $3) on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`,
    [PLUS_OPEN_KEY, JSON.stringify(raw), by.userId]
  );
  await writeAuditLog(db, {
    schoolId: null,
    actorUserId: by.userId,
    actorRole: 'super_admin',
    eventAction: 'family.plus_open_set',
    targetType: 'control_setting',
    targetId: PLUS_OPEN_KEY,
    beforeState: { open: before },
    afterState: { open: raw },
  });
  return { ok: true, open: raw };
}

// The daily voice allowance per family, in characters (C230-AS, C388): what the server voice may speak for one family in
// one India day; spoken lines meter against it, not the AI requests. A whole number from 0 (the server voice off for
// families) to VOICE_CHARS_MAX; audited.
export const VOICE_CHARS_MAX = 1_000_000;

export async function readVoiceAllowance(db: Sql): Promise<number | null> {
  return voiceCharLimit(db);
}

export async function setVoiceAllowance(db: Sql, by: { userId: string }, raw: unknown): Promise<{ ok: true; chars: number } | { ok: false; code: 'bad_value' }> {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0 || raw > VOICE_CHARS_MAX) return { ok: false, code: 'bad_value' };
  const before = await readVoiceAllowance(db);
  await db.query(
    `insert into control.settings (key, value, updated_by) values ($1, $2::jsonb, $3) on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`,
    [VOICE_CHARS_SETTING, JSON.stringify(raw), by.userId]
  );
  await writeAuditLog(db, {
    schoolId: null,
    actorUserId: by.userId,
    actorRole: 'super_admin',
    eventAction: 'family.voice_allowance_set',
    targetType: 'control_setting',
    targetId: VOICE_CHARS_SETTING,
    beforeState: { chars: before },
    afterState: { chars: raw },
  });
  return { ok: true, chars: raw };
}

// W16-A3 begin
// The platform's tutors, for Control → Family's read-only list (the Tutor Hall): the library's rows, as the platform role.
// No editing yet.
export type ControlTutor = { key: string; subject: Subject | null; nameEn: string; nameHi: string; styleEn: string; styleHi: string; language: 'en' | 'hi' | 'both'; enabled: boolean };
export async function readPlatformTutors(db: Sql): Promise<ControlTutor[]> {
  const { rows } = await db.query(`select key, subject, name_en, name_hi, style_en, style_hi, language, enabled from content.tutors order by sort, key`);
  return (rows as { key: string; subject: string | null; name_en: string; name_hi: string; style_en: string; style_hi: string; language: 'en' | 'hi' | 'both'; enabled: boolean }[]).map((r) => ({
    key: r.key,
    subject: (SUBJECT_IDS as readonly string[]).includes(r.subject ?? '') ? (r.subject as Subject) : null,
    nameEn: r.name_en,
    nameHi: r.name_hi,
    styleEn: r.style_en,
    styleHi: r.style_hi,
    language: r.language,
    enabled: r.enabled,
  }));
}
// w16-a3 end
