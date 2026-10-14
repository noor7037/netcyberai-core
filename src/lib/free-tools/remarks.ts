import { parseCsv } from '@/lib/import/csv';
import { num, pct, toCsv, type ToolReport } from './report';

// Report card remarks drafted from a fixed bank of phrases (not AI), for
// the teacher to edit. Pure and deterministic: the same students, choices
// and draft numbers always give the same remarks, so the wording rules are
// unit-tested, including a scan of the whole bank for labels and for
// he/she wording.
//
// Writing rules for every phrase: the student's first name or neutral
// wording, never he, she, his or her; effort, habits and a next step,
// never a fixed label about the child.

export interface RemarkStudent {
  id: string;
  name: string;
  overall: string; // overall percentage as typed
  attendance: string; // attendance percentage as typed
  strength: string; // an id from STRENGTHS, CUSTOM, or '' for none
  strengthText: string; // the teacher's own words when strength is CUSTOM
  nextStep: string; // an id from NEXT_STEPS, CUSTOM, or ''
  nextStepText: string;
}

export const CUSTOM = 'custom';
export const MAX_STUDENTS = 200;
export const REMARK_MAX = { name: 60, custom: 120, remark: 1200 };

interface PhraseSet {
  id: string;
  label: string;
  phrases: string[];
}

// {name} is the student's first name; {text} the teacher's own words.
// Each list has three phrases, and at each position only one of the
// strength, attendance and next-step lists names the student, so a draft
// never repeats the name sentence after sentence.
export const STRENGTHS: PhraseSet[] = [
  { id: 'neat-work', label: 'Neat work', phrases: ['Work is always presented neatly and with care.', 'Neat, careful presentation is a real strength.', '{name} takes pride in neat, well-presented work.'] },
  { id: 'reads-aloud', label: 'Reads aloud with confidence', phrases: ['Reading aloud is confident and clear.', 'Reading aloud with confidence is a real strength.', '{name} reads aloud with confidence and expression.'] },
  { id: 'good-questions', label: 'Asks good questions', phrases: ['Thoughtful questions in class show real curiosity.', 'Asking good questions is a real strength.', '{name} asks thoughtful questions that help the whole class.'] },
  { id: 'helps-classmates', label: 'Helps classmates', phrases: ['Helping classmates comes naturally.', 'Kindness towards classmates is a real strength.', '{name} is always ready to help classmates.'] },
  { id: 'works-steadily', label: 'Works steadily', phrases: ['Class work is steady and focused.', 'Working steadily, with good focus, is a real strength.', '{name} settles to work well and keeps going.'] },
  { id: 'creative-ideas', label: 'Creative ideas', phrases: ['Class work is full of creative ideas.', 'Creative thinking is a real strength.', '{name} brings fresh, creative ideas to lessons.'] },
  { id: 'strong-in-maths', label: 'Strong in maths', phrases: ['Maths is a clear strength.', 'Confidence in maths is a real strength.', '{name} handles maths with confidence.'] },
  { id: 'clear-writing', label: 'Clear writing', phrases: ['Written work is clear and easy to follow.', 'Clear writing is a real strength.', '{name} writes clearly and well.'] },
];

export const NEXT_STEPS: PhraseSet[] = [
  { id: 'times-tables', label: 'Practise times tables daily', phrases: ['Daily times-table practice at home will help {name} gain speed and confidence.', 'The next step is to practise times tables for a few minutes every day.', 'A few minutes of times-table practice each day will build speed and confidence.'] },
  { id: 'read-daily', label: 'Read for ten minutes each day', phrases: ['Reading for ten minutes every day at home will help {name} grow as a reader.', 'The next step is to read for ten minutes each day.', 'Ten minutes of reading each day will build fluency and vocabulary.'] },
  { id: 'check-answers', label: 'Check answers before submitting', phrases: ['Checking each answer before handing work in will help {name} catch small slips.', 'The next step is to check answers before submitting work.', 'A quick check of every answer before submitting will make the work even more accurate.'] },
  { id: 'class-discussion', label: 'Take part in class discussion', phrases: ['Sharing ideas in class discussion is the next step for {name}.', 'The next step is to take a bigger part in class discussions.', 'Speaking up more in class discussions will build confidence.'] },
  { id: 'homework-on-time', label: 'Complete homework on time', phrases: ['Completing homework on time will help {name} practise what is learned in class.', 'The next step is to complete homework on time, every time.', 'A regular homework routine will help with keeping up in each subject.'] },
  { id: 'attend-regularly', label: 'Attend regularly', phrases: ['Coming to school every day is the next step for {name}.', 'The next step is to attend school regularly.', 'Regular attendance will help with keeping up in every lesson.'] },
];

export const CUSTOM_STRENGTH = ['A real strength this term: {text}.', 'Something to celebrate: {text}.', 'A strength {name} can be proud of: {text}.'];
export const CUSTOM_NEXT_STEP = ['The next step for {name}: {text}.', 'The next step to work on together: {text}.', 'Next term, the focus will be on this: {text}.'];

// The first sentence, by overall percentage. Band edges are this tool's
// own choice for wording, not a board rule; the printed list states them.
export const PERFORMANCE_BANDS: { min: number; phrases: string[] }[] = [
  {
    min: 85,
    phrases: ['{name} has worked to an excellent standard this term.', 'This has been an outstanding term for {name}.', 'Excellent work this term, {name}: the results show real understanding.', '{name} has achieved excellent results across subjects this term.'],
  },
  {
    min: 70,
    phrases: ['{name} has done very good work this term.', 'This has been a strong term for {name}.', 'Very good work this term, {name}: the results show a secure grasp of most topics.', '{name} has made very good progress this term.'],
  },
  {
    min: 55,
    phrases: ['{name} has made steady progress this term.', 'This has been a term of steady progress for {name}.', 'Good, steady work this term, {name}: there is a sound base to build on.', '{name} is making sound progress in most subjects.'],
  },
  {
    min: 40,
    phrases: ['{name} has shown real effort this term and is making progress.', 'This has been a term of growing understanding for {name}.', 'Good effort this term, {name}: the foundations are being laid.', '{name} is building understanding step by step.'],
  },
  {
    min: 0,
    phrases: ['{name} is building the basics step by step and has kept trying this term.', 'This has been a term of building foundations for {name}.', 'Keep trying, {name}: every bit of practice is helping.', '{name} is growing in confidence with the basics, and regular practice will help.'],
  },
];

export const ATTENDANCE_BANDS: { min: number; phrases: string[] }[] = [
  { min: 95, phrases: ['Attendance has been excellent.', '{name} has been in school almost every day this term.', 'Excellent attendance this term: well done.'] },
  { min: 85, phrases: ['Attendance has been regular.', '{name} has attended regularly this term.', 'Regular attendance has made it easier to keep up with lessons.'] },
  { min: 75, phrases: ['Coming to school even more regularly will make it easier to keep up with new lessons.', 'A few more days in school would help {name} keep up with every lesson.', 'Every extra day in class will help build on this progress.'] },
  { min: 0, phrases: ['Coming to school every day will make a real difference to learning.', 'Being in school every day will help {name} keep up with new learning.', 'Every day in class counts, and more regular attendance will help a great deal.'] },
];

export const CLOSINGS = [
  'Well done, {name}, and keep it up!',
  'Keep going, {name}!',
  'I look forward to seeing even more progress next term.',
  'Keep up the good effort, {name}.',
  'Best wishes for the term ahead.',
  'Well done this term, {name}.',
  'I am proud of the effort shown this term.',
];

// Every phrase the builder can use, for the wording tests.
export function phraseBank(): string[] {
  return [
    ...STRENGTHS.flatMap((s) => s.phrases),
    ...NEXT_STEPS.flatMap((s) => s.phrases),
    ...CUSTOM_STRENGTH,
    ...CUSTOM_NEXT_STEP,
    ...PERFORMANCE_BANDS.flatMap((b) => b.phrases),
    ...ATTENDANCE_BANDS.flatMap((b) => b.phrases),
    ...CLOSINGS,
  ];
}

// ---- drafting -------------------------------------------------------------------

export function firstName(name: string): string {
  const f = name.trim().split(/\s+/)[0] ?? '';
  return f ? f[0].toUpperCase() + f.slice(1) : '';
}

// A percentage from 0 to 100 (a trailing % is allowed), or null when blank
// or not a usable number.
export function readPercent(s: string): number | null {
  const t = s.trim().replace(/%$/, '').trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

export function percentProblem(s: string): string | null {
  return s.trim() && readPercent(s) === null ? 'Enter a number from 0 to 100.' : null;
}

const bandFor = <T extends { min: number }>(bands: T[], v: number): T => bands.find((b) => v >= b.min) ?? bands[bands.length - 1];
const pick = (list: string[], v: number) => list[((v % list.length) + list.length) % list.length];
const ownWords = (s: string) => s.trim().replace(/\s+/g, ' ').replace(/[.!?;,:]+$/, '').slice(0, REMARK_MAX.custom);

function choice(sets: PhraseSet[], id: string, custom: string, customPhrases: string[]): { phrases: string[]; text: string } | null {
  if (id === CUSTOM) return ownWords(custom) ? { phrases: customPhrases, text: ownWords(custom) } : null;
  const set = sets.find((s) => s.id === id);
  return set ? { phrases: set.phrases, text: '' } : null;
}

// One remark, from the student's choices and a draft number. Each part
// moves to its next phrase as the number goes up, and the parts have
// three, four and seven phrases, so the wording repeats only after
// many drafts.
export function draftRemark(s: RemarkStudent, variant: number, name = firstName(s.name)): string {
  if (!name) return '';
  const parts: { phrase: string; text?: string }[] = [];
  const overall = readPercent(s.overall);
  const attendance = readPercent(s.attendance);
  if (overall !== null) parts.push({ phrase: pick(bandFor(PERFORMANCE_BANDS, overall).phrases, variant) });
  const strength = choice(STRENGTHS, s.strength, s.strengthText, CUSTOM_STRENGTH);
  if (strength) parts.push({ phrase: pick(strength.phrases, variant), text: strength.text });
  // When the next step is already about attendance, a low attendance
  // sentence would say the same thing twice, so it is left out.
  const attendanceIsNextStep = s.nextStep === 'attend-regularly' && attendance !== null && attendance < ATTENDANCE_BANDS[1].min;
  if (attendance !== null && !attendanceIsNextStep) parts.push({ phrase: pick(bandFor(ATTENDANCE_BANDS, attendance).phrases, variant) });
  const next = choice(NEXT_STEPS, s.nextStep, s.nextStepText, CUSTOM_NEXT_STEP);
  if (next) parts.push({ phrase: pick(next.phrases, variant), text: next.text });
  parts.push({ phrase: pick(CLOSINGS, variant) });
  return parts.map((p) => p.phrase.replace(/\{name\}/g, name).replace(/\{text\}/g, p.text ?? '')).join(' ');
}

// Drafts for a whole class. Student number i starts at draft i (or the
// draft number "Draft again" pinned for that student), so neighbours
// start on different wording; a draft that would repeat another
// student's remark word for word (with the name set aside) moves on to
// the next draft number. Returns each student's remark and the draft
// number it used.
export function draftClass(students: RemarkStudent[], pinned: Record<string, number> = {}): { text: Record<string, string>; variant: Record<string, number> } {
  const text: Record<string, string> = {};
  const variant: Record<string, number> = {};
  const seen = new Set<string>();
  const NAME = '\u0001';
  students.forEach((s, i) => {
    let v = pinned[s.id] ?? i;
    if (firstName(s.name)) {
      let shape = draftRemark(s, v, NAME);
      for (let tries = 0; seen.has(shape) && tries < 100; tries++) shape = draftRemark(s, ++v, NAME);
      seen.add(shape);
    }
    variant[s.id] = v;
    text[s.id] = draftRemark(s, v);
  });
  return { text, variant };
}

// ---- outputs ------------------------------------------------------------------------

const named = (students: RemarkStudent[]) => students.filter((s) => s.name.trim());

const bandText = (bands: { min: number }[]) =>
  bands
    .map((b, i) => (i === 0 ? `${pct(b.min, 0)} and above` : b.min === 0 ? `below ${pct(bands[i - 1].min, 0)}` : `${pct(b.min, 0)} to below ${pct(bands[i - 1].min, 0)}`))
    .join(', ');

export function remarksReport(students: RemarkStudent[], remarks: Record<string, string>, className: string): ToolReport {
  const list = named(students);
  return {
    title: 'Report card remarks',
    subtitle: [className.trim(), `${num(list.length)} ${list.length === 1 ? 'student' : 'students'}`].filter(Boolean).join(' · '),
    sections: [{ kind: 'table', heading: 'Class list', columns: ['Student', 'Remark'], rows: list.map((s) => [s.name.trim(), (remarks[s.id] ?? '').trim()]) }],
    assumptions: [
      'Each draft is built from a fixed bank of phrases, chosen by the overall percentage, attendance, and the strength and next step picked for the student. The same choices always give the same draft.',
      `Overall percentage bands for the first sentence: ${bandText(PERFORMANCE_BANDS)}.`,
      `Attendance bands: ${bandText(ATTENDANCE_BANDS)}.`,
    ],
    disclaimer: 'Every remark is a draft for the teacher to read and edit before it goes on a report card. Made in your browser; nothing is sent to NetCyberAI.',
  };
}

export function remarksCsv(students: RemarkStudent[], remarks: Record<string, string>): string {
  return toCsv([['Student', 'Remark'], ...named(students).map((s) => [s.name.trim(), (remarks[s.id] ?? '').trim()])]);
}

// "Name: remark" blocks, ready to paste into report cards.
export function remarksText(students: RemarkStudent[], remarks: Record<string, string>): string {
  return named(students)
    .map((s) => `${s.name.trim()}: ${(remarks[s.id] ?? '').trim()}`)
    .join('\n\n');
}

// ---- the class list as CSV ----------------------------------------------------------------

export const STUDENT_COLUMNS = ['Student', 'Overall %', 'Attendance %', 'Strength', 'Next step'];

export function newStudentId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function blankStudent(id = newStudentId()): RemarkStudent {
  return { id, name: '', overall: '', attendance: '', strength: '', strengthText: '', nextStep: '', nextStepText: '' };
}

const labelOf = (sets: PhraseSet[], id: string, custom: string) => (id === CUSTOM ? custom : sets.find((s) => s.id === id)?.label ?? '');

export function studentTemplateCsv(): string {
  return toCsv([STUDENT_COLUMNS]);
}

export function studentsToCsv(students: RemarkStudent[]): string {
  return toCsv([STUDENT_COLUMNS, ...named(students).map((s) => [s.name.trim(), s.overall, s.attendance, labelOf(STRENGTHS, s.strength, s.strengthText), labelOf(NEXT_STEPS, s.nextStep, s.nextStepText)])]);
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const COLUMN_FIELD: Record<string, 'name' | 'overall' | 'attendance' | 'strength' | 'nextStep'> = {
  student: 'name',
  studentname: 'name',
  name: 'name',
  overall: 'overall',
  overallpercentage: 'overall',
  percentage: 'overall',
  attendance: 'attendance',
  attendancepercentage: 'attendance',
  strength: 'strength',
  nextstep: 'nextStep',
  next: 'nextStep',
};

// A listed choice by its label (or id); anything else is the teacher's own words.
function readChoice(sets: PhraseSet[], v: string): { id: string; text: string } {
  if (!v.trim()) return { id: '', text: '' };
  const hit = sets.find((s) => norm(s.label) === norm(v) || s.id === norm(v));
  return hit ? { id: hit.id, text: '' } : { id: CUSTOM, text: v.trim().slice(0, REMARK_MAX.custom) };
}

export function studentsFromCsv(csv: string): { rows: RemarkStudent[]; problems: string[]; error?: string } {
  const table = parseCsv(csv.replace(/^﻿/, ''));
  if (table.length < 2) return { rows: [], problems: [], error: 'The file has no students. It needs a header row and at least one student row.' };
  const fields = table[0].map((h) => COLUMN_FIELD[norm(h)]);
  if (!fields.includes('name')) return { rows: [], problems: [], error: 'The first row needs a Student column. Download the CSV template to see the columns.' };
  const rows: RemarkStudent[] = [];
  let skipped = 0;
  let over = 0;
  for (const cells of table.slice(1)) {
    const rec: Partial<Record<'name' | 'overall' | 'attendance' | 'strength' | 'nextStep', string>> = {};
    fields.forEach((f, i) => {
      if (f && rec[f] === undefined) rec[f] = (cells[i] ?? '').trim();
    });
    if (!rec.name) {
      if (cells.some((c) => c.trim())) skipped++;
      continue;
    }
    if (rows.length >= MAX_STUDENTS) {
      over++;
      continue;
    }
    const strength = readChoice(STRENGTHS, rec.strength ?? '');
    const next = readChoice(NEXT_STEPS, rec.nextStep ?? '');
    rows.push({
      id: newStudentId(),
      name: rec.name.slice(0, REMARK_MAX.name),
      overall: (rec.overall ?? '').slice(0, 8),
      attendance: (rec.attendance ?? '').slice(0, 8),
      strength: strength.id,
      strengthText: strength.text,
      nextStep: next.id,
      nextStepText: next.text,
    });
  }
  const problems = [
    skipped ? `${num(skipped)} ${skipped === 1 ? 'row has' : 'rows have'} no student name and ${skipped === 1 ? 'was' : 'were'} left out.` : '',
    over ? `Only the first ${num(MAX_STUDENTS)} students were opened; ${num(over)} more ${over === 1 ? 'was' : 'were'} left out.` : '',
  ].filter(Boolean);
  return { rows, problems };
}
