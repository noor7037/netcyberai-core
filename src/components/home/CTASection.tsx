import { Button } from '@/components/ui/Button';
import { Container } from '@/components/ui/Container';
import { companyName, whatsappLink } from '@/lib/site-config';

export function CTASection() {
  return (
    <section className="bg-sapphire">
      <Container className="flex flex-col items-start gap-4 py-16 text-off-white">
        <h2 className="text-2xl font-bold">See it on your own phone</h2>
        <p className="max-w-xl text-off-white/90">
          Message us on WhatsApp and we will walk you through a demo built
          around how your school actually works.
        </p>
        <Button
          href={whatsappLink(`Hi, I would like to book a demo of ${companyName}.`)}
          variant="secondary"
        >
          Book a demo
        </Button>
      </Container>
    </section>
  );
}
