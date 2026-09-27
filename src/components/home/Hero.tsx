import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { DemoLabel } from '@/components/visual/Primitives';
import { Icon } from '@/components/visual/Icons';
import { HeroDashboard } from '@/components/home/HeroDashboard';
import { heroDashboard } from '@/demo-fixture/website-demo';
import { tones, type Tone } from '@/lib/semantic';

const ROLES: { label: string; tone: Tone }[] = [
  { label: 'Principal', tone: 'trust' },
  { label: 'School Admin', tone: 'product' },
  { label: 'Teacher', tone: 'product' },
  { label: 'Student', tone: 'achievement' },
  { label: 'Parent', tone: 'communication' },
  { label: 'Finance', tone: 'action' },
];

// Two genuine columns: the proposition on the left, the principal's
// dashboard as the single primary visual on the right. The parent's
// WhatsApp view has its own section directly below (WhatsAppShowcase),
// so the hero is not split between two devices.
export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden bg-midnight text-white">
      <div aria-hidden="true" className="nca-mesh-dark absolute inset-0" />
      <div aria-hidden="true" className="nca-spectrum-bar absolute inset-x-0 top-0 h-1" />
      <div className="relative mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-14 lg:py-20">
        <div className="flex flex-col gap-6">
          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-cyan px-3 py-1 text-xs font-bold uppercase tracking-wider text-slate">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-sapphire" />
            The connected school platform
          </span>
          <h1 id="hero-title" className="text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl xl:text-6xl">
            See your whole school <span className="nca-spectrum-text">working as one.</span>
          </h1>
          <p className="max-w-xl text-lg opacity-90">
            <strong className="font-semibold">
              Free school principals from administrative burden to focus on what matters most: leading learning and
              nurturing your school community.
            </strong>{' '}
            NetCyberAI connects teachers, office staff and parents through one validated school record, so families get
            honest daily updates on WhatsApp and you see attendance, fees and open exceptions in one place.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button href="/book-demo" variant="secondary">
              Book a demo
            </Button>
            <Button href="/get-started" variant="outlineLight">
              Get started
            </Button>
            <Link
              href="/#product-tour"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-md px-3 font-semibold underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan"
            >
              <Icon name="play" className="h-4 w-4" /> Watch the product tour
            </Link>
          </div>
          <ul className="flex flex-wrap gap-2" aria-label="Roles connected by NetCyberAI">
            {ROLES.map((r) => (
              <li key={r.label} className={`rounded-full px-3 py-1 text-xs font-semibold ${tones[r.tone].solid}`}>
                {r.label}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative">
          <div className="relative z-10">
            <HeroDashboard />
          </div>
          <p aria-hidden="true" className="nca-float-slow absolute -left-3 -top-5 z-20 hidden items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-bold text-slate shadow-xl sm:flex">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-turquoise text-slate">
              <Icon name="check" className="h-3 w-3" />
            </span>
            {heroDashboard.toasts.attendance}
          </p>
          <p aria-hidden="true" className="nca-float absolute -right-3 -top-6 z-20 hidden max-w-[17rem] items-center gap-2 rounded-2xl bg-white px-3 py-2 text-xs font-bold text-slate shadow-xl xl:flex">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-leaf text-slate">
              <Icon name="chat" className="h-3 w-3" />
            </span>
            {heroDashboard.toasts.fee}
          </p>
          <p aria-hidden="true" className="nca-float-slow absolute -bottom-5 left-6 z-20 hidden items-center gap-2 rounded-full bg-gold px-3 py-2 text-xs font-bold text-slate shadow-xl sm:flex">
            <Icon name="trophy" className="h-4 w-4" /> {heroDashboard.toasts.personalBest}
          </p>
          <div className="mt-9 flex justify-center sm:justify-end">
            <DemoLabel onDark />
          </div>
        </div>
      </div>
    </section>
  );
}
