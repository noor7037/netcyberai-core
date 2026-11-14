import type { LabCase } from './cases';
import type { ResolverAsk } from '@/lib/ai/prompts/family.resolver/v8';
import { resolverSystem as v16System, resolverUser as v16User } from '@/lib/ai/prompts/family.resolver/v16';
import { resolverSystem as v17System, resolverUser as v17User } from '@/lib/ai/prompts/family.resolver/v17';
import { questionLanguage, type ReplyLang } from '@/lib/family/question-language';
import type { LangCode } from '@/lib/family/languages';

// The tutor v17 set (C521): photo questions from Classes 1 to 5 (Mathematics, EVS, English, Hindi) and typed questions
// in English, Hindi, Hinglish, Tamil and Punjabi. Each question is two cases, the same question under the live tutor
// prompt v16 ('-v16', before) and under v17 ('-v17', after), so one Lab run shows the two answers side by side. The
// system prompt is the real family.resolver prompt rendered for the case, so a prompt change shows here at once. The
// questions are made up for the Lab; no child's words, no textbook text. Nothing here calls a model.

type Subject = 'mathematics' | 'evs' | 'english' | 'hindi';
export type TutorV17Question = {
  id: string;
  classLevel: number;
  subject: Subject;
  // The child's own words, typed with the photo (or the whole question when there is no photo).
  text: string;
  // What the photo's reading says (family.homework), or none for a typed question.
  photo?: string;
  // The parent's word-help language for the child.
  motherTongue: LangCode;
  // What the answer must show, for the founder's score.
  shows: string;
};

export const TUTOR_V17_QUESTIONS: readonly TutorV17Question[] = [
  // Photo questions, Classes 1 to 5.
  { id: 'photo-c1-maths-shape', classLevel: 1, subject: 'mathematics', text: 'Q1', photo: '1. How many sides does a triangle have?\n2. Draw a circle.', motherTongue: 'hi', shows: 'A triangle drawn on the board, its three sides counted.' },
  { id: 'photo-c2-maths-take-away', classLevel: 2, subject: 'mathematics', text: 'how to do this', photo: '3. Rani has 12 sweets. She gives 5 to Raju. How many sweets are left with Rani?', motherTongue: 'hi', shows: 'The sweets drawn and 5 taken away; 12 - 5 = 7.' },
  { id: 'photo-c3-maths-perimeter', classLevel: 3, subject: 'mathematics', text: 'Q2 please', photo: '1. Add 245 and 132.\n2. Find the perimeter of a rectangle 6 cm long and 4 cm wide.', motherTongue: 'ta', shows: 'Question 2 named; a rectangle drawn with 6 cm and 4 cm labelled; 6 + 4 + 6 + 4 = 20 cm.' },
  { id: 'photo-c4-maths-data', classLevel: 4, subject: 'mathematics', text: 'which day', photo: 'Books read by Meena: Monday 3, Tuesday 5, Wednesday 2, Thursday 4. On which day did she read the most books?', motherTongue: 'mr', shows: 'A bar chart of the four days from the page numbers only; Tuesday, 5 books.' },
  { id: 'photo-c5-maths-area-hi', classLevel: 5, subject: 'mathematics', text: 'इसका उत्तर बताओ', photo: '4. Find the area of a square whose side is 7 cm.', motherTongue: 'hi', shows: 'A square drawn with 7 cm sides; 7 × 7 = 49 square cm; answered in Hindi with area and square taught as English words.' },
  { id: 'photo-c5-maths-fraction-hinglish', classLevel: 5, subject: 'mathematics', text: 'ye kaise karte hai batao', photo: '6. Shade 3/4 of the circle.', motherTongue: 'hi', shows: 'A circle drawn in four equal parts with three shaded; answered in Hinglish.' },
  { id: 'photo-c1-evs-colour', classLevel: 1, subject: 'evs', text: 'what is the answer', photo: 'Look and say: What colour is a ripe banana?', motherTongue: 'bn', shows: 'The colour shown (a photo of a ripe yellow banana); yellow.' },
  { id: 'photo-c2-evs-seed', classLevel: 2, subject: 'evs', text: 'explain', photo: '2. Write the stages of a plant growing from a seed.', motherTongue: 'hi', shows: 'The stages in order (seed, sprout, small plant, big plant) as steps.' },
  { id: 'photo-c3-evs-milk', classLevel: 3, subject: 'evs', text: 'Q5', photo: '5. Name two animals that give us milk.', motherTongue: 'gu', shows: 'A photo of a cow (or buffalo or goat); two true animals named.' },
  { id: 'photo-c4-evs-heart', classLevel: 4, subject: 'evs', text: 'what is this answer', photo: '3. Which organ pumps blood to all parts of our body?', motherTongue: 'kn', shows: 'The heart, shown by the heart 3D model.' },
  { id: 'photo-c5-evs-rain-ta', classLevel: 5, subject: 'evs', text: 'இதற்கு பதில் சொல்லுங்கள்', photo: '1. How does water from the sea come back to us as rain?', motherTongue: 'ta', shows: 'The water cycle as steps (heat, vapour, clouds, rain); answered mostly in Tamil with evaporation and condensation taught as English words.' },
  { id: 'photo-c5-evs-moon-pa', classLevel: 5, subject: 'evs', text: 'ਇਹ ਸਵਾਲ ਸਮਝਾਓ', photo: '2. Why does the Moon seem to change its shape during a month?', motherTongue: 'pa', shows: 'The phases as steps or a scene; answered mostly in Punjabi (Gurmukhi) with the English words taught alongside.' },
  { id: 'photo-c3-english-article', classLevel: 3, subject: 'english', text: 'Q4', photo: '4. Fill in the blank with a or an: ___ apple, ___ ball, ___ umbrella.', motherTongue: 'hi', shows: 'an apple, a ball, an umbrella, with the vowel-sound rule; no forced visual.' },
  { id: 'photo-c2-english-opposite', classLevel: 2, subject: 'english', text: 'help', photo: 'Write the opposite: big, hot, up.', motherTongue: 'ur', shows: 'small, cold, down; the first word answered first.' },
  { id: 'photo-c4-hindi-sangya', classLevel: 4, subject: 'hindi', text: 'यह समझाइए', photo: '1. संज्ञा किसे कहते हैं? दो उदाहरण लिखिए।', motherTongue: 'hi', shows: 'संज्ञा defined in Hindi with two true examples; noun taught as the English word.' },
  { id: 'photo-c1-hindi-fruit', classLevel: 1, subject: 'hindi', text: 'ye kya hai', photo: 'चित्र देखकर नाम लिखो: (picture of a mango)', motherTongue: 'hi', shows: 'आम named, with a photo of a mango; answered in Hinglish.' },
  // Typed questions, one per language.
  { id: 'lang-en', classLevel: 4, subject: 'evs', text: 'Why do leaves fall in autumn?', motherTongue: 'ta', shows: 'English, with the key words and one short closing line in Tamil script.' },
  { id: 'lang-hi', classLevel: 4, subject: 'evs', text: 'पौधे अपना भोजन कैसे बनाते हैं?', motherTongue: 'hi', shows: 'Mostly Hindi in Devanagari, with photosynthesis and sunlight taught as English words.' },
  { id: 'lang-hinglish', classLevel: 4, subject: 'mathematics', text: 'fraction kya hota hai samjhao', motherTongue: 'hi', shows: 'Easy Hinglish in Roman letters, keeping the word fraction.' },
  { id: 'lang-ta', classLevel: 4, subject: 'evs', text: 'மழை எப்படி பெய்கிறது?', motherTongue: 'ta', shows: 'Mostly Tamil in Tamil script, with rain and cloud taught as English words.' },
  { id: 'lang-pa', classLevel: 4, subject: 'mathematics', text: 'ਤਿਕੋਣ ਦੀਆਂ ਕਿੰਨੀਆਂ ਭੁਜਾਵਾਂ ਹੁੰਦੀਆਂ ਹਨ?', motherTongue: 'pa', shows: 'Mostly Punjabi in Gurmukhi, with triangle and side taught as English words.' },
];

// The question as the tutor route writes it (src/lib/family/resolver.ts withAttached; tutor-read.ts marks the photo).
export const askedText = (q: Pick<TutorV17Question, 'text' | 'photo'>): string =>
  q.photo ? `${q.text}\n\nThe student attached files. What they say:\n[File 1, photo]\n${q.photo}` : q.text;

// The ask the resolver builds for this question, with the language the route detects (v16 ignores it).
export function tutorV17Ask(q: TutorV17Question): ResolverAsk & { replyLang: ReplyLang } {
  const replyLang = questionLanguage(q.text, 'en', q.motherTongue).lang;
  return {
    board: 'CBSE',
    classLevel: q.classLevel,
    subject: q.subject,
    openSubjects: ['mathematics', 'evs', 'english', 'hindi'],
    classSubjects: ['mathematics', 'evs', 'english', 'hindi'],
    chapter: null,
    topic: null,
    question: askedText(q),
    language: 'en',
    style: 'en',
    followUp: null,
    misconception: null,
    bookSubjects: [],
    replyLang,
    motherTongue: q.motherTongue,
  };
}

const labLanguage = (l: ReplyLang): LabCase['language'] => l;

// Two cases per question: '<id>-v16' and '<id>-v17'.
export function tutorV17LabCases(): LabCase[] {
  return TUTOR_V17_QUESTIONS.flatMap((q) => {
    const a = tutorV17Ask(q);
    const rubric = (v: string) => [
      `Shows: ${q.shows}`,
      q.photo ? 'Answers the one question the child points to (else the first) and names it.' : 'Answers the question asked, correctly.',
      `${v === 'v17' ? 'Answer, why, a worked example and a check, ' : ''}pitched for Class ${q.classLevel}.`,
    ];
    return (['v16', 'v17'] as const).map((v) => ({
      id: `t17-${q.id}-${v}`,
      area: 'tutor_v17' as const,
      language: labLanguage(a.replyLang),
      system: v === 'v16' ? v16System(a) : v17System(a),
      messages: [{ role: 'user' as const, content: v === 'v16' ? v16User(a) : v17User(a) }],
      expect: 'text' as const,
      maxTokens: 2000,
      rubric: rubric(v),
      tags: { board: 'CBSE', classLevel: q.classLevel, subject: q.subject, unit: q.id, type: v, band: q.classLevel <= 2 ? 'lkg_1' : 'c2_5' },
    }));
  });
}
