// A Tech Lab lesson as committed (schema nca-techlab/1). Answers stay on the server.

import type { TechLang } from './text';

export type Localized = string | { en?: string; hi?: string; hinglish?: string; text?: string };

export type TechQuestion = {
  id: string;
  type: string;
  prompt?: Localized;
  options?: unknown;
  answer?: unknown;
  explain?: Localized;
  difficulty?: number;
};

// ---- the teaching layer (C557): optional, so every older lesson still loads as it is ----------------------------------
// A part of a diagram (a component, a stage, a node), drawn by the `diagram` template in SeeVisual.
export type DiagramPart = { id: string; label: Localized; note?: Localized; icon?: string };
// A diagram: parts in rows (each row a list of part ids, drawn left to right) and the links between them.
export type TechDiagram = { parts: DiagramPart[]; rows: string[][]; links?: { from: string; to: string; label?: Localized }[] };
// One beat of a See step: what the teacher says, which part is lit while it is said, and values shown on parts
// (a register's number, a packet's address). Narrated in order, one beat at a time.
export type SeeBeat = { narration: Localized; focus?: string; values?: Record<string, string> };
// The lesson's own opening: a familiar situation (may hold {{name}}) and the question it raises.
export type LessonHook = { text: Localized; question: Localized };
// Predict before seeing: a choice, then why. Not marked, never counts toward the lesson.
// On the phone (forChild) answer and explain are absent: the lesson route gives them once the child has chosen.
export type LessonPredict = { prompt: Localized; options: Localized[]; answer: number; explain: Localized };
// Teach-back: the child explains it in their own words (aloud or typed; nothing is kept), then checks against what a
// good explanation mentions.
export type LessonTeachBack = { prompt: Localized; checklist: Localized[] };

export type TechLesson = {
  schema: string;
  id: string;
  level: number;
  classes: number[];
  unit: string;
  title: Localized;
  minutes: number;
  xp: number;
  prereq?: string[];
  outcomes?: Localized[];
  hook?: LessonHook;
  predict?: LessonPredict;
  teachBack?: LessonTeachBack;
  // A term is introduced after the idea (stage 6): its meaning (en/hi/hinglish), and optionally what it does and where
  // it is found.
  vocab?: { term: string; en?: string; hi?: string; hinglish?: string; does?: Localized; where?: Localized }[];
  see?: { step?: number; caption?: Localized; visual?: string; narration?: Localized; diagram?: TechDiagram; beats?: SeeBeat[] }[];
  play?: { lab?: string; config?: Record<string, unknown>; goal?: Localized };
  // `limit`: where the analogy stops being true (stage 7). `advanced`: an optional deeper paragraph for older classes.
  understand?: { heading?: Localized; body?: Localized; analogy?: Localized; limit?: Localized; realExample?: Localized; advanced?: Localized }[];
  try?: { mission?: Localized; questions?: TechQuestion[] };
  sources?: { title?: string; url?: string; licence?: string }[];
};

export type LessonSummary = {
  key: string;
  title: Localized;
  minutes: number;
  xp: number;
  lab: string | null;
  prereq: string[];
};

export type UnitSummary = {
  id: string;
  level: 1 | 2 | 3;
  strand: string;
  classes: number[];
  title: Localized;
  badge: { id: string; name: Localized; emoji: string } | null;
  lessons: LessonSummary[];
};

export type StrandInfo = { en: string; hi?: string; hinglish?: string; e: string };

export type LevelInfo = {
  level: 1 | 2 | 3;
  classes: number[];
  title: Localized;
  goal?: Localized;
};

export type LabInfo = { id: string; level: 'L1' | 'L2' | 'L3' };

export type CourseCatalog = {
  levels: LevelInfo[];
  strands: Record<string, StrandInfo>;
  units: UnitSummary[];
  labs: LabInfo[];
};

export type LessonDone = { stars: number; best: number; xp: number };

export type TechProgress = {
  xp: number;
  done: Record<string, LessonDone>;
  badges: string[];
  labs: string[];
};

export const EMPTY_PROGRESS: TechProgress = { xp: 0, done: {}, badges: [], labs: [] };

export type ScoredQuestion = { id: string; right: boolean; explain: string; mark: unknown };

export type FinishResult = {
  right: number;
  total: number;
  passed: boolean;
  stars: 0 | 1 | 2 | 3;
  gain: number;
  xp: number;
  totalXp: number;
  saved: boolean;
  questions: ScoredQuestion[];
  badges: { id: string; emoji: string; name: string }[];
};

export type TechWords = Record<string, Record<TechLang, string>>;
