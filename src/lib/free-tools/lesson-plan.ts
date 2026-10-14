import { formatDate, parseIsoDate } from '@/lib/certificates/words';
import type { ToolReport } from './report';

// The lesson plan and worksheet maker. It lays out what the teacher types:
// a timed plan and a printable worksheet with an answer key. It writes no
// lesson content of its own. A lesson holds no one's personal details, so
// the whole lesson may be kept in this browser (cleanLesson guards it).

export type PhaseId = 'warmup' | 'teaching' | 'practice' | 'review';
export type QuestionType = 'short' | 'blank' | 'mcq' | 'truefalse';

export const PHASES: { id: PhaseId; label: string; hint: string }[] = [
  { id: 'warmup', label: 'Warm-up', hint: 'Recall what students already know, or open with a question.' },
  { id: 'teaching', label: 'Teaching', hint: 'Explain and show, with worked examples.' },
  { id: 'practice', label: 'Practice', hint: 'Students try it themselves, alone or in pairs.' },
  { id: 'review', label: 'Review', hint: 'Check understanding and sum up the lesson.' },
];
const PHASE_IDS = PHASES.map((p) => p.id);

// How a period is split before the teacher changes it, in parts of 100.
export const PHASE_PARTS: Record<PhaseId, number> = { warmup: 10, teaching: 40, practice: 35, review: 15 };

export const QUESTION_TYPES: { id: QuestionType; label: string }[] = [
  { id: 'short', label: 'Short answer' },
  { id: 'blank', label: 'Fill in the blank' },
  { id: 'mcq', label: 'Multiple choice' },
  { id: 'truefalse', label: 'True or false' },
];

export const LIMITS = { objectives: 3, questions: 25, options: 4, minPeriod: 5, maxPeriod: 240, defaultPeriod: 40 } as const;
// Characters per field, shared by the inputs and by cleanLesson.
export const MAX = { className: 30, subject: 40, topic: 90, objective: 140, materials: 300, activity: 400, homework: 300, question: 300, option: 80, answer: 140 } as const;

export interface LessonPhase {
  minutes: string;
  activity: string;
}

export interface LessonQuestion {
  type: QuestionType;
  text: string;
  options: string[]; // always four slots; blank ones are left out
  answer: string; // the slot index ("0" to "3") for multiple choice, "True" or "False", or the answer text
}

export interface Lesson {
  className: string;
  subject: string;
  topic: string;
  date: string; // YYYY-MM-DD or empty
  period: string; // minutes
  objectives: string[];
  materials: string;
  phases: Record<PhaseId, LessonPhase>;
  homework: string;
  questions: LessonQuestion[];
}

export function blankQuestion(type: QuestionType = 'short'): LessonQuestion {
  return { type, text: '', options: ['', '', '', ''], answer: '' };
}

// Splits a period by the given weights. Each boundary is rounded from the
// running total, so every phase is a whole number of minutes, none is
// negative and they always add up to the period: the last phase takes up
// the rounding.
export function splitPeriod(total: number, parts: Record<PhaseId, number> = PHASE_PARTS): Record<PhaseId, number> {
  const weights = PHASE_IDS.map((id) => Math.max(0, parts[id] || 0));
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  const out = {} as Record<PhaseId, number>;
  let before = 0;
  let acc = 0;
  PHASE_IDS.forEach((id, i) => {
    acc += weights[i];
    const edge = i === PHASE_IDS.length - 1 ? total : Math.round((total * acc) / sum);
    out[id] = edge - before;
    before = edge;
  });
  return out;
}

export function phasesFromMinutes(m: Record<PhaseId, number>, activities?: Record<PhaseId, LessonPhase>): Record<PhaseId, LessonPhase> {
  return Object.fromEntries(PHASE_IDS.map((id) => [id, { minutes: String(m[id]), activity: activities?.[id].activity ?? '' }])) as Record<PhaseId, LessonPhase>;
}

export function blankLesson(): Lesson {
  return {
    className: '',
    subject: '',
    topic: '',
    date: '',
    period: String(LIMITS.defaultPeriod),
    objectives: [''],
    materials: '',
    phases: phasesFromMinutes(splitPeriod(LIMITS.defaultPeriod)),
    homework: '',
    questions: [blankQuestion()],
  };
}

export function wholeMinutes(s: string): number | null {
  return /^\s*\d{1,3}\s*$/.test(s) ? Number(s) : null;
}

export function periodMinutes(l: Lesson): number | null {
  const p = wholeMinutes(l.period);
  return p !== null && p >= LIMITS.minPeriod && p <= LIMITS.maxPeriod ? p : null;
}

// The minutes of each phase, or null when any is not a whole number.
export function phaseMinutes(phases: Record<PhaseId, LessonPhase>): Record<PhaseId, number> | null {
  const out = {} as Record<PhaseId, number>;
  for (const id of PHASE_IDS) {
    const m = wholeMinutes(phases[id].minutes);
    if (m === null) return null;
    out[id] = m;
  }
  return out;
}

export function phaseTotal(phases: Record<PhaseId, LessonPhase>): number | null {
  const m = phaseMinutes(phases);
  return m && PHASE_IDS.reduce((a, id) => a + m[id], 0);
}

// After the teacher changes one phase's minutes, the last phase takes up
// the difference so the period still adds up. When it cannot (the others
// already fill the period, or the last phase itself was changed), nothing
// moves and lessonErrors says what does not add up.
export function balancePhases(phases: Record<PhaseId, LessonPhase>, period: number | null, changed: PhaseId): Record<PhaseId, LessonPhase> {
  const last = PHASE_IDS[PHASE_IDS.length - 1];
  if (changed === last || period === null) return phases;
  let others = 0;
  for (const id of PHASE_IDS.slice(0, -1)) {
    const m = wholeMinutes(phases[id].minutes);
    if (m === null) return phases;
    others += m;
  }
  const rest = period - others;
  return rest >= 0 ? { ...phases, [last]: { ...phases[last], minutes: String(rest) } } : phases;
}

export function classLabel(c: string): string {
  const t = c.trim();
  return !t || /^(class|grade|std)\b/i.test(t) ? t : `Class ${t}`;
}

// ---- questions ---------------------------------------------------------------------

export const BLANK_LINE = '__________';
const LETTERS = ['a', 'b', 'c', 'd'];

// A multiple-choice question's filled options, lettered in order; blank
// slots are skipped so the printed letters never have gaps.
export function mcqChoices(q: LessonQuestion): { slot: string; label: string; text: string }[] {
  return q.options
    .map((text, i) => ({ slot: String(i), text: text.trim() }))
    .filter((o) => o.text)
    .map((o, i) => ({ ...o, label: LETTERS[i] }));
}

export function questionProblems(q: LessonQuestion, n: number): string[] {
  const out: string[] = [];
  if (q.type === 'mcq') {
    const choices = mcqChoices(q);
    if (choices.length < 2) out.push(`Question ${n}: give at least two options.`);
    if (!choices.some((c) => c.slot === q.answer)) out.push(`Question ${n}: choose the correct option for the key.`);
  } else if (q.type === 'truefalse') {
    if (q.answer !== 'True' && q.answer !== 'False') out.push(`Question ${n}: choose True or False for the key.`);
  } else if (!q.answer.trim()) out.push(`Question ${n}: type the answer for the key.`);
  return out;
}

export interface WorksheetItem {
  no: number;
  type: QuestionType;
  text: string;
  options: { label: string; text: string }[];
  answer: string;
}

export interface Worksheet {
  title: string;
  subtitle: string;
  items: WorksheetItem[];
}

// Questions with text, numbered from 1, ready to print. A fill-in-the-blank
// question shows a line where the teacher typed three or more underscores,
// or at the end when there are none.
export function numberQuestions(questions: LessonQuestion[]): WorksheetItem[] {
  return questions
    .filter((q) => q.text.trim())
    .map((q, i) => {
      const text = q.text.trim();
      const choices = q.type === 'mcq' ? mcqChoices(q) : [];
      const hit = choices.find((c) => c.slot === q.answer);
      return {
        no: i + 1,
        type: q.type,
        text: q.type === 'blank' ? (/_{3,}/.test(text) ? text.replace(/_{3,}/g, BLANK_LINE) : `${text} ${BLANK_LINE}`) : text,
        options: choices.map(({ label, text: t }) => ({ label, text: t })),
        answer: q.type === 'mcq' ? (hit ? `(${hit.label}) ${hit.text}` : '') : q.answer.trim(),
      };
    });
}

export function worksheetErrors(l: Lesson): string[] {
  const asked = l.questions.filter((q) => q.text.trim());
  if (!asked.length) return ['Add at least one question for the worksheet.'];
  return asked.flatMap((q, i) => questionProblems(q, i + 1));
}

function describe(l: Lesson): string {
  return [classLabel(l.className), l.subject.trim(), formatDate(l.date)].filter(Boolean).join(' · ');
}

export function worksheetOf(l: Lesson): Worksheet {
  return { title: `Worksheet: ${l.topic.trim()}`, subtitle: describe(l), items: numberQuestions(l.questions) };
}

// ---- the plan ------------------------------------------------------------------------

export function lessonErrors(l: Lesson): string[] {
  const out: string[] = [];
  if (!l.className.trim()) out.push('Type the class.');
  if (!l.subject.trim()) out.push('Type the subject.');
  if (!l.topic.trim()) out.push('Type the topic.');
  if (l.date && !parseIsoDate(l.date)) out.push('The date is not a real date.');
  const period = periodMinutes(l);
  if (period === null) out.push(`Period length: a whole number of minutes from ${LIMITS.minPeriod} to ${LIMITS.maxPeriod}.`);
  if (!l.objectives.some((o) => o.trim())) out.push('Write at least one learning objective.');
  const bad = PHASES.filter((p) => wholeMinutes(l.phases[p.id].minutes) === null);
  for (const p of bad) out.push(`${p.label}: the minutes must be a whole number.`);
  const total = phaseTotal(l.phases);
  if (period !== null && total !== null && total !== period) out.push(`The timings add up to ${total} minutes, but the period is ${period}. Change them so they add up.`);
  return out;
}

const TYPE_LABEL = Object.fromEntries(QUESTION_TYPES.map((t) => [t.id, t.label])) as Record<QuestionType, string>;

// The plan as a report: on screen, in print, as a PDF and as a CSV.
// Call only when lessonErrors(l) is empty.
export function lessonReport(l: Lesson): ToolReport {
  const period = periodMinutes(l) ?? 0;
  const minutes = phaseMinutes(l.phases) ?? splitPeriod(period);
  let start = 0;
  const timings = PHASES.map((p) => {
    const m = minutes[p.id];
    const row = [p.label, String(m), `${start}–${start + m} min`, l.phases[p.id].activity.trim() || '—'];
    start += m;
    return row;
  });
  const items = numberQuestions(l.questions);
  const parts = PHASES.map((p) => PHASE_PARTS[p.id]).join(':');
  return {
    title: `Lesson plan: ${l.topic.trim()}`,
    subtitle: describe(l),
    sections: [
      {
        kind: 'stats',
        items: [
          { label: 'Class', value: classLabel(l.className) },
          { label: 'Subject', value: l.subject.trim() },
          { label: 'Period', value: `${period} minutes` },
          ...(l.date ? [{ label: 'Date', value: formatDate(l.date) }] : []),
        ],
      },
      { kind: 'notes', heading: 'Learning objectives', items: l.objectives.map((o) => o.trim()).filter(Boolean) },
      ...(l.materials.trim() ? [{ kind: 'text' as const, heading: 'Materials', text: l.materials.trim() }] : []),
      { kind: 'table', heading: 'Timings', columns: ['Phase', 'Minutes', 'Time', 'Activity'], rows: timings, numeric: [false, true, false, false] },
      ...(items.length
        ? [
            {
              kind: 'table' as const,
              heading: 'Checks for understanding',
              columns: ['No.', 'Type', 'Question', 'Answer'],
              rows: items.map((it) => [String(it.no), TYPE_LABEL[it.type], [it.text, ...it.options.map((o) => `(${o.label}) ${o.text}`)].join('  '), it.answer]),
              numeric: [true, false, false, false],
            },
          ]
        : []),
      ...(l.homework.trim() ? [{ kind: 'text' as const, heading: 'Homework', text: l.homework.trim() }] : []),
    ],
    assumptions: [
      `The period starts split into warm-up, teaching, practice and review in the proportion ${parts}, then as the teacher set it. The last phase takes up any rounding, so the minutes always add up to the period.`,
      'Every objective, activity, question and answer is as the teacher typed it. The tool lays them out; it does not write or check them.',
    ],
    disclaimer: 'Made with the free lesson plan and worksheet maker. Nothing typed here is sent to NetCyberAI. Review the plan before the lesson.',
  };
}

// ---- saved in this browser -----------------------------------------------------------

const str = (x: unknown, max: number) => (typeof x === 'string' ? x.slice(0, max) : '');

// A lesson read back from storage: only known fields, only strings, each
// cut to its limit. Anything else is dropped.
export function cleanLesson(input: unknown): Lesson {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const base = blankLesson();
  const objectives = (Array.isArray(src.objectives) ? src.objectives : []).slice(0, LIMITS.objectives).map((o) => str(o, MAX.objective));
  const phasesSrc = (src.phases && typeof src.phases === 'object' ? src.phases : {}) as Record<string, unknown>;
  const phases = Object.fromEntries(
    PHASE_IDS.map((id) => {
      const p = (phasesSrc[id] && typeof phasesSrc[id] === 'object' ? phasesSrc[id] : {}) as Record<string, unknown>;
      return [id, { minutes: str(p.minutes, 3) || base.phases[id].minutes, activity: str(p.activity, MAX.activity) }];
    })
  ) as Record<PhaseId, LessonPhase>;
  const types = new Set(QUESTION_TYPES.map((t) => t.id));
  const questions = (Array.isArray(src.questions) ? src.questions : []).slice(0, LIMITS.questions).map((x) => {
    const q = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
    const opts = Array.isArray(q.options) ? q.options : [];
    return {
      type: types.has(q.type as QuestionType) ? (q.type as QuestionType) : 'short',
      text: str(q.text, MAX.question),
      options: [0, 1, 2, 3].map((i) => str(opts[i], MAX.option)),
      answer: str(q.answer, MAX.answer),
    };
  });
  const date = str(src.date, 10);
  return {
    className: str(src.className, MAX.className),
    subject: str(src.subject, MAX.subject),
    topic: str(src.topic, MAX.topic),
    date: parseIsoDate(date) ? date : '',
    period: str(src.period, 3) || base.period,
    objectives: objectives.length ? objectives : base.objectives,
    materials: str(src.materials, MAX.materials),
    phases,
    homework: str(src.homework, MAX.homework),
    questions: questions.length ? questions : base.questions,
  };
}
