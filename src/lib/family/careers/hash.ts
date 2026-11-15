import { createHash } from 'node:crypto';

// Stable hash of a seed row. A second import with the same hash does not change review state.
export function contentHash(value: unknown): string {
  return createHash('sha256').update(stable(value)).digest('hex');
}

function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${stable(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}
