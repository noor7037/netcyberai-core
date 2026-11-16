// Prompt v17 of the family.resolver profile (C521): v16, word for word, with two changes.
//   1. A question from a PHOTO of the child's page (the attached files' reading names a "[File N, photo]", and it is not
//      a sketch): the answer names the exact question it answers (one question, the one the child points to, else the
//      first), shows its meaning in ONE visual chosen by what it means (the board for a shape, a chart for data, steps
//      or a scene for a process, a photo for a real thing or colours, a 3D model only for an organ we have a model
//      file for), and teaches in four parts: the answer, why, a worked example, a check. Classes 3 and up: the plan's
//      own visual blocks give way to that one visual, and a worked example joins the plan. The youngest (LKG to Class 2)
//      keep v15's board, explanation and check.
//   2. The answer's LANGUAGE follows the language the question was asked in (src/lib/family/question-language.ts sets
//      `replyLang`), with the child's mother tongue (`motherTongue`, the parent's word-help language for the child):
//      an English question is answered in English with the key words and one short line in the mother tongue; a
//      question in Hindi, Tamil, Punjabi or another Indian language mostly in that language and script, with the key
//      English words taught beside their own words; Hinglish in easy Roman Hinglish. Without `replyLang` the style
//      setting stands, as in v16.
// The Family app is a bounded module, so the language names are repeated here (test/family/c521-tutor-v17.test.ts keeps
// them equal to src/lib/family/languages.ts). v16 is untouched; Control chooses v17 by name.

import { CHART_LINE, IMAGE_LINE, planOf, SCENE_LINE, STEPS_LINE, type ResolverAsk } from './v8';
import { MODEL_CATALOGUE, modelLines } from './v11';
import { MIDDLE_BOARD_FIRST } from './v15';
import { QUICK_ANSWER_LINE, resolverSystem as v16System, resolverUser as v16User } from './v16';
import { isYoungVisual, type Plan, type PlannedBlock } from '@/lib/ai/teaching/plan-shape';

export const RESOLVER_PROMPT_VERSION = 'v17';
export type { ResolverAsk };

// ---- 1. a question from a photo -------------------------------------------------------------------------------------

// How the tutor route marks a photo's reading inside the question (src/lib/family/tutor-read.ts attachedText).
const PHOTO_MARK = /\[File \d+, photo\]/;
export const isPhotoQuestion = (a: Pick<ResolverAsk, 'question' | 'sketch'>): boolean => a.sketch !== true && !!a.question && PHOTO_MARK.test(a.question);

// The organs with a 3D model file (public/models/*.glb); test/family/c521-tutor-v17.test.ts keeps the two equal.
export const MODEL_FILES = ['brain', 'digestive', 'excretory', 'eye', 'heart', 'lungs'] as const;

// The plan's own visual blocks, which give way to the one visual a photo question is shown with.
const PLAN_VISUALS: readonly PlannedBlock[] = ['figure', 'steps', 'timeline', 'image', 'scene', 'chart', 'diagram', 'mind_map'];

// Classes 3 and up: no planned visual (the photo rule picks one) and a worked example right after the explanation.
export function photoPlan(plan: Plan): Plan {
  const blocks = plan.blocks.filter((b) => !PLAN_VISUALS.includes(b));
  if (!blocks.includes('worked_example')) blocks.splice(blocks.indexOf('explanation') + 1, 0, 'worked_example');
  return { ...plan, blocks, visuals: [] };
}

export const PHOTO_LINE =
  'PHOTO QUESTION: the question comes from a photo of the student\'s page (its words are given after "The student attached files"). Answer ONE question: the one the student\'s own words point to; if they do not say and the page has several, the first one. Never answer a different one.';

// v16's quick answer, with the question named first.
export const QUICK_ANSWER_PHOTO_LINE = QUICK_ANSWER_LINE.replace(
  '"points":["the direct answer',
  '"points":["the question you answer, in its words on the page, with its number if it has one (Q3: ...)","the direct answer'
);

export const YOUNG_PHOTO_LINES = [
  'Name the question first: the first board step\'s "say" says which question it is in a few spoken words ("Question 2: how many sides has a triangle?"), then the board shows the answer. The explanation says the answer and why; the check is a quick self-test.',
  `For a real thing or for colours, you may add one photo after the board: ${IMAGE_LINE}, query naming the thing and its colour (the board's four colours are not real colours).`,
];

const modelText = (a: ResolverAsk): string => {
  if (modelLines(a).length > 0) return `a body organ, only ${MODEL_FILES.join(', ')} → the model block above; `;
  if (a.subject !== 'evs') return '';
  return `a body organ → {"type":"model","title":"≤60","model":"<key>","focus":["<part>",...],"caption":"≤160"}, only for: ${MODEL_FILES.map((k) => `${k} (${MODEL_CATALOGUE[k].join(', ')})`).join('; ')}; `;
};

export function showItLine(a: ResolverAsk, middle: boolean): string {
  const where = middle ? 'right after the quick answer, before the explanation' : 'right after the explanation';
  return `SHOW IT: write exactly ONE visual block (the board counts as one; it is allowed besides the blocks listed above), ${where}, chosen by what the question means: a shape (its sides, angles, area or perimeter) → the board, drawing that real shape with its measures labelled; numbers or data to compare → ${CHART_LINE} (only numbers on the page or stated in the answer); a process or stages in order → ${STEPS_LINE} with 3 to 5 items; a thing whose parts work together → ${SCENE_LINE} with its real parts, colour 1 to 8 by part; a real object, animal, plant or place, or colours → a photo ${IMAGE_LINE} whose query names the thing and its colour; ${modelText(a)}nothing that can be shown (a grammar rule) → none.`;
}

export const elaborationLine = (middle: boolean): string =>
  `Teach it in four parts: the ANSWER (the quick answer), WHY (the explanation: the reason or rule behind it), a WORKED EXAMPLE (a question like it solved step by step, or one more real case worked through${middle ? '; 2 or 3 short steps' : ''}) and a CHECK (a quick question the student answers to test themselves).`;

// ---- 2. the language of the question --------------------------------------------------------------------------------

export const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  hi: 'Hindi',
  bn: 'Bengali',
  te: 'Telugu',
  mr: 'Marathi',
  ta: 'Tamil',
  ur: 'Urdu',
  gu: 'Gujarati',
  kn: 'Kannada',
  ml: 'Malayalam',
  or: 'Odia',
  pa: 'Punjabi',
  as: 'Assamese',
};

export const SAME_LANGUAGE_LINE =
  'Every text of every block (titles, the board\'s "say" lines, labels, the check and its options) is in that language, as it is read aloud; numbers and maths stay in standard digits and signs (1, 2, 3, +, =, cm).';

// The words after "Explain in" on the first line, for the language the question was asked in; null: v16's style stands.
export function languageRule(a: Pick<ResolverAsk, 'replyLang' | 'motherTongue'>): string | null {
  const lang = a.replyLang;
  if (lang === 'hinglish')
    return 'easy Hinglish (everyday Hindi in Roman letters), because the student asked that way: keep the key English school words and say in Hinglish what each one means.';
  if (!lang || !LANGUAGE_NAMES[lang]) return null;
  if (lang === 'en') {
    const mt = a.motherTongue && a.motherTongue !== 'en' ? LANGUAGE_NAMES[a.motherTongue] : undefined;
    return `simple English, because the student asked in English.${mt ? ` Help in ${mt} too: give the one or two key English words in ${mt} as well, and end the explanation with one short sentence in ${mt}, in its own script.` : ''}`;
  }
  const name = LANGUAGE_NAMES[lang];
  return `simple ${name}, mostly, in ${name} script, because the student asked in ${name}: keep the key English school words and teach each one beside its ${name} word (the English word and what it means), so the student grows at ease with English.`;
}

export function withLanguage(base: string, rule: string): string {
  const nl = base.indexOf('\n');
  const first = nl < 0 ? base : base.slice(0, nl);
  const at = first.indexOf(' Explain in ');
  if (at < 0) return base;
  return `${first.slice(0, at)} Explain in ${rule}\n${SAME_LANGUAGE_LINE}${nl < 0 ? '' : base.slice(nl)}`;
}

// ---- the prompt -------------------------------------------------------------------------------------------------------

// v9's board line places the board after the explanation; Classes 3 to 5 place it where SHOW IT says.
export const BOARD_AFTER_EXPLANATION = 'also write ONE board block, right after the explanation,';

const beforeRules = (base: string, lines: readonly string[]): string => {
  if (lines.length === 0) return base;
  const at = base.indexOf('\nRules: ');
  const add = lines.join('\n');
  return at < 0 ? `${base}\n${add}` : `${base.slice(0, at)}\n${add}${base.slice(at)}`;
};

export function resolverSystem(a: ResolverAsk): string {
  const photo = isPhotoQuestion(a);
  const young = isYoungVisual(a.classLevel, true);
  const middle = !young && a.classLevel <= 5;
  let base = v16System(photo && !young ? { ...a, plan: photoPlan(planOf(a)) } : a);
  if (photo) {
    if (young) base = beforeRules(base, [PHOTO_LINE, ...YOUNG_PHOTO_LINES]);
    else {
      base = base.replace(QUICK_ANSWER_LINE, QUICK_ANSWER_PHOTO_LINE).replace(`\n${MIDDLE_BOARD_FIRST.known}`, '').replace(`\n${MIDDLE_BOARD_FIRST.named}`, '');
      // Classes 3 to 5 show the visual before the explanation, so the board is placed where SHOW IT says.
      if (middle) base = base.replace(BOARD_AFTER_EXPLANATION, 'also write ONE board block, where SHOW IT below says,');
      base = beforeRules(base, [PHOTO_LINE, showItLine(a, middle), elaborationLine(middle)]);
    }
  }
  const rule = languageRule(a);
  return rule ? withLanguage(base, rule) : base;
}

export const resolverUser = v16User;
