import { Container } from '@/components/ui/Container';
import { Reveal } from '@/components/ui/Reveal';

const steps = [
  {
    title: 'The school shares the day',
    body: 'Teachers mark attendance and flag what was taught, in a couple of taps on their own phone.',
  },
  {
    title: 'Parents get one message',
    body: 'A short WhatsApp update reaches the parent directly — no app to install, no password to remember.',
  },
  {
    title: 'Everyone sees what matters',
    body: 'Principals get an honest, private read on teaching and engagement, without a public scoreboard.',
  },
];

export function HowItWorks() {
  return (
    <section className="bg-off-white">
      <Container className="py-16">
        <Reveal>
          <h2 className="text-2xl font-bold text-slate">How it works</h2>
        </Reveal>
        <Reveal className="mt-8">
          <ol className="grid gap-6 sm:grid-cols-3">
            {steps.map((step, i) => (
              <li key={step.title} className="rounded-lg border border-slate/10 bg-white p-6 transition-transform hover:-translate-y-1 hover:shadow-md">
                <span className="text-sm font-semibold text-sapphire">Step {i + 1}</span>
                <h3 className="mt-2 text-lg font-semibold text-slate">{step.title}</h3>
                <p className="mt-2 text-sm text-slate">{step.body}</p>
              </li>
            ))}
          </ol>
        </Reveal>
      </Container>
    </section>
  );
}
