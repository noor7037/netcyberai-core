import Link from 'next/link';
import { Container } from '@/components/ui/Container';
import { SectionHeading } from '@/components/visual/Primitives';
import { Icon } from '@/components/visual/Icons';
import { FamilyApp } from '@/components/showcase/FamilyApp';

// "For families": the NetCyberAI Family app, from docs/website/ECOSYSTEM_FACTS.md §1.
const THINGS: { title: string; body: string }[] = [
  { title: 'AI tutor', body: 'Type, speak or photograph a page; answers come in your child’s own language, step by step.' },
  { title: 'Study', body: 'Interactive chapters with animated diagrams, labs and checks, starting with Classes 1 to 3 and Class 10.' },
  { title: 'English', body: 'A spoken-English course in short daily lessons.' },
  { title: 'Draw', body: 'A drawing studio with guided templates; drawings stay on the phone.' },
  { title: 'Future', body: 'Careers, entrance exams, and scholarships and government schemes, each reviewed first.' },
];

export function FamilySection() {
  return (
    <section id="family-app" aria-labelledby="family-title" className="scroll-mt-24 bg-white">
      <Container wide className="grid grid-cols-1 items-center gap-10 py-16 lg:grid-cols-2">
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
              <li key={t.title} className="flex items-start gap-3 text-slate">
                <Icon name="check" className="mt-1 h-4 w-4 shrink-0 text-emerald" />
                <span>
                  <b>{t.title}.</b> {t.body}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-slate">A parent area shows progress, daily limits and consent. Ask us about Family plans.</p>
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
