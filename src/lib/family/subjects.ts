// The subjects a child can study (Wave A step 2a, C264). M1 had two, fixed in code; a child of any class now studies
// the subjects of their class: those the catalog released to everyone holds for the child's syllabus board and class,
// and, until the catalog has them, the school subjects every board teaches at that stage, so a typed question can be
// asked in them. A subject is one of the known ids below: each has its name in both message files
// (`fam.subject.<id>`). Safe for the phone: no database or message file is imported here.

export const SUBJECT_IDS = [
  'mathematics',
  'science',
  'evs',
  'social_science',
  'english',
  'hindi',
  'sanskrit',
  'physics',
  'chemistry',
  'biology',
  'accountancy',
  'business_studies',
  'economics',
  'history',
  'geography',
  'political_science',
  'computer_science',
  'informatics_practices',
  'psychology',
  'sociology',
] as const;
export type Subject = (typeof SUBJECT_IDS)[number];
export const isSubject = (v: unknown): v is Subject => typeof v === 'string' && (SUBJECT_IDS as readonly string[]).includes(v);

// The school subjects of each stage (NCF 2023's stages), in the order the Study page shows them.
export function stageSubjects(classLevel: number): Subject[] {
  if (classLevel <= 0) return [];
  if (classLevel <= 2) return ['mathematics', 'english', 'hindi'];
  if (classLevel <= 5) return ['mathematics', 'evs', 'english', 'hindi'];
  if (classLevel <= 10) return ['mathematics', 'science', 'social_science', 'english', 'hindi'];
  return ['mathematics', 'physics', 'chemistry', 'biology', 'accountancy', 'business_studies', 'economics', 'history', 'geography', 'political_science', 'english', 'hindi'];
}

// The stage's subjects first, then any other known subject the catalog holds for the class.
export function subjectsOfClass(classLevel: number, catalogSubjects: readonly string[]): Subject[] {
  const stage = stageSubjects(classLevel);
  if (classLevel <= 0) return [];
  const extra = SUBJECT_IDS.filter((s) => catalogSubjects.includes(s) && !stage.includes(s));
  return [...stage, ...extra];
}
