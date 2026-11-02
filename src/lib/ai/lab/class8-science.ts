import type { LabCase } from './cases';
import { bandProblems, type Band } from '../qc/rules';

// The Class 8 Science eval set (W16-A5; the proposal's M4 and M11). Fifty questions across the thirteen chapters of
// NCERT's Class 8 Science book as the content library lists them (data/catalog/ncert-2026-27-classes-6-8-maths-
// science.csv, keys cbse.c8.science.ch01 to ch13), each with the chapter it belongs to, the key phrases a right answer
// carries, the class band and the kind of question. The Lab asks the model, gives it the library's chapter list, and
// grades the answer by rules alone (no second model): the chapter it names matches, at least two key phrases are
// present, and the depth suits the band.
//
// Where the words come from. The library's chapter and topic titles are in the repository; the chapters' own texts
// are not. So every key phrase is a word or phrase the expected chapter's own title or one of its topic titles
// contains (test/ai/lab-class8.test.ts holds each to that), or the digits of a worked answer to a made-up numerical.
// A question whose chapter has no title wording to take from carries no phrases (`[]`), and its grade is the chapter
// and the depth only. No fact of the chapter's text is invented here.

export type Class8Kind = 'fact' | 'why' | 'how' | 'compare' | 'numerical';
export const CLASS8_KINDS: readonly Class8Kind[] = ['fact', 'why', 'how', 'compare', 'numerical'];
export const CLASS8_BAND: Band = 'c6_8';

export type RulesGrade = {
  graded_by: 'rules';
  expectedChapterKey: string;
  keyPhrases: string[];
  band: Band;
  kind: Class8Kind;
};
export type Class8Case = RulesGrade & { id: string; question: string };

// The library's thirteen chapters, in the order printed (the catalog CSV's titles).
export const CLASS8_CHAPTERS: readonly { key: string; title: string }[] = [
  { key: 'cbse.c8.science.ch01', title: 'Exploring the Investigative World of Science' },
  { key: 'cbse.c8.science.ch02', title: 'The Invisible Living World: Beyond Our Naked Eye' },
  { key: 'cbse.c8.science.ch03', title: 'Health: The Ultimate Treasure' },
  { key: 'cbse.c8.science.ch04', title: 'Electricity: Magnetic and Heating Effects' },
  { key: 'cbse.c8.science.ch05', title: 'Exploring Forces' },
  { key: 'cbse.c8.science.ch06', title: 'Pressure, Winds, Storms, and Cyclones' },
  { key: 'cbse.c8.science.ch07', title: 'Particulate Nature of Matter' },
  { key: 'cbse.c8.science.ch08', title: 'Nature of Matter: Elements, Compounds, and Mixtures' },
  { key: 'cbse.c8.science.ch09', title: 'The Amazing World of Solutes, Solvents, and Solutions' },
  { key: 'cbse.c8.science.ch10', title: 'Light: Mirrors and Lenses' },
  { key: 'cbse.c8.science.ch11', title: 'Keeping Time with the Skies' },
  { key: 'cbse.c8.science.ch12', title: 'How Nature Works in Harmony' },
  { key: 'cbse.c8.science.ch13', title: 'Our Home: Earth, a Unique Life Sustaining Planet' },
];

// [chapter number, short name, kind, the question, key phrases]
type Row = [number, string, Class8Kind, string, string[]];
const ROWS: Row[] = [
  [1, 'science', 'fact', 'What is science about?', ['science', 'investigative']],
  [1, 'investigate', 'why', 'Why do we investigate the world around us instead of just guessing?', ['investigative world', 'science']],
  [1, 'explore', 'how', 'How do scientists explore a new question?', []],

  [2, 'cell', 'fact', 'What is a cell?', ['cell', 'basic unit of life']],
  [2, 'basic-unit', 'why', 'Why is the cell considered the basic unit of life?', ['cell', 'basic unit of life']],
  [2, 'microbes', 'how', 'How are we connected to microbes in our daily life?', ['microbes', 'microorganisms']],
  [2, 'levels', 'compare', 'How does a single cell differ from the whole body of a living organism, and what are the levels of organisation in between?', ['levels of organisation', 'cell']],

  [3, 'health', 'fact', 'What does health mean? Is it more than not falling sick?', ['health', 'falling sick']],
  [3, 'stay-healthy', 'how', 'How can we stay healthy?', ['stay healthy', 'health']],
  [3, 'diseases', 'compare', 'What are the causes and types of diseases, and how do the types differ?', ['diseases', 'causes and types']],
  [3, 'prevent', 'how', 'How can we prevent and control diseases?', ['prevent and control diseases', 'diseases']],

  [4, 'magnetic', 'fact', 'Does an electric current have a magnetic effect?', ['electric current', 'magnetic effect']],
  [4, 'hot-wire', 'why', 'Why does a wire carrying a current get hot?', ['current carrying wire', 'heating effects']],
  [4, 'battery', 'how', 'How does a battery generate electricity?', ['battery', 'electricity']],
  [4, 'two-effects', 'compare', 'How is the magnetic effect of an electric current different from its heating effect?', ['magnetic effect', 'heating effects']],

  [5, 'force', 'fact', 'What is a force?', ['force', 'objects']],
  [5, 'float', 'why', 'Why do some objects float and others sink?', ['floating', 'sinking']],
  [5, 'weight', 'how', 'How is the weight of an object measured?', ['weight', 'force']],
  [5, 'types', 'compare', 'What are the different types of forces, and how do they differ?', ['types of forces', 'forces']],

  [6, 'pressure', 'fact', 'What is pressure?', ['pressure', 'air']],
  [6, 'wind', 'how', 'How is wind formed?', ['wind', 'air pressure']],
  [6, 'fast-wind', 'why', 'Why does air pressure fall where the wind blows fast?', ['air pressure', 'wind']],
  [6, 'calc-pressure', 'numerical', 'A force of 200 N acts on a surface of area 0.5 m². What is the pressure?', ['400', 'pressure']],

  [7, 'matter', 'fact', 'What is matter composed of?', ['matter', 'particles']],
  [7, 'states', 'why', 'What decides whether a substance is a solid, a liquid or a gas?', ['states of matter', 'particles']],
  [7, 'spacing', 'compare', 'How does the spacing between particles differ in solids, liquids and gases?', ['spacing', 'particles']],
  [7, 'motion', 'how', 'How do particles move in solids, liquids and gases?', ['particles', 'states of matter']],

  [8, 'mixture', 'fact', 'What is a mixture?', ['mixture', 'pure substances']],
  [8, 'element', 'compare', 'How is an element different from a compound?', ['elements', 'compounds']],
  [8, 'minerals', 'fact', 'What are minerals?', ['minerals', 'elements']],
  [8, 'uses', 'how', 'How do we use elements, compounds and mixtures in daily life?', ['elements', 'compounds', 'mixtures']],

  [9, 'solution', 'fact', 'What are a solute, a solvent and a solution?', ['solute', 'solvent', 'solution']],
  [9, 'density', 'why', 'Why do some objects float and others sink in water?', ['density', 'float']],
  [9, 'dissolve', 'how', 'How much solute can a fixed amount of solvent dissolve?', ['solubility', 'solute']],
  [9, 'calc-density', 'numerical', 'A block has a mass of 500 g and a volume of 250 cm³. What is its density?', ['2 g/cm', 'density']],

  [10, 'reflection', 'fact', 'What are the laws of reflection?', ['reflection', 'mirrors']],
  [10, 'images', 'how', 'What kind of images do spherical mirrors form?', ['spherical mirrors', 'images']],
  [10, 'lens', 'compare', 'How is a lens different from a spherical mirror?', ['lens', 'spherical mirrors']],
  [10, 'calc-reflect', 'numerical', 'A ray of light strikes a plane mirror at an angle of incidence of 35 degrees. What is the angle of reflection?', ['35', 'reflection']],

  [11, 'moon', 'why', 'Why does the appearance of the Moon change?', ['moon', 'appearance']],
  [11, 'calendar', 'how', 'How did calendars come into existence?', ['calendars', 'moon']],
  [11, 'festivals', 'fact', 'Are festivals related to astronomical phenomena?', ['festivals', 'astronomical']],
  [11, 'satellites', 'why', 'Why do we launch artificial satellites into space?', ['artificial satellites', 'space']],

  [12, 'community', 'fact', 'Who all live together in nature, and what is a community?', ['organism', 'community']],
  [12, 'food', 'how', 'Who eats whom in an ecosystem?', ['organisms', 'ecosystem']],
  [12, 'balance', 'how', 'How do interactions maintain balance in ecosystems?', ['balance', 'ecosystems']],
  [12, 'waste', 'why', 'What happens to waste in nature?', ['waste', 'nature']],

  [13, 'unique', 'why', 'Why is Earth a unique planet?', ['earth', 'life']],
  [13, 'planets', 'compare', 'What do the planets of our solar system look like, and how is Earth different?', ['planets', 'solar system']],
  [13, 'threats', 'how', 'What are the threats to life on Earth?', ['threats', 'life']],
];

const keyOf = (n: number) => `cbse.c8.science.ch${String(n).padStart(2, '0')}`;

export const CLASS8_SCIENCE: readonly Class8Case[] = ROWS.map(([n, name, kind, question, keyPhrases]) => ({
  id: `c8sci-ch${String(n).padStart(2, '0')}-${name}`,
  question,
  expectedChapterKey: keyOf(n),
  keyPhrases,
  band: CLASS8_BAND,
  kind,
  graded_by: 'rules' as const,
}));

// ---- the grader ------------------------------------------------------------------------------------------------------

export type RulesScore = {
  // 0 to 100.
  score: number;
  citation: boolean;
  phrasesFound: number;
  phrasesNeeded: number;
  bandOk: boolean;
  problems: string[];
};
// A case passes at this score or more.
export const RULES_PASS = 70;
// Points: the chapter named (40), two key phrases present (40), the depth for the band (20). A case with no key phrases
// is graded on the chapter and the depth alone, out of 60 and scaled to 100.
const POINTS = { citation: 40, phrases: 40, band: 20 } as const;

const norm = (s: string) => s.normalize('NFC').toLowerCase().replace(/\s+/g, ' ');
const CHAPTER_KEY = /cbse\.c8\.science\.ch\d{2}/gi;
const SOURCE_LINE = /source\s*:\s*(cbse\.c8\.science\.ch\d{2})/gi;

// The chapter an answer names: its last "Source:" line, else the last chapter key in the text.
export function citedChapter(text: string): string | null {
  const lines = Array.from(text.matchAll(SOURCE_LINE), (m) => m[1].toLowerCase());
  if (lines.length > 0) return lines[lines.length - 1];
  const keys = Array.from(text.matchAll(CHAPTER_KEY), (m) => m[0].toLowerCase());
  return keys.length > 0 ? keys[keys.length - 1] : null;
}

export function gradeByRules(g: RulesGrade, answer: string): RulesScore {
  const text = norm(answer);
  const problems: string[] = [];
  const cited = citedChapter(text);
  const citation = cited === g.expectedChapterKey;
  if (cited === null) problems.push('no_citation');
  else if (!citation) problems.push('wrong_chapter');

  const needed = Math.min(2, g.keyPhrases.length);
  const found = g.keyPhrases.filter((p) => text.includes(norm(p))).length;
  if (needed > 0 && found < needed) problems.push('key_phrases');

  const band = bandProblems(answer, g.band);
  if (band.length > 0) problems.push('off_band');

  const earned =
    (citation ? POINTS.citation : 0) + (needed === 0 ? 0 : Math.round((POINTS.phrases * Math.min(found, needed)) / needed)) + (band.length === 0 ? POINTS.band : 0);
  const out = POINTS.citation + (needed === 0 ? 0 : POINTS.phrases) + POINTS.band;
  return { score: Math.round((earned / out) * 100), citation, phrasesFound: found, phrasesNeeded: needed, bandOk: band.length === 0, problems };
}

// ---- the Lab's cases -------------------------------------------------------------------------------------------------

const BAND_RULE = 'Use 150 to 350 words, give the reasoning, name a common misconception, then one check question and one practice question.';

export function class8SystemPrompt(): string {
  const list = CLASS8_CHAPTERS.map((c) => `${c.key}: ${c.title}`).join('\n');
  return [
    'You are a Science tutor for a Class 8 CBSE student.',
    BAND_RULE,
    'Answer in English.',
    'The Class 8 Science library has these chapters:',
    list,
    'Answer from the chapter the question belongs to. End with one last line in this form, naming that chapter by its key: Source: <chapter key>',
  ].join('\n');
}

// The set as the Lab runs it: a case graded by rules, with the grade it carries.
export function class8LabCases(): LabCase[] {
  const system = class8SystemPrompt();
  return CLASS8_SCIENCE.map((c) => ({
    id: c.id,
    area: 'class8_science' as const,
    language: 'en' as const,
    system,
    messages: [{ role: 'user' as const, content: c.question }],
    expect: 'text' as const,
    maxTokens: 900,
    rubric: [
      `Names the chapter it belongs to: ${c.expectedChapterKey}.`,
      c.keyPhrases.length > 0 ? `Uses at least two of these words: ${c.keyPhrases.join(', ')}.` : 'Explains correctly, in order, with the reason.',
      `Pitched for classes 6 to 8: ${BAND_RULE}`,
    ],
    tags: { board: 'CBSE', classLevel: 8, subject: 'science', unit: c.expectedChapterKey, type: c.kind, band: c.band },
    grade: { graded_by: c.graded_by, expectedChapterKey: c.expectedChapterKey, keyPhrases: c.keyPhrases, band: c.band, kind: c.kind },
  }));
}
