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

// Subjects open to every child (C298): the Control setting's key, and its stored value read as known subject ids only.
// Control writes it and the Family app enforces it, so both read it through this one rule.
export const OPEN_SUBJECTS_KEY = 'family.open_subjects';
export const openSubjectsOf = (v: unknown): Subject[] => (Array.isArray(v) ? SUBJECT_IDS.filter((s) => v.includes(s)) : []);
