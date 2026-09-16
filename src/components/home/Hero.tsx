import { Button } from '@/components/ui/Button';
import { Container } from '@/components/ui/Container';
import { companyName, whatsappLink } from '@/lib/site-config';

export function Hero() {
  return (
    <section className="bg-sapphire">
      <Container className="flex flex-col gap-6 py-16 text-off-white">
        <h1 className="text-3xl font-bold sm:text-4xl">
          Give every parent a reason to trust the school again, every day.
        </h1>
        <p className="max-w-2xl text-lg text-off-white/90">
          {companyName} is a WhatsApp-native Student Learning Monitoring &amp;
          Parent Engagement platform for Indian schools. It sends parents an
          honest daily update about what their child learned in class,
          automates fee reminders with a UPI payment link, and gives a
          principal a private, non-public signal on teaching quality — not
          another school ERP.
        </p>
        <div>
          <Button
            href={whatsappLink(`Hi, I would like to book a demo of ${companyName}.`)}
            variant="secondary"
          >
            Book a demo
          </Button>
        </div>
      </Container>
    </section>
  );
}
