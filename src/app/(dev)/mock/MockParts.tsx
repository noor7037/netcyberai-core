import type { ReactNode } from 'react';
import { colors } from '@/lib/design-tokens';

// Shared pieces of the two parent-home mock-ups (development only, sample data only).

export type IconName = 'home' | 'kids' | 'school' | 'me' | 'link' | 'shield' | 'clock' | 'check' | 'book' | 'chat' | 'star' | 'flask' | 'flame' | 'chevron';

const PATHS: Record<IconName, ReactNode> = {
  home: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />,
  kids: (<><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><circle cx="17" cy="9" r="2.4" /><path d="M16.5 14.2c2.6.3 4.5 2.5 4.5 5.8" /></>),
  school: (<><path d="M3 9l9-5 9 5-9 5z" /><path d="M7 11.5V16c0 1.2 2.2 2.5 5 2.5s5-1.3 5-2.5v-4.5" /></>),
  me: (<><circle cx="12" cy="8" r="3.6" /><path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7" /></>),
  link: (<><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>),
  shield: (<><path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z" /><path d="M9 12l2.2 2.2L15.5 10" /></>),
  clock: (<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  check: (<><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.7 2.7L16 9.5" /></>),
  book: (<><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M4 19V5" /></>),
  chat: <path d="M4 5h16v11H9l-5 4z" />,
  star: <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z" />,
  flask: (<><path d="M9 3h6" /><path d="M10 3v6l-5.5 9.5A1.5 1.5 0 0 0 5.8 21h12.4a1.5 1.5 0 0 0 1.3-2.5L14 9V3" /></>),
  flame: <path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.2 2-4.2.2 1.2.8 2 1.6 2.4C10.2 8 10.6 5.5 12 3z" />,
  chevron: <path d="M9 6l6 6-6 6" />,
};

export function Icon({ name, size = 22, className = '' }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      {PATHS[name]}
    </svg>
  );
}

export function SampleChip() {
  return <span className="inline-flex items-center rounded-full bg-sunshine px-2.5 py-1 text-xs font-semibold text-slate">Sample data</span>;
}

const TABS: { id: string; label: string; icon: IconName }[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'children', label: 'Children', icon: 'kids' },
  { id: 'school', label: 'School', icon: 'school' },
  { id: 'me', label: 'Me', icon: 'me' },
];

export function TabBar({ active = 'home' }: { active?: string }) {
  return (
    <nav aria-label="Parent app" className="absolute inset-x-0 bottom-0 z-10 border-t border-slate/10 bg-white">
      <ul className="grid grid-cols-4">
        {TABS.map((t) => {
          const on = t.id === active;
          return (
            <li key={t.id}>
              <button type="button" aria-current={on ? 'page' : undefined} className={`flex min-h-[56px] w-full flex-col items-center justify-center gap-0.5 text-xs font-semibold ${on ? 'text-royal' : 'text-slate'}`}>
                <span className={`flex h-7 w-12 items-center justify-center rounded-full ${on ? 'bg-royal/10' : ''}`}>
                  <Icon name={t.icon} size={22} />
                </span>
                {t.label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** A phone-width frame that is full width on a real phone. */
export function Phone({ children, tab }: { children: ReactNode; tab?: string }) {
  return (
    <main className="min-h-screen bg-off-white">
      <div data-mock-frame className="relative mx-auto min-h-screen w-full max-w-[430px] bg-off-white pb-[72px]">
        {children}
        <TabBar active={tab} />
      </div>
    </main>
  );
}

export const subjectHex = { royal: colors.royal, turquoise: colors.turquoise, grape: colors.grape, tangerine: colors.tangerine } as const;
