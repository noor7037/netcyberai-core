import type { ReactNode } from 'react';
import { BottomTabs, type BarTab } from '@/components/family/parent/parts';

// Shared frame of the two parent-home mock-ups (development only, sample data only). The visual parts themselves
// live in src/components/family/parent/ (C506) and are the ones the real parent area uses.

export function SampleChip() {
  return <span className="inline-flex items-center rounded-full bg-sunshine px-2.5 py-1 text-xs font-semibold text-slate">Sample data</span>;
}

const TABS: BarTab[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'children', label: 'Children', icon: 'kids' },
  { id: 'school', label: 'School', icon: 'school' },
  { id: 'me', label: 'Me', icon: 'me' },
];

/** A phone-width frame that is full width on a real phone. */
export function Phone({ children, tab }: { children: ReactNode; tab?: string }) {
  return (
    <main className="min-h-screen bg-off-white">
      <div data-mock-frame className="relative mx-auto min-h-screen w-full max-w-[430px] bg-off-white pb-[72px]">
        {children}
        <BottomTabs tabs={TABS} active={tab ?? 'home'} label="Parent app" position="absolute" />
      </div>
    </main>
  );
}
