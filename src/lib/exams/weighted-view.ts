import { examTypeLabel } from '@/lib/contracts/exam-types';
import type { Sql } from '@/lib/jobs/types';
import { examTypesOf } from './exam-types';
import type { ExamTypeWeight } from './scheme';

// The names of the exam types a scheme counts (C230-AJ part 2), for the screens that show the counted result: the class
// result, the report cards and their PDF. Each type's name in both languages as the school's own list says it (a type the
// list no longer has reads as "other"); the screen picks the reader's language. The result itself is worked out by
// weightedForClass and weightedChildResult (results.ts); this only names its types.

export type WeightedNames = Record<string, { en: string; hi: string }>;

export async function weightedNamesOf(db: Sql, schoolId: string, weights: readonly ExamTypeWeight[]): Promise<WeightedNames> {
  const types = await examTypesOf(db, schoolId);
  return Object.fromEntries(
    weights.map((w) => {
      const l = examTypeLabel(types, w.type);
      return [w.type, { en: l.en, hi: l.hi }];
    })
  );
}
