import Link from 'next/link';
import { Container } from '@/components/ui/Container';
import { Button } from '@/components/ui/Button';
import { buildMetadata, pageMeta } from '@/lib/seo';

export const metadata = buildMetadata(pageMeta.products);

const PRODUCTS = [
  {
    title: 'School Management',
    description:
      'Students, guardians, classes, sections, subjects, and academic sessions — the operational record every other module reads from.',
    href: null,
  },
  {
    title: 'AI Insights',
    description:
      'The Daily Learning Pulse and a private, non-public signal for principals on teaching quality — never a public ranking or scorecard.',
    href: '/features/daily-learning-pulse-hinglish',
  },
  {
    title: 'Parent Engagement',
    description:
      'Every parent-facing update arrives on WhatsApp, in Hinglish where it helps — no app install required.',
    href: '/demo',
  },
  {
    title: 'Fees & Billing',
    description: 'Automated WhatsApp fee reminders with a UPI payment link, on a fixed D-3 to D+7 sequence.',
    href: '/features/whatsapp-fee-recovery-upi',
  },
  {
    title: 'Attendance & Safety',
    description: 'Teacher/admin attendance entry with correction and audit trail, feeding directly into parent communication.',
    href: null,
  },
  {
    title: 'Academics',
    description: 'Classes, sections, subjects, and exams — the academic structure a real timetable and report card build on.',
    href: null,
  },
  {
    title: 'Communication',
    description: 'A single, consent- and quiet-hours-aware WhatsApp send gate behind every automated message the platform sends.',
    href: null,
  },
  {
    title: 'Compliance & Security',
    description: 'DPDP-aligned consent ledger, append-only audit trail, and row-level tenant isolation by default.',
    href: '/security/data-ownership',
  },
  {
    title: 'Reports & Analytics',
    description: 'Platform- and school-level dashboards over real data — attendance, fees, communication, and consent.',
    href: null,
  },
] as const;

export default function ProductsPage() {
  return (
    <>
      <section className="bg-gradient-to-br from-sapphire via-sapphire to-violet">
        <Container className="flex flex-col gap-4 py-16 text-off-white">
          <h1 className="max-w-2xl text-3xl font-bold sm:text-4xl">One platform, nine capabilities</h1>
          <p className="max-w-2xl text-lg text-off-white/90">
            NetCyberAI is built as one connected system, not a bundle of separate tools. Every capability
            below shares the same students, guardians, classes, and consent records.
          </p>
        </Container>
      </section>

      <section className="bg-off-white">
        <Container className="py-16">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {PRODUCTS.map((p) => (
              <div key={p.title} className="flex flex-col gap-3 rounded-lg border border-slate/10 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-bold text-slate">{p.title}</h2>
                <p className="text-sm text-slate/70">{p.description}</p>
                {p.href && (
                  <Link href={p.href} className="text-sm font-semibold text-sapphire underline">
                    Learn more →
                  </Link>
                )}
              </div>
            ))}
          </div>
        </Container>
      </section>

      <section className="bg-sapphire">
        <Container className="flex flex-col items-start gap-4 py-16 text-off-white">
          <h2 className="text-2xl font-bold">See it on your own school&apos;s data model</h2>
          <div className="flex flex-wrap gap-3">
            <Button href="/book-demo" variant="secondary">
              Book a demo
            </Button>
            <Button href="/get-started" variant="outline" className="border-off-white text-off-white hover:bg-off-white/10">
              Get started
            </Button>
          </div>
        </Container>
      </section>
    </>
  );
}
