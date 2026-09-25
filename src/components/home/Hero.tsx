import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Container } from '@/components/ui/Container';
import { BrowserFrame } from '@/components/visual/Frames';
import { PrincipalScreen, ParentPulsePhone } from '@/components/visual/Screens';
import { DemoLabel } from '@/components/visual/Primitives';
import { Icon } from '@/components/visual/Icons';
import { tones, type Tone } from '@/lib/semantic';
import { companyName } from '@/lib/site-config';

const ROLES: { label: string; tone: Tone }[] = [
  { label: 'Principal', tone: 'trust' },
  { label: 'School Admin', tone: 'product' },
  { label: 'Teacher', tone: 'product' },
  { label: 'Student', tone: 'achievement' },
  { label: 'Parent', tone: 'communication' },
  { label: 'Finance', tone: 'action' },
];

export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden bg-midnight text-white">
      <div aria-hidden="true" className="nca-mesh-dark absolute inset-0" />
      <div aria-hidden="true" className="nca-spectrum-bar absolute inset-x-0 top-0 h-1" />
      <Container wide className="relative grid grid-cols-1 items-center gap-12 py-16 lg:grid-cols-2 lg:py-24">
        <div className="flex flex-col gap-6">
          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-cyan px-3 py-1 text-xs font-bold uppercase tracking-wider text-slate">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-sapphire" />
            The connected school ecosystem
          </span>
          <h1 id="hero-title" className="text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
            See your whole school <span className="nca-spectrum-text">working as one.</span>
          </h1>
          <p className="max-w-xl text-lg opacity-90">
            {companyName} connects principals, office staff, teachers, students and parents through one validated
            school record. Parents get honest daily updates on WhatsApp, teachers work from a single Today screen,
            and principals see school health, open exceptions and fee status in one dashboard, without chasing anyone.
          </p>
          <div className="flex flex-wrap gap-3">
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

        <div className="relative lg:pb-10">
          <div className="relative z-10 lg:mr-28">
            <BrowserFrame url="app.netcyberai.com/principal">
              <PrincipalScreen compact />
            </BrowserFrame>
          </div>
          <div className="nca-float relative z-20 mx-auto -mt-6 w-60 sm:ml-auto sm:mr-0 lg:absolute lg:-bottom-6 lg:right-0 lg:mt-0 lg:w-56">
            <ParentPulsePhone compact />
          </div>
          <div aria-hidden="true" className="nca-float-slow absolute -left-4 -top-4 z-30 hidden items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-bold text-slate shadow-xl sm:flex">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-turquoise text-slate">
              <Icon name="check" className="h-3 w-3" />
            </span>
            6A attendance saved
          </div>
          <div aria-hidden="true" className="nca-float absolute -left-6 bottom-4 z-30 hidden items-center gap-2 rounded-full bg-gold px-3 py-2 text-xs font-bold text-slate shadow-xl lg:flex">
            <Icon name="trophy" className="h-4 w-4" /> New Personal Best
          </div>
          <div className="mt-4 flex justify-center sm:justify-end lg:absolute lg:-bottom-12 lg:left-0 lg:mt-0 lg:justify-start">
            <DemoLabel onDark />
          </div>
        </div>
      </Container>
    </section>
  );
}
