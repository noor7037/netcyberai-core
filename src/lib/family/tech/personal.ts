// Tech Lab, personal to one child (C555): the child's own name at a few meaningful points of a lesson, a link to what
// they learnt last time, a closing summary, and the course's "what next" from their own class and progress.
//
// The lesson files stay one copy for every child. A lesson may carry the project's name token {{name}} (the same token
// the tutor uses, src/lib/family/name-token.ts); it is filled on the phone with the child's first name, never more than
// twice in one block, and stripped wherever there is no name (the server voice, a shared copy). The lines below are
// authored once in the three lesson languages and chosen by the lesson id, so two lessons do not open with the same words.
// The child's name never goes to the server voice: a line that holds it is read by the phone's own voice.

import { nameFiller, withoutName } from '@/lib/family/name-token';
import { fill, pick, type TechLang } from './text';
import type { CourseCatalog, LessonHook, Localized, TechProgress, UnitSummary } from './types';

export type TechPersonal = {
  name: string;
  // The lesson before this one in the unit, when the child has passed it.
  prevTitle: Localized | null;
  // The next lesson in the unit, if there is one.
  nextTitle: Localized | null;
  // This lesson was passed before (a revision visit).
  returning: boolean;
};

type Lines = Record<TechLang, readonly string[]>;

// The opening, said once, at the start of the lesson.
const HELLO: Lines = {
  hinglish: [
    'Hey {{name}}! Aaj hum ek interesting cheez samjhenge.',
    'Namaste {{name}}! Chalo, aaj ek nayi technology ke andar jhaankte hain.',
    '{{name}}, taiyaar ho? Aaj ka lesson ek naya raaz kholega.',
    'Welcome back {{name}}! Aaj kuch aisa seekhenge jo roz tumhare aas-paas hota hai.',
  ],
  en: [
    'Hi {{name}}! Today we are going to understand something interesting.',
    'Hello {{name}}! Let us look inside a new piece of technology today.',
    '{{name}}, ready? Today we uncover how something really works.',
    'Welcome back {{name}}! Today you will learn something that happens around you every day.',
  ],
  hi: [
    'नमस्ते {{name}}! आज हम एक दिलचस्प चीज़ समझेंगे।',
    '{{name}}, चलो आज एक नई तकनीक के अंदर झाँकते हैं।',
    '{{name}}, तैयार हो? आज का पाठ एक नया राज़ खोलेगा।',
    'फिर से स्वागत है {{name}}! आज कुछ ऐसा सीखेंगे जो रोज़ तुम्हारे आस-पास होता है।',
  ],
};

const AGAIN: Lines = {
  hinglish: ['{{name}}, ye lesson tum pehle kar chuke ho. Chalo ek baar revise karte hain, is baar aur dhyaan se.'],
  en: ['{{name}}, you have done this lesson before. Let us revise it, a little more carefully this time.'],
  hi: ['{{name}}, यह पाठ तुम पहले कर चुके हो। चलो इसे एक बार दोहराते हैं, इस बार और ध्यान से।'],
};

const LAST_TIME: Lines = {
  hinglish: ['Pichhli baar tumne "{prev}" seekha tha. Aaj usi se aage badhenge.', 'Yaad hai "{prev}"? Aaj ka lesson usi ke upar banta hai.'],
  en: ['Last time you learnt "{prev}". Today we build on it.', 'Remember "{prev}"? Today\'s lesson builds on it.'],
  hi: ['पिछली बार तुमने "{prev}" सीखा था। आज उसी से आगे बढ़ेंगे।', '"{prev}" याद है? आज का पाठ उसी पर बनता है।'],
};

const LOOK: Lines = {
  hinglish: ['Ab zara picture ko dhyaan se dekho.', 'Neeche wali picture par nazar rakho, har step mein kuch badlega.', 'Pehle picture dekho, phir padho.'],
  en: ['Now look carefully at the picture.', 'Keep your eyes on the picture below: something changes at every step.', 'Look at the picture first, then read.'],
  hi: ['अब ज़रा चित्र को ध्यान से देखो।', 'नीचे वाले चित्र पर नज़र रखो, हर कदम पर कुछ बदलेगा।', 'पहले चित्र देखो, फिर पढ़ो।'],
};

// Before the lab.
const TO_PLAY: Lines = {
  hinglish: ['{{name}}, ab tumhari baari. Lab kholo aur khud karke dekho.', 'Ab padhna bas. {{name}}, lab mein khud try karo.'],
  en: ['{{name}}, now it is your turn. Open the lab and try it yourself.', 'Enough reading for now. {{name}}, try it yourself in the lab.'],
  hi: ['{{name}}, अब तुम्हारी बारी। लैब खोलो और खुद करके देखो।', 'अब पढ़ना बस। {{name}}, लैब में खुद करके देखो।'],
};

// After a right answer, now and then (the first one, then every third).
const RIGHT: Lines = {
  hinglish: ['Bahut badhiya, {{name}}! Sahi jawab.', 'Sahi pakda, {{name}}!', 'Ekdum sahi, {{name}}!'],
  en: ['Very good, {{name}}! That is right.', 'Well spotted, {{name}}!', 'Exactly right, {{name}}!'],
  hi: ['बहुत बढ़िया, {{name}}! सही जवाब।', 'सही पकड़ा, {{name}}!', 'बिल्कुल सही, {{name}}!'],
};

const WRAP_HEAD: Lines = {
  hinglish: ['Shabaash {{name}}! Aaj tumne ye seekha:', '{{name}}, aaj ka saar:'],
  en: ['Well done {{name}}! Today you learnt:', '{{name}}, here is what you learnt today:'],
  hi: ['शाबाश {{name}}! आज तुमने यह सीखा:', '{{name}}, आज का सार:'],
};

const WRAP_NEXT: Lines = {
  hinglish: ['Agla lesson: "{next}". Wahan hum isi ko aage le jayenge.'],
  en: ['Next lesson: "{next}". There we take this further.'],
  hi: ['अगला पाठ: "{next}"। वहाँ हम इसे आगे ले जाएँगे।'],
};

const WRAP_END: Lines = {
  hinglish: ['Is unit ka aakhri lesson poora! Course par jaakar agla unit chuno.'],
  en: ['That was the last lesson of this unit. Pick the next unit on the course page.'],
  hi: ['इस इकाई का आख़िरी पाठ पूरा! कोर्स पेज पर अगली इकाई चुनो।'],
};

// A stable choice from a list, by the lesson id, so the same lesson always reads the same and neighbours differ.
function seed(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

function one(lines: Lines, lang: TechLang, key: string, offset = 0): string {
  const list = lines[lang];
  return list[(seed(key) + offset) % list.length];
}

// The name filled in, or the token stripped when there is no name.
export function named(text: string, name: string | null | undefined): string {
  return (name ? nameFiller(name) : withoutName)(text);
}

function end(text: string): string {
  const t = text.trim();
  return !t || /[.!?।:]$/.test(t) ? t : `${t}.`;
}

// The opening sentences: a greeting by name, a link to the last lesson (or a revision note), and where to look.
// C557: a lesson with its own opening (a familiar situation and the question it raises) uses that instead of a general
// greeting; a revision visit still says so first.
export function introLines(lessonId: string, lang: TechLang, personal: TechPersonal, hook?: LessonHook): string[] {
  if (hook) {
    const prevTitle = personal.prevTitle ? pick(lang, personal.prevTitle) : '';
    const own = [
      ...(personal.returning ? [named(one(AGAIN, lang, lessonId), personal.name)] : []),
      ...(prevTitle && !personal.returning ? [fill(one(LAST_TIME, lang, lessonId), { prev: prevTitle })] : []),
      named(pick(lang, hook.text), personal.name),
      pick(lang, hook.question),
    ];
    return own.map(end).filter(Boolean);
  }
  const lines = [named(one(personal.returning ? AGAIN : HELLO, lang, lessonId), personal.name)];
  const prev = personal.prevTitle ? pick(lang, personal.prevTitle) : '';
  if (prev && !personal.returning) lines.push(fill(one(LAST_TIME, lang, lessonId), { prev }));
  lines.push(one(LOOK, lang, lessonId, 1));
  return lines.map(end).filter(Boolean);
}

export function toPlayLine(lessonId: string, lang: TechLang, name: string): string {
  return named(one(TO_PLAY, lang, lessonId), name);
}

// The praise for the n-th right answer (0-based): by name for the first, then every third; otherwise null (the
// screen's plain "Correct!").
export function rightLine(lessonId: string, lang: TechLang, name: string, nth: number): string | null {
  if (!name || nth % 3 !== 0) return null;
  return named(one(RIGHT, lang, lessonId, nth), name);
}

// The closing summary: a line by name, what was learnt (the lesson's own outcomes), and the next step.
export function wrapLines(lessonId: string, lang: TechLang, personal: TechPersonal, outcomes: readonly Localized[]): string[] {
  const head = named(one(WRAP_HEAD, lang, lessonId), personal.name);
  const learnt = outcomes.map((item) => end(pick(lang, item))).filter(Boolean);
  const next = personal.nextTitle ? pick(lang, personal.nextTitle) : '';
  const tail = next ? fill(one(WRAP_NEXT, lang, lessonId), { next }) : one(WRAP_END, lang, lessonId);
  return [end(head), ...learnt, end(tail)].filter(Boolean);
}

// ---- the course: what this child does next ------------------------------------------------------------------------------

export type PathStep = { key: string; title: Localized; unit: Localized; why: 'continue' | 'start' | 'revise' | 'stretch' };

export type ChildPath = {
  // Lessons of the child's own class: how many there are and how many are passed.
  total: number;
  done: number;
  next: PathStep | null;
  revise: PathStep[];
  stretch: PathStep | null;
};

// Units that list this class (Nursery–UKG read Level 1 units that list them, or Class 1's).
export function unitsForClass(catalog: CourseCatalog, classLevel: number): UnitSummary[] {
  const exact = catalog.units.filter((unit) => unit.classes.includes(classLevel));
  return exact.length ? exact : catalog.units.filter((unit) => unit.classes.includes(Math.max(1, classLevel)));
}

const REVISE_BELOW = 80;

// The path through the course for one child, from the child's real class (never the class they are exploring) and
// their own progress. The next lesson is the first one in course order that is not yet passed and whose prerequisites
// are passed; a lesson passed with a low best score is offered once more for revision (at most two, the lowest first);
// with every lesson of the class passed, the first lesson the next class adds is the stretch. Nothing here labels the
// child: it only orders lessons.
export function childPath(catalog: CourseCatalog, classLevel: number, progress: TechProgress): ChildPath {
  const units = unitsForClass(catalog, classLevel);
  const rows = units.flatMap((unit) => unit.lessons.map((lesson) => ({ unit, lesson })));
  const passed = (key: string) => !!progress.done[key];
  const done = rows.filter((row) => passed(row.lesson.key)).length;
  const ready = rows.find((row) => !passed(row.lesson.key) && row.lesson.prereq.every((id) => passed(id) || !rows.some((other) => other.lesson.key === id)));
  const pending = ready ?? rows.find((row) => !passed(row.lesson.key));
  const started = pending ? pending.unit.lessons.some((lesson) => passed(lesson.key)) : false;
  const next: PathStep | null = pending ? { key: pending.lesson.key, title: pending.lesson.title, unit: pending.unit.title, why: started ? 'continue' : 'start' } : null;
  const revise = rows
    .filter((row) => passed(row.lesson.key) && (progress.done[row.lesson.key]?.best ?? 100) < REVISE_BELOW)
    .sort((a, b) => (progress.done[a.lesson.key]?.best ?? 0) - (progress.done[b.lesson.key]?.best ?? 0))
    .slice(0, 2)
    .map((row) => ({ key: row.lesson.key, title: row.lesson.title, unit: row.unit.title, why: 'revise' as const }));
  let stretch: PathStep | null = null;
  if (!next && classLevel < 12) {
    const mine = new Set(rows.map((row) => row.lesson.key));
    const ahead = unitsForClass(catalog, Math.max(1, classLevel) + 1).flatMap((unit) => unit.lessons.map((lesson) => ({ unit, lesson }))).find((row) => !mine.has(row.lesson.key) && !passed(row.lesson.key));
    if (ahead) stretch = { key: ahead.lesson.key, title: ahead.lesson.title, unit: ahead.unit.title, why: 'stretch' };
  }
  return { total: rows.length, done, next, revise, stretch };
}
