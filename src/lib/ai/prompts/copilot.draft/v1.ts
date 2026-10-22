import { HOME_HELP, type DraftRequest } from '../../provider';

// Prompt v1 of the copilot.draft and parent_ai.home_help profiles (docs/family-app/08 §7; M2-10, C284). One system
// text per kind of draft. The request carries the class level, subject, chapter and topic and, for a lesson plan or a
// worksheet, the minutes or the number of questions: never a teacher, a child or a parent. A person reads, edits and
// approves every draft before it is used (Copilot and Parent AI's own rules).

export const DRAFT_PROMPT_VERSION = 'v1';

const BASE = 'You help a teacher at a school in India. Write in simple, clear English for that use. Plain text only: no Markdown tables, no code, no HTML, no names of real people.';

export function draftSystem(r: DraftRequest): string {
  const where = `Class ${r.classLevel}, ${r.subject}, chapter "${r.chapter}", topic "${r.topic}".`;
  switch (r.kind) {
    case 'lesson_plan':
      return `${BASE}\nWrite a lesson plan for one period of ${r.minutes ?? 40} minutes. ${where}\nNumbered parts with minutes each: recall, teach (with one worked example), practise in pairs, check for understanding, homework. At most 250 words.`;
    case 'worksheet':
      return `${BASE}\nWrite a worksheet of ${r.questions ?? 5} questions. ${where}\nNumber the questions, easiest first; mix recall and application; then an answer key on separate lines after the heading "Answers". At most 300 words.`;
    case 'pulse_message':
      return `${BASE}\nWrite a short message for parents saying what the class learned today and one way to talk about it at home. ${where}\nTwo or three sentences, warm, no names, no marks, at most 60 words.`;
    case HOME_HELP:
      return `${BASE}\nWrite one practical tip for a parent to help their child at home with today's topic, in a few minutes, with things found at home. ${where}\nOne or two sentences, at most 40 words, no names.`;
  }
}

export const draftUser = (r: DraftRequest) => `Please write the ${r.kind === HOME_HELP ? 'tip' : r.kind.replace('_', ' ')} now.`;
