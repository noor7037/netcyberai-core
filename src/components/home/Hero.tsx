import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/visual/Icons';
import { heroChips, heroGuarantee } from '@/content/pricing';
import { WhatsAppPhone } from '@/components/showcase/WhatsAppPhone';
import { Ecosystem } from './Ecosystem';
import { ScaledStage } from './ScaledStage';

// Homepage hero (founder, 2026-09-28, Decision Log C79, C81): the
// NetCyberAI ecosystem, animated and in live text, on top with the
// parent's WhatsApp beside it on wide screens; then the headline, one
// short paragraph that names the problem and the answer, and the calls to
// action, with no eyebrow line above the headline. Below 1280px the phone
// follows the text. On phones the whole block above the phone is the
// desktop layout scaled to the screen (ScaledStage, C82); the phone itself
// stays at real phone size.

export function Hero() {
  const chips = heroChips();
  const guarantee = heroGuarantee();
  return (
    <section aria-labelledby="hero-title" className="nca-hero-sky relative overflow-hidden pb-12">
      <div aria-hidden="true" className="nca-hero-clouds absolute inset-0" />

      {/* One container: the ecosystem with the text below it (scaled
          down whole on phones), then the phone; from 1280px the phone
          stands beside the ecosystem. */}
      <div className="relative mx-auto flex w-full max-w-[86rem] flex-col gap-6 md:gap-10 md:px-6 md:pt-6 xl:grid xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-center xl:gap-8 xl:pt-8">
        <ScaledStage width={980} className="nca-hero-stage md:contents" innerClassName="flex flex-col gap-10 max-md:px-6 max-md:pt-6 md:contents">
          <Ecosystem />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:gap-10 xl:col-span-2 xl:row-start-2">
            <h1 id="hero-title" className="text-6xl font-extrabold leading-[1.04] tracking-tight text-slate">
              Smarter Schools. <span className="nca-brighter">Brighter Futures.</span>
            </h1>
            <div className="flex flex-col gap-4">
              <p className="text-lg text-slate">
                School work is scattered across registers, spreadsheets and busy WhatsApp groups. NetCyberAI brings your principal,
                teachers, students and parents onto one connected platform: attendance, fees, exams and daily learning updates run
                automatically, and parents get honest updates on WhatsApp with nothing to install.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Button href="/book-demo" variant="secondary">
                  Book a free demo <Icon name="arrow" className="ml-1 h-4 w-4" />
                </Button>
                <Button href="/get-started" variant="outline">
                  Get started
                </Button>
                <Button href="#principal-dashboard" variant="accent">
                  <Icon name="play" className="mr-1.5 h-4 w-4" /> Try the principal dashboard
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
              {guarantee && (
                <p className="flex items-start gap-3 rounded-2xl border-2 border-emerald bg-white px-4 py-3 text-sm font-bold text-slate shadow-sm">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald text-white">
                    <Icon name="shield" className="h-4 w-4" />
                  </span>
                  <span>{guarantee}</span>
                </p>
              )}
            </div>
          </div>
        </ScaledStage>

        <div className="hidden flex-col gap-3 xl:col-start-2 xl:row-start-1 xl:flex">
          <WhatsAppPhone controls={false} />
        </div>

        <div className="mx-auto flex w-full max-w-[22rem] flex-col gap-3 px-4 md:px-0 xl:hidden">
          <WhatsAppPhone />
        </div>
      </div>
    </section>
  );
}
