// The school's exam types (C230-AJ part 2, C357): its own list, kept as the Exams setting "exam_types" (docs/17 §1a).
// A school renames, hides or adds types; each exam names one by its key (exams.exam_type). "other" is always there:
// existing exams are "other", and a type removed from the list reads as "other" too.

export type ExamTypeRow = { key: string; en: string; hi: string; hidden: boolean };

export const EXAM_TYPE_KEY = /^[a-z][a-z0-9_]{1,39}$/;
export const OTHER_EXAM_TYPE = 'other';
export const MAX_EXAM_TYPES = 30;

export const DEFAULT_EXAM_TYPES: readonly ExamTypeRow[] = [
  { key: 'weekly', en: 'Weekly test', hi: 'साप्ताहिक परीक्षा', hidden: false },
  { key: 'monthly', en: 'Monthly test', hi: 'मासिक परीक्षा', hidden: false },
  { key: 'unit', en: 'Unit test', hi: 'इकाई परीक्षा', hidden: false },
  { key: 'periodic', en: 'Periodic test', hi: 'आवधिक परीक्षा', hidden: false },
  { key: 'sessional', en: 'Sessional', hi: 'सत्रीय परीक्षा', hidden: false },
  { key: 'half_yearly', en: 'Half-yearly', hi: 'अर्धवार्षिक परीक्षा', hidden: false },
  { key: 'annual', en: 'Annual', hi: 'वार्षिक परीक्षा', hidden: false },
  { key: 'practical', en: 'Practical', hi: 'प्रायोगिक परीक्षा', hidden: false },
  { key: 'pre_board', en: 'Mock or pre-board', hi: 'मॉक या प्री-बोर्ड', hidden: false },
  { key: 'other', en: 'Other', hi: 'अन्य', hidden: false },
];

// A type's name in the reader's language; a key the list no longer has reads as "other".
export function examTypeName(types: readonly ExamTypeRow[], key: string, lang: 'en' | 'hi'): string {
  const t = types.find((x) => x.key === key) ?? types.find((x) => x.key === OTHER_EXAM_TYPE) ?? DEFAULT_EXAM_TYPES[DEFAULT_EXAM_TYPES.length - 1];
  return lang === 'hi' ? t.hi : t.en;
}

// The types a new exam may take, and an existing exam may be changed to: the shown ones, and the exam's own current
// type even when the school has since hidden it (hiding a type never changes an exam that has it).
export function offeredExamTypes(types: readonly ExamTypeRow[], current: string | null = null): ExamTypeRow[] {
  return types.filter((t) => !t.hidden || t.key === current);
}

// A type's name in both languages, for a reader whose language is chosen on the screen; a key the list no longer has
// reads as "other".
export function examTypeLabel(types: readonly ExamTypeRow[], key: string): { key: string; en: string; hi: string } {
  const t = types.find((x) => x.key === key) ?? types.find((x) => x.key === OTHER_EXAM_TYPE) ?? DEFAULT_EXAM_TYPES[DEFAULT_EXAM_TYPES.length - 1];
  return { key: t.key, en: t.en, hi: t.hi };
}
