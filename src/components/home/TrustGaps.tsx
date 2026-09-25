import { Card } from '@/components/ui/Card';
import { Container } from '@/components/ui/Container';
import { Reveal } from '@/components/ui/Reveal';

const gaps = [
  {
    title: 'Parent ↔ Child',
    problem:
      "Parents don't know what was taught today, so they can't engage with their child about it at home.",
    solution:
      'A short daily message tells them exactly what happened in class — no login required.',
  },
  {
    title: 'Parent ↔ School',
    problem: 'Parents often feel like a fee number, not a family the school actually knows.',
    solution:
      'Fee reminders, receipts, and updates arrive as a conversation, on WhatsApp, in their own language.',
  },
  {
    title: 'Principal ↔ Teacher',
    problem:
      'Principals have no real signal on teaching quality beyond exam results and hallway impression.',
    solution:
      'A private Impact Card gives each teacher and their principal an honest, non-public view of what is working.',
  },
];

export function TrustGaps() {
  return (
    <section className="bg-off-white">
      <Container className="py-16">
        <Reveal>
          <h2 className="text-2xl font-bold text-slate">The three trust gaps we close</h2>
        </Reveal>
        <Reveal className="mt-8">
          <div className="grid gap-6 sm:grid-cols-3">
            {gaps.map((gap) => (
              <Card key={gap.title} className="transition-transform hover:-translate-y-1 hover:shadow-md">
                <h3 className="text-lg font-semibold text-sapphire">{gap.title}</h3>
                <p className="mt-3 text-sm text-slate">{gap.problem}</p>
                <p className="mt-3 border-l-4 border-emerald pl-3 text-sm font-medium text-slate">{gap.solution}</p>
              </Card>
            ))}
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
