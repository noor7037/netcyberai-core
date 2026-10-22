import Link from 'next/link';
import type { FamilyChild } from '@/lib/family/children';
import { classText, fill, type Words } from '@/lib/family/fill';
import type { Greeting, HomeStage } from '@/lib/family/home';
import { ChildSwitcher } from '../ChildSwitcher';
import { Picture } from '../Picture';
import { PRESS } from '../ui/motion';

// The greeting band of the home (D1-2, C294), as on the overview board: the app's name and line, a greeting by the time
// of day in India with the child's first name, the class, one tap to switch child and the way to the parent area. A
// small still picture of books, a pencil and a star; no character (09 §3). Class 9 and up get a calmer band (09 §2).

export function HomeHeader({ w, child, children, greeting, stage }: { w: Words; child: FamilyChild; children: FamilyChild[]; greeting: Greeting; stage: HomeStage }) {
  const big = stage === 'young';
  return (
    <header data-home-stage={stage} className={`relative overflow-hidden bg-royal-deep bg-gradient-to-br px-4 pb-16 pt-5 text-white ${stage === 'senior' ? 'from-royal-deep to-royal' : stage === 'young' ? 'from-royal via-electric to-violet' : 'from-royal-deep via-royal to-azure'}`}>
      <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-16 left-1/3 h-32 w-32 rounded-full bg-white/5" />
      <div className="relative mx-auto flex w-full max-w-xl flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/30">
              <Picture e="📚" size={22} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-base font-extrabold leading-tight">{w['fam.app.name']}</p>
              <p className="truncate text-xs font-semibold text-white/90">{w['fam.home.brandLine']}</p>
            </div>
          </div>
          <Link href="/family/parent" className={`flex min-h-[44px] shrink-0 items-center gap-2 rounded-full bg-royal-deep px-4 text-sm font-bold text-white ring-1 ring-white/50 hover:bg-midnight ${PRESS}`}>
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
            {w['fam.home.parent']}
          </Link>
        </div>
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className={`font-extrabold leading-tight ${big ? 'text-3xl' : 'text-2xl sm:text-3xl'}`}>{fill(w[`fam.home.greet.${greeting}`], { name: child.firstName })}</h1>
            <p className="mt-1 inline-flex rounded-full bg-royal-deep px-3 py-0.5 text-sm font-semibold text-white ring-1 ring-white/40">{classText((k) => w[k], child.classLevel)}</p>
          </div>
          <div aria-hidden="true" className="relative h-20 w-24 shrink-0">
            <Picture e="📚" size={big ? 60 : 52} className="absolute bottom-0 left-0" />
            <Picture e="✏️" size={big ? 36 : 30} className="absolute right-0 top-3 rotate-12" />
            <Picture e="⭐" size={big ? 28 : 22} className="absolute right-6 top-0" />
          </div>
        </div>
        <ChildSwitcher w={w} children={children.map((c) => ({ childId: c.childId, firstName: c.firstName }))} activeId={child.childId} />
      </div>
    </header>
  );
}
