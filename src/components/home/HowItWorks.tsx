import { Container } from '@/components/ui/Container';
import { Button } from '@/components/ui/Button';
import { SectionHeading } from '@/components/visual/Primitives';
import { Icon } from '@/components/visual/Icons';
import { ONBOARDING, ONBOARDING_STEPS } from '@/content/onboarding';
import { tones } from '@/lib/semantic';

// "Get your school online in 3 easy steps": one section reused on the
// homepage, pricing and contact pages (Decision Log C79).
export function HowItWorks({ id = 'how-it-works', tint = 'white', ctas = true }: { id?: string; tint?: 'white' | 'off-white'; ctas?: boolean }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={`scroll-mt-24 ${tint === 'white' ? 'bg-white' : 'bg-off-white'}`}>
      <Container wide className="flex flex-col gap-8 py-16">
        <SectionHeading id={`${id}-title`} eyebrow={ONBOARDING.eyebrow} tone="success" title={ONBOARDING.title} lead={ONBOARDING.lead} />
        <ol className="relative grid grid-cols-1 gap-4 md:grid-cols-3">
          <span aria-hidden="true" className="nca-steps-line absolute top-11 hidden h-0.5 md:block" style={{ left: '16%', right: '16%' }} />
          {ONBOARDING_STEPS.map((s, i) => (
            <li key={s.title} className="nca-lift relative flex flex-col gap-3 rounded-3xl border border-slate/10 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${tones[s.tone].solid}`}>
                  <Icon name={s.icon} className="h-6 w-6" />
                </span>
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sapphire text-sm font-extrabold text-white">{i + 1}</span>
              </div>
              <h3 className="text-lg font-extrabold text-slate">{s.title}</h3>
              <p className="text-sm text-slate/80">{s.text}</p>
            </li>
          ))}
        </ol>
        {ONBOARDING.noExcel && (
          <div className="flex flex-col gap-3 rounded-3xl border-2 border-dashed border-emerald/50 bg-white p-5 sm:flex-row sm:items-center">
            <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${tones.success.solid}`}>
              <Icon name="users" className="h-6 w-6" />
            </span>
            <div className="flex flex-col">
              <h3 className="font-extrabold text-slate">{ONBOARDING.noExcel.title}</h3>
              <p className="text-sm text-slate/80">{ONBOARDING.noExcel.text}</p>
            </div>
          </div>
        )}
        {ctas && (
          <div className="flex flex-wrap gap-3">
            <Button href="/book-demo" variant="secondary">
              Book a free demo <Icon name="arrow" className="ml-1 h-4 w-4" />
            </Button>
            <Button href="/get-started" variant="outline">
              Get started
            </Button>
          </div>
        )}
      </Container>
    </section>
  );
}
