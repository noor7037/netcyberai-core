// Prompt v3 of the family.resolver profile (docs/family-app/08 §7; Wave A step 2a, C264). One change from v2: a child
// of any class studies the subjects of their class, not only Mathematics and Science, so the subject line names one of
// the subjects of the student's class (the server sends that list), or "other".
//
// Before: v2 asked for {"type":"subject","subject":"mathematics" | "science" | "other"}.
// After:  v3 asks for {"type":"subject","subject":"<one of the class's subjects>" | "other"}, the list in the request.
//
// Everything else is v2's, word for word. The request carries board, class, subject, chapter, topic and language,
// never a child's name, school or contact (the AI platform's pre-processor removes them from the whole request as well).

export const RESOLVER_PROMPT_VERSION = 'v3';

// A subject id of src/lib/family/subjects.ts (the server checks the model's answer against its own list).
export type ResolverSubject = string;

export type ResolverAsk = {
  board: string;
  classLevel: number;
  // null: a typed question whose subject the model names first (the server checks it).
  subject: ResolverSubject | null;
  // The subjects this student may be answered in, for a question whose subject is to be named.
  openSubjects: ResolverSubject[];
  // The subjects of the student's class, which the subject line names one of (or "other").
  classSubjects: ResolverSubject[];
  chapter: string | null;
  topic: string | null;
  question: string | null;
  language: 'en' | 'hi';
  style: 'en' | 'hi' | 'hinglish';
  followUp: 'simpler' | 'another_example' | 'differently' | 'practise_more' | null;
  // A different explanation after a wrong answer: the misunderstanding the child's answer showed.
  misconception: string | null;
  // W9-A (C406): the tutor chat so far, for a question asked in a chat: its running summary and its last turns (the
  // child's words, the tutor's explanation paragraphs only). Read by v7 and later; earlier versions ignore it.
  memory?: ResolverMemory;
};

export type ResolverMemory = { summary: string | null; turns: { role: 'child' | 'tutor'; text: string }[] };

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

// The line the model writes first for a question whose subject it names.
export const SUBJECT_LINE = '{"type":"subject","subject":"mathematics"}';

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
    'Write these blocks, in this order, each as one line:',
    '{"type":"explanation","title":"...","idea":"the idea in one plain sentence","example":"an everyday Indian example or analogy","steps":["3 to 6 short steps"],"terms":[{"en":"English term","local":"the same term in the explanation language"}]}',
    'For a problem-solving topic: {"type":"worked_example","problem":"...","steps":[{"text":"what we do","expression":"plain arithmetic like (12+8)*3 or 45/9","result":"60"}],"answer":"..."}. Give "expression" and "result" only for arithmetic steps; use digits and + - * / ^ ( ) only in expressions. Leave them out for steps without arithmetic.',
    'When a structure or process helps: {"type":"diagram","title":"...","kind":"flow or cycle","nodes":[{"id":"a","label":"short label"}],"edges":[{"from":"a","to":"b","label":"optional"}]} with 2 to 8 nodes.',
    '{"type":"key_points","points":["2 to 6 short points"]}',
    '{"type":"check","items":[2 or 3 items]} and then {"type":"practice","items":[2 or 3 items]}. Each item: {"id":"q1","question":"...","options":["4 options"],"answer":index of the right option from 0,"hint":"a hint that does not give the answer","why":"one line on why the right option is right","wrong":["for each option, two lines on the exact misunderstanding that option shows; empty string for the right option"]}. If an item needs arithmetic, add "expression" with the plain arithmetic whose value is the right option.',
    '{"type":"english_moment","words":[{"en":"one or two key English words","meaning":"meaning in the explanation language"}],"sentence":"one simple model sentence using them","pattern":"one sentence pattern to reuse","sayIt":"one short line for the student to say aloud"}',
    'Optionally {"type":"sources","links":[{"label":"...","url":"https://ncert.nic.in/... or https://cbseacademic.nic.in/..."}]} only for a page you are sure exists; otherwise leave this block out.',
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
  return `Teach this ${a.topic ? 'topic' : 'chapter'}: ${a.chapter ?? ''}${a.topic ? ` / ${a.topic}` : ''}.`;
}
