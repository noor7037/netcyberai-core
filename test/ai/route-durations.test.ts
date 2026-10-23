import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { WHOLE_ANSWER_TIMEOUT_MS } from '@/lib/ai/adapters/types';

// C230-X: a vendor call answered whole may take WHOLE_ANSWER_TIMEOUT_MS (C323). A route that asks for text must outlive
// it, with room for the safety check and a second provider, so the request ends in its own message and is metered,
// instead of the platform cutting it off. A route that sets no maxDuration gets the platform's default (300 s).

const API = path.join(process.cwd(), 'src/app/api');
const routes = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? routes(p) : n === 'route.ts' ? [p] : [];
  });

describe('routes that ask the AI for text outlive a whole answer', () => {
  it('each sets maxDuration at least a minute above the whole-answer limit, or leaves the default', () => {
    const asking = routes(API).filter((f) => /\bprepareText\b|\bstreamText\(|\bprepareNext\b|\brunDueJobs\b/.test(readFileSync(f, 'utf8')));
    expect(asking.length).toBeGreaterThan(0);
    for (const f of asking) {
      const m = readFileSync(f, 'utf8').match(/export const maxDuration = (\d+);/);
      if (m) expect(Number(m[1]), path.relative(process.cwd(), f)).toBeGreaterThanOrEqual(WHOLE_ANSWER_TIMEOUT_MS / 1000 + 60);
    }
  });
});
