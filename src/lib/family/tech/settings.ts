// The parent's Tech & AI Lab choices for one child (C557), set in the parent area like the English course's: the class
// the course is shown for (null: the child's own class, which never changes) and the topic areas switched off. A topic
// area switched off is hidden from the child; its lessons and the child's progress in it are kept.

import type { CourseCatalog } from './types';

type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

export type TechSettings = { courseClass: number | null; strandsOff: string[] };
export const DEFAULT_TECH_SETTINGS: TechSettings = { courseClass: null, strandsOff: [] };

export const STRAND_IDS = ['hw', 'elec', 'os', 'sw', 'prog', 'web', 'net', 'cloud', 'data', 'cyber', 'robo', 'ai', 'ds', 'cit', 'career'] as const;

export function isCourseClass(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= -2 && (value as number) <= 12;
}

// What may be stored: a class from Nursery to 12 or none, and known topic areas, each once.
export function cleanSettings(input: { courseClass?: unknown; strandsOff?: unknown }): TechSettings | null {
  const courseClass = input.courseClass == null ? null : isCourseClass(input.courseClass) ? input.courseClass : undefined;
  if (courseClass === undefined) return null;
  if (!Array.isArray(input.strandsOff) || input.strandsOff.length > STRAND_IDS.length) return null;
  if (!input.strandsOff.every((id) => (STRAND_IDS as readonly unknown[]).includes(id))) return null;
  return { courseClass, strandsOff: [...new Set(input.strandsOff as string[])].sort() };
}

export async function readTechSettings(db: Db, childId: string): Promise<TechSettings> {
  const ready = await db.query(`select to_regclass('family.tech_settings') as t`);
  if (ready.rows[0]?.t == null) return { ...DEFAULT_TECH_SETTINGS };
  const { rows } = await db.query(`select course_class, strands_off from family.tech_settings where child_id = $1`, [childId]);
  const row = rows[0];
  if (!row) return { ...DEFAULT_TECH_SETTINGS };
  return { courseClass: row.course_class == null ? null : Number(row.course_class), strandsOff: Array.isArray(row.strands_off) ? (row.strands_off as string[]) : [] };
}

export async function saveTechSettings(db: Db, accountId: string, childId: string, settings: TechSettings): Promise<void> {
  await db.query(
    `insert into family.tech_settings (account_id, child_id, course_class, strands_off, updated_at) values ($1, $2, $3, $4, now())
     on conflict (child_id) do update set course_class = excluded.course_class, strands_off = excluded.strands_off, updated_at = now()`,
    [accountId, childId, settings.courseClass, settings.strandsOff]
  );
}

// The course this child sees: the units of topic areas still on, and the labs and badges that go with them.
export function visibleCatalog(catalog: CourseCatalog, settings: TechSettings): CourseCatalog {
  if (!settings.strandsOff.length) return catalog;
  const off = new Set(settings.strandsOff);
  return { ...catalog, units: catalog.units.filter((unit) => !off.has(unit.strand)) };
}

// The class the course is shown for.
export function courseClassOf(settings: TechSettings, childClass: number): number {
  return settings.courseClass ?? childClass;
}
