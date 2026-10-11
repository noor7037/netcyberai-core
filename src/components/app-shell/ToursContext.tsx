'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { isTourId, type TourId } from '@/lib/contracts/tours';

// Which first-visit tours this person has seen (C138), for the tours on the
// page. The shell provides it once. `seen` is null while it is not known
// (this browser has no cookie for this person yet): the provider then asks
// their account once, and until the answer is in no tour is shown, so a
// tour the person dismissed on another device never reappears for a moment.

type Tours = { seen: ReadonlySet<TourId> | null; markSeen: (id: TourId) => void };
const ToursContext = createContext<Tours>({ seen: null, markSeen: () => undefined });

export function ToursProvider({ initial, children }: { initial: readonly TourId[] | null; children: ReactNode }) {
  const [seen, setSeen] = useState<ReadonlySet<TourId> | null>(initial ? new Set(initial) : null);
  const asked = useRef(false);

  useEffect(() => {
    if (seen !== null || asked.current) return;
    asked.current = true;
    fetch('/api/auth/tours')
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (Array.isArray(body?.seen)) setSeen(new Set((body.seen as unknown[]).filter(isTourId)));
      })
      .catch(() => undefined); // not known: no tour this time
  }, [seen]);

  const markSeen = useCallback((id: TourId) => {
    setSeen((s) => new Set([...(s ?? []), id]));
    // Kept on the account. One more try if the first does not get through; if
    // both fail the tour shows again when the page is next loaded, which is harmless.
    const save = () => fetch('/api/auth/tours', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tour: id }) }).then((res) => res.ok);
    save()
      .then((ok) => ok || save())
      .catch(() => save().catch(() => undefined));
  }, []);

  const value = useMemo(() => ({ seen, markSeen }), [seen, markSeen]);
  return <ToursContext.Provider value={value}>{children}</ToursContext.Provider>;
}

export function useTours(): Tours {
  return useContext(ToursContext);
}
