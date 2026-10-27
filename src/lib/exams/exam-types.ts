import { DEFAULT_EXAM_TYPES, EXAM_TYPE_KEY, MAX_EXAM_TYPES, OTHER_EXAM_TYPE, type ExamTypeRow } from '@/lib/contracts/exam-types';
import { SETTINGS_SCHEMAS } from '@/lib/frameworks/settings-schemas';
import { readSettings } from '@/lib/frameworks/settings-store';
import type { Sql } from '@/lib/jobs/types';

// The school's exam types as they are in force (C230-AJ part 2, C357): its Exams setting "exam_types", made safe to
// use. A row with a key that is not a key, a second row with the same key, or empty names is left out; a row with one
// name takes it for the other language; "other" is always there (shown, whatever the setting says), so every exam has
// a type to read as.

export function cleanExamTypes(raw: unknown): ExamTypeRow[] {
  const rows = Array.isArray(raw) ? raw : DEFAULT_EXAM_TYPES;
  const out: ExamTypeRow[] = [];
  for (const r of rows.slice(0, MAX_EXAM_TYPES)) {
    if (typeof r !== 'object' || r === null) continue;
    const { key, en, hi, hidden } = r as Record<string, unknown>;
    if (typeof key !== 'string' || !EXAM_TYPE_KEY.test(key) || out.some((t) => t.key === key)) continue;
    const e = typeof en === 'string' ? en.trim().slice(0, 60) : '';
    const h = typeof hi === 'string' ? hi.trim().slice(0, 60) : '';
    if (!e && !h) continue;
    out.push({ key, en: e || h, hi: h || e, hidden: key === OTHER_EXAM_TYPE ? false : hidden === true });
  }
  if (!out.some((t) => t.key === OTHER_EXAM_TYPE)) out.push({ ...DEFAULT_EXAM_TYPES.find((t) => t.key === OTHER_EXAM_TYPE)! });
  return out;
}

export async function examTypesOf(db: Sql, schoolId: string): Promise<ExamTypeRow[]> {
  const schema = SETTINGS_SCHEMAS.find((s) => s.moduleId === 'exams');
  if (!schema) return cleanExamTypes(null);
  return cleanExamTypes((await readSettings(db, schoolId, schema)).effective.exam_types);
}

// A type's name in the reader's language; a key the list no longer has reads as "other".
export function examTypeName(types: readonly ExamTypeRow[], key: string, lang: 'en' | 'hi'): string {
  const t = types.find((x) => x.key === key) ?? types.find((x) => x.key === OTHER_EXAM_TYPE) ?? DEFAULT_EXAM_TYPES[DEFAULT_EXAM_TYPES.length - 1];
  return lang === 'hi' ? t.hi : t.en;
}
