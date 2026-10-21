'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Words } from '@/lib/family/fill';
import { familyApi } from './client';

// One tap to switch child (M1-2, C248): many families share one phone. First names only.
export function ChildSwitcher({ w, children, activeId }: { w: Words; children: { childId: string; firstName: string }[]; activeId: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  if (children.length < 2) return null;
  return (
    <nav aria-label={w['fam.home.whoIsLearning']} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {children.map((c) => {
        const active = c.childId === activeId;
        return (
          <button
            key={c.childId}
            type="button"
            aria-pressed={active}
            disabled={busy !== null}
            onClick={async () => {
              if (active) return;
              setBusy(c.childId);
              await familyApi('/api/family/child', 'POST', { childId: c.childId });
              setBusy(null);
              router.refresh();
            }}
            className={`flex min-h-[44px] shrink-0 items-center gap-2 rounded-full px-4 text-base font-bold transition-colors motion-reduce:transition-none ${
              active ? 'bg-white text-royal-deep shadow-md' : 'bg-royal-deep text-white ring-1 ring-white/50 hover:bg-midnight'
            }`}
          >
            <span aria-hidden="true" className={`flex h-7 w-7 items-center justify-center rounded-full text-sm ${active ? 'bg-royal text-white' : 'bg-royal-deep text-white'}`}>
              {c.firstName.slice(0, 1).toUpperCase()}
            </span>
            {c.firstName}
          </button>
        );
      })}
    </nav>
  );
}
