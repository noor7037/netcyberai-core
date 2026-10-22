// The subject ids every part of NetCyberAI shares (C264; moved here for C298 so Control can name them without
// importing Family app code, 03 §14). Each has its name in both message files (`fam.subject.<id>`). No imports.

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

// Control's two lists of subjects for the Family app, and a stored list read as known subject ids only. Control writes
// them and the Family app enforces them, so both read them through this one rule.
//   open           open to every child, whatever their free subject is (C298: the pilot's EVS)
//   reviewed_only  a chapter or topic shows only an explanation NetCyberAI has checked (C300: the pilot's EVS)
export const SUBJECT_LIST_KEYS = { open: 'family.open_subjects', reviewed_only: 'family.reviewed_only_subjects' } as const;
export type SubjectList = keyof typeof SUBJECT_LIST_KEYS;
export const OPEN_SUBJECTS_KEY = SUBJECT_LIST_KEYS.open;
export const subjectListOf = (v: unknown): Subject[] => (Array.isArray(v) ? SUBJECT_IDS.filter((s) => v.includes(s)) : []);
