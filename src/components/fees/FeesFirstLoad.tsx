'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';

// The Fees page opens with ONE request (C180, docs/19 rule 10). Each part of the page asks for its data through
// useFeesPart: the first time, it is handed its share of that one summary; after that (the office has done
// something and the part reads again) it calls its own address, so what it shows is fresh.

type Part = 'reports' | 'payments' | 'setup' | 'concessions' | 'bank' | 'recovery';
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the same shape fetch() answers with
type Answer = { ok: boolean; status: number; json: () => Promise<any> };
const Ctx = createContext<{ first: () => Promise<Record<string, unknown> | null> } | null>(null);

export function FeesFirstLoad({ children }: { children: ReactNode }) {
  const asked = useRef<Promise<Record<string, unknown> | null> | null>(null);
  const first = useCallback(
    () =>
      (asked.current ??= fetch('/api/app/fees/summary')
        .then((r) => (r.ok ? (r.json() as Promise<Record<string, unknown>>) : null))
        .catch(() => null)),
    []
  );
  return <Ctx.Provider value={useMemo(() => ({ first }), [first])}>{children}</Ctx.Provider>;
}

export function useFeesPart(part: Part, url: string): () => Promise<Answer> {
  const ctx = useContext(Ctx);
  const fresh = useRef(true);
  // React runs effects twice in development; the second run is still the page opening.
  useEffect(
    () => () => {
      fresh.current = true;
    },
    []
  );
  return useCallback(async () => {
    if (fresh.current && ctx) {
      const all = await ctx.first();
      fresh.current = false;
      if (all && all[part] !== undefined) return { ok: true, status: 200, json: async () => all[part] };
    }
    return fetch(url);
  }, [ctx, part, url]);
}
