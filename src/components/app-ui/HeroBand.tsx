import Link from 'next/link';
import type { ReactNode } from 'react';

// The dashboard hero band (docs/19 §3.3): greeting, date, where you are,
// and "what needs you today" as chips that go straight to the work.
// `cinematic` is the midnight band for the principal and Control; `brand`
// is the royal-to-violet gradient band of the page banners (C235-C; white
// text, both stops 6.7:1 or more). No charts sit on a dark band (no
// validated dark chart palette yet, docs/19 §3.5). `needs` says how many
// things need the person when the screen lists them itself below the band
// (C235-C: the band then shows the count without repeating them as chips).

export type HeroChip = { label: string; href: string; count?: number };

export function greetingFor(hour: number): string {
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

// The hour in India, whatever the server's clock zone.
export function indiaHour(now: Date = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-IN', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Kolkata' }).format(now));
}

export const indiaDate = (now: Date = new Date()) => now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });

export function HeroBand({
  greeting,
  title,
  date,
  chips,
  allClear = 'Nothing needs you right now.',
  variant = 'brand',
  needs,
  children,
}: {
  greeting: string;
  title: string; // the school, or "NetCyberAI Control"
  date: string;
  chips: readonly HeroChip[];
  allClear?: string;
  variant?: 'brand' | 'cinematic';
  needs?: number;
  children?: ReactNode;
}) {
  // Text inside takes the band's own text colour.
  const surface = variant === 'cinematic' ? 'nca-mesh-dark bg-midnight text-white' : 'bg-royal bg-gradient-to-br from-royal to-violet text-white';
  const n = needs ?? chips.length;
  return (
    <section aria-label="Today" className={`relative overflow-hidden rounded-3xl p-5 md:p-7 ${surface}`}>
      <span aria-hidden="true" className="nca-spectrum-bar absolute inset-x-0 top-0 h-1.5" />
      <p className="text-sm font-semibold">
        {greeting} · {date}
      </p>
      <h1 className="mt-1 text-2xl font-extrabold md:text-3xl">{title}</h1>
      <p className="mt-3 text-base font-semibold">{n === 0 ? allClear : n === 1 ? '1 thing needs you today' : `${n} things need you today`}</p>
      {chips.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {chips.map((c) => (
            <li key={c.href + c.label}>
              <Link href={c.href} className={`inline-flex min-h-[44px] items-center gap-2 rounded-full bg-white px-4 text-sm font-bold text-sapphire shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white`}>
                {c.count !== undefined && <span className="rounded-full bg-sapphire px-2 py-0.5 text-xs tabular-nums text-white">{c.count.toLocaleString('en-IN')}</span>}
                {c.label}
                <span aria-hidden="true">→</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {children}
    </section>
  );
}
