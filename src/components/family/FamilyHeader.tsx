import Link from 'next/link';
import type { FamilyChild } from '@/lib/family/children';
import { classText, fill, type Words } from '@/lib/family/fill';
import { ChildSwitcher } from './ChildSwitcher';
import { NotifyBell } from './NotifyBell';

// The top of child mode (M1-2, C248): who is learning, one tap to switch child, the notifications bell and the way to
// the hubs. H1 (C230-AO): the Parent button moved under the child's Profile (the avatar opens it) as "Parent space",
// still behind the parent PIN. D1 (C230-Q): a deep band with soft moving light (family.css `.fam-band`, still under
// reduced motion), the child's initial in a coloured ring, and room for the first card to rise over its edge.
// W19-C: the greeting row of the founder's reference: the avatar, "Hi <name>!" and the class on the left, round 44 px
// buttons on the right (Progress, Explore, the bell). `news`: how many new things the school has for this child.
const round = 'fam-press flex h-11 min-h-[44px] w-11 min-w-[44px] shrink-0 items-center justify-center rounded-full bg-white text-ink shadow-md ring-1 ring-ink/10';

export function FamilyHeader({ w, child, children, news = 0 }: { w: Words; child: FamilyChild | null; children: FamilyChild[]; news?: number }) {
  return (
    <header className="fam-band rounded-b-[2rem] bg-paper px-4 pb-12 pt-5 text-ink">
      <span aria-hidden="true" className="fam-band-dots" />
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-extrabold uppercase tracking-[0.12em] text-saffron-deep">{w['fam.app.name']}</p>
          <div className="flex items-center gap-2">
            <Link href="/family/progress" aria-label={w['fam.progress.title']} data-progress-entry className={round}>
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 20h16M7 16v-4M12 16V7M17 16v-6" />
              </svg>
            </Link>
            <Link href="/family/future" aria-label={w['fam.hub.entry']} data-hub-entry className="fam-press flex h-11 min-h-[44px] w-11 min-w-[44px] shrink-0 items-center justify-center rounded-full bg-white text-ink shadow-md ring-1 ring-ink/10">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" />
                <path d="M15.5 8.5l-2 5-5 2 2-5z" />
              </svg>
            </Link>
            <NotifyBell label={w['fam.notify.center.title']} total={news} />
          </div>
        </div>
        {child && (
          <div className="fam-rise flex items-center gap-3">
            <Link href="/family/profile" aria-label={w['fam.profile.title']} data-profile-link className="fam-press fam-avatar-ring flex h-14 w-14 shrink-0 items-center justify-center rounded-full p-[3px] shadow-xl">
              <span aria-hidden="true" className="flex h-full w-full items-center justify-center rounded-full bg-lesson-lilac text-2xl font-black text-lesson-lilac-deep">
                {child.firstName.slice(0, 1).toUpperCase()}
              </span>
            </Link>
            <div className="min-w-0">
              <h1 className="fam-display truncate text-[1.75rem] font-extrabold leading-tight tracking-tight text-ink">{fill(w['fam.home.hello'], { name: child.firstName })}</h1>
              <p className="text-base font-semibold text-ink">{classText((k) => w[k], child.classLevel)}</p>
            </div>
          </div>
        )}
        <ChildSwitcher w={w} children={children.map((c) => ({ childId: c.childId, firstName: c.firstName }))} activeId={child?.childId ?? null} />
      </div>
    </header>
  );
}
