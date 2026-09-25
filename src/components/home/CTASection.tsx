import { Button } from '@/components/ui/Button';
import { Container } from '@/components/ui/Container';
import { Reveal } from '@/components/ui/Reveal';
import { companyName, whatsappLink } from '@/lib/site-config';

export function CTASection() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-sapphire via-violet to-sapphire">
      <div aria-hidden="true" className="pointer-events-none absolute -left-16 -top-16 h-64 w-64 rounded-full bg-cyan/20 blur-3xl" />
      <Container className="relative py-16">
        <Reveal>
          <h2 className="text-2xl font-bold text-off-white sm:text-3xl">See it on your own school&apos;s data</h2>
          <p className="mt-3 max-w-xl text-off-white/90">
            Book a real walkthrough, or start the Get Started flow now — either way, a real person
            follows up, not an automated reply.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button href="/get-started" variant="secondary">
              Get started
            </Button>
            <Button href="/book-demo" variant="outlineLight">
              Book a demo
            </Button>
            <Button href="/demo" variant="outlineLight">
              Watch the product tour
            </Button>
            <Button
              href={whatsappLink(`Hi, I would like to know more about ${companyName}.`)}
              variant="outlineLight"
            >
              Message us on WhatsApp
            </Button>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
