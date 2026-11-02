import type { PoolClient } from 'pg';
import { writeAuditLog } from '@/lib/audit/log';
import { SUBJECT_IDS, isSubject } from '@/lib/contracts/subjects';

// AI Tutors, the school's side (W16-A3): the platform's tutors with this school's switch on each, and the school's own
// tutors. The office (principal, school admin) reads and changes them; the database decides again (school_tutors, forced
// row level security). A family reads them only through public.school_tutors_for_guardian(). Every change is audited.

type Sql = Pick<PoolClient, 'query'>;
export const AI_TUTOR_ROLES: readonly string[] = ['principal', 'school_admin'];
export const TUTOR_NAME_MAX = 40;
export const TUTOR_STYLE_MAX = 140;
export type TutorLanguage = 'en' | 'hi' | 'both';
export const TUTOR_LANGUAGES: readonly TutorLanguage[] = ['en', 'hi', 'both'];
const TINTS = ['mint', 'butter', 'lilac', 'blush', 'sky'] as const;

export type PlatformTutorRow = { key: string; subject: string | null; nameEn: string; nameHi: string; styleEn: string; styleHi: string; language: TutorLanguage; tint: string; enabled: boolean };
export type OwnTutorRow = { tutorId: string; name: string; subject: string | null; style: string; language: TutorLanguage; enabled: boolean };
export type TutorsView = { platform: PlatformTutorRow[]; own: OwnTutorRow[] };

// One line, no markup or control characters (the database refuses them too).
// eslint-disable-next-line no-control-regex
// A tag is removed whole ("<b>x</b>" is "x", not "b x /b"; 2 Nov), then any stray bracket and control character.
// eslint-disable-next-line no-control-regex
const oneLine = (v: unknown): string => (typeof v === 'string' ? v.replace(/<[^>]*>/g, ' ').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim() : '');

export type TutorInput = { name: string; subject: string | null; style: string; language: TutorLanguage };
export type TutorFault = 'name' | 'style' | 'subject' | 'language';

// What the office typed, as the row it becomes; or the field that is wrong.
export function parseTutor(body: Record<string, unknown>): { ok: true; value: TutorInput } | { ok: false; field: TutorFault } {
  const name = oneLine(body.name);
  if (name.length < 1 || name.length > TUTOR_NAME_MAX) return { ok: false, field: 'name' };
  const style = oneLine(body.style);
  if (style.length < 1 || style.length > TUTOR_STYLE_MAX) return { ok: false, field: 'style' };
  const subject = body.subject === null || body.subject === undefined || body.subject === '' ? null : body.subject;
  if (subject !== null && !isSubject(subject)) return { ok: false, field: 'subject' };
  if (!TUTOR_LANGUAGES.includes(body.language as TutorLanguage)) return { ok: false, field: 'language' };
  return { ok: true, value: { name, subject: subject as string | null, style, language: body.language as TutorLanguage } };
}

// A school's tutor wears a tint by its subject (the same subject always the same tint); an all-subject tutor, lilac.
export const tintFor = (subject: string | null): (typeof TINTS)[number] => (subject === null ? 'lilac' : TINTS[Math.max(0, SUBJECT_IDS.indexOf(subject as never)) % TINTS.length]);

export async function readTutors(db: Sql): Promise<TutorsView> {
  const platform = (
    await db.query(`select tutor_key, subject, name_en, name_hi, style_en, style_hi, language, tint, school_enabled from public.platform_tutors_for_school()`)
  ).rows as { tutor_key: string; subject: string | null; name_en: string; name_hi: string; style_en: string; style_hi: string; language: TutorLanguage; tint: string; school_enabled: boolean }[];
  const own = (
    await db.query(`select tutor_id, name, subject, style, language, enabled from school_tutors where platform_key is null order by created_at, tutor_id`)
  ).rows as { tutor_id: string; name: string; subject: string | null; style: string; language: TutorLanguage; enabled: boolean }[];
  return {
    platform: platform.map((r) => ({ key: r.tutor_key, subject: r.subject, nameEn: r.name_en, nameHi: r.name_hi, styleEn: r.style_en, styleHi: r.style_hi, language: r.language, tint: r.tint, enabled: r.school_enabled })),
    own: own.map((r) => ({ tutorId: r.tutor_id, name: r.name, subject: r.subject, style: r.style, language: r.language, enabled: r.enabled })),
  };
}

type Who = { schoolId: string; userId: string; role: string };
const audit = (db: Sql, who: Who, eventAction: string, targetId: string, afterState: Record<string, unknown>, beforeState?: Record<string, unknown>) =>
  writeAuditLog(db, { schoolId: who.schoolId, actorUserId: who.userId, actorRole: who.role as never, eventAction, targetType: 'school_tutors', targetId, afterState, beforeState });

export async function addTutor(db: Sql, who: Who, input: TutorInput): Promise<OwnTutorRow> {
  const { rows } = await db.query(
    `insert into school_tutors (school_id, name, subject, style, language, tint, created_by) values ($1, $2, $3, $4, $5, $6, $7) returning tutor_id`,
    [who.schoolId, input.name, input.subject, input.style, input.language, tintFor(input.subject), who.userId]
  );
  const tutorId = String(rows[0].tutor_id);
  await audit(db, who, 'ai_tutors.added', tutorId, { name: input.name, subject: input.subject, language: input.language });
  return { tutorId, ...input, enabled: true };
}

// Change one of the school's own tutors (its words) and/or switch it. null: it is not this school's own tutor.
export async function changeTutor(db: Sql, who: Who, tutorId: string, input: TutorInput | null, enabled: boolean | null): Promise<OwnTutorRow | null> {
  const before = (await db.query(`select name, subject, style, language, enabled from school_tutors where tutor_id = $1 and platform_key is null for update`, [tutorId])).rows[0] as
    | { name: string; subject: string | null; style: string; language: TutorLanguage; enabled: boolean }
    | undefined;
  if (!before) return null;
  const next = { ...before, ...(input ?? {}), enabled: enabled ?? before.enabled };
  await db.query(`update school_tutors set name = $2, subject = $3, style = $4, language = $5, tint = $6, enabled = $7 where tutor_id = $1`, [tutorId, next.name, next.subject, next.style, next.language, tintFor(next.subject), next.enabled]);
  // The audit row holds the tutor's display name, its subject and language codes and the switch, before and after; the
  // style (the school's typed words) stays on the tutor's own row, which a deletion can reach (test/audit/audit-pii).
  await audit(
    db, who, enabled !== null && input === null ? 'ai_tutors.switched' : 'ai_tutors.changed', tutorId,
    { name: next.name, subject: next.subject, language: next.language, enabled: next.enabled },
    { name: before.name, subject: before.subject, language: before.language, enabled: before.enabled }
  );
  return { tutorId, ...next };
}

// Switch a platform tutor on or off for this school. false: no such platform tutor.
export async function switchPlatformTutor(db: Sql, who: Who, key: string, enabled: boolean): Promise<boolean> {
  const known = (await db.query(`select 1 from public.platform_tutors_for_school() where tutor_key = $1`, [key])).rows[0];
  if (!known) return false;
  await db.query(
    `insert into school_tutors (school_id, platform_key, enabled, created_by) values ($1, $2, $3, $4)
     on conflict (school_id, platform_key) do update set enabled = excluded.enabled`,
    [who.schoolId, key, enabled, who.userId]
  );
  await audit(db, who, 'ai_tutors.platform_switched', key, { platform_key: key, enabled });
  return true;
}
