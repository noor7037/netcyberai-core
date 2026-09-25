import Link from 'next/link';
import { Container } from '@/components/ui/Container';
import { Reveal } from '@/components/ui/Reveal';

const FEATURES = [
  { title: 'WhatsApp Fee Recovery', href: '/features/whatsapp-fee-recovery-upi' },
  { title: 'Daily Learning Pulse (Hinglish)', href: '/features/daily-learning-pulse-hinglish' },
  { title: 'Digital TC & Bonafide Pipeline', href: '/features/digital-tc-character-bonafide-pipeline' },
  { title: 'Parent Weekly Confidence Brief', href: '/features/parent-weekly-confidence-brief' },
  { title: 'Teacher Impact Card (Principal-only)', href: '/features/teacher-impact-card-principal-only' },
  { title: 'Haryana Form 6 Fee Advisory', href: '/features/haryana-form-6-fee-advisory' },
] as const;

export function FeatureHighlights() {
  return (
    <section className="bg-white">
      <Container className="py-16">
        <Reveal>
          <h2 className="max-w-2xl text-2xl font-bold text-slate sm:text-3xl">Feature deep-dives</h2>
        </Reveal>
        <Reveal className="mt-8">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <Link
                key={f.href}
                href={f.href}
                className="flex items-center justify-between rounded-md border border-slate/10 px-4 py-3 text-sm font-medium text-slate hover:border-sapphire/30 hover:bg-off-white"
              >
                {f.title}
                <span aria-hidden="true" className="text-sapphire">
                  →
                </span>
              </Link>
            ))}
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
