import type { Change } from '@/lib/agent/types';

// One plain line for each recorded change (C546): what kind of thing, and the values that differ. Ids and times are
// left out; they mean nothing to a person.
const SKIP = /(_id|Id|_at|At|hash|revision|school|created|updated|version)$/;

function flat(v: unknown): Record<string, string> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const out: Record<string, string> = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    if (SKIP.test(k) || x === null || x === undefined || typeof x === 'object') continue;
    out[k.replace(/_/g, ' ')] = String(x);
  }
  return out;
}

export function changeLine(c: Change): string {
  const what = c.action.replace(/[._]/g, ' ');
  const before = flat(c.before);
  const after = flat(c.after);
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((k) => before[k] !== after[k]).slice(0, 6);
  const parts = keys.map((k) => (k in before && k in after ? `${k}: ${before[k]} → ${after[k]}` : k in after ? `${k}: ${after[k]}` : `${k}: ${before[k]} removed`));
  return parts.length ? `${what} — ${parts.join(', ')}` : what;
}
