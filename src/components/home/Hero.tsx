import { Button } from '@/components/ui/Button';
import { Container } from '@/components/ui/Container';
import { companyName } from '@/lib/site-config';

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-sapphire via-sapphire to-azure">
      {/* Layered brand glow, decorative only -- respects prefers-reduced-motion
          by never animating; it's a static gradient wash, not a moving effect. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-violet/30 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 left-1/3 h-72 w-72 rounded-full bg-peach/20 blur-3xl"
      />
      <Container className="relative flex flex-col gap-6 py-20 text-off-white">
        <h1 className="max-w-3xl text-3xl font-bold sm:text-5xl">
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
        <div className="flex flex-wrap gap-3">
          <Button href="/get-started" variant="secondary">
            Get started
          </Button>
          <Button href="/book-demo" variant="outline" className="border-off-white text-off-white hover:bg-off-white/10">
            Book a demo
          </Button>
        </div>
      </Container>
    </section>
  );
}
