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
