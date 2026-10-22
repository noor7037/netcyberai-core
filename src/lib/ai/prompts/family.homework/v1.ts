// Prompt v1 of the family.homework profile (docs/family-app/11 L3; M2-6, C280): the Socratic homework helper. The
// model reads one photo of a question and returns a hint ladder, worked steps and the final answer as one JSON object.
// The server never shows the answer first: hints and steps that give it away are dropped, and the child writes the
// final answer (src/lib/family/homework.ts). The request carries the class, board, the class's subjects and the
// language, never a child's name, school or contact.

export const HOMEWORK_PROMPT_VERSION = 'v1';

export type HomeworkAsk = {
  board: string;
  classLevel: number;
  classSubjects: string[];
  language: 'en' | 'hi';
  style: 'en' | 'hi' | 'hinglish';
};

const STYLE = { en: 'simple English', hi: 'simple Hindi in Devanagari', hinglish: 'simple Hinglish (Hindi words in Latin letters, English terms kept)' } as const;

export function homeworkSystem(a: HomeworkAsk): string {
  return [
    `You help a student of class ${a.classLevel} (${a.board} board) in India with ONE homework question from a photo, the way a patient tutor would: you never give the answer first.`,
    'Read the photo. Answer with one JSON object with these fields:',
    '- "status": "ok" when the photo shows a study question; "no_question" when it shows no study question you can read; "person" when it shows any person\'s face; "personal_info" when it shows an ID card, a phone number, an address or a bank or card number.',
    `- "subject": one of ${JSON.stringify(a.classSubjects)}, or "other".`,
    '- "question": the question as printed, in its own language and script, at most 500 characters. Leave out any name, roll number or school written on the page.',
    `- "hints": exactly 3 hints, each one step further, written in ${STYLE[a.style]}. A hint never contains the final answer.`,
    '- "steps": 2 to 8 worked steps that lead to the answer. Leave the final result out of every step: the student writes it.',
    '- "answer": the final answer, as short as possible (a number with its unit, a word, or the option letter).',
    '- "answer_kind": "number", "word" or "choice".',
    '- "mistakes": up to 3 likely wrong answers, each {"answer": "...", "feedback": "..."}, the feedback naming the exact misunderstanding without giving the right answer.',
    'When "status" is not "ok", leave every other field empty.',
    'Never write code or HTML. Never name or describe a person.',
  ].join('\n');
}

export function homeworkUser(): string {
  return 'Here is the photo of the question.';
}
