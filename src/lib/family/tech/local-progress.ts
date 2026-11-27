// Progress kept on this phone only until the Tech Lab tables exist. Stars and XP, never an answer. Kept per child
// (C555): brothers and sisters share a phone, so one child's stars never show on another child's course.

import { EMPTY_PROGRESS, type TechProgress } from './types';

const KEY = 'nca.tech.local.v2';
const keyFor = (child: string) => `${KEY}.${child}`;

export function readLocalProgress(child: string): TechProgress {
  if (typeof sessionStorage === 'undefined' || !child) return { ...EMPTY_PROGRESS, done: {} };
  try {
    const raw = JSON.parse(sessionStorage.getItem(keyFor(child)) || 'null') as TechProgress | null;
    if (!raw || typeof raw !== 'object' || !raw.done) return { ...EMPTY_PROGRESS, done: {} };
    return { xp: Number(raw.xp) || 0, done: raw.done, badges: raw.badges ?? [], labs: raw.labs ?? [] };
  } catch {
    return { ...EMPTY_PROGRESS, done: {} };
  }
}

function write(child: string, progress: TechProgress) {
  if (!child) return;
  try {
    sessionStorage.setItem(keyFor(child), JSON.stringify(progress));
  } catch {
    /* a full store must not block the lesson */
  }
}

export function rememberPass(child: string, lessonKey: string, stars: number, best: number, xp: number, gain: number, badgeIds: string[]) {
  const progress = readLocalProgress(child);
  const prev = progress.done[lessonKey];
  progress.done[lessonKey] = { stars: Math.max(stars, prev?.stars || 0), best: Math.max(best, prev?.best || 0), xp: Math.max(xp, prev?.xp || 0) };
  progress.xp += gain;
  for (const id of badgeIds) if (!progress.badges.includes(id)) progress.badges.push(id);
  write(child, progress);
}

export function rememberLab(child: string, labId: string) {
  const progress = readLocalProgress(child);
  if (!progress.labs.includes(labId)) progress.labs.push(labId);
  write(child, progress);
}

export function mergeProgress(server: TechProgress, local: TechProgress | null): TechProgress {
  if (!local) return server;
  const done = { ...local.done };
  for (const [key, row] of Object.entries(server.done)) {
    const other = done[key];
    done[key] = other ? { stars: Math.max(row.stars, other.stars), best: Math.max(row.best, other.best), xp: Math.max(row.xp, other.xp) } : row;
  }
  const badges = [...new Set([...server.badges, ...local.badges])];
  const labs = [...new Set([...server.labs, ...local.labs])];
  const xp = Object.values(done).reduce((sum, row) => sum + (row.xp || 0), 0);
  return { xp, done, badges, labs };
}
