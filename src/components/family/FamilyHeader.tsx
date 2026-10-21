import Link from 'next/link';
import type { FamilyChild } from '@/lib/family/children';
import { fill, type Words } from '@/lib/family/fill';
import { ChildSwitcher } from './ChildSwitcher';

// The top of child mode (M1-2, C248): who is learning, one tap to switch child, and the way to the parent area (which
// asks for the parent PIN).
export function FamilyHeader({ w, child, children }: { w: Words; child: FamilyChild | null; children: FamilyChild[] }) {
  return (
    <header className="bg-gradient-to-br from-royal-deep to-royal px-4 pb-8 pt-5 text-white">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold uppercase tracking-wide text-white/90">{w['fam.app.name']}</p>
            {child && <h1 className="mt-1 truncate text-3xl font-extrabold">{fill(w['fam.home.hello'], { name: child.firstName })}</h1>}
            {child && <p className="text-base text-white/90">{fill(w['fam.class.label'], { n: child.classLevel })}</p>}
          </div>
          <Link
            href="/family/parent"
            className="flex min-h-[44px] shrink-0 items-center gap-2 rounded-full bg-royal-deep px-4 text-sm font-bold text-white ring-1 ring-white/50 hover:bg-midnight"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
            {w['fam.home.parent']}
          </Link>
        </div>
        <ChildSwitcher w={w} children={children.map((c) => ({ childId: c.childId, firstName: c.firstName }))} activeId={child?.childId ?? null} />
      </div>
    </header>
  );
}
