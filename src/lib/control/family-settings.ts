import { writeAuditLog } from '@/lib/audit/log';
import type { Sql } from '@/lib/jobs/types';
import { VOICE_CHARS_SETTING, voiceCharLimit } from '@/lib/ai/daily-cap';
import { CAP_MAX, MULTIPLIER_MAX, PHOTO_DOUBTS_SETTING, PLUS_MULTIPLIER_SETTING, TEXT_TURNS_SETTING, VOICE_MINUTES_SETTING, plusMultiplier, tutorBaseCaps, type TutorCaps } from '@/lib/family/tutor-meter';
import { SUBJECT_IDS, SUBJECT_LIST_KEYS, subjectListOf, type Subject, type SubjectList } from '@/lib/contracts/subjects';
import { tintFor } from '@/lib/ai-tutors/index';

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

// w16-b4 start
// The tutor's daily caps per child (Control → Family, W16-B4): text turns, voice minutes and photo doubts, and the
// multiplier a family on Plus gets. What the screen shows is what applies (src/lib/family/tutor-meter.ts: the new setting,
// else the older one, else the built-in number). A change needs a reason and is audited with the numbers before and after.
export type TutorCapsView = TutorCaps & { plusMultiplier: number };
export type TutorCapsInput = { textTurns: unknown; voiceMinutes: unknown; photoDoubts: unknown; plusMultiplier: unknown; reason: unknown };
export const TUTOR_CAPS_REASON_MAX = 200;

export async function readTutorCaps(db: Sql): Promise<TutorCapsView> {
  return { ...(await tutorBaseCaps(db)), plusMultiplier: await plusMultiplier(db) };
}

const capOk = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= CAP_MAX;

export async function setTutorCaps(db: Sql, by: { userId: string }, raw: TutorCapsInput): Promise<{ ok: true; caps: TutorCapsView } | { ok: false; code: 'bad_value' | 'reason_required' }> {
  const reason = typeof raw.reason === 'string' ? raw.reason.trim() : '';
  if (reason.length < 3 || reason.length > TUTOR_CAPS_REASON_MAX) return { ok: false, code: 'reason_required' };
  const m = raw.plusMultiplier;
  if (!capOk(raw.textTurns) || !capOk(raw.voiceMinutes) || !capOk(raw.photoDoubts) || typeof m !== 'number' || !Number.isFinite(m) || m < 1 || m > MULTIPLIER_MAX) return { ok: false, code: 'bad_value' };
  const before = await readTutorCaps(db);
  const next: TutorCapsView = { textTurns: raw.textTurns, voiceMinutes: raw.voiceMinutes, photoDoubts: raw.photoDoubts, plusMultiplier: m };
  const rows: [string, number][] = [
    [TEXT_TURNS_SETTING, next.textTurns],
    [VOICE_MINUTES_SETTING, next.voiceMinutes],
    [PHOTO_DOUBTS_SETTING, next.photoDoubts],
    [PLUS_MULTIPLIER_SETTING, next.plusMultiplier],
  ];
  for (const [key, value] of rows) {
    await db.query(
      `insert into control.settings (key, value, updated_by) values ($1, $2::jsonb, $3) on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`,
      [key, JSON.stringify(value), by.userId]
    );
  }
  await writeAuditLog(db, {
    schoolId: null,
    actorUserId: by.userId,
    actorRole: 'super_admin',
    eventAction: 'family.tutor_caps_set',
    targetType: 'control_setting',
    targetId: TEXT_TURNS_SETTING,
    beforeState: before,
    afterState: { ...next, reason },
  });
  return { ok: true, caps: next };
}
// w16-b4 end

// ---- the platform's tutors (2 Nov 2026: Control could read them but not add or change one) ---------------------------
// The founder adds a tutor every family sees in the Tutor Hall, changes its words or switches it off, with a reason; each
// change is one audit row with the tutor's name, subject, language and switch before and after (never its style, the
// typed line, which stays on the row). The key is made from the English name once and never changes.

export type PlatformTutorInput = { key?: unknown; subject?: unknown; nameEn?: unknown; nameHi?: unknown; styleEn?: unknown; styleHi?: unknown; language?: unknown; enabled?: unknown; reason?: unknown };
export type PlatformTutorResult = { ok: true; tutor: ControlTutor } | { ok: false; code: 'bad_value' | 'reason_required' | 'not_found' };
const TUTOR_REASON_MAX = 200;
// eslint-disable-next-line no-control-regex
const line = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.replace(/<[^>]*>/g, ' ').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim();
  return s.length >= 1 && s.length <= max ? s : null;
};
const keyFrom = (nameEn: string): string => {
  const base = nameEn.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 36);
  return /^[a-z]/.test(base) && base.length >= 2 ? base : `tutor_${base}`.slice(0, 36);
};

export async function savePlatformTutor(db: Sql, by: { userId: string }, raw: PlatformTutorInput): Promise<PlatformTutorResult> {
  const reason = typeof raw.reason === 'string' ? raw.reason.trim() : '';
  if (reason.length < 3 || reason.length > TUTOR_REASON_MAX) return { ok: false, code: 'reason_required' };
  const nameEn = line(raw.nameEn, 40);
  const nameHi = line(raw.nameHi, 40);
  const styleEn = line(raw.styleEn, 140);
  const styleHi = line(raw.styleHi, 140);
  const subject = raw.subject === null || raw.subject === '' || raw.subject === undefined ? null : (SUBJECT_IDS as readonly string[]).includes(String(raw.subject)) ? (raw.subject as Subject) : undefined;
  const language = raw.language === undefined ? 'both' : raw.language === 'en' || raw.language === 'hi' || raw.language === 'both' ? raw.language : undefined;
  const enabled = raw.enabled === undefined ? true : typeof raw.enabled === 'boolean' ? raw.enabled : undefined;
  if (!nameEn || !nameHi || !styleEn || !styleHi || subject === undefined || language === undefined || enabled === undefined) return { ok: false, code: 'bad_value' };
  const key = raw.key === undefined || raw.key === null ? null : typeof raw.key === 'string' && /^[a-z][a-z0-9_]{1,39}$/.test(raw.key) ? raw.key : undefined;
  if (key === undefined) return { ok: false, code: 'bad_value' };

  let was: { key: string; subject: string | null; language: string; enabled: boolean; name_en: string; name_hi: string } | null = null;
  let saved: string;
  if (key) {
    const row = (await db.query(`select key, subject, language, enabled, name_en, name_hi from content.tutors where key = $1 for update`, [key])).rows[0] as typeof was;
    if (!row) return { ok: false, code: 'not_found' };
    was = row;
    await db.query(
      `update content.tutors set subject = $2, name_en = $3, name_hi = $4, style_en = $5, style_hi = $6, language = $7, tint = $8, enabled = $9, updated_at = now() where key = $1`,
      [key, subject, nameEn, nameHi, styleEn, styleHi, language, tintFor(subject), enabled]
    );
    saved = key;
  } else {
    // A key of its own: the English name, then _2, _3 … while that one is taken.
    const base = keyFrom(nameEn);
    const taken = new Set((await db.query(`select key from content.tutors where key = $1 or key like $2`, [base, `${base}\\_%`])).rows.map((r) => String((r as { key: string }).key)));
    saved = base;
    for (let n = 2; taken.has(saved); n += 1) saved = `${base}_${n}`;
    await db.query(
      `insert into content.tutors (key, subject, name_en, name_hi, style_en, style_hi, language, tint, avatar_key, enabled, sort)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $1, $9, 100 + (select count(*) from content.tutors))`,
      [saved, subject, nameEn, nameHi, styleEn, styleHi, language, tintFor(subject), enabled]
    );
  }
  const after = { key: saved, subject, language, enabled, name_en: nameEn, name_hi: nameHi };
  await writeAuditLog(db, {
    schoolId: null,
    actorUserId: by.userId,
    actorRole: 'super_admin',
    eventAction: was ? 'family.tutor_changed' : 'family.tutor_added',
    targetType: 'content_tutor',
    targetId: saved,
    beforeState: was ? { key: was.key, subject: was.subject, language: was.language, enabled: was.enabled, name_en: was.name_en, name_hi: was.name_hi } : undefined,
    afterState: { ...after, reason },
  });
  return { ok: true, tutor: { key: saved, subject, nameEn, nameHi, styleEn, styleHi, language, enabled } };
}
