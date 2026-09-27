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
  { title: 'Your school, kept separate', body: 'Only your school can see your records. The database itself enforces this, not just the screen.', icon: 'lock', tone: 'trust' },
  { title: 'Parent consent on record', body: 'We record each parent’s permission for each kind of message. No permission, no message.', icon: 'compliance', tone: 'success' },
  { title: 'A history nobody can rewrite', body: 'Every change shows who made it and when. School staff cannot edit or delete that history.', icon: 'shield', tone: 'intelligence' },
  { title: 'WhatsApp stays off until you say so', body: 'Every new school starts in pilot mode, so nothing reaches a parent before you are ready.', icon: 'chat', tone: 'communication' },
  { title: 'One master record', body: 'One source of truth for your whole school. Spreadsheets are never the live copy, and a full data export is on the way.', icon: 'download', tone: 'product' },
  { title: 'AI suggests, people decide', body: 'AI drafts messages and flags problems. A person always approves before anything changes.', icon: 'sparkle', tone: 'action' },
];

export function TrustSecurity() {
  return (
    <section aria-labelledby="trust-title" className="bg-white">
      <Container wide className="flex flex-col gap-8 py-12">
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
