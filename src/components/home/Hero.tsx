import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { DemoLabel } from '@/components/visual/Primitives';
import { Icon, type IconName } from '@/components/visual/Icons';
import { HeroWhatsApp } from '@/components/showcase/HeroWhatsApp';

const PROOF: { icon: IconName; text: string }[] = [
  { icon: 'chat', text: 'Parents on WhatsApp, no app to install' },
  { icon: 'shield', text: 'Data in India, isolated per school' },
  { icon: 'lock', text: 'Pilot mode: nothing sent until you say so' },
];

// Two columns: the proposition on the left; on the right, the school's
// WhatsApp as each audience sees it, with how it works underneath. The
// principal's full dashboard follows directly below this section.
export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden bg-off-white">
      <div aria-hidden="true" className="nca-hero-wash absolute inset-0" />
      <div className="relative mx-auto grid w-full max-w-7xl grid-cols-1 items-start gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-12 lg:py-14">
        <div className="flex flex-col gap-5 lg:sticky lg:top-24">
          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-bold uppercase tracking-wider text-emerald shadow-sm">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-leaf" />
            The connected school platform
          </span>
          <h1 id="hero-title" className="text-4xl font-extrabold leading-[1.08] tracking-tight text-slate sm:text-5xl xl:text-6xl">
            See your whole school <span className="text-emerald">working as one.</span>
          </h1>
          <p className="max-w-xl text-lg text-slate">
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
            <Button href="/get-started" variant="outline">
              Get started
            </Button>
            <Link
              href="#principal-dashboard"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-md px-3 font-semibold text-slate underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal"
            >
              <Icon name="play" className="h-4 w-4" /> Try the principal dashboard
            </Link>
          </div>
          <ul className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-5">
            {PROOF.map((p) => (
              <li key={p.text} className="flex items-center gap-2 text-sm font-semibold text-slate">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald/10 text-emerald">
                  <Icon name={p.icon} className="h-4 w-4" />
                </span>
                {p.text}
              </li>
            ))}
          </ul>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Who NetCyberAI connects">
            {[
              ['Principal', 'Dashboard'],
              ['Teachers', 'Staff app'],
              ['Parents', 'WhatsApp'],
              ['Office', 'Fees, records'],
            ].map(([who, how]) => (
              <li key={who} className="nca-lift rounded-xl border border-slate/10 bg-white px-3 py-2">
                <b className="block text-sm text-slate">{who}</b>
                <span className="block text-xs text-slate/70">{how}</span>
              </li>
            ))}
          </ul>
          <DemoLabel />
        </div>

        <HeroWhatsApp />
      </div>
    </section>
  );
}
