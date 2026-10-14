import { parseCsv } from '@/lib/import/csv';
import { toCsv, type ReportSection, type ReportTone, type ToolReport } from './report';
import { browserStore, type KeyValueStore } from './school-profile';
import { daysBetween, readDate, showDate, toIso, type DayDate } from './student-data-check';

// Teacher qualification and TET register: each teacher's degrees,
// professional qualification and TET against the rules the school sets for
// each stage, with certificates and approvals running out listed early.
//
// The only rule filled in to start is the one the page states: TET is
// marked as needed for classes I to VIII (NCTE, under the RTE Act). Every
// other requirement starts off and is the school's to set. The rules are
// saved in this browser; the teacher list is not, unless the school ticks
// "Keep on this device" (device-list.ts).

export const REGISTER_KEY = 'nca-free-tool:teacher-qualification-register';
export const REGISTER_SLUG = 'teacher-qualification-register';
export const MAX_TEACHERS = 300;

export type StageId = 'pre' | 'primary' | 'upper' | 'secondary' | 'senior';

export const STAGES: { id: StageId; label: string }[] = [
  { id: 'pre', label: 'Pre-primary' },
  { id: 'primary', label: 'Primary (I–V)' },
  { id: 'upper', label: 'Upper primary (VI–VIII)' },
  { id: 'secondary', label: 'Secondary (IX–X)' },
  { id: 'senior', label: 'Senior secondary (XI–XII)' },
];
export const stageLabel = (id: StageId | '') => STAGES.find((s) => s.id === id)?.label ?? 'Not chosen';

export interface StageRule {
  degree: boolean;
  professional: boolean;
  tet: boolean;
  pg: boolean;
}
export type RuleId = keyof StageRule;
export const RULE_LABEL: Record<RuleId, string> = {
  degree: 'Degree',
  professional: 'Professional qualification (B.Ed, D.El.Ed or other)',
  tet: 'TET',
  pg: 'Postgraduate degree',
};

export const WINDOWS = [30, 60, 90] as const;
export type ExpiryWindow = (typeof WINDOWS)[number];

export interface RegisterSettings {
  rules: Record<StageId, StageRule>;
  window: ExpiryWindow;
}

const off: StageRule = { degree: false, professional: false, tet: false, pg: false };
export const defaultRegisterSettings = (): RegisterSettings => ({
  rules: { pre: { ...off }, primary: { ...off, tet: true }, upper: { ...off, tet: true }, secondary: { ...off }, senior: { ...off } },
  window: 90,
});

export type TetType = '' | 'CTET' | 'State TET';
export type TetPaper = '' | 'I' | 'II' | 'both';

export interface Teacher {
  name: string;
  stage: StageId | '';
  subjects: string;
  degree: string;
  pg: string;
  professional: string;
  tetType: TetType;
  tetPaper: TetPaper;
  // Dates are yyyy-mm-dd, from date inputs; '' when not given.
  tetDate: string;
  tetValidUntil: string;
  other: string;
  otherValidUntil: string;
}

export const blankTeacher = (): Teacher => ({
  name: '',
  stage: '',
  subjects: '',
  degree: '',
  pg: '',
  professional: '',
  tetType: '',
  tetPaper: '',
  tetDate: '',
  tetValidUntil: '',
  other: '',
  otherValidUntil: '',
});

// ---- settings and the opt-in list ---------------------------------------------------

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
const record = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const isoOrBlank = (v: unknown) => {
  const s = text(v, 10);
  return ISO.test(s) && readDate(s) ? s : '';
};

export function cleanRegisterSettings(input: unknown): RegisterSettings {
  const src = record(input);
  const rules = record(src.rules);
  const out = defaultRegisterSettings();
  for (const st of STAGES) {
    const r = record(rules[st.id]);
    for (const k of Object.keys(off) as RuleId[]) if (typeof r[k] === 'boolean') out.rules[st.id][k] = r[k] as boolean;
  }
  if (WINDOWS.includes(src.window as ExpiryWindow)) out.window = src.window as ExpiryWindow;
  return out;
}

export function readRegisterSettings(store: KeyValueStore | null = browserStore()): RegisterSettings {
  if (!store) return defaultRegisterSettings();
  try {
    const raw = store.getItem(REGISTER_KEY);
    return raw ? cleanRegisterSettings(JSON.parse(raw)) : defaultRegisterSettings();
  } catch {
    return defaultRegisterSettings();
  }
}

export function saveRegisterSettings(s: RegisterSettings, store: KeyValueStore | null = browserStore()): boolean {
  if (!store) return false;
  try {
    store.setItem(REGISTER_KEY, JSON.stringify(cleanRegisterSettings(s)));
    return true;
  } catch {
    return false;
  }
}

// For the opt-in on-device list: a teacher row read back from storage is
// rebuilt field by field, never trusted as it is.
export function cleanTeacher(input: unknown): Teacher | null {
  if (!input || typeof input !== 'object') return null;
  const r = input as Record<string, unknown>;
  const stage = STAGES.some((s) => s.id === r.stage) ? (r.stage as StageId) : '';
  return {
    name: text(r.name, 80),
    stage,
    subjects: text(r.subjects, 80),
    degree: text(r.degree, 60),
    pg: text(r.pg, 60),
    professional: text(r.professional, 60),
    tetType: r.tetType === 'CTET' || r.tetType === 'State TET' ? r.tetType : '',
    tetPaper: r.tetPaper === 'I' || r.tetPaper === 'II' || r.tetPaper === 'both' ? r.tetPaper : '',
    tetDate: isoOrBlank(r.tetDate),
    tetValidUntil: isoOrBlank(r.tetValidUntil),
    other: text(r.other, 80),
    otherValidUntil: isoOrBlank(r.otherValidUntil),
  };
}

// ---- flags ---------------------------------------------------------------------------

// "None", "nil", "-" and the like count as nothing recorded.
const NONE = new Set(['', 'none', 'no', 'nil', 'na', 'n/a', '-', '—', 'not applicable']);
export const has = (s: string) => !NONE.has(s.trim().toLowerCase());

export interface Expiry {
  teacher: string;
  item: string;
  until: DayDate;
  // Days from today; negative once it has passed.
  days: number;
}

export interface TeacherCheck {
  teacher: Teacher;
  gaps: string[];
  expiries: Expiry[];
}

const CTET_COVERS: Partial<Record<StageId, { papers: TetPaper[]; missing: string }>> = {
  primary: { papers: ['I', 'both'], missing: 'CTET paper II does not cover classes I to V (paper I does)' },
  upper: { papers: ['II', 'both'], missing: 'CTET paper I does not cover classes VI to VIII (paper II does)' },
};

export function checkTeacher(t: Teacher, s: RegisterSettings, today: DayDate): TeacherCheck {
  const gaps: string[] = [];
  const expiries: Expiry[] = [];
  const who = t.name.trim();
  if (!t.stage) gaps.push('Stage not chosen');
  const rule = t.stage ? s.rules[t.stage] : off;
  if (rule.degree && !has(t.degree)) gaps.push('No degree recorded');
  if (rule.pg && !has(t.pg)) gaps.push('No postgraduate degree recorded');
  if (rule.professional && !has(t.professional)) gaps.push('No professional qualification recorded');
  if (rule.tet && !t.tetType) gaps.push('No TET recorded');
  const covers = t.stage ? CTET_COVERS[t.stage] : undefined;
  if (rule.tet && t.tetType === 'CTET' && covers) {
    if (!t.tetPaper) gaps.push('CTET paper not recorded');
    else if (!covers.papers.includes(t.tetPaper)) gaps.push(covers.missing);
  }
  if (t.tetDate && !readDate(t.tetDate)) gaps.push('TET certificate date not readable');
  const dated = (raw: string, item: string) => {
    if (!raw.trim()) return;
    const until = readDate(raw);
    if (!until) return void gaps.push(`${item}: valid-until date not readable`);
    const days = daysBetween(today, until);
    if (days <= s.window) expiries.push({ teacher: who, item, until, days });
  };
  if (t.tetType) dated(t.tetValidUntil, `${t.tetType} certificate`);
  dated(t.otherValidUntil, has(t.other) ? t.other.trim() : 'Other approval');
  return { teacher: t, gaps, expiries };
}

export const expiryStatus = (days: number) => (days < 0 ? `Passed ${-days} day${days === -1 ? '' : 's'} ago` : days === 0 ? 'Ends today' : `${days} day${days === 1 ? '' : 's'} left`);

const isBlank = (t: Teacher) => Object.values(t).every((v) => !String(v).trim());

export interface RegisterResult {
  errors: string[];
  checks: TeacherCheck[];
  report: ToolReport | null;
}

export function buildRegister(teachers: Teacher[], s: RegisterSettings, today: DayDate): RegisterResult {
  const rows = teachers.filter((t) => !isBlank(t));
  const errors = rows.flatMap((t, i) => (t.name.trim() ? [] : [`Add the name of the teacher in row ${i + 1}.`]));
  const checks = rows.map((t) => checkTeacher(t, s, today));
  if (errors.length || !checks.length) return { errors, checks, report: null };
  return { errors, checks, report: registerReport(checks, s) };
}

function tetCell(t: Teacher): string {
  if (!t.tetType) return 'None';
  const parts: string[] = [t.tetType === 'CTET' && t.tetPaper ? `CTET, paper ${t.tetPaper === 'both' ? 'I and II' : t.tetPaper}` : t.tetType];
  const d = readDate(t.tetDate);
  if (d) parts.push(`certificate ${showDate(d)}`);
  const v = readDate(t.tetValidUntil);
  if (v) parts.push(`valid until ${showDate(v)}`);
  return parts.join(' · ');
}

function otherCell(t: Teacher): string {
  const v = readDate(t.otherValidUntil);
  const name = has(t.other) ? t.other.trim() : '';
  if (!name && !v) return '—';
  return [name || 'Approval', v ? `valid until ${showDate(v)}` : ''].filter(Boolean).join(' · ');
}

function registerReport(checks: TeacherCheck[], s: RegisterSettings): ToolReport {
  const withGaps = checks.filter((c) => c.gaps.length);
  const expiries = checks.flatMap((c) => c.expiries).sort((a, b) => a.days - b.days || a.teacher.localeCompare(b.teacher));
  const passed = expiries.filter((e) => e.days < 0);
  const ending = expiries.filter((e) => e.days >= 0);
  const complete = checks.filter((c) => !c.gaps.length && !c.expiries.length).length;
  const status = (c: TeacherCheck) => {
    const bits = [c.gaps.length ? `${c.gaps.length} gap${c.gaps.length === 1 ? '' : 's'}` : ''];
    if (c.expiries.some((e) => e.days < 0)) bits.push('date passed');
    else if (c.expiries.length) bits.push('ending soon');
    const s = bits.filter(Boolean).join(', ');
    return s ? s[0].toUpperCase() + s.slice(1) : 'Complete';
  };
  const tone = (c: TeacherCheck): ReportTone | undefined => (c.gaps.length || c.expiries.some((e) => e.days < 0) ? 'bad' : c.expiries.length ? 'warn' : undefined);

  const sections: ReportSection[] = [
    {
      kind: 'stats',
      items: [
        { label: 'Teachers', value: String(checks.length) },
        { label: 'Teachers with gaps', value: String(withGaps.length), tone: withGaps.length ? 'bad' : 'good' },
        { label: `Ending within ${s.window} days`, value: String(ending.length), tone: ending.length ? 'warn' : 'good', note: 'Certificates and approvals' },
        { label: 'Dates already passed', value: String(passed.length), tone: passed.length ? 'bad' : 'good' },
        { label: 'Complete', value: String(complete), tone: complete === checks.length ? 'good' : 'neutral', note: 'No gap and nothing ending soon' },
      ],
    },
    withGaps.length
      ? {
          kind: 'table',
          heading: 'Gaps, teacher by teacher',
          columns: ['Teacher', 'Stage', 'What is missing'],
          rows: withGaps.map((c) => [c.teacher.name.trim(), stageLabel(c.teacher.stage), c.gaps.join('; ')]),
          rowTones: withGaps.map(() => 'bad' as const),
        }
      : { kind: 'notes', heading: 'Gaps, teacher by teacher', items: ['No gaps against the rules you set.'], tone: 'good' },
    expiries.length
      ? {
          kind: 'table',
          heading: `Ending within ${s.window} days or already passed`,
          columns: ['Teacher', 'Certificate or approval', 'Valid until', 'Status'],
          rows: expiries.map((e) => [e.teacher, e.item, showDate(e.until), expiryStatus(e.days)]),
          rowTones: expiries.map((e) => (e.days < 0 ? 'bad' : 'warn')),
        }
      : { kind: 'notes', heading: `Ending within ${s.window} days or already passed`, items: ['Nothing ends within the window, and no date has passed.'], tone: 'good' },
    {
      kind: 'table',
      heading: 'Register',
      columns: ['No.', 'Teacher', 'Stage', 'Subjects', 'Degree', 'Postgraduate', 'Professional', 'TET', 'Other approval', 'Status'],
      rows: checks.map((c, i) => {
        const t = c.teacher;
        const or = (v: string) => (has(v) ? v.trim() : '—');
        return [String(i + 1), t.name.trim(), stageLabel(t.stage), or(t.subjects), or(t.degree), or(t.pg), or(t.professional), tetCell(t), otherCell(t), status(c)];
      }),
      numeric: [true],
      rowTones: checks.map(tone),
    },
    {
      kind: 'notes',
      heading: 'Rules used for each stage',
      items: STAGES.map((st) => {
        const need = (Object.keys(RULE_LABEL) as RuleId[]).filter((k) => s.rules[st.id][k]).map((k) => RULE_LABEL[k]);
        return `${st.label}: ${need.length ? need.join(', ') : 'nothing set'}`;
      }),
    },
  ];

  return {
    title: 'Teacher qualification and TET register',
    subtitle: `${checks.length} teacher${checks.length === 1 ? '' : 's'} · dates ending within ${s.window} days flagged`,
    sections,
    assumptions: [
      'TET starts marked as needed for classes I to VIII, as the NCTE requires under the RTE Act. Every other requirement is the one set for each stage on this page. Check your board’s and state’s rules.',
      'CTET paper I covers classes I to V and paper II covers classes VI to VIII. Where TET is needed, a CTET paper that does not cover the teacher’s stage is listed as a gap.',
      'Qualifications count as recorded when anything other than none, nil or a dash is entered. The register does not check the certificates themselves.',
      `Certificates and approvals with a valid-until date within ${s.window} days of today, or already passed, are listed. A blank valid-until date is read as no end date; the NCTE made TET qualifying certificates valid for life in 2021.`,
    ],
    disclaimer: 'This register lists what was entered against the rules set on this page. Check each qualification against the original certificate and your board’s and state’s current rules before an inspection.',
  };
}

// ---- CSV -----------------------------------------------------------------------------

export const TEACHER_COLUMNS = [
  'name',
  'stage',
  'subjects',
  'degree',
  'postgraduate_degree',
  'professional_qualification',
  'tet_type',
  'tet_paper',
  'tet_certificate_date',
  'tet_valid_until',
  'other_approval',
  'other_valid_until',
] as const;

export const TEACHER_TEMPLATE_CSV = `${TEACHER_COLUMNS.join(',')}\r\n`;

const csvDate = (iso: string) => {
  const d = readDate(iso);
  return d ? showDate(d) : '';
};

export function teachersToCsv(teachers: Teacher[]): string {
  return toCsv([
    [...TEACHER_COLUMNS],
    ...teachers
      .filter((t) => !isBlank(t))
      .map((t) => [t.name, t.stage ? stageLabel(t.stage) : '', t.subjects, t.degree, t.pg, t.professional, t.tetType || 'None', t.tetPaper, csvDate(t.tetDate), csvDate(t.tetValidUntil), t.other, csvDate(t.otherValidUntil)]),
  ]);
}

const STAGE_WORDS: Record<string, StageId> = {
  preprimary: 'pre',
  pre: 'pre',
  primary: 'primary',
  upperprimary: 'upper',
  upper: 'upper',
  secondary: 'secondary',
  seniorsecondary: 'senior',
  senior: 'senior',
  highersecondary: 'senior',
};

export function readStage(s: string): StageId | '' {
  const k = s.toLowerCase().split('(')[0].replace(/[^a-z]/g, '');
  return STAGE_WORDS[k] ?? '';
}

export function readTetType(s: string): TetType {
  const k = s.trim().toLowerCase();
  if (!has(k)) return '';
  return k.replace(/[^a-z]/g, '') === 'ctet' ? 'CTET' : 'State TET';
}

export function readTetPaper(s: string): TetPaper {
  const k = s.toLowerCase().replace(/paper|\s/g, '');
  if (k === 'i' || k === '1') return 'I';
  if (k === 'ii' || k === '2') return 'II';
  if (['both', 'iandii', 'i&ii', 'i,ii', 'i+ii', '1and2', '1&2', '1,2', '1+2'].includes(k)) return 'both';
  return '';
}

export interface TeachersImport {
  teachers: Teacher[];
  unreadableDates: number;
  unknownStages: number;
  error?: string;
}

const unguard = (v: string) => v.trim().replace(/^'(?=[=+\-@])/, '');

export function teachersFromCsv(csv: string): TeachersImport {
  const table = parseCsv(csv.replace(/^﻿/, ''));
  if (table.length < 2) return { teachers: [], unreadableDates: 0, unknownStages: 0, error: 'The file has no rows of teachers.' };
  const keys = table[0].map((h) => h.trim().toLowerCase().replace(/[\s-]+/g, '_'));
  const col = (k: string) => keys.indexOf(k);
  if (col('name') < 0) return { teachers: [], unreadableDates: 0, unknownStages: 0, error: 'The file needs a name column. Download the template to see the columns.' };
  let unreadableDates = 0;
  let unknownStages = 0;
  const teachers = table
    .slice(1)
    .filter((r) => r.some((c) => c.trim()))
    .slice(0, MAX_TEACHERS)
    .map((r) => {
      const get = (k: string, max = 80) => (col(k) >= 0 ? unguard(r[col(k)] ?? '').slice(0, max) : '');
      const date = (k: string) => {
        const raw = get(k, 20);
        const iso = toIso(raw);
        if (raw && !iso) unreadableDates += 1;
        return iso;
      };
      const stageRaw = get('stage');
      const stage = readStage(stageRaw);
      if (stageRaw && !stage) unknownStages += 1;
      return {
        name: get('name'),
        stage,
        subjects: get('subjects'),
        degree: get('degree', 60),
        pg: get('postgraduate_degree', 60),
        professional: get('professional_qualification', 60),
        tetType: readTetType(get('tet_type')),
        tetPaper: readTetPaper(get('tet_paper')),
        tetDate: date('tet_certificate_date'),
        tetValidUntil: date('tet_valid_until'),
        other: get('other_approval'),
        otherValidUntil: date('other_valid_until'),
      };
    });
  return { teachers, unreadableDates, unknownStages };
}
