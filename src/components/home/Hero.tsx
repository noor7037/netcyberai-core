import { Button } from '@/components/ui/Button';
import { DemoLabel } from '@/components/visual/Primitives';
import { Icon } from '@/components/visual/Icons';
import { heroChips } from '@/content/pricing';
import { HeroStage } from '@/components/home/HeroStage';

// Homepage hero, built to the founder's reference (2026-09-27): the
// promise on the left; on the right the principal's dashboard with the
// school's WhatsApp phone over it, then the role strip. The promise chips
// come from the claim registry, so an unapproved offer never shows.

function SchoolScene() {
  return (
    <svg aria-hidden="true" viewBox="0 0 1440 260" preserveAspectRatio="xMidYMax slice" className="absolute inset-x-0 bottom-0 h-[260px] w-full">
      <defs>
        <linearGradient id="hs-hill1" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#bfe8c9" />
          <stop offset="1" stopColor="#dff4e3" />
        </linearGradient>
        <linearGradient id="hs-hill2" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#9fd9ae" />
          <stop offset="1" stopColor="#cdeed5" />
        </linearGradient>
      </defs>
      <path d="M0 150 C220 90 420 120 620 110 S1040 70 1440 120 V260 H0 Z" fill="url(#hs-hill1)" />
      {/* School building */}
      <g transform="translate(560 58)">
        <rect x="0" y="52" width="320" height="110" rx="4" fill="#f4a261" />
        <rect x="120" y="18" width="80" height="144" rx="4" fill="#e76f51" />
        <path d="M110 22 L160 -8 L210 22 Z" fill="#c2410c" />
        <circle cx="160" cy="46" r="13" fill="#fff" stroke="#c2410c" strokeWidth="3" />
        <path d="M160 38 V46 L166 50" stroke="#1e293b" strokeWidth="2" fill="none" />
        <line x1="160" y1="-8" x2="160" y2="-34" stroke="#1e293b" strokeWidth="2" />
        <path d="M160 -34 L182 -28 L160 -22 Z" fill="#ff7a1a" />
        {[18, 58, 234, 274].map((x) => (
          <g key={x}>
            <rect x={x} y="70" width="26" height="24" rx="2" fill="#bfe3ff" />
            <rect x={x} y="110" width="26" height="24" rx="2" fill="#bfe3ff" />
          </g>
        ))}
        <rect x="140" y="112" width="40" height="50" rx="3" fill="#8b5a3c" />
        <rect x="-10" y="160" width="340" height="8" rx="3" fill="#e9c8a8" />
      </g>
      {/* Trees */}
      {[
        [470, 170, 34],
        [520, 180, 26],
        [930, 172, 32],
        [985, 182, 24],
        [120, 170, 38],
        [1300, 165, 40],
        [1360, 180, 28],
      ].map(([x, y, r]) => (
        <g key={`${x}-${y}`}>
          <rect x={x - 3} y={y} width="6" height={r + 6} fill="#8b5a3c" />
          <circle cx={x} cy={y - r / 3} r={r} fill="#4caf6e" />
          <circle cx={x - r / 2} cy={y} r={r * 0.7} fill="#5cbf7d" />
        </g>
      ))}
      <path d="M0 200 C300 170 600 215 900 195 S1300 180 1440 205 V260 H0 Z" fill="url(#hs-hill2)" />
      {/* Path to school */}
      <path d="M700 226 C690 238 660 250 640 260 H800 C780 250 750 238 740 226 Z" fill="#f3e2cf" />
    </svg>
  );
}

export function Hero() {
  const chips = heroChips();
  return (
    <section aria-labelledby="hero-title" className="nca-hero-sky relative overflow-hidden pb-10 lg:pb-12">
      <div aria-hidden="true" className="nca-hero-clouds absolute inset-0" />
      <SchoolScene />
      <HeroStage
        copy={
          <div className="relative z-10 flex flex-col gap-5 lg:pt-6">
            <span className="inline-flex w-fit items-center gap-2 rounded-full bg-white px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wider text-emerald shadow-sm sm:text-xs">
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald text-white">
                <Icon name="check" className="h-3 w-3" />
              </span>
              The complete school management platform
            </span>
            <h1 id="hero-title" className="text-[2.6rem] font-extrabold leading-[1.04] tracking-tight text-slate sm:text-6xl lg:text-5xl xl:text-[3.5rem]">
              Simpler School Operations. <span className="nca-brighter">Brighter Futures.</span>
            </h1>
            <p className="max-w-xl text-lg text-slate">
              Bring your principal, teachers, students and parents together in one connected platform. Save time, improve
              learning outcomes, increase parent satisfaction and grow your school with the power of automation and AI.
              Parents get honest daily updates on WhatsApp, with nothing to install.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button href="/book-demo" variant="secondary">
                Book a demo <Icon name="arrow" className="ml-1 h-4 w-4" />
              </Button>
              <Button href="/get-started" variant="outline">
                Get started <Icon name="arrow" className="ml-1 h-4 w-4" />
              </Button>
            </div>
            <ul className="flex flex-wrap gap-x-5 gap-y-2" aria-label="What every school gets">
              {chips.map((c) => (
                <li key={c} className="flex items-center gap-2 text-sm font-semibold text-slate">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-leaf text-slate">
                    <Icon name="check" className="h-3 w-3" />
                  </span>
                  {c}
                </li>
              ))}
            </ul>
            <a href="#principal-dashboard" className="inline-flex w-fit items-center gap-2 text-sm font-bold text-slate underline-offset-4 hover:underline">
              <Icon name="play" className="h-4 w-4" /> Try the full principal dashboard
            </a>
            <DemoLabel />
          </div>
        }
      />
    </section>
  );
}
