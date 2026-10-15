import { checkTeacher, cleanRegisterSettings, type ExpiryWindow, has, type RegisterSettings, type RuleId, type StageId, STAGES, type Teacher, type TetPaper, type TetType, WINDOWS } from '@/lib/free-tools/teacher-register';
import { isoDate, readDate } from '@/lib/free-tools/student-data-check';
import { hasAadhaarNumber } from '@/lib/privacy/aadhaar';

// The compliance desk's teacher register (docs/28 row 10d, C227): the pure rules the screen and the server both need,
// and nothing that reads a database. The register's rules are the website's Teacher qualification and TET register's
// own (src/lib/free-tools/teacher-register.ts), imported, never copied (docs/28 section 3 rule 2): the stages, the
// TET types and papers, which requirement each stage has (the school's setting, the tool's defaults: TET for classes
// I to VIII), the expiry windows, and checkTeacher, which says what is missing and what ends soon. A blank valid-until
// date is no end date: the tool never works an expiry out of a certificate's date (the NCTE made TET certificates
// valid for life in 2021), and neither does the desk.
//
// The tool says what is missing in English sentences. The desk shows them in the person's language: each sentence the
// tool can write is read back to a code here (GAP_CODES), and test/compliance/register.test.ts holds every sentence
// the tool writes to a code.

export { STAGES, WINDOWS };
export type { RegisterSettings, StageId, TetPaper, TetType };

// Who has a row in the register: the school's teaching staff (an accountant does not teach). Who keeps it: the office.
export const REGISTER_ROLES: readonly string[] = ['principal', 'school_admin', 'teacher', 'academic_coordinator'];
export const DESK_ROLES: readonly string[] = ['principal', 'school_admin'];

export const TET_TYPES: readonly Exclude<TetType, ''>[] = ['CTET', 'State TET'];
export const TET_PAPERS: readonly Exclude<TetPaper, ''>[] = ['I', 'II', 'both'];
export const RULE_IDS: readonly RuleId[] = ['degree', 'professional', 'tet', 'pg'];

// The longest each typed field may be: the tool's own lengths (cleanTeacher), held equal by the tests.
export const FIELD_MAX = { subjects: 80, degree: 60, postgraduate_degree: 60, professional_qualification: 60, other_approval: 80 } as const;
export type TextField = keyof typeof FIELD_MAX;
export const TEXT_FIELDS = Object.keys(FIELD_MAX) as TextField[];

// A staff member's row, as the database keeps it.
export type Qualification = {
  stage: StageId | null;
  subjects: string | null;
  degree: string | null;
  postgraduate_degree: string | null;
  professional_qualification: string | null;
  tet_type: Exclude<TetType, ''> | null;
  tet_paper: Exclude<TetPaper, ''> | null;
  tet_certificate_date: string | null;
  tet_valid_until: string | null;
  other_approval: string | null;
  other_valid_until: string | null;
};
export const QUALIFICATION_FIELDS: readonly (keyof Qualification)[] = ['stage', 'subjects', 'degree', 'postgraduate_degree', 'professional_qualification', 'tet_type', 'tet_paper', 'tet_certificate_date', 'tet_valid_until', 'other_approval', 'other_valid_until'];
export const emptyQualification = (): Qualification => ({ stage: null, subjects: null, degree: null, postgraduate_degree: null, professional_qualification: null, tet_type: null, tet_paper: null, tet_certificate_date: null, tet_valid_until: null, other_approval: null, other_valid_until: null });

// The row as the tool's Teacher, so the tool's own checkTeacher reads it.
export function toTeacher(name: string, q: Qualification | null): Teacher {
  const v = q ?? emptyQualification();
  return {
    name,
    stage: v.stage ?? '',
    subjects: v.subjects ?? '',
    degree: v.degree ?? '',
    pg: v.postgraduate_degree ?? '',
    professional: v.professional_qualification ?? '',
    tetType: v.tet_type ?? '',
    tetPaper: v.tet_paper ?? '',
    tetDate: v.tet_certificate_date ?? '',
    tetValidUntil: v.tet_valid_until ?? '',
    other: v.other_approval ?? '',
    otherValidUntil: v.other_valid_until ?? '',
  };
}

// ---- what is missing, and what ends --------------------------------------------------------------------------------

export const GAP_CODES = {
  'Stage not chosen': 'stage',
  'No degree recorded': 'degree',
  'No postgraduate degree recorded': 'pg',
  'No professional qualification recorded': 'professional',
  'No TET recorded': 'tet',
  'CTET paper not recorded': 'ctet_paper',
  'CTET paper II does not cover classes I to V (paper I does)': 'ctet_primary',
  'CTET paper I does not cover classes VI to VIII (paper II does)': 'ctet_upper',
  'TET certificate date not readable': 'date',
} as const;
export type GapCode = (typeof GAP_CODES)[keyof typeof GAP_CODES] | 'other';
export const gapCode = (sentence: string): GapCode => (GAP_CODES as Record<string, GapCode>)[sentence] ?? (sentence.endsWith(': valid-until date not readable') ? 'date' : 'other');

// A certificate or approval that ends within the window, or has ended. `days` from today; negative once passed.
export type Ending = { kind: 'tet' | 'other'; label: string; until: string; days: number };
export type StaffCheck = { gaps: GapCode[]; endings: Ending[] };

export function checkStaff(name: string, q: Qualification | null, settings: RegisterSettings, todayIso: string): StaffCheck {
  const today = readDate(todayIso);
  if (!today) throw new Error('today is not a date');
  const teacher = toTeacher(name, q);
  const check = checkTeacher(teacher, settings, today);
  const tetItem = teacher.tetType ? `${teacher.tetType} certificate` : null;
  return {
    gaps: check.gaps.map(gapCode),
    // An approval with no name typed has an empty label: the screen says it in the reader's language (review of C227).
    endings: check.expiries.map((e) => ({ kind: e.item === tetItem ? 'tet' : 'other', label: e.item === tetItem ? teacher.tetType : has(teacher.other) ? e.item : '', until: isoDate(e.until), days: e.days })),
  };
}

// ---- the school's setting, read as the tool's settings ----------------------------------------------------------------

// The settings of the Compliance module (src/lib/frameworks/settings-schemas.ts): the window, and for each stage and
// requirement an on/off setting "<stage>_<requirement>". Read through the tool's own cleanRegisterSettings, so anything
// it would not keep is its default.
export const SETTING_WINDOW = 'expiry_window';
export const ruleSetting = (stage: StageId, rule: RuleId) => `${stage}_${rule}`;

export function registerSettingsOf(values: Readonly<Record<string, unknown>>): RegisterSettings {
  const rules: Record<string, Record<string, unknown>> = {};
  for (const s of STAGES) rules[s.id] = Object.fromEntries(RULE_IDS.map((r) => [r, values[ruleSetting(s.id, r)]]));
  return cleanRegisterSettings({ rules, window: Number(values[SETTING_WINDOW]) as ExpiryWindow });
}

// ---- reading what the office typed -----------------------------------------------------------------------------------

export type QualificationProblem = 'stage' | 'length' | 'aadhaar' | 'tet_type' | 'tet_paper' | 'date' | 'tet_needed' | 'future' | 'order';
const isIso = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && readDate(v) !== null && isoDate(readDate(v)!) === v;

// A row as typed on the form (or read from a CSV line): each field a string, '' for nothing. Spaces are trimmed; a
// field the tool counts as nothing (none, nil, a dash) is kept as typed, as the tool keeps it.
export function readQualification(input: Readonly<Record<string, unknown>>, todayIso: string): { ok: true; value: Qualification } | { ok: false; reason: QualificationProblem; field: string } {
  const str = (k: string) => (typeof input[k] === 'string' ? (input[k] as string).trim() : input[k] === undefined || input[k] === null ? '' : null);
  const value = emptyQualification();
  const stage = str('stage');
  if (stage === null || (stage && !STAGES.some((s) => s.id === stage))) return { ok: false, reason: 'stage', field: 'stage' };
  value.stage = (stage || null) as StageId | null;
  for (const f of TEXT_FIELDS) {
    const v = str(f);
    if (v === null || v.length > FIELD_MAX[f]) return { ok: false, reason: 'length', field: f };
    if (hasAadhaarNumber(v)) return { ok: false, reason: 'aadhaar', field: f };
    value[f] = v.replace(/\s+/g, ' ') || null;
  }
  const tetType = str('tet_type');
  if (tetType === null || (tetType && !(TET_TYPES as readonly string[]).includes(tetType))) return { ok: false, reason: 'tet_type', field: 'tet_type' };
  value.tet_type = (tetType || null) as Qualification['tet_type'];
  const paper = str('tet_paper');
  if (paper === null || (paper && !(TET_PAPERS as readonly string[]).includes(paper))) return { ok: false, reason: 'tet_paper', field: 'tet_paper' };
  value.tet_paper = (paper || null) as Qualification['tet_paper'];
  for (const f of ['tet_certificate_date', 'tet_valid_until', 'other_valid_until'] as const) {
    const v = str(f);
    if (v === null || (v && !isIso(v))) return { ok: false, reason: 'date', field: f };
    value[f] = v || null;
  }
  if (!value.tet_type && (value.tet_paper || value.tet_certificate_date || value.tet_valid_until)) return { ok: false, reason: 'tet_needed', field: 'tet_type' };
  if (value.tet_certificate_date && value.tet_certificate_date > todayIso) return { ok: false, reason: 'future', field: 'tet_certificate_date' };
  if (value.tet_certificate_date && value.tet_valid_until && value.tet_valid_until < value.tet_certificate_date) return { ok: false, reason: 'order', field: 'tet_valid_until' };
  return { ok: true, value };
}

// The fields that differ between two rows (for the audit row: names of fields, never their values).
export const changedFields = (before: Qualification | null, after: Qualification): string[] => QUALIFICATION_FIELDS.filter((f) => (before ? before[f] : null) !== after[f]);

// ---- the CSV import, in the tool's own columns -------------------------------------------------------------------------

// A name as the import compares it with a staff account: letters in lower case, one space between words.
export const nameKey = (name: string) => name.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-IN');

export type ImportStatus = 'ready' | 'no_account' | 'two_accounts' | 'twice' | QualificationProblem;
export type ImportRow = { line: number; name: string; status: ImportStatus; userId: string | null; replaces: boolean; value: Qualification | null };

// Each teacher of the tool's own reading of the file (teachersFromCsv) matched with ONE staff account of the school by
// name. A name that matches no account, or two, or comes twice in the file, is left out and said; so is a line the
// desk's own rules refuse. The tool reads a TET paper or date only beside a TET; a line with no TET keeps none.
export function matchImport(teachers: readonly Teacher[], staff: readonly { user_id: string; name: string; has_row: boolean }[], todayIso: string): ImportRow[] {
  const byName = new Map<string, { user_id: string; has_row: boolean }[]>();
  for (const s of staff) byName.set(nameKey(s.name), [...(byName.get(nameKey(s.name)) ?? []), s]);
  const seen = new Map<string, number>();
  for (const t of teachers) seen.set(nameKey(t.name), (seen.get(nameKey(t.name)) ?? 0) + 1);
  return teachers.map((t, i) => {
    const line = i + 1;
    const key = nameKey(t.name);
    const accounts = byName.get(key) ?? [];
    const base = { line, name: t.name.trim(), userId: accounts.length === 1 ? accounts[0].user_id : null, replaces: accounts.length === 1 && accounts[0].has_row, value: null };
    if (accounts.length === 0) return { ...base, status: 'no_account' as const };
    if (accounts.length > 1) return { ...base, status: 'two_accounts' as const };
    if ((seen.get(key) ?? 0) > 1) return { ...base, status: 'twice' as const };
    const read = readQualification(
      {
        stage: t.stage,
        subjects: t.subjects,
        degree: t.degree,
        postgraduate_degree: t.pg,
        professional_qualification: t.professional,
        tet_type: t.tetType,
        tet_paper: t.tetType ? t.tetPaper : '',
        tet_certificate_date: t.tetType ? t.tetDate : '',
        tet_valid_until: t.tetType ? t.tetValidUntil : '',
        other_approval: t.other,
        other_valid_until: t.otherValidUntil,
      },
      todayIso
    );
    return read.ok ? { ...base, status: 'ready' as const, value: read.value } : { ...base, status: read.reason };
  });
}
