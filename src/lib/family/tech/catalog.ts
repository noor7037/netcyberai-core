// The Tech Lab course, read from the lesson files in the repository. The phone's copy has answers removed
// (forChild). Progress, when the tables exist, is separate.

import fs from 'node:fs';
import path from 'node:path';
import { forChild } from './score';
import type { CourseCatalog, LabInfo, LevelInfo, Localized, StrandInfo, TechLesson, UnitSummary } from './types';

export const LESSON_KEY = /^L[1-3]\.[a-z0-9][a-z0-9-]{1,40}\.[0-9]{2}$/;

type UnitFile = {
  id: string;
  level: number;
  title: Localized;
  classes: number[];
  lessons?: string[];
  badge?: { id?: string; name?: Localized; emoji?: string };
};

type Meta = {
  levels: LevelInfo[];
  strands: Record<string, StrandInfo>;
  labs: LabInfo[];
  units: { id: string; level: number; strand: string; position: number }[];
};

type Loaded = {
  catalog: CourseCatalog;
  lessons: Map<string, TechLesson>;
};

let loaded: Loaded | null = null;

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

function walk(dir: string, units: UnitFile[], lessons: TechLesson[]) {
  for (const name of fs.readdirSync(dir)) {
    if (name.startsWith('_')) continue;
    const file = path.join(dir, name);
    const stat = fs.statSync(file);
    if (stat.isDirectory()) {
      walk(file, units, lessons);
      continue;
    }
    if (!name.endsWith('.json')) continue;
    if (name === 'unit.json') units.push(readJson<UnitFile>(file));
    else lessons.push(readJson<TechLesson>(file));
  }
}

function asLevel(value: number): 1 | 2 | 3 {
  return value === 1 || value === 2 || value === 3 ? value : 2;
}

function build(): Loaded {
  const root = path.join(process.cwd(), 'content/tech');
  const meta = readJson<Meta>(path.join(root, 'meta.json'));
  const unitFiles: UnitFile[] = [];
  const lessonFiles: TechLesson[] = [];
  walk(path.join(root, 'lessons'), unitFiles, lessonFiles);
  const lessons = new Map<string, TechLesson>();
  for (const lesson of lessonFiles) {
    if (lesson.schema !== 'nca-techlab/1' || !LESSON_KEY.test(lesson.id)) continue;
    lessons.set(lesson.id, lesson);
  }
  const strandOf = new Map(meta.units.map((unit) => [unit.id, unit.strand]));
  const positionOf = new Map(meta.units.map((unit) => [unit.id, unit.position]));
  const units: UnitSummary[] = unitFiles
    .filter((unit) => /^L[1-3]\.[a-z0-9][a-z0-9-]{1,40}$/.test(unit.id))
    .map((unit) => {
      const listed = (unit.lessons ?? []).filter((id) => lessons.has(id));
      const extra = [...lessons.values()].filter((lesson) => lesson.unit === unit.id.split('.').slice(1).join('.') && !listed.includes(lesson.id)).map((lesson) => lesson.id);
      const keys = [...listed, ...extra].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
      return {
        id: unit.id,
        level: asLevel(Number(unit.level)),
        strand: strandOf.get(unit.id) || 'hw',
        classes: (unit.classes ?? []).map(Number).filter((n) => n >= -2 && n <= 12),
        title: unit.title,
        badge: unit.badge?.emoji ? { id: unit.badge.id || `unit:${unit.id}`, name: unit.badge.name || unit.title, emoji: unit.badge.emoji } : null,
        lessons: keys.map((key) => {
          const lesson = lessons.get(key)!;
          return { key, title: lesson.title, minutes: Number(lesson.minutes) || 8, xp: Number(lesson.xp) || 20, lab: lesson.play?.lab ?? null };
        }),
      };
    })
    .sort((a, b) => (positionOf.get(a.id) ?? 999) - (positionOf.get(b.id) ?? 999));
  return {
    lessons,
    catalog: { levels: meta.levels, strands: meta.strands, units, labs: meta.labs },
  };
}

function data(): Loaded {
  if (!loaded) loaded = build();
  return loaded;
}

export function courseCatalog(): CourseCatalog {
  return data().catalog;
}

export function lessonById(key: string): TechLesson | null {
  if (!LESSON_KEY.test(key)) return null;
  return data().lessons.get(key) ?? null;
}

export function lessonForChild(key: string): TechLesson | null {
  const lesson = lessonById(key);
  return lesson ? forChild(lesson) : null;
}

export function playPayload(key: string): { id: string; play: NonNullable<TechLesson['play']> } | null {
  const lesson = lessonById(key);
  if (!lesson?.play?.lab) return null;
  return { id: lesson.id, play: { lab: lesson.play.lab, config: lesson.play.config ?? {}, goal: lesson.play.goal } };
}

export function lessonCount(): number {
  return data().lessons.size;
}

// Test hook: drop the cache after a fixture change.
export function resetCatalogCache() {
  loaded = null;
}
