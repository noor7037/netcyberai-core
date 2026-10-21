import { isCoursePicture } from './emoji';

// The English course's lesson files (docs/family-app/12 §11): their shape, and the checker every file must pass before
// it is loaded into the content library. One file per unit (`data/english/<track>/unit-NN.json`) holds its five
// lessons; `data/english/<track>/assessments.json` holds the day-0, day-45 and day-90 checks. The checker is the one
// gate: test/english runs it on every committed file, and the loader refuses a file it rejects.

export const TRACKS = ['a', 'b', 'c', 'd'] as const;
export type Track = (typeof TRACKS)[number];
export const isTrack = (v: unknown): v is Track => typeof v === 'string' && (TRACKS as readonly string[]).includes(v);

export const LESSON_KINDS = ['words', 'pattern', 'listen', 'speak', 'review'] as const;
export type LessonKind = (typeof LESSON_KINDS)[number];
export const UNITS_PER_TRACK = 18;
export const ASSESSMENT_KINDS = ['day0', 'day45', 'day90'] as const;
export type AssessmentKind = (typeof ASSESSMENT_KINDS)[number];

// English with an optional Hindi line. Where a track needs the Hindi (`TRACK_RULES.hindi`), the checker asks for it.
export type Bi = { en: string; hi?: string };
// An allowed emoji or "own:<name>" (emoji.ts).
export type Picture = string;

export type Word = { key: string; en: string; hi: string; pic: Picture; example?: Bi };
export type PartRole = 'who' | 'do' | 'what' | 'where' | 'when' | 'not' | 'ask' | 'other';
export type Part = { text: string; role: PartRole };
export type Example = { en: string; hi?: string; time?: 'past' | 'now' | 'future'; parts?: Part[]; pic?: Picture };
export type ScenePlace = 'home' | 'school' | 'market' | 'field' | 'village' | 'clinic' | 'station' | 'road' | 'festival' | 'plain';
export type ScenePic = { pic: Picture; x: number; y: number; size?: number };
export type Scene = { place: ScenePlace; pics: ScenePic[] };
export type Line = { speaker?: string; pic?: Picture; en: string; hi?: string };
export type Option = { text?: string; pic?: Picture };
export type Prompt = Bi & { pic?: Picture; say?: string };
export type ChooseItem = { key: string; prompt: Prompt; options: Option[]; answer: number; why?: Bi };
export type BuildItem = { key: string; hi?: string; pic?: Picture; tiles: string[]; answer: string; why?: Bi };
export type SayPrompt = { key: string; model: string; hi?: string; pic?: Picture; cue?: Bi };

export type Step =
  | { type: 'tip'; text: Bi; pic?: Picture }
  | { type: 'words'; words: Word[] }
  | { type: 'action'; prompts: { en: string; hi: string; pic: Picture }[] }
  | { type: 'pattern'; title: Bi; visual: 'timeline' | 'builder' | 'question_flip' | 'plural' | 'compare' | 'cards'; examples: Example[]; note?: Bi }
  | { type: 'story'; title: Bi; scene: Scene; lines: Line[] }
  | { type: 'choose'; items: ChooseItem[] }
  | { type: 'match'; pairs: { key: string; left: Option; right: Option }[] }
  | { type: 'build'; items: BuildItem[] }
  | { type: 'say'; mode: 'repeat' | 'answer' | 'describe'; prompts: SayPrompt[] }
  | {
      type: 'roleplay';
      title: Bi;
      scene: Scene;
      roles: { name: string; pic: Picture }[];
      learner: number;
      turns: { role: number; en: string; hi?: string }[];
      // What the AI partner may do in voice practice (E-9): its aim and the words the learner should use.
      partner?: { goal: string; must_use: string[] };
    }
  | { type: 'picture'; scene: Scene; questions: { key: string; en: string; hi?: string; model: string }[] }
  | { type: 'bridge'; items: { key: string; hi: string; tiles: string[]; answer: string }[] }
  | { type: 'talk'; topic: Bi; outline: Bi[]; seconds: number; model: string[] };
export type StepType = Step['type'];

// A check item is scored on the server: the phone gets it without its answer (`forChild`).
export type CheckItem = ({ type: 'choose' } & ChooseItem) | ({ type: 'build' } & BuildItem);

export type Lesson = { key: string; kind: LessonKind; title: Bi; minutes: number; steps: Step[]; check: CheckItem[]; home: Bi };
export type Unit = { track: Track; unit: number; key: string; title: Bi; pic: Picture; can_do: Bi; lessons: Lesson[] };

export type AssessmentSkill = 'listening' | 'words' | 'grammar' | 'reading';
export type Assessment = {
  track: Track;
  kind: AssessmentKind;
  key: string;
  sections: { skill: AssessmentSkill; items: CheckItem[] }[];
  // Rated by the child (B–D) or the grown-up (A) on each criterion, 0–2, until voice feedback is measured (12 §9).
  speaking: { key: string; prompt: Bi; model: string; criteria: Bi[] }[];
};
export type AssessmentFile = { track: Track; assessments: Assessment[] };

// Per track (12 §2, §6): the longest English sentence in words, the minutes a lesson may take, how many new words a
// Words lesson brings, whether Hindi is needed on instructions and story lines, and whether the track reads.
export const TRACK_RULES: Record<Track, { maxWords: number; minutes: [number, number]; newWords: [number, number]; hindi: boolean; reads: boolean; options: [number, number] }> = {
  a: { maxWords: 6, minutes: [3, 6], newWords: [3, 6], hindi: true, reads: false, options: [2, 3] },
  b: { maxWords: 9, minutes: [4, 8], newWords: [4, 8], hindi: true, reads: true, options: [2, 4] },
  c: { maxWords: 14, minutes: [5, 9], newWords: [5, 9], hindi: false, reads: true, options: [3, 4] },
  d: { maxWords: 22, minutes: [6, 10], newWords: [5, 9], hindi: false, reads: true, options: [3, 4] },
};

// What each lesson of the rhythm must hold (12 §3): one of each `need` group.
const LESSON_NEEDS: Record<LessonKind, StepType[][]> = {
  words: [['words'], ['choose', 'match'], ['say']],
  pattern: [['pattern'], ['build', 'choose'], ['say']],
  listen: [['story'], ['choose'], ['say']],
  speak: [['roleplay', 'picture', 'talk', 'bridge']],
  review: [['choose', 'match', 'build']],
};
// Steps a track that does not read may not have.
const READING_STEPS: StepType[] = ['build', 'bridge', 'talk'];

export type CourseProblem = { where: string; problem: string };

const KEY_PART = /^[a-z0-9][a-z0-9-]{0,29}$/;
const two = (n: number) => String(n).padStart(2, '0');
export const unitKey = (track: Track, unit: number) => `${track}.u${two(unit)}`;
export const lessonKey = (track: Track, unit: number, lesson: number) => `${unitKey(track, unit)}.l${lesson}`;

// The words of an English sentence, as the length rule counts them.
export function wordCount(s: string): number {
  return s.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
}
// Build answers compare on words only: case, extra spaces and the final full stop or question mark do not count.
export function normaliseSentence(s: string): string {
  return s
    .toLowerCase()
    .replace(/[“”"]/g, '')
    .replace(/[’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?]+$/, '')
    .trim();
}
// The words of a sentence without their punctuation, sorted: tiles and answer must use the same words.
const sortedWords = (s: string) =>
  normaliseSentence(s)
    .split(' ')
    .map((w) => w.replace(/[.,!?;:]+$/, ''))
    .sort()
    .join(' ');

class Checker {
  problems: CourseProblem[] = [];
  keys = new Set<string>();
  constructor(readonly track: Track) {}
  add(where: string, problem: string) {
    this.problems.push({ where, problem });
  }
  get rules() {
    return TRACK_RULES[this.track];
  }
  text(where: string, v: unknown, max = 300): v is string {
    if (typeof v !== 'string' || v.trim() === '') {
      this.add(where, 'text missing');
      return false;
    }
    if (v !== v.trim() || /\s{2,}/.test(v)) this.add(where, 'extra spaces');
    if (v.length > max) this.add(where, `longer than ${max} characters`);
    if (/<[a-z/][^>]*>|https?:|www\.|\*\*|`/i.test(v)) this.add(where, 'markup, a link or code in the text');
    if (/%/.test(v)) this.add(where, 'a percentage in lesson text');
    return true;
  }
  hindi(where: string, v: unknown, required: boolean) {
    if (v === undefined || v === null) {
      if (required) this.add(where, 'Hindi missing');
      return;
    }
    if (this.text(where, v) && !/[ऀ-ॿ]/.test(v as string)) this.add(where, 'Hindi line has no Devanagari');
  }
  bi(where: string, v: unknown, hindiRequired: boolean) {
    const o = v as Bi;
    if (!o || typeof o !== 'object') return this.add(where, 'missing');
    this.text(`${where}.en`, o.en);
    this.hindi(`${where}.hi`, o.hi, hindiRequired);
  }
  sentence(where: string, v: unknown) {
    if (!this.text(where, v)) return;
    const n = wordCount(v as string);
    if (n > this.rules.maxWords) this.add(where, `${n} words; track ${this.track} allows ${this.rules.maxWords}`);
  }
  picture(where: string, v: unknown, required = true) {
    if (v === undefined && !required) return;
    if (!isCoursePicture(v)) this.add(where, `picture ${JSON.stringify(v)} is not on the course list (emoji.ts)`);
  }
  key(where: string, v: unknown, prefix: string) {
    if (typeof v !== 'string' || !v.startsWith(`${prefix}.`) || !KEY_PART.test(v.slice(prefix.length + 1))) {
      return this.add(where, `key ${JSON.stringify(v)} must be "${prefix}.<a-z0-9->"`);
    }
    if (this.keys.has(v)) this.add(where, `key ${v} used twice`);
    this.keys.add(v);
  }
  scene(where: string, s: unknown) {
    const sc = s as Scene;
    if (!sc || typeof sc !== 'object') return this.add(where, 'scene missing');
    if (!['home', 'school', 'market', 'field', 'village', 'clinic', 'station', 'road', 'festival', 'plain'].includes(sc.place)) this.add(`${where}.place`, 'unknown place');
    if (!Array.isArray(sc.pics) || sc.pics.length < 1 || sc.pics.length > 12) return this.add(`${where}.pics`, '1–12 pictures');
    sc.pics.forEach((p, i) => {
      this.picture(`${where}.pics[${i}]`, p?.pic);
      if (!(p?.x >= 0 && p.x <= 100 && p?.y >= 0 && p.y <= 60)) this.add(`${where}.pics[${i}]`, 'x 0–100 and y 0–60');
      if (p?.size !== undefined && !(p.size >= 0.5 && p.size <= 3)) this.add(`${where}.pics[${i}]`, 'size 0.5–3');
    });
  }
  option(where: string, o: unknown) {
    const op = o as Option;
    if (!op || (op.text === undefined && op.pic === undefined)) return this.add(where, 'an option needs text or a picture');
    if (op.text !== undefined) this.text(`${where}.text`, op.text, 120);
    if (op.pic !== undefined) this.picture(`${where}.pic`, op.pic);
    if (!this.rules.reads && op.pic === undefined) this.add(where, `track ${this.track} options are pictures`);
  }
  choose(where: string, it: ChooseItem, prefix: string) {
    this.key(`${where}.key`, it?.key, prefix);
    const p = it?.prompt;
    if (!p) return this.add(`${where}.prompt`, 'missing');
    this.text(`${where}.prompt.en`, p.en, 200);
    this.hindi(`${where}.prompt.hi`, p.hi, this.rules.hindi);
    if (p.pic !== undefined) this.picture(`${where}.prompt.pic`, p.pic);
    if (p.say !== undefined) this.sentence(`${where}.prompt.say`, p.say);
    const [lo, hi] = this.rules.options;
    if (!Array.isArray(it.options) || it.options.length < lo || it.options.length > hi) return this.add(`${where}.options`, `${lo}–${hi} options`);
    it.options.forEach((o, i) => this.option(`${where}.options[${i}]`, o));
    if (!Number.isInteger(it.answer) || it.answer < 0 || it.answer >= it.options.length) this.add(`${where}.answer`, 'answer is not one of the options');
    const seen = new Set(it.options.map((o) => `${o?.text ?? ''}|${o?.pic ?? ''}`));
    if (seen.size !== it.options.length) this.add(`${where}.options`, 'two options are the same');
    if (it.why !== undefined) this.bi(`${where}.why`, it.why, this.rules.hindi);
  }
  build(where: string, it: { key: string; tiles: string[]; answer: string }, prefix: string) {
    this.key(`${where}.key`, it?.key, prefix);
    if (!Array.isArray(it?.tiles) || it.tiles.length < 2 || it.tiles.length > 10) return this.add(`${where}.tiles`, '2–10 tiles');
    it.tiles.forEach((t, i) => this.text(`${where}.tiles[${i}]`, t, 40));
    this.sentence(`${where}.answer`, it.answer);
    if (typeof it.answer === 'string' && sortedWords(it.tiles.join(' ')) !== sortedWords(it.answer)) this.add(`${where}.answer`, 'the answer does not use exactly the tiles');
    if (typeof it.answer === 'string' && normaliseSentence(it.tiles.join(' ')) === normaliseSentence(it.answer)) this.add(`${where}.tiles`, 'the tiles are already in the right order');
  }
}

function checkStep(c: Checker, where: string, s: Step, lKey: string): void {
  const r = c.rules;
  if (!r.reads && READING_STEPS.includes(s.type)) c.add(where, `track ${c.track} does not read: no ${s.type} step`);
  switch (s.type) {
    case 'tip':
      c.bi(`${where}.text`, s.text, r.hindi);
      if (s.pic !== undefined) c.picture(`${where}.pic`, s.pic);
      return;
    case 'words': {
      if (!Array.isArray(s.words) || s.words.length < 1 || s.words.length > 10) return c.add(`${where}.words`, '1–10 words');
      s.words.forEach((w, i) => {
        const at = `${where}.words[${i}]`;
        c.key(`${at}.key`, w?.key, lKey);
        c.text(`${at}.en`, w?.en, 40);
        c.hindi(`${at}.hi`, w?.hi, true);
        c.picture(`${at}.pic`, w?.pic);
        if (w?.example !== undefined) {
          c.sentence(`${at}.example.en`, w.example.en);
          c.hindi(`${at}.example.hi`, w.example.hi, r.hindi);
        }
      });
      return;
    }
    case 'action':
      if (!Array.isArray(s.prompts) || s.prompts.length < 2 || s.prompts.length > 8) return c.add(`${where}.prompts`, '2–8 actions');
      s.prompts.forEach((p, i) => {
        c.sentence(`${where}.prompts[${i}].en`, p?.en);
        c.hindi(`${where}.prompts[${i}].hi`, p?.hi, true);
        c.picture(`${where}.prompts[${i}].pic`, p?.pic);
      });
      return;
    case 'pattern':
      c.bi(`${where}.title`, s.title, true);
      if (!['timeline', 'builder', 'question_flip', 'plural', 'compare', 'cards'].includes(s.visual)) c.add(`${where}.visual`, 'unknown visual');
      if (!Array.isArray(s.examples) || s.examples.length < 2 || s.examples.length > 8) return c.add(`${where}.examples`, '2–8 examples');
      s.examples.forEach((e, i) => {
        const at = `${where}.examples[${i}]`;
        c.sentence(`${at}.en`, e?.en);
        c.hindi(`${at}.hi`, e?.hi, r.hindi);
        if (e?.pic !== undefined) c.picture(`${at}.pic`, e.pic);
        if (s.visual === 'timeline' && !['past', 'now', 'future'].includes(e?.time as string)) c.add(`${at}.time`, 'a timeline example needs past, now or future');
        if (e?.parts !== undefined) {
          if (!Array.isArray(e.parts) || e.parts.length < 2) c.add(`${at}.parts`, 'at least 2 parts');
          else if (normaliseSentence(e.parts.map((p) => p.text).join(' ')) !== normaliseSentence(e.en)) c.add(`${at}.parts`, 'the parts do not make the sentence');
        }
        if (s.visual === 'builder' && e?.parts === undefined) c.add(`${at}.parts`, 'a builder example needs its parts');
      });
      if (s.note !== undefined) c.bi(`${where}.note`, s.note, r.hindi);
      return;
    case 'story':
      c.bi(`${where}.title`, s.title, true);
      c.scene(`${where}.scene`, s.scene);
      if (!Array.isArray(s.lines) || s.lines.length < 3 || s.lines.length > 14) return c.add(`${where}.lines`, '3–14 lines');
      s.lines.forEach((l, i) => {
        c.sentence(`${where}.lines[${i}].en`, l?.en);
        c.hindi(`${where}.lines[${i}].hi`, l?.hi, r.hindi);
        if (l?.speaker !== undefined) c.text(`${where}.lines[${i}].speaker`, l.speaker, 30);
        if (l?.pic !== undefined) c.picture(`${where}.lines[${i}].pic`, l.pic);
      });
      return;
    case 'choose':
      if (!Array.isArray(s.items) || s.items.length < 1 || s.items.length > 8) return c.add(`${where}.items`, '1–8 items');
      s.items.forEach((it, i) => c.choose(`${where}.items[${i}]`, it, lKey));
      return;
    case 'match':
      if (!Array.isArray(s.pairs) || s.pairs.length < 2 || s.pairs.length > 6) return c.add(`${where}.pairs`, '2–6 pairs');
      s.pairs.forEach((p, i) => {
        c.key(`${where}.pairs[${i}].key`, p?.key, lKey);
        c.option(`${where}.pairs[${i}].left`, p?.left);
        c.option(`${where}.pairs[${i}].right`, p?.right);
      });
      return;
    case 'build':
      if (!Array.isArray(s.items) || s.items.length < 1 || s.items.length > 6) return c.add(`${where}.items`, '1–6 items');
      s.items.forEach((it, i) => {
        c.build(`${where}.items[${i}]`, it, lKey);
        c.hindi(`${where}.items[${i}].hi`, it?.hi, false);
        if (it?.pic !== undefined) c.picture(`${where}.items[${i}].pic`, it.pic);
      });
      return;
    case 'say':
      if (!['repeat', 'answer', 'describe'].includes(s.mode)) c.add(`${where}.mode`, 'unknown mode');
      if (!Array.isArray(s.prompts) || s.prompts.length < 1 || s.prompts.length > 6) return c.add(`${where}.prompts`, '1–6 prompts');
      s.prompts.forEach((p, i) => {
        c.key(`${where}.prompts[${i}].key`, p?.key, lKey);
        c.sentence(`${where}.prompts[${i}].model`, p?.model);
        c.hindi(`${where}.prompts[${i}].hi`, p?.hi, r.hindi);
        if (p?.pic !== undefined) c.picture(`${where}.prompts[${i}].pic`, p.pic);
        if (p?.cue !== undefined) c.bi(`${where}.prompts[${i}].cue`, p.cue, r.hindi);
      });
      return;
    case 'roleplay': {
      c.bi(`${where}.title`, s.title, true);
      c.scene(`${where}.scene`, s.scene);
      if (!Array.isArray(s.roles) || s.roles.length < 2 || s.roles.length > 3) return c.add(`${where}.roles`, '2–3 roles');
      s.roles.forEach((ro, i) => {
        c.text(`${where}.roles[${i}].name`, ro?.name, 30);
        c.picture(`${where}.roles[${i}].pic`, ro?.pic);
      });
      if (!Number.isInteger(s.learner) || s.learner < 0 || s.learner >= s.roles.length) c.add(`${where}.learner`, 'not one of the roles');
      if (!Array.isArray(s.turns) || s.turns.length < 4 || s.turns.length > 12) return c.add(`${where}.turns`, '4–12 turns');
      s.turns.forEach((tu, i) => {
        if (!Number.isInteger(tu?.role) || tu.role < 0 || tu.role >= s.roles.length) c.add(`${where}.turns[${i}].role`, 'not one of the roles');
        c.sentence(`${where}.turns[${i}].en`, tu?.en);
        c.hindi(`${where}.turns[${i}].hi`, tu?.hi, r.hindi);
      });
      if (s.turns.filter((tu) => tu?.role === s.learner).length < 2) c.add(`${where}.turns`, 'the learner needs at least 2 turns');
      if (s.partner !== undefined) {
        c.text(`${where}.partner.goal`, s.partner.goal, 200);
        if (!Array.isArray(s.partner.must_use) || s.partner.must_use.length > 8) c.add(`${where}.partner.must_use`, 'up to 8 words');
      }
      return;
    }
    case 'picture':
      c.scene(`${where}.scene`, s.scene);
      if (!Array.isArray(s.questions) || s.questions.length < 2 || s.questions.length > 5) return c.add(`${where}.questions`, '2–5 questions');
      s.questions.forEach((q, i) => {
        c.key(`${where}.questions[${i}].key`, q?.key, lKey);
        c.sentence(`${where}.questions[${i}].en`, q?.en);
        c.hindi(`${where}.questions[${i}].hi`, q?.hi, r.hindi);
        c.sentence(`${where}.questions[${i}].model`, q?.model);
      });
      return;
    case 'bridge':
      if (!Array.isArray(s.items) || s.items.length < 1 || s.items.length > 5) return c.add(`${where}.items`, '1–5 items');
      s.items.forEach((it, i) => {
        c.hindi(`${where}.items[${i}].hi`, it?.hi, true);
        c.build(`${where}.items[${i}]`, it, lKey);
      });
      return;
    case 'talk':
      c.bi(`${where}.topic`, s.topic, true);
      if (!Number.isInteger(s.seconds) || s.seconds < 20 || s.seconds > 120) c.add(`${where}.seconds`, '20–120 seconds');
      if (!Array.isArray(s.outline) || s.outline.length < 2 || s.outline.length > 5) c.add(`${where}.outline`, '2–5 points');
      else s.outline.forEach((o, i) => c.bi(`${where}.outline[${i}]`, o, r.hindi));
      if (!Array.isArray(s.model) || s.model.length < 2 || s.model.length > 8) c.add(`${where}.model`, '2–8 model lines');
      else s.model.forEach((m, i) => c.sentence(`${where}.model[${i}]`, m));
      return;
    default:
      c.add(where, `unknown step type ${JSON.stringify((s as { type?: unknown })?.type)}`);
  }
}

function checkItems(c: Checker, where: string, items: CheckItem[], lKey: string): void {
  items.forEach((it, i) => {
    const at = `${where}[${i}]`;
    if (it?.type === 'choose') c.choose(at, it, lKey);
    else if (it?.type === 'build') {
      if (!c.rules.reads) c.add(at, `track ${c.track} does not read: no build item`);
      c.build(at, it, lKey);
      c.hindi(`${at}.hi`, it.hi, false);
      if (it.pic !== undefined) c.picture(`${at}.pic`, it.pic);
      if (it.why !== undefined) c.bi(`${at}.why`, it.why, c.rules.hindi);
    } else c.add(at, 'a check item is choose or build');
  });
}

function checkLesson(c: Checker, where: string, l: Lesson, track: Track, unit: number, n: number): void {
  const want = lessonKey(track, unit, n);
  if (l?.key !== want) c.add(`${where}.key`, `must be ${want}`);
  if (l?.kind !== LESSON_KINDS[n - 1]) c.add(`${where}.kind`, `lesson ${n} is the ${LESSON_KINDS[n - 1]} lesson`);
  c.bi(`${where}.title`, l?.title, true);
  c.bi(`${where}.home`, l?.home, true);
  const [lo, hi] = c.rules.minutes;
  if (!Number.isInteger(l?.minutes) || l.minutes < lo || l.minutes > hi) c.add(`${where}.minutes`, `${lo}–${hi} minutes for track ${track}`);
  if (!Array.isArray(l?.steps) || l.steps.length < 2 || l.steps.length > 12) return c.add(`${where}.steps`, '2–12 steps');
  l.steps.forEach((s, i) => checkStep(c, `${where}.steps[${i}]`, s, want));
  const types = new Set(l.steps.map((s) => s?.type));
  for (const need of LESSON_NEEDS[l.kind] ?? []) {
    if (!need.some((t) => types.has(t))) c.add(`${where}.steps`, `a ${l.kind} lesson needs a ${need.join(' or ')} step`);
  }
  if (l.kind === 'words') {
    const words = l.steps.flatMap((s) => (s.type === 'words' ? s.words : []));
    const [wl, wh] = c.rules.newWords;
    if (words.length < wl || words.length > wh) c.add(`${where}.steps`, `${words.length} new words; track ${track} brings ${wl}–${wh}`);
  }
  if (!Array.isArray(l.check)) return c.add(`${where}.check`, 'missing (an empty list for track a)');
  if (!c.rules.reads) {
    if (l.check.length > 0) c.add(`${where}.check`, 'track a has no scored check (12 §4)');
    return;
  }
  const [cl, ch] = l.kind === 'review' ? [5, 10] : [3, 8];
  if (l.check.length < cl || l.check.length > ch) c.add(`${where}.check`, `${cl}–${ch} check items`);
  checkItems(c, `${where}.check`, l.check, want);
}

// One unit file. `expected` is the unit the file name says it holds.
export function checkUnit(raw: unknown, track: Track, expected: number, c = new Checker(track)): CourseProblem[] {
  const u = raw as Unit;
  const where = unitKey(track, expected);
  if (!u || typeof u !== 'object') {
    c.add(where, 'not a unit object');
    return c.problems;
  }
  if (u.track !== track) c.add(`${where}.track`, `must be "${track}"`);
  if (u.unit !== expected) c.add(`${where}.unit`, `must be ${expected}`);
  if (u.key !== where) c.add(`${where}.key`, `must be ${where}`);
  c.bi(`${where}.title`, u.title, true);
  c.bi(`${where}.can_do`, u.can_do, true);
  c.picture(`${where}.pic`, u.pic);
  if (!Array.isArray(u.lessons) || u.lessons.length !== 5) {
    c.add(`${where}.lessons`, 'exactly 5 lessons');
    return c.problems;
  }
  u.lessons.forEach((l, i) => checkLesson(c, `${where}.l${i + 1}`, l, track, expected, i + 1));
  return c.problems;
}

export function checkAssessments(raw: unknown, track: Track, c = new Checker(track)): CourseProblem[] {
  const f = raw as AssessmentFile;
  const where = `${track}.assessments`;
  if (!f || f.track !== track || !Array.isArray(f.assessments)) {
    c.add(where, `an object with track "${track}" and an assessments list`);
    return c.problems;
  }
  const kinds = f.assessments.map((a) => a?.kind);
  if (kinds.join(',') !== ASSESSMENT_KINDS.join(',')) c.add(where, `the assessments are ${ASSESSMENT_KINDS.join(', ')}, in that order`);
  const skills: AssessmentSkill[] = c.rules.reads ? ['listening', 'words', 'grammar', 'reading'] : ['listening', 'words'];
  f.assessments.forEach((a, i) => {
    const key = `${track}.${a?.kind}`;
    const at = `${where}[${i}]`;
    if (a?.key !== key) c.add(`${at}.key`, `must be ${key}`);
    if (a?.track !== track) c.add(`${at}.track`, `must be "${track}"`);
    if (!Array.isArray(a?.sections) || a.sections.map((s) => s?.skill).join(',') !== skills.join(',')) {
      c.add(`${at}.sections`, `sections ${skills.join(', ')}, in that order`);
    } else {
      a.sections.forEach((s, j) => {
        if (!Array.isArray(s.items) || s.items.length < 3 || s.items.length > 10) c.add(`${at}.sections[${j}]`, '3–10 items');
        else checkItems(c, `${at}.sections[${j}].items`, s.items, key);
      });
    }
    if (!Array.isArray(a?.speaking) || a.speaking.length < 1 || a.speaking.length > 4) c.add(`${at}.speaking`, '1–4 speaking tasks');
    else
      a.speaking.forEach((sp, j) => {
        c.key(`${at}.speaking[${j}].key`, sp?.key, key);
        c.bi(`${at}.speaking[${j}].prompt`, sp?.prompt, true);
        c.sentence(`${at}.speaking[${j}].model`, sp?.model);
        if (!Array.isArray(sp?.criteria) || sp.criteria.length < 2 || sp.criteria.length > 4) c.add(`${at}.speaking[${j}].criteria`, '2–4 criteria');
        else sp.criteria.forEach((cr, k) => c.bi(`${at}.speaking[${j}].criteria[${k}]`, cr, true));
      });
  });
  return c.problems;
}

// A whole track: 18 units in order and the assessments, with every key unique across the track.
export function checkTrack(track: Track, units: unknown[], assessments: unknown): CourseProblem[] {
  const c = new Checker(track);
  if (units.length !== UNITS_PER_TRACK) c.add(track, `${units.length} unit files; a track has ${UNITS_PER_TRACK}`);
  units.forEach((u, i) => checkUnit(u, track, i + 1, c));
  checkAssessments(assessments, track, c);
  return c.problems;
}

// What the phone gets: check items without their answers or reasons, and their tiles in a fixed shuffled order.
export type ChildCheckItem = { key: string; type: 'choose'; prompt: Prompt; options: Option[] } | { key: string; type: 'build'; hi?: string; pic?: Picture; tiles: string[] };
export function forChild(item: CheckItem): ChildCheckItem {
  if (item.type === 'choose') return { key: item.key, type: 'choose', prompt: item.prompt, options: item.options };
  let tiles = shuffleByKey(item.tiles, item.key);
  // Never hand over the tiles already in the answer's order.
  if (normaliseSentence(tiles.join(' ')) === normaliseSentence(item.answer)) tiles = [...tiles.slice(1), tiles[0]];
  return { key: item.key, type: 'build', hi: item.hi, pic: item.pic, tiles };
}
export function lessonForChild(l: Lesson): Omit<Lesson, 'check'> & { check: ChildCheckItem[] } {
  return { ...l, check: l.check.map(forChild) };
}

// A stable shuffle: the same item always shows its tiles in the same order, never the answer's order.
export function shuffleByKey<T>(xs: readonly T[], key: string): T[] {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619) >>> 0;
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 13), 1103515245) >>> 0;
    const j = h % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  const same = out.every((x, i) => x === xs[i]);
  if (same && out.length > 1) out.push(out.shift() as T);
  return out;
}

export type ItemResult = { key: string; correct: boolean; answer: string; why?: Bi };
// Scores a check on the server. An answer is a choice index (choose) or the built sentence (build). An item with no
// answer counts as not correct.
export function scoreItems(items: CheckItem[], answers: Record<string, unknown>): { results: ItemResult[]; score: number } {
  const results = items.map((it): ItemResult => {
    const given = answers[it.key];
    if (it.type === 'choose') {
      const correct = Number.isInteger(given) && given === it.answer;
      const right = it.options[it.answer];
      return { key: it.key, correct, answer: right?.text ?? right?.pic ?? '', why: it.why };
    }
    const correct = typeof given === 'string' && normaliseSentence(given) === normaliseSentence(it.answer);
    return { key: it.key, correct, answer: it.answer, why: it.why };
  });
  const score = items.length === 0 ? 100 : Math.round((100 * results.filter((r) => r.correct).length) / items.length);
  return { results, score };
}

// Stars for a lesson (12 §8): 3 for every item right on the first try, 2 for a score of PASS_SCORE or more, 1 for
// that after earlier tries; track A, which has no scored check, gets 3 when the grown-up says it was done. 0 means not done yet.
export const PASS_SCORE = 80;
export function lessonStars(track: Track, score: number, attempt: number): 0 | 1 | 2 | 3 {
  if (!TRACK_RULES[track].reads) return 3;
  if (score < PASS_SCORE) return 0;
  if (attempt > 1) return 1;
  return score === 100 ? 3 : 2;
}
