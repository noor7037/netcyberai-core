import Link from 'next/link';
import { Container } from '@/components/ui/Container';
import { SectionHeading } from '@/components/visual/Primitives';
import { Icon } from '@/components/visual/Icons';
import { FamilyApp } from '@/components/showcase/FamilyApp';

// "For families": the NetCyberAI Family app, from docs/website/ECOSYSTEM_FACTS.md §1.
const THINGS: { title: string; body: string; href: string }[] = [
  { title: 'AI tutor', body: 'Type, speak or photograph a page; answers come in your child’s own language, step by step.', href: '/features/family-ai-tutor' },
  { title: 'Study', body: 'Interactive chapters with animated diagrams, labs and checks, starting with Classes 1 to 3 and Class 10.', href: '/features/study-chapters-labs' },
  { title: 'English', body: 'A spoken-English course in short daily lessons.', href: '/features/english-speaking-practice' },
  { title: 'Draw', body: 'A drawing studio with guided templates; drawings stay on the phone.', href: '/features/draw-studio' },
  { title: 'Future', body: 'Careers, entrance exams, and scholarships and government schemes, each reviewed first.', href: '/features/future-careers-exams-schemes' },
];

// The school-or-alone path, in three plain steps.
const STEPS: { title: string; href: string }[] = [
  { title: 'Sign in and add each child', href: '/features/family-app-getting-started' },
  { title: 'The child learns with the tutor and Study', href: '/features/family-ai-tutor' },
  { title: 'If the school uses NetCyberAI, connect with the school’s code', href: '/features/school-link' },
];

export function FamilySection() {
  return (
    <section id="family-app" aria-labelledby="family-title" className="scroll-mt-24 bg-white">
      <Container className="grid grid-cols-1 items-center gap-10 py-16 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <SectionHeading
            id="family-title"
            eyebrow="For families"
            tone="product"
            title="The NetCyberAI Family app, for the child at home"
            lead="Any family can use it, with or without a NetCyberAI school. If the school uses NetCyberAI, School Link connects the two with a one-time code from the school."
          />
          <ul className="flex flex-col gap-3">
            {THINGS.map((t) => (
              <li key={t.title}>
                <Link
                  href={t.href}
                  className="flex min-h-[44px] items-start gap-3 rounded-2xl p-2 text-slate hover:bg-off-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal"
                >
                  <Icon name="check" className="mt-1 h-4 w-4 shrink-0 text-emerald" />
                  <span>
                    <b>{t.title}.</b> {t.body}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <section aria-labelledby="family-paths" className="rounded-3xl border border-slate/15 bg-off-white p-5">
            <h3 id="family-paths" className="text-lg font-bold text-slate">
              Works on its own, or with your school
            </h3>
            <ol className="mt-3 flex flex-col gap-2">
              {STEPS.map((s, i) => (
                <li key={s.href}>
                  <Link
                    href={s.href}
                    className="flex min-h-[44px] items-start gap-3 rounded-xl p-1 text-slate underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal"
                  >
                    <span className="font-bold">{i + 1}</span>
                    <span>{s.title}</span>
                  </Link>
                </li>
              ))}
            </ol>
          </section>
          <p>
            <Link
              href="/features/parent-controls-progress"
              className="inline-flex min-h-[44px] items-center font-semibold text-sapphire underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal"
            >
              How parents see progress and choose what is switched on
            </Link>
          </p>
          <p className="text-slate">Ask us about Family plans.</p>
          <div>
            <Link
              href="/products/family-app"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-sapphire px-6 font-bold text-white hover:opacity-90"
            >
              Explore the Family app <Icon name="arrow" className="h-4 w-4" />
            </Link>
          </div>
        </div>
        <FamilyApp />
      </Container>
    </section>
  );
}
