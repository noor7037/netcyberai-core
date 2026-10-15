// One class order everywhere (C235-A): Nursery < LKG < UKG < 1 < 2 < … < 12, then the section, then the name.
// Ordering by name alone put "10-A" before "2-A"; every list and chooser of classes now uses this order, in
// TypeScript (compareClasses) or in SQL (classOrderSql), and the two agree (test/classes/class-order.test.ts).
//
// The grade is read from the class's `grade` column, or from the start of its name when that is empty ("5-A",
// "5A", "LKG-B", "Nursery"), case ignored. A grade outside Nursery, LKG, UKG and 1 to 12 sorts after 12 (a number
// above 12 by its number, anything else last), so a class named in a school's own way is still listed, never lost.

export const PRE_PRIMARY_GRADES = ['Nursery', 'LKG', 'UKG'] as const;
// The grades of an Indian school, in order: what a class's grade may be (the classes CSV and the standard set).
export const SCHOOL_GRADES: readonly string[] = [...PRE_PRIMARY_GRADES, ...Array.from({ length: 12 }, (_, i) => String(i + 1))];

const UNKNOWN_RANK = 1000;
const GRADE_START = /^(NURSERY|LKG|UKG|[0-9]{1,2})/;

// The grade a class is in, as a rank: Nursery 0, LKG 1, UKG 2, 1 is 3 … 12 is 14; unknown last.
export function classRank(grade: string | null | undefined, name: string | null | undefined): number {
  const source = (grade?.trim() ? grade : name ?? '').trim().toUpperCase();
  const key = GRADE_START.exec(source)?.[1];
  if (!key) return UNKNOWN_RANK;
  const pre = (PRE_PRIMARY_GRADES as readonly string[]).findIndex((g) => g.toUpperCase() === key);
  return pre >= 0 ? pre : 2 + Number(key);
}

export type OrderableClass = { name?: string | null; grade?: string | null; section?: string | null };

// The section a class is ordered by: its `section` column, or else what its name has after the grade, letters and
// digits only ("6B" and "6-B" are both B), so a class named without a section column still sits among its grade's.
export function sectionKey(section: string | null | undefined, name: string | null | undefined): string {
  const own = (section ?? '').trim().toUpperCase();
  if (own) return own;
  return (name ?? '').trim().toUpperCase().replace(GRADE_START, '').replace(/[^A-Z0-9]/g, '');
}

// Plain code-point comparison, as SQL's collate "C": the same answer on every machine and in the database.
const byCode = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function compareClasses(a: OrderableClass, b: OrderableClass): number {
  return classRank(a.grade, a.name) - classRank(b.grade, b.name) || byCode(sectionKey(a.section, a.name), sectionKey(b.section, b.name)) || byCode(a.name ?? '', b.name ?? '');
}

export function sortClasses<T extends OrderableClass>(rows: readonly T[]): T[] {
  return [...rows].sort(compareClasses);
}

// The same order as an SQL `order by` list, for a classes row under `alias` (empty for none). Put the class id or
// the row's own columns after it when two rows of one class must keep a fixed order.
export function classOrderSql(alias = 'c'): string {
  const p = alias ? `${alias}.` : '';
  const key = `substring(upper(btrim(coalesce(nullif(btrim(${p}grade), ''), ${p}name, ''))) from '^(NURSERY|LKG|UKG|[0-9]{1,2})')`;
  // coalesce evaluates left to right and stops at the first value: the cast runs only for a number (or nothing).
  const section = `coalesce(nullif(upper(btrim(${p}section)), ''), regexp_replace(regexp_replace(upper(btrim(coalesce(${p}name, ''))), '^(NURSERY|LKG|UKG|[0-9]{1,2})', ''), '[^A-Z0-9]', '', 'g'))`;
  return `coalesce(array_position(array['NURSERY', 'LKG', 'UKG'], ${key}) - 1, 2 + ${key}::int, ${UNKNOWN_RANK}), ${section} collate "C", ${p}name collate "C"`;
}
