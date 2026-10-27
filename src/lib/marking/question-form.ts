import { MAX_QUESTIONS, QUESTION_KINDS, SECTION_PATTERN, type CorrectAnswer, type Difficulty, type MarkingQuestion, type QuestionKind, type QuestionOption, type SaveSetupInput, type StructureProblem } from '@/lib/contracts/marking';
import { cleanCorrect, cleanOptions } from './answers';
import { structureProblems } from './rollup';

// The questions editor's side (C347): a question as the teacher types it (every number is text until it is sent), the
// same checks the server makes so a mistake is named at once, and the structure problems as the totals change. Pure
// and free of the server's code, so it is safe in the browser and tested (test/marking/teacher-view.test.ts). The
// server checks everything again.

export type StepForm = { step: string; marks: string };
export type QuestionForm = {
  key: string; // this screen's own handle for the row; never sent
  label: string;
  component: string;
  maxMarks: string;
  choiceGroup: string;
  unitId: string;
  kind: QuestionKind;
  prompt: string;
  answerKey: string;
  steps: StepForm[];
  // A choice question's options and the correct answer rules mark by (docs/36, C361), its difficulty and printed
  // section: kept as they are by a screen that does not edit them.
  options: QuestionOption[];
  correct: CorrectAnswer | null;
  difficulty: Difficulty | null;
  section: string;
};

export const LABEL_PATTERN = /^[0-9A-Za-z][0-9A-Za-z().-]{0,11}$/;
export const GROUP_PATTERN = /^[A-Z]{1,2}$/;
const PROMPT_MAX = 4000;
const KEY_MAX = 8000;
const STEP_MAX = 300;
const STEPS_MAX = 12;

let counter = 0;
const fresh = () => `q${Date.now().toString(36)}${(counter += 1)}`;

const text = (n: number) => String(n);
export const toNumber = (s: string): number => Number(s.trim().replace(',', '.'));
const oneDecimal = (n: number) => Math.round(n * 10) === n * 10;

export function formFromQuestion(q: MarkingQuestion): QuestionForm {
  return {
    key: q.questionId,
    label: q.label,
    component: q.component,
    maxMarks: text(q.maxMarks),
    choiceGroup: q.choiceGroup ?? '',
    unitId: q.unitId ?? '',
    kind: q.kind,
    prompt: q.prompt,
    answerKey: q.answerKey,
    steps: q.steps.map((s) => ({ step: s.step, marks: text(s.marks) })),
    options: q.options.map((o) => ({ ...o })),
    correct: q.correct,
    difficulty: q.difficulty,
    section: q.section ?? '',
  };
}

// "6(b)" is followed by "7", "Q3" by "Q4"; the number in the label counts up, a label without one gets "1".
export function nextLabel(labels: readonly string[]): string {
  const last = labels[labels.length - 1];
  if (!last) return '1';
  // A sub-part "6(b)" or "6.2" counts on the question's own number.
  const m = /^(\D*)(\d+)/.exec(last);
  return m ? `${m[1]}${Number(m[2]) + 1}` : '1';
}

export function newQuestion(forms: readonly QuestionForm[], parts: readonly string[]): QuestionForm {
  const prev = forms[forms.length - 1];
  return {
    key: fresh(),
    label: nextLabel(forms.map((f) => f.label)),
    component: prev?.component ?? parts[0] ?? '',
    maxMarks: '',
    choiceGroup: '',
    unitId: prev?.unitId ?? '',
    kind: prev?.kind ?? 'short',
    prompt: '',
    answerKey: '',
    steps: [],
    options: [],
    correct: null,
    difficulty: null,
    section: prev?.section ?? '',
  };
}

export function move<T>(list: readonly T[], from: number, by: -1 | 1): T[] {
  const to = from + by;
  if (to < 0 || to >= list.length) return [...list];
  const out = [...list];
  [out[from], out[to]] = [out[to], out[from]];
  return out;
}

export function groupsOf(forms: readonly QuestionForm[]): string[] {
  return [...new Set(forms.map((f) => f.choiceGroup.trim().toUpperCase()).filter(Boolean))].sort();
}

// Which field of which question is wrong (the first one), as the server would say it.
export type FormProblem = { at: number; field: 'label' | 'component' | 'maxMarks' | 'choiceGroup' | 'kind' | 'prompt' | 'answerKey' | 'steps' | 'twice' | 'options' | 'correct' | 'section' } | { at: -1; field: 'too_many' | 'group_count' };

export function firstProblem(forms: readonly QuestionForm[], parts: readonly string[], counts: Readonly<Record<string, string>>): FormProblem | null {
  if (forms.length > MAX_QUESTIONS) return { at: -1, field: 'too_many' };
  const seen = new Set<string>();
  for (let i = 0; i < forms.length; i++) {
    const f = forms[i];
    const label = f.label.trim();
    if (!LABEL_PATTERN.test(label)) return { at: i, field: 'label' };
    if (seen.has(label.toLowerCase())) return { at: i, field: 'twice' };
    seen.add(label.toLowerCase());
    if (!parts.includes(f.component)) return { at: i, field: 'component' };
    const max = toNumber(f.maxMarks);
    if (f.maxMarks.trim() === '' || !Number.isFinite(max) || max <= 0 || max > 100 || !oneDecimal(max)) return { at: i, field: 'maxMarks' };
    const group = f.choiceGroup.trim().toUpperCase();
    if (group && !GROUP_PATTERN.test(group)) return { at: i, field: 'choiceGroup' };
    if (!(QUESTION_KINDS as readonly string[]).includes(f.kind)) return { at: i, field: 'kind' };
    if (f.prompt.trim().length > PROMPT_MAX) return { at: i, field: 'prompt' };
    if (f.answerKey.trim().length > KEY_MAX) return { at: i, field: 'answerKey' };
    if (f.steps.length > STEPS_MAX) return { at: i, field: 'steps' };
    let given = 0;
    for (const s of f.steps) {
      const marks = toNumber(s.marks);
      if (!s.step.trim() || s.step.trim().length > STEP_MAX || s.marks.trim() === '' || !Number.isFinite(marks) || marks <= 0 || !oneDecimal(marks)) return { at: i, field: 'steps' };
      given += marks;
    }
    if (given > max + 1e-9) return { at: i, field: 'steps' };
    const options = cleanOptions(f.options, f.kind);
    if (!options.ok) return { at: i, field: 'options' };
    if (!cleanCorrect(f.correct, f.kind, options.options).ok) return { at: i, field: 'correct' };
    if (f.section.trim() && !SECTION_PATTERN.test(f.section.trim().toUpperCase())) return { at: i, field: 'section' };
  }
  for (const g of groupsOf(forms)) {
    const n = toNumber(counts[g] ?? '');
    if (!Number.isInteger(n) || n < 1) return { at: -1, field: 'group_count' };
  }
  return null;
}

// The numbers a screen shows while the teacher types: the structure of the paper as it would be saved. A mark not yet
// typed counts as nothing.
export function problemsOf(forms: readonly QuestionForm[], components: readonly { key: string; name: string; max: number }[], counts: Readonly<Record<string, string>>): StructureProblem[] {
  const questions = forms.map((f) => ({ questionId: f.key, component: f.component, maxMarks: Number.isFinite(toNumber(f.maxMarks)) ? toNumber(f.maxMarks) : 0, choiceGroup: f.choiceGroup.trim().toUpperCase() || null }));
  const numeric: Record<string, number> = {};
  for (const g of groupsOf(forms)) {
    const n = toNumber(counts[g] ?? '');
    if (Number.isFinite(n)) numeric[g] = n;
  }
  return structureProblems(components, questions, numeric);
}

// The parts of the paper that no question counts to: their marks are typed by hand.
export function partsWithoutQuestions(forms: readonly QuestionForm[], components: readonly { key: string; name: string }[]): { key: string; name: string }[] {
  return components.filter((c) => !forms.some((f) => f.component === c.key));
}

export function toSaveBody(forms: readonly QuestionForm[], counts: Readonly<Record<string, string>>, setup: { language: SaveSetupInput['setup']['language']; guidance: string; wrongMarks?: number }): SaveSetupInput {
  const groups = groupsOf(forms);
  return {
    setup: { language: setup.language, guidance: setup.guidance, choiceCounts: Object.fromEntries(groups.map((g) => [g, toNumber(counts[g] ?? '')])), ...(setup.wrongMarks === undefined ? {} : { wrongMarks: setup.wrongMarks }) },
    questions: forms.map((f, i) => ({
      position: i + 1,
      label: f.label.trim(),
      component: f.component,
      maxMarks: toNumber(f.maxMarks),
      choiceGroup: f.choiceGroup.trim().toUpperCase() || null,
      unitId: f.unitId || null,
      kind: f.kind,
      prompt: f.prompt.trim(),
      answerKey: f.answerKey.trim(),
      steps: f.steps.map((s) => ({ step: s.step.trim(), marks: toNumber(s.marks) })),
      options: f.options.map((o) => ({ key: o.key, text: o.text.trim() })),
      correct: f.correct,
      difficulty: f.difficulty,
      section: f.section.trim().toUpperCase() || null,
    })),
  };
}

// Whether what is on the screen differs from what is saved (the forms against the saved questions and counts).
export function sameAsSaved(forms: readonly QuestionForm[], counts: Readonly<Record<string, string>>, saved: { questions: readonly MarkingQuestion[]; choiceCounts: Readonly<Record<string, number>> }, setup: { language: string; guidance: string }, savedSetup: { language: string; guidance: string }): boolean {
  if (setup.language !== savedSetup.language || setup.guidance.trim() !== savedSetup.guidance.trim()) return false;
  if (forms.length !== saved.questions.length) return false;
  const a = JSON.stringify(forms.map(({ key: _key, ...rest }) => ({ ...rest, label: rest.label.trim(), prompt: rest.prompt.trim(), answerKey: rest.answerKey.trim(), choiceGroup: rest.choiceGroup.trim().toUpperCase(), section: rest.section.trim().toUpperCase(), options: rest.options.map((o) => ({ key: o.key, text: o.text.trim() })) })));
  const b = JSON.stringify(saved.questions.map((q) => {
    const { key: _key, ...rest } = formFromQuestion(q);
    return rest;
  }));
  if (a !== b) return false;
  const groups = groupsOf(forms);
  return groups.every((g) => toNumber(counts[g] ?? '') === (saved.choiceCounts[g] ?? NaN)) && Object.keys(saved.choiceCounts).every((g) => groups.includes(g));
}
