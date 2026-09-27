import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { DemoLabel } from '@/components/visual/Primitives';
import { Icon, type IconName } from '@/components/visual/Icons';
import { tones, type Tone } from '@/lib/semantic';
import { heroChips } from '@/content/pricing';
import { WhatsAppPhone } from '@/components/showcase/WhatsAppPhone';

// Homepage hero, built to the founder's reference (2026-09-27): the
// promise on top; below it the founder's illustration (principal
// dashboard, teachers, students, parent, school) with the parent's live
// WhatsApp standing in the space left for it on the right; then the role
// strip. The promise chips come from the claim registry.

const ROLES: { href: string; label: string; line: string; icon: IconName; tone: Tone }[] = [
  { href: '/solutions/principal', label: 'Principal', line: 'Complete control and insights', icon: 'principal', tone: 'product' },
  { href: '/solutions/teacher', label: 'Teachers', line: 'Plan, teach, track and communicate', icon: 'teacher', tone: 'action' },
  { href: '/products/academics', label: 'Students', line: 'Learn, grow and track progress', icon: 'student', tone: 'alert' },
  { href: '/products/parent-engagement', label: 'Parents', line: 'Real-time updates on WhatsApp', icon: 'parent', tone: 'success' },
  { href: '/solutions/school-admin', label: 'School Admin', line: 'Manage operations efficiently', icon: 'admin', tone: 'intelligence' },
  { href: '/solutions/finance', label: 'Finance', line: 'Fees, expenses and reports', icon: 'finance', tone: 'achievement' },
];

const focusRing = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-royal';

export function Hero() {
  const chips = heroChips();
  return (
    <section aria-labelledby="hero-title" className="nca-hero-sky relative overflow-hidden pb-10">
      <div aria-hidden="true" className="nca-hero-clouds absolute inset-0" />

      <div className="relative mx-auto grid w-full max-w-[86rem] grid-cols-1 gap-6 px-4 pt-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end lg:gap-10 lg:pt-10">
        <div className="flex flex-col gap-4">
          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-white px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wider text-emerald shadow-sm sm:text-xs">
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald text-white">
              <Icon name="check" className="h-3 w-3" />
            </span>
            The complete school management platform
          </span>
          <h1 id="hero-title" className="text-[2.6rem] font-extrabold leading-[1.02] tracking-tight text-slate sm:text-6xl xl:text-7xl">
            Simpler School Operations. <span className="nca-brighter">Brighter Futures.</span>
          </h1>
        </div>
        <div className="flex flex-col gap-4">
          <p className="text-lg text-slate">
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
            <a href="#principal-dashboard" className={`inline-flex min-h-[44px] items-center gap-2 rounded-md px-2 text-sm font-bold text-slate underline-offset-4 hover:underline ${focusRing}`}>
              <Icon name="play" className="h-4 w-4" /> Try the full principal dashboard
            </a>
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
        </div>
      </div>

      {/* The founder's illustration. From xl up, the parent's live WhatsApp
          stands in the space the artwork leaves for it on the right. */}
      <div className="relative mx-auto mt-6 w-full max-w-[86rem] px-2 sm:px-6">
        <div className="relative aspect-[1765/891] w-full">
          <Image
            src="/brand/hero-art.webp"
            alt="A principal’s NetCyberAI dashboard with teachers, students and a parent in front of a school"
            fill
            priority
            sizes="(min-width: 1376px) 1376px, 100vw"
            className="object-contain"
          />
          <div className="nca-hero-phone absolute z-10 hidden xl:block">
            <WhatsAppPhone controls={false} />
          </div>
        </div>
        <div className="mt-2 flex justify-end">
          <DemoLabel />
        </div>
      </div>

      {/* Below xl the phone gets its own full-size place under the art. */}
      <div className="relative mt-6 px-4 xl:hidden">
        <p className="mb-3 text-center text-sm font-extrabold text-slate">A parent’s WhatsApp, live: it scrolls by itself. Touch it to pause.</p>
        <WhatsAppPhone />
      </div>

      <div className="relative z-10 mx-auto mt-6 w-full max-w-[86rem] px-4 sm:px-6">
        <ul className="grid grid-cols-3 gap-2 lg:hidden" aria-label="Who NetCyberAI serves">
          {ROLES.map((r) => (
            <li key={r.href}>
              <Link href={r.href} className={`flex min-h-[40px] w-full items-center justify-center rounded-full bg-white px-2 text-xs font-bold text-slate shadow-sm hover:bg-off-white ${focusRing}`}>
                {r.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="hidden items-center gap-2 rounded-2xl border border-slate/10 bg-white/95 p-2 shadow-xl backdrop-blur lg:flex">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald/10 text-emerald">
            <Icon name="shield" className="h-8 w-8" />
          </span>
          <Icon name="arrow" className="h-4 w-4 shrink-0 text-slate/70" />
          <ul className="grid flex-1 grid-cols-6 gap-1" aria-label="Who NetCyberAI serves">
            {ROLES.map((r) => (
              <li key={r.href}>
                <Link href={r.href} className={`nca-lift flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left hover:bg-off-white ${focusRing}`}>
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tones[r.tone].solid}`}>
                    <Icon name={r.icon} className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 leading-tight">
                    <b className="block text-sm text-slate">{r.label}</b>
                    <span className="block text-[11px] text-slate/70">{r.line}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
