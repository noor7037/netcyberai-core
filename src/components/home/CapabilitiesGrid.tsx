import Link from 'next/link';
import { Container } from '@/components/ui/Container';
import { Reveal } from '@/components/ui/Reveal';

const CAPABILITIES = [
  {
    title: 'School management',
    description: 'Students, guardians, classes, sections, subjects, and academic sessions in one operational record.',
    href: '/products',
  },
  {
    title: 'Parent engagement',
    description: 'Daily Learning Pulse, fee reminders, and recognition — all on WhatsApp, no app required.',
    href: '/demo',
  },
  {
    title: 'Teacher & principal intelligence',
    description: 'Fast daily entry for teachers; a private, non-public teaching-quality signal for principals.',
    href: '/features/daily-learning-pulse-hinglish',
  },
  {
    title: 'Fees, attendance & communication',
    description: 'A single consent- and quiet-hours-aware WhatsApp send gate behind every automated message.',
    href: '/features/whatsapp-fee-recovery-upi',
  },
  {
    title: 'Compliance & security',
    description: 'DPDP-aligned consent ledger, append-only audit trail, and tenant isolation by default.',
    href: '/security/data-ownership',
  },
] as const;

export function CapabilitiesGrid() {
  return (
    <section className="bg-off-white">
      <Container className="py-16">
        <Reveal>
          <h2 className="max-w-2xl text-2xl font-bold text-slate sm:text-3xl">Everything the platform covers</h2>
        </Reveal>
        <Reveal className="mt-8">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CAPABILITIES.map((c) => (
              <Link
                key={c.title}
                href={c.href}
                className="flex flex-col gap-2 rounded-lg border border-slate/10 bg-white p-6 shadow-sm transition-transform hover:-translate-y-1 hover:shadow-md hover:border-sapphire/30"
              >
                <h3 className="text-base font-bold text-slate">{c.title}</h3>
                <p className="text-sm text-slate/70">{c.description}</p>
                <span className="mt-auto text-sm font-semibold text-sapphire">Learn more →</span>
              </Link>
            ))}
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
