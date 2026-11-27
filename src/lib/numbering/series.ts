// Numbers the school would otherwise type (C554): the next admission number, the next roll number in a class, the next
// staff code. Pure: it reads the numbers already in use and continues them, so a school's own style is kept ("ADM/0023"
// is followed by "ADM/0024"), nothing is ever given twice, and a school with none yet starts at its first.

const TAIL = /^(.*?)(\d+)$/;

export type Series = { prefix: string; width: number; last: number };

// The style most of the existing numbers follow: the same text before the digits; the widest digits; the highest.
export function seriesOf(existing: readonly (string | null | undefined)[]): Series | null {
  const groups = new Map<string, { count: number; width: number; last: number }>();
  for (const raw of existing) {
    const v = (raw ?? '').trim();
    const m = TAIL.exec(v);
    if (!m) continue;
    const key = m[1];
    const n = Number(m[2]);
    if (!Number.isSafeInteger(n)) continue;
    const g = groups.get(key) ?? { count: 0, width: 0, last: 0 };
    g.count++;
    g.width = Math.max(g.width, m[2].length);
    g.last = Math.max(g.last, n);
    groups.set(key, g);
  }
  let best: Series | null = null;
  let bestCount = 0;
  for (const [prefix, g] of groups) {
    if (g.count > bestCount || (g.count === bestCount && best && g.last > best.last)) {
      best = { prefix, width: g.width, last: g.last };
      bestCount = g.count;
    }
  }
  return best;
}

export const format = (s: Series, n: number) => `${s.prefix}${String(n).padStart(s.width, '0')}`;

// The next `count` numbers after what is in use, never one already taken (compared without case or outer spaces).
export function nextNumbers(existing: readonly (string | null | undefined)[], count: number, start: Series): string[] {
  const taken = new Set(existing.map((v) => (v ?? '').trim().toLowerCase()).filter(Boolean));
  const s = seriesOf(existing) ?? start;
  const out: string[] = [];
  let n = s.last + 1;
  while (out.length < count) {
    const v = format(s, n++);
    if (!taken.has(v.toLowerCase())) {
      out.push(v);
      taken.add(v.toLowerCase());
    }
  }
  return out;
}

// Where a school with no numbers yet starts.
export const ADMISSION_START: Series = { prefix: '', width: 4, last: 0 }; // 0001
export const ROLL_START: Series = { prefix: '', width: 1, last: 0 }; // 1, 2, 3 … in each class
export const STAFF_START: Series = { prefix: 'EMP-', width: 3, last: 0 }; // EMP-001
