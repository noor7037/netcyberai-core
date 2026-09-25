import { Container } from '@/components/ui/Container';
import { Reveal } from '@/components/ui/Reveal';

// Qualitative outcome statements only -- no invented percentages or
// customer counts. See docs/10_DECISION_LOG.md's own standing rule:
// no unsourced numeric claims outside /demo.
const OUTCOMES = [
  {
    title: 'Parents hear from the school every day',
    description: 'Not once a term, and not only when something goes wrong — a short, honest update, every school day.',
  },
  {
    title: 'Fee follow-up runs itself',
    description: 'A fixed reminder sequence with a UPI link, so office staff aren’t manually chasing every parent by phone.',
  },
  {
    title: 'Principals see what a report card can’t',
    description: 'A private, non-public signal on teaching quality — never a public ranking or scorecard.',
  },
  {
    title: 'Nothing lives outside the record',
    description: 'Consent, attendance, fees, and communication all trace back to one auditable source, not a spreadsheet.',
  },
] as const;

export function OutcomesGrid() {
  return (
    <section className="bg-white">
      <Container className="py-16">
        <Reveal>
          <h2 className="max-w-2xl text-2xl font-bold text-slate sm:text-3xl">What actually changes</h2>
        </Reveal>
        <Reveal className="mt-8">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {OUTCOMES.map((o) => (
              <div key={o.title} className="rounded-lg border-l-4 border-cyan bg-off-white p-6">
                <h3 className="text-lg font-bold text-slate">{o.title}</h3>
                <p className="mt-2 text-sm text-slate/70">{o.description}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
