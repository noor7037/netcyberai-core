// Server scoring for a Tech Lab check. The phone never receives answer or explain until it has answered.

import { pick, type TechLang } from './text';
import type { TechLesson, TechQuestion } from './types';

export const PASS_PERCENT = 60;

export function norm(value: string): string {
  return value.toLowerCase().normalize('NFC').replace(/[\s.,!?'"]+/g, ' ').trim();
}

export type MatchSpec = { lefts: unknown[]; rights: unknown[]; key: number[] };

// Match questions were written in three shapes. All become lefts, rights, and the right-hand index for each left.
export function matchSpec(question: TechQuestion): MatchSpec | null {
  const options = question.options;
  const answer = question.answer;
  if (options && !Array.isArray(options) && typeof options === 'object' && Array.isArray((options as { left?: unknown }).left)) {
    const row = options as { left: unknown[]; right?: unknown[] };
    const lefts = row.left;
    const rights = row.right ?? [];
    const pairs = Array.isArray(answer) ? answer : [];
    const key = lefts.map((_, index) => {
      const pair = pairs.find((item) => Array.isArray(item) && item[0] === index);
      if (Array.isArray(pair) && Number.isInteger(pair[1])) return pair[1] as number;
      return Array.isArray(answer) && Number.isInteger(answer[index]) ? (answer[index] as number) : index;
    });
    return { lefts, rights, key };
  }
  if (Array.isArray(options) && options.length && options[0] && typeof options[0] === 'object' && options[0] !== null && 'left' in (options[0] as object)) {
    const pairs = options as { left: unknown; right: unknown }[];
    const key = Array.isArray(answer) && answer.every((item) => Number.isInteger(item)) ? (answer as number[]) : pairs.map((_, index) => index);
    return { lefts: pairs.map((pair) => pair.left), rights: pairs.map((pair) => pair.right), key };
  }
  if (Array.isArray(options) && Array.isArray(answer) && answer.length === options.length && !answer.some((item) => Array.isArray(item))) {
    return { lefts: options, rights: answer, key: options.map((_, index) => index) };
  }
  return null;
}

export function shortAccept(answer: unknown): unknown[] {
  if (Array.isArray(answer)) return answer;
  if (answer && typeof answer === 'object' && Array.isArray((answer as { accept?: unknown }).accept)) return (answer as { accept: unknown[] }).accept;
  return [answer];
}

function sameNumbers(left: unknown, right: unknown): boolean {
  return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((item, index) => item === right[index]);
}

export type LabEvent = Record<string, unknown> & { _done?: boolean };

const LAB_DONE = (message: Record<string, unknown>) =>
  (message.source === 'nca-techlab' && (message.type === 'done' || message.type === 'mission:complete')) ||
  (message.source === 'nca-labs' && message.type === 'done') ||
  message.type === 'techlab:lab-complete';

// The three lab kits post different shapes. Flatten them the way the prototype player does.
export function flatLab(message: Record<string, unknown>, lessonLab?: string): LabEvent {
  const data = message.data && typeof message.data === 'object' && !Array.isArray(message.data) ? (message.data as Record<string, unknown>) : {};
  const result = message.result && typeof message.result === 'object' && !Array.isArray(message.result) ? (message.result as Record<string, unknown>) : {};
  return {
    lab: (message.lab as string | undefined) || lessonLab,
    event: message.event || (message.type === 'techlab:lab-complete' ? 'complete' : message.source === 'nca-techlab' ? message.type : undefined),
    mode: message.mode ?? data.mode ?? result.mode,
    ...data,
    ...result,
    _done: LAB_DONE(message),
  };
}

export function labMatches(answer: unknown, event: LabEvent): boolean {
  if (!answer || typeof answer !== 'object' || Array.isArray(answer)) return event._done === true;
  for (const [key, value] of Object.entries(answer as Record<string, unknown>)) {
    if (typeof value === 'boolean') continue;
    if (event[key] === undefined) {
      if (key === 'lab' || key === 'event' || key === 'mode') return false;
      continue;
    }
    if (typeof value !== 'object' && String(event[key]) !== String(value)) return false;
  }
  return true;
}

function shortRight(answer: unknown, given: string): boolean {
  const wanted = norm(given);
  if (!wanted) return false;
  return shortAccept(answer).some((item) => {
    if (item && typeof item === 'object') {
      return Object.values(item as Record<string, unknown>).some((value) => typeof value === 'string' && norm(value) === wanted);
    }
    return norm(String(item ?? '')) === wanted;
  });
}

export function isRight(question: TechQuestion, given: unknown, events: readonly LabEvent[] = []): boolean {
  if (question.type === 'lab-check') return events.some((event) => labMatches(question.answer, event));
  if (given == null || given === '') return false;
  switch (question.type) {
    case 'multi':
      return Array.isArray(question.answer) && Array.isArray(given) && question.answer.length === given.length && question.answer.every((item) => (given as unknown[]).includes(item));
    case 'order':
      return sameNumbers(given, Array.isArray(question.answer) ? question.answer : []);
    case 'match': {
      const spec = matchSpec(question);
      return !!spec && sameNumbers(given, spec.key);
    }
    case 'short':
      return typeof given === 'string' && shortRight(question.answer, given);
    default:
      return Number(given) === Number(question.answer);
  }
}

// What the phone may show after the child has answered: which choice was right, never the accepted typed strings.
export function reveal(question: TechQuestion): unknown {
  if (question.type === 'mcq') return question.answer;
  if (question.type === 'multi' || question.type === 'order') return question.answer;
  if (question.type === 'match') return matchSpec(question)?.key ?? null;
  return null;
}

export function outcome(right: number, total: number, xpFull: number, prevXp = 0, pass = PASS_PERCENT): { passed: boolean; share: number; stars: 0 | 1 | 2 | 3; xp: number; gain: number } {
  const share = total > 0 ? right / total : 1;
  if (share + 1e-9 < pass / 100) return { passed: false, share, stars: 0, xp: 0, gain: 0 };
  const stars: 1 | 2 | 3 = share >= 0.95 ? 3 : share >= 0.8 ? 2 : 1;
  const xp = Math.round((Number(xpFull) || 20) * (0.5 + 0.5 * share));
  return { passed: true, share, stars, xp, gain: Math.max(0, xp - prevXp) };
}

export function questionsOf(lesson: TechLesson): TechQuestion[] {
  return (lesson.try?.questions ?? []).filter((question) => question && typeof question.id === 'string');
}

export function scoreAll(lesson: TechLesson, answers: Record<string, unknown>, events: readonly LabEvent[], lang: TechLang, prevXp = 0, pass = PASS_PERCENT) {
  const questions = questionsOf(lesson);
  const scored = questions.map((question) => ({
    id: question.id,
    right: isRight(question, answers[question.id], events),
    explain: pick(lang, question.explain),
    mark: reveal(question),
  }));
  const right = scored.filter((item) => item.right).length;
  return { questions: scored, right, total: questions.length, ...outcome(right, questions.length, lesson.xp, prevXp, pass) };
}

// A copy of the lesson with every answer and explanation removed.
// Match questions whose right-hand texts were stored as the answer are rewritten to {left, right} first,
// so the child can see both columns. The pairing (the key) is deleted with the answer.
export function forChild<T>(lesson: T): T {
  const copy = JSON.parse(JSON.stringify(lesson)) as T & { try?: { questions?: TechQuestion[] } };
  for (const question of copy.try?.questions ?? []) {
    if (question.type === 'match') {
      const spec = matchSpec(question);
      if (spec) question.options = { left: spec.lefts, right: spec.rights };
    }
    delete question.answer;
    delete question.explain;
  }
  return copy;
}

export function levelOfClass(classLevel: number): 1 | 2 | 3 {
  if (classLevel <= 5) return 1;
  if (classLevel <= 8) return 2;
  return 3;
}
