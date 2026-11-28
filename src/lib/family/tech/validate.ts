// What a Tech Lab lesson's pictures and teaching layer may be (C557), and how far a lesson meets the teaching standard.
// Used by the course importer (scripts/import_tech_course.ts), the tests and the coverage report.

import type { TechLesson } from './types';

// Picture kinds SeeVisual draws as a picture of their own.
export const DRAWN_KINDS = ['scene', 'flow', 'cycle', 'stack', 'tokens', 'compare', 'bits', 'icon', 'diagram'] as const;
// Kinds with an explicit, honest stand-in: a lab step shows a card that opens that lab; a code step shows the rule or
// formula in code type; an animation that has not been drawn yet shows the step's own key idea and its terms, marked as
// such (never an unrelated picture).
export const STAND_IN_KINDS = ['lab', 'code', 'anim'] as const;

export type VisualKind = (typeof DRAWN_KINDS)[number] | (typeof STAND_IN_KINDS)[number];

export function visualKind(spec: unknown, hasDiagram = false): VisualKind | null {
  if (hasDiagram) return 'diagram';
  const text = String(spec ?? '').trim();
  if (text === 'code') return 'code';
  const colon = text.indexOf(':');
  const kind = colon < 0 ? text : text.slice(0, colon);
  return (DRAWN_KINDS as readonly string[]).includes(kind) || (STAND_IN_KINDS as readonly string[]).includes(kind) ? (kind as VisualKind) : null;
}

const filled = (value: unknown) => {
  if (typeof value === 'string') return value.trim().length > 0;
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return ['en', 'hi', 'hinglish'].every((lang) => typeof row[lang] === 'string' && (row[lang] as string).trim().length > 0);
};

// Problems that would show a child something wrong or nothing: every picture kind known, the teaching layer complete in
// the three languages, and a diagram's beats pointing at parts it has.
export function lessonProblems(lesson: TechLesson): string[] {
  const out: string[] = [];
  (lesson.see ?? []).forEach((step, index) => {
    const at = `${lesson.id} see ${index + 1}`;
    if (!visualKind(step.visual, !!step.diagram)) out.push(`${at}: picture kind "${String(step.visual ?? '')}" has no renderer`);
    const parts = new Set((step.diagram?.parts ?? []).map((part) => part.id));
    for (const row of step.diagram?.rows ?? []) for (const id of row) if (!parts.has(id)) out.push(`${at}: diagram row names unknown part "${id}"`);
    for (const link of step.diagram?.links ?? []) if (!parts.has(link.from) || !parts.has(link.to)) out.push(`${at}: diagram link names an unknown part`);
    (step.beats ?? []).forEach((beat, b) => {
      if (!filled(beat.narration)) out.push(`${at} beat ${b + 1}: narration missing in a language`);
      if (beat.focus && !parts.has(beat.focus)) out.push(`${at} beat ${b + 1}: focus "${beat.focus}" is not a part of the diagram`);
      for (const id of Object.keys(beat.values ?? {})) if (!parts.has(id)) out.push(`${at} beat ${b + 1}: value for unknown part "${id}"`);
    });
  });
  if (lesson.hook && !(filled(lesson.hook.text) && filled(lesson.hook.question))) out.push(`${lesson.id}: hook incomplete in a language`);
  if (lesson.predict) {
    const p = lesson.predict;
    if (!filled(p.prompt) || !filled(p.explain) || !p.options?.length || !p.options.every(filled)) out.push(`${lesson.id}: predict incomplete in a language`);
    if (!Number.isInteger(p.answer) || p.answer < 0 || p.answer >= (p.options?.length ?? 0)) out.push(`${lesson.id}: predict answer out of range`);
  }
  if (lesson.teachBack && !(filled(lesson.teachBack.prompt) && lesson.teachBack.checklist?.length && lesson.teachBack.checklist.every(filled))) out.push(`${lesson.id}: teach-back incomplete in a language`);
  return out;
}

// ---- the teaching standard (stage E): what a reviewer can check from the file ------------------------------------------
export type LessonGrade = 'meets' | 'minor' | 'restructure';
export type LessonAudit = {
  id: string;
  grade: LessonGrade;
  hook: boolean; // a lesson-specific real-life opening and question
  predict: boolean; // a prediction before the explanation
  teachBack: boolean; // the child explains it in their own words
  pictures: number; // See steps
  drawn: number; // See steps drawn as a picture of their own
  standIns: number; // See steps with an honest stand-in (lab card, code, key idea)
  beats: boolean; // narration tied to the part of the picture being explained
  understand: number; // Understand cards
  questions: number; // Karo questions
  questionKinds: number; // different question types (more than recall)
  lab: boolean; // a hands-on lab
  gaps: string[];
};

export function auditLesson(lesson: TechLesson): LessonAudit {
  const see = lesson.see ?? [];
  const kinds = see.map((step) => visualKind(step.visual, !!step.diagram));
  const drawn = kinds.filter((kind) => kind && (DRAWN_KINDS as readonly string[]).includes(kind)).length;
  const standIns = kinds.filter((kind) => kind && (STAND_IN_KINDS as readonly string[]).includes(kind)).length;
  const questions = lesson.try?.questions ?? [];
  const questionKinds = new Set(questions.map((q) => q.type)).size;
  const gaps: string[] = [];
  if (!lesson.hook) gaps.push('no lesson-specific opening');
  if (!lesson.predict) gaps.push('no prediction');
  if (!lesson.teachBack) gaps.push('no teach-back');
  if (see.length && drawn < see.length) gaps.push(`${see.length - drawn} of ${see.length} pictures not drawn`);
  if ((lesson.understand ?? []).length < 2) gaps.push('one Understand card');
  if (questionKinds < 2) gaps.push('one question type');
  if (!lesson.play?.lab) gaps.push('no lab');
  const core = !!lesson.hook && !!lesson.predict && !!lesson.teachBack && drawn === see.length;
  const grade: LessonGrade = core ? 'meets' : drawn === see.length || gaps.length <= 3 ? 'minor' : 'restructure';
  return {
    id: lesson.id,
    grade,
    hook: !!lesson.hook,
    predict: !!lesson.predict,
    teachBack: !!lesson.teachBack,
    pictures: see.length,
    drawn,
    standIns,
    beats: see.some((step) => (step.beats ?? []).some((beat) => !!beat.focus)),
    understand: (lesson.understand ?? []).length,
    questions: questions.length,
    questionKinds,
    lab: !!lesson.play?.lab,
    gaps,
  };
}
