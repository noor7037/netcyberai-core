import type { Subject } from './subjects';
import type { TopicProgress } from './learning';
import { subjectColour, type SubjectColour } from './subject-colours';

// The child's home as in the overview board (D1-2, C294; docs/family-app/09 §1–§2): which parts show, the greeting by
// the time of day in India, and one tile per subject of the child's class. Pure, so the rules are tested without a page.

// One bundled picture per subject (public/family/pictures). Neutral and secular: Hindi and Sanskrit take a pen and a
// book, never a religious sign.
export const SUBJECT_PICTURES: Record<Subject, string> = {
  mathematics: '🔢',
  science: '🔬',
  evs: '🌱',
  social_science: '🌍',
  english: '🔤',
  hindi: '✍️',
  sanskrit: '📖',
  physics: '⚡',
  chemistry: '🧪',
  biology: '🌿',
  accountancy: '🧮',
  business_studies: '📈',
  economics: '💰',
  history: '🏛️',
  geography: '🗺️',
  political_science: '⚖️',
  computer_science: '💻',
  informatics_practices: '🖥️',
  psychology: '🧠',
  sociology: '👥',
};

export const subjectPicture = (s: string) => SUBJECT_PICTURES[s as Subject] ?? '📚';

export type Greeting = 'morning' | 'afternoon' | 'evening';

// The hour in India (UTC+05:30, no daylight saving) of a moment.
export function indiaHour(at: Date = new Date()): number {
  return Math.floor(((at.getTime() / 60000 + 330) % 1440 + 1440) % 1440 / 60);
}

export function greetingOf(hour: number): Greeting {
  if (hour >= 4 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  return 'evening';
}

// 09 §2: classes 1–5 get larger tiles and pictures; class 9 and up a calmer header.
export type HomeStage = 'young' | 'middle' | 'senior';
export const stageOf = (classLevel: number): HomeStage => (classLevel <= 5 ? 'young' : classLevel >= 9 ? 'senior' : 'middle');

export type HomeInput = {
  modules: { plan: boolean; habit: boolean; homework: boolean; voiceInput: boolean };
  consents: { voicePractice: boolean };
  hasPlan: boolean;
  hasHabit: boolean;
  hasTalk: boolean;
  subjects: number;
  progress: number;
};

export type HomeParts = { plan: boolean; camera: boolean; microphone: boolean; talk: boolean; week: boolean; tiles: boolean; welcome: boolean };

// Each part only when its module is switched on and its data exists. A first-time child (no plan items and no
// checked answers yet) gets the designed welcome first, pointing to the first step; never an empty card.
export function homeParts(i: HomeInput): HomeParts {
  const plan = i.modules.plan && i.hasPlan;
  const tiles = i.subjects > 0;
  return {
    plan,
    camera: i.modules.homework,
    microphone: i.modules.voiceInput && i.consents.voicePractice,
    talk: i.modules.habit && i.hasTalk,
    week: i.modules.habit && i.hasHabit,
    tiles,
    welcome: !plan && i.progress === 0,
  };
}

export type SubjectTile = { subject: Subject; picture: string; colour: SubjectColour; checked: number; mastered: number; isFree: boolean; open: boolean; href: string };

// One tile per subject of the child's class, in the class's order with the free subject first; the topics checked and
// mastered come from progress (checked answers only). A subject other than the free one is closed until Family Plus.
export function subjectTiles(subjects: Subject[], progress: Pick<TopicProgress, 'subject' | 'mastered'>[], freeSubject: Subject | null): SubjectTile[] {
  const ordered = freeSubject && subjects.includes(freeSubject) ? [freeSubject, ...subjects.filter((s) => s !== freeSubject)] : subjects;
  return ordered.map((subject) => {
    const mine = progress.filter((p) => p.subject === subject);
    return {
      subject,
      picture: subjectPicture(subject),
      colour: subjectColour(subject),
      checked: mine.length,
      mastered: mine.filter((p) => p.mastered).length,
      isFree: freeSubject === subject,
      open: !freeSubject || freeSubject === subject,
      href: `/family/study?subject=${subject}`,
    };
  });
}
