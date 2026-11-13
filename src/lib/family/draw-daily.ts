// The daily creation limit (C513): how many NEW drawings a child may start in an India day, Control's
// DRAW_DAILY_SETTING (DRAW_DAILY_DEFAULT when it was never set). The number is read on the server and handed to the page;
// the count is kept on the device, beside the drawings (src/lib/family/sketch-store.ts), never on our servers. A drawing
// counts once, at its first line on a fresh page, so opening the studio and closing it costs nothing. At the limit only
// a new drawing waits for tomorrow: every drawing already made still opens and can be finished. If the device cannot
// keep the count (a private window, storage off), nothing is blocked.

import { DRAW_DAILY_DEFAULT, DRAW_DAILY_SETTING } from './draw-contract';
import { indiaDate } from '@/lib/time/india';

export const DRAW_DAILY_MAX = 200;

// A stored value as the limit: a whole number from 0 (no new drawings) to DRAW_DAILY_MAX, else the default.
export function drawDailyLimit(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v.trim()) : NaN;
  return Number.isInteger(n) && n >= 0 && n <= DRAW_DAILY_MAX ? n : DRAW_DAILY_DEFAULT;
}

type Query = { query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };
export async function readDrawDaily(db: Query): Promise<number> {
  const { rows } = await db.query(`select value from control.settings where key = $1`, [DRAW_DAILY_SETTING]);
  return drawDailyLimit(rows[0]?.value);
}

// The device's count's key: the child and the India day, so a brother's drawings never use his sister's places and
// the count starts again at midnight in India.
export const dayKey = (child: string, at: Date = new Date()): string => `${child}|${indiaDate(at)}`;

// null: the count could not be read, so the child is not stopped.
export const canStartNew = (count: number | null, limit: number): boolean => count === null || count < limit;
export const placesLeft = (count: number | null, limit: number): number | null => (count === null ? null : Math.max(0, limit - count));
