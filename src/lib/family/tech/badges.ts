// Badges a child can earn. No ranks and no streaks: a goal, the same rule as the English course.

import { pick, type TechLang } from './text';
import type { CourseCatalog, Localized, TechProgress } from './types';

export type BadgeDef = { id: string; emoji: string; name: Localized; test: (progress: TechProgress) => boolean };

export const MILESTONE_BADGES: readonly BadgeDef[] = [
  { id: 'first-step', emoji: '👣', name: { hinglish: 'Pehla Kadam', en: 'First Step', hi: 'पहला कदम' }, test: (progress) => Object.keys(progress.done).length >= 1 },
  { id: 'five-lessons', emoji: '🔥', name: { hinglish: '5 Lessons', en: '5 Lessons', hi: '5 पाठ' }, test: (progress) => Object.keys(progress.done).length >= 5 },
  { id: 'sharp', emoji: '🎯', name: { hinglish: 'Sharp Shooter', en: 'Sharp Shooter', hi: 'अचूक निशाना' }, test: (progress) => Object.values(progress.done).filter((row) => row.stars === 3).length >= 3 },
  { id: 'lab-explorer', emoji: '🧪', name: { hinglish: 'Lab Explorer', en: 'Lab Explorer', hi: 'लैब खोजी' }, test: (progress) => progress.labs.length >= 3 },
  { id: 'xp-500', emoji: '⚡', name: { hinglish: '500 XP', en: '500 XP', hi: '500 XP' }, test: (progress) => progress.xp >= 500 },
];

export function unitBadges(catalog: CourseCatalog): BadgeDef[] {
  return catalog.units
    .filter((unit) => unit.lessons.length > 0)
    .map((unit) => ({
      id: `unit:${unit.id}`,
      emoji: unit.badge?.emoji || catalog.strands[unit.strand]?.e || '🏅',
      name: unit.badge?.name || unit.title,
      test: (progress: TechProgress) => unit.lessons.every((lesson) => progress.done[lesson.key]),
    }));
}

export function freshBadges(catalog: CourseCatalog, progress: TechProgress): BadgeDef[] {
  const have = new Set(progress.badges);
  return [...MILESTONE_BADGES, ...unitBadges(catalog)].filter((badge) => !have.has(badge.id) && badge.test(progress));
}

export function badgeName(badge: BadgeDef, lang: TechLang): string {
  return pick(lang, badge.name);
}
