// The subjects a child can study (Wave A step 2a, C264). M1 had two, fixed in code; a child of any class now studies
// the subjects of their class: those the catalog released to everyone holds for the child's syllabus board and class,
// and, until the catalog has them, the school subjects every board teaches at that stage, so a typed question can be
// asked in them. A subject is one of the known ids below: each has its name in both message files
// (`fam.subject.<id>`). Safe for the phone: no database or message file is imported here.

export { SUBJECT_IDS, isSubject, type Subject } from '@/lib/contracts/subjects';
import { SUBJECT_IDS, type Subject } from '@/lib/contracts/subjects';

// The school subjects of each stage (NCF 2023's stages), in the order the Study page shows them. A board that divides a
// stage's subjects differently says so here (C272): ICSE (CISCE) teaches Classes 9 and 10 as Physics, Chemistry and
// Biology, and History and Civics with Geography, not as Science and Social Science.
// Classes 11 and 12 can be narrowed to a stream (S4, C377): the subjects of Science, Commerce or Humanities, with the
// languages every stream keeps. No stream chosen (or a class below 11) keeps the whole stage, as before.
export const STREAMS = ['science', 'commerce', 'humanities'] as const;
export type Stream = (typeof STREAMS)[number];
export const isStream = (v: unknown): v is Stream => (STREAMS as readonly unknown[]).includes(v);
export const STREAM_FROM_CLASS = 11;
const STREAM_SUBJECTS: Record<Stream, readonly Subject[]> = {
  science: ['mathematics', 'physics', 'chemistry', 'biology', 'english', 'hindi'],
  commerce: ['mathematics', 'accountancy', 'business_studies', 'economics', 'english', 'hindi'],
  humanities: ['history', 'geography', 'political_science', 'economics', 'english', 'hindi'],
};

export function stageSubjects(classLevel: number, board?: string, stream?: Stream | null): Subject[] {
  if (classLevel <= 0) return [];
  if (classLevel <= 2) return ['mathematics', 'english', 'hindi'];
  if (classLevel <= 5) return ['mathematics', 'evs', 'english', 'hindi'];
  if (classLevel >= 9 && classLevel <= 10 && board === 'CISCE') return ['mathematics', 'physics', 'chemistry', 'biology', 'history', 'geography', 'english', 'hindi'];
  if (classLevel <= 10) return ['mathematics', 'science', 'social_science', 'english', 'hindi'];
  const all: Subject[] = ['mathematics', 'physics', 'chemistry', 'biology', 'accountancy', 'business_studies', 'economics', 'history', 'geography', 'political_science', 'english', 'hindi'];
  return stream ? all.filter((x) => STREAM_SUBJECTS[stream].includes(x)) : all;
}

// The stage's subjects first, then any other known subject the catalog holds for the class.
export function subjectsOfClass(classLevel: number, catalogSubjects: readonly string[], board?: string, stream?: Stream | null): Subject[] {
  const stage = stageSubjects(classLevel, board, stream);
  if (classLevel <= 0) return [];
  // Another stream's subjects are not added back from the catalog; any other subject it holds is.
  const whole = stageSubjects(classLevel, board);
  const extra = SUBJECT_IDS.filter((s) => catalogSubjects.includes(s) && !stage.includes(s) && !whole.includes(s));
  return [...stage, ...extra];
}
