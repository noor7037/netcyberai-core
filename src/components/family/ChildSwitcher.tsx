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
            className={`fam-press flex min-h-[44px] shrink-0 items-center gap-2 rounded-full py-1 pl-1 pr-4 text-base font-bold ${
              active ? 'bg-white text-ink shadow-lg' : 'bg-ink text-white ring-1 ring-white/40 hover:bg-ink/90'
            }`}
          >
            <span aria-hidden="true" className={`flex h-9 w-9 items-center justify-center rounded-full text-sm ${active ? 'bg-saffron text-ink' : 'bg-ink text-white'}`}>
              {c.firstName.slice(0, 1).toUpperCase()}
            </span>
            {c.firstName}
          </button>
        );
      })}
    </nav>
  );
}
