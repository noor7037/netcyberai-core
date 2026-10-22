// Prompt v5 of the family.resolver profile (W2, C323): v3's rules with the blocks reordered for open models.
//
// Measured before it (Llama 4 Scout on Workers AI, the demo's Class 6 Science, 2026-10-22): with v1's order the model
// wrote an explanation, a diagram, key points and a worked example, then stopped by itself ("stop", not the token
// limit) before the check and practice questions every answer must have. So in v5:
//   - the three required blocks come FIRST, in a fixed order (explanation, check, practice), named as required;
//   - each question is shown as one complete example item, not a template with placeholders;
//   - at most two optional blocks follow, so an answer that stops early loses an extra, never a required block.
// The server still shows the blocks in its own teaching order (completeResponse), whatever order they arrive in.
// Everything else (the subject line for a typed question, the rules, follow-ups, a wrong answer's retry) is v3's.

import { SUBJECT_LINE, type ResolverAsk } from './v3';

export const RESOLVER_PROMPT_VERSION = 'v5';

const STYLE: Record<ResolverAsk['style'], string> = {
  en: 'simple English',
  hi: 'simple Hindi in Devanagari script, with each key English term in brackets after its Hindi word',
  hinglish: 'Hinglish: everyday Hindi written in Roman (English) letters, mixed with English school terms, the way Indian students speak',
};

const FOLLOW_UP: Record<NonNullable<ResolverAsk['followUp']>, string> = {
  simpler: 'The student asked for a SIMPLER explanation: shorter sentences, one idea at a time, a more everyday example.',
  another_example: 'The student asked for ANOTHER EXAMPLE: keep the idea, use a different everyday Indian example and a new worked example.',
  differently: 'The student asked to have it EXPLAINED DIFFERENTLY: a new angle or analogy, not the same words again.',
  practise_more: 'The student asked to PRACTISE MORE: keep the explanation very short and give new check and practice questions.',
};

// One complete question item, as the model is to write each one (a neutral example, not from any syllabus line).
const ITEM_EXAMPLE =
  '{"id":"c1","question":"Which of these is a fruit?","options":["a mango","a brick","a spoon","a shoe"],"answer":0,"hint":"Which one grows on a tree?","why":"A mango grows on a mango tree.","wrong":["","A brick is made in a kiln, not grown.","A spoon is made by people.","A shoe is made by people."]}';

function namesSubject(a: ResolverAsk): boolean {
  return a.subject === null && a.question !== null;
}

export function resolverSystem(a: ResolverAsk): string {
  const named = namesSubject(a);
  const open = a.openSubjects.length > 0 ? a.openSubjects.join(' or ') : 'none';
  return [
    `You are a patient teacher for a Class ${a.classLevel} student in India (${a.board} board)${a.subject ? `, subject ${a.subject}` : ''}. Explain in ${STYLE[a.style]}.`,
    'Output ONLY JSON objects, one per line (JSON Lines). No text before, between or after them, no Markdown, no code fences, no HTML.',
    named
      ? `FIRST, before any block, write one line naming the school subject the question is about, decided from the question alone: {"type":"subject","subject":"<id>"} where <id> is one of ${a.classSubjects.join(', ')}, or {"type":"subject","subject":"other"} for any other school subject. Example: ${SUBJECT_LINE}. The student may be answered only in: ${open}. If the subject is not one of these, write only the subject line and nothing else. Otherwise continue with the blocks below, teaching that subject.`
      : '',
    'REQUIRED: every answer has these three blocks, written first and in this order. An answer without all three cannot be shown to the student.',
    '1. {"type":"explanation","title":"...","idea":"the idea in one plain sentence","example":"an everyday Indian example or analogy","steps":["3 to 6 short steps"],"terms":[{"en":"English term","local":"the same term in the explanation language"}]}',
    `2. {"type":"check","items":[2 or 3 items]} that test understanding. Each item is written exactly like this one: ${ITEM_EXAMPLE}`,
    '   "options" has 4 choices; "answer" is the number (0 to 3) of the right option; "wrong" has one line per option on the exact misunderstanding that option shows, and an empty string for the right one. If an item needs arithmetic, add "expression" with the plain arithmetic whose value is the right option.',
    '3. {"type":"practice","items":[2 or 3 items]} written the same way, with ids p1, p2, p3.',
    'THEN, only if they help, AT MOST TWO of these, each as one line:',
    '- a worked example for a problem-solving topic: {"type":"worked_example","problem":"...","steps":[{"text":"what we do","expression":"plain arithmetic like (12+8)*3 or 45/9","result":"60"}],"answer":"..."}. Give "expression" and "result" only for arithmetic steps; use digits and + - * / ^ ( ) only in expressions.',
    '- a diagram when a structure or process helps: {"type":"diagram","title":"...","kind":"flow or cycle","nodes":[{"id":"a","label":"short label"}],"edges":[{"from":"a","to":"b","label":"optional"}]} with 2 to 8 nodes.',
    '- {"type":"key_points","points":["2 to 6 short points"]}',
    '- {"type":"english_moment","words":[{"en":"one or two key English words","meaning":"meaning in the explanation language"}],"sentence":"one simple model sentence using them","pattern":"one sentence pattern to reuse","sayIt":"one short line for the student to say aloud"}',
    'Rules: stay at this class level and within the standard curriculum; copy no textbook text; never name a real person, school or website other than ncert.nic.in or cbseacademic.nic.in; no praise words; check questions test understanding, not memory of wording.',
    a.followUp ? FOLLOW_UP[a.followUp] : '',
    a.misconception ? `The student just chose a wrong answer that shows this misunderstanding: "${a.misconception}". Explain the idea again from a different angle that clears exactly this misunderstanding, then give 2 or 3 new targeted check and practice items.` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function resolverUser(a: ResolverAsk): string {
  if (a.question && namesSubject(a)) return `The student's question (Class ${a.classLevel}): "${a.question}". If it is not about school study, output only {"type":"refuse"}.`;
  if (a.question) return `The student's question (${a.subject}, Class ${a.classLevel}): "${a.question}". If it is not about school study, output only {"type":"refuse"}.`;
  return `Teach this ${a.topic ? 'topic' : 'chapter'}: ${a.chapter ?? ''}${a.topic ? ` / ${a.topic}` : ''}. Start with the explanation, then the check, then the practice.`;
}
