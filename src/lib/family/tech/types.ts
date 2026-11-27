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
  vocab?: { term: string; en?: string; hi?: string; hinglish?: string }[];
  see?: { step?: number; caption?: Localized; visual?: string; narration?: Localized }[];
  play?: { lab?: string; config?: Record<string, unknown>; goal?: Localized };
  understand?: { heading?: Localized; body?: Localized; analogy?: Localized; realExample?: Localized }[];
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
