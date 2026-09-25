import Link from 'next/link';
import { Container } from '@/components/ui/Container';
import { SectionHeading } from '@/components/visual/Primitives';
import { SpotlightCard } from '@/components/visual/SpotlightCard';
import { Icon, type IconName } from '@/components/visual/Icons';
import { tones, type Tone } from '@/lib/semantic';

// Only guarantees the product actually enforces in code today -- see
// docs/10_DECISION_LOG.md for each. No certification or regulatory
// compliance claim is made here.
const ITEMS: { title: string; body: string; icon: IconName; tone: Tone }[] = [
  { title: 'Every school isolated', body: 'Row-level security scopes every query to one school at the database layer, not just in the interface.', icon: 'lock', tone: 'trust' },
  { title: 'Consent on the record', body: 'A consent ledger per student and purpose. Messages without consent are never sent.', icon: 'compliance', tone: 'success' },
  { title: 'Append-only audit trail', body: 'Who changed what, and when. Audit entries cannot be edited or deleted by school staff.', icon: 'shield', tone: 'intelligence' },
  { title: 'WhatsApp stays off until you say so', body: 'Pilot schools run with outbound messaging whitelisted, so nothing reaches parents before you are ready.', icon: 'chat', tone: 'communication' },
  { title: 'Your data, fully exportable', body: 'PostgreSQL is the single source of truth, with full export. Spreadsheets are never the live database.', icon: 'download', tone: 'product' },
  { title: 'AI proposes; people decide', body: 'Input is validated in the portal. AI drafts and flags; it is never an unrestricted writer to your records.', icon: 'sparkle', tone: 'action' },
];

export function TrustSecurity() {
  return (
    <section aria-labelledby="trust-title" className="bg-white">
      <Container wide className="flex flex-col gap-10 py-20">
        <SectionHeading
          id="trust-title"
          eyebrow="Trust and security"
          tone="trust"
          title="Built so a school can trust it with children's data"
          lead="Safety rules that live in the product itself, not in a policy document."
        />
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ITEMS.map((it) => (
            <li key={it.title}>
              <SpotlightCard className="h-full rounded-2xl border border-slate/10 bg-off-white p-5">
                <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${tones[it.tone].solid}`}>
                  <Icon name={it.icon} className="h-5 w-5" />
                </span>
                <p className="mt-4 font-bold text-slate">{it.title}</p>
                <p className="mt-1 text-sm text-slate/70">{it.body}</p>
              </SpotlightCard>
            </li>
          ))}
        </ul>
        <Link
          href="/security/data-ownership"
          className="inline-flex min-h-[44px] w-fit items-center gap-2 font-bold text-royal underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal"
        >
          How data ownership works <Icon name="arrow" className="h-4 w-4" />
        </Link>
      </Container>
    </section>
  );
}
