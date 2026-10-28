import Link from 'next/link';
import type { FamilyChild } from '@/lib/family/children';
import { classText, fill, type Words } from '@/lib/family/fill';
import { ChildSwitcher } from './ChildSwitcher';
import { NotifyBell } from './NotifyBell';

// The top of child mode (M1-2, C248): who is learning, one tap to switch child, the notifications bell and the way to
// the hubs. H1 (C230-AO): the Parent button moved under the child's Profile (the avatar opens it) as "Parent space",
// still behind the parent PIN. D1 (C230-Q): a deep band with soft moving light (family.css `.fam-band`, still under
// reduced motion), the child's initial in a coloured ring, and room for the first card to rise over its edge.
// `news`: how many new things the school has for this child (the bell's dot).
export function FamilyHeader({ w, child, children, news = 0 }: { w: Words; child: FamilyChild | null; children: FamilyChild[]; news?: number }) {
  return (
    <header className="fam-band rounded-b-[2rem] bg-gradient-to-br from-midnight via-royal-deep to-violet px-4 pb-12 pt-5 text-white">
      <span aria-hidden="true" className="fam-band-dots" />
      <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-base font-extrabold uppercase tracking-[0.12em] text-white">{w['fam.app.name']}</p>
          <div className="flex items-center gap-2">
            <Link
              href="/family/future"
              data-hub-entry
              className="fam-press flex min-h-[44px] shrink-0 items-center gap-2 rounded-full bg-royal-deep px-4 text-sm font-bold text-white shadow-lg ring-1 ring-white/40 hover:bg-midnight"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" />
                <path d="M15.5 8.5l-2 5-5 2 2-5z" />
              </svg>
              {w['fam.hub.entry']}
            </Link>
            <NotifyBell label={w['fam.notify.center.title']} total={news} />
          </div>
        </div>
        {child && (
          <div className="fam-rise flex items-center gap-4">
            <Link href="/family/profile" aria-label={w['fam.profile.title']} data-profile-link className="fam-press fam-avatar-ring flex h-16 w-16 shrink-0 items-center justify-center rounded-full p-[3px] shadow-xl">
              <span aria-hidden="true" className="flex h-full w-full items-center justify-center rounded-full bg-midnight text-2xl font-black text-white">{child.firstName.slice(0, 1).toUpperCase()}</span>
            </Link>
            <div className="min-w-0">
              <h1 className="truncate text-3xl font-extrabold leading-tight tracking-tight text-white">{fill(w['fam.home.hello'], { name: child.firstName })}</h1>
              <p className="mt-0.5 text-base font-semibold text-white">{classText((k) => w[k], child.classLevel)}</p>
            </div>
          </div>
        )}
        <ChildSwitcher w={w} children={children.map((c) => ({ childId: c.childId, firstName: c.firstName }))} activeId={child?.childId ?? null} />
      </div>
    </header>
  );
}
