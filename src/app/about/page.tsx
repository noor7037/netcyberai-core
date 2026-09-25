import { Container } from '@/components/ui/Container';
import { Button } from '@/components/ui/Button';
import { buildMetadata, pageMeta } from '@/lib/seo';
import { companyName } from '@/lib/site-config';

export const metadata = buildMetadata(pageMeta.about);

export default function AboutPage() {
  return (
    <>
      <section className="bg-gradient-to-br from-sapphire via-violet to-sapphire">
        <Container className="flex flex-col gap-4 py-16 text-off-white">
          <h1 className="max-w-2xl text-3xl font-bold sm:text-4xl">Why {companyName} exists</h1>
          <p className="max-w-2xl text-lg text-off-white/90">
            Most Indian parents don&apos;t distrust their child&apos;s school — they simply don&apos;t hear
            from it often enough to know what&apos;s actually happening in class.
          </p>
        </Container>
      </section>

      <section className="bg-off-white">
        <Container className="flex flex-col gap-6 py-16 text-slate">
          <p className="max-w-2xl text-lg">
            {companyName} is a WhatsApp-native Student Learning Monitoring &amp; Parent Engagement platform
            for Indian schools. It sends parents an honest daily update about what their child learned,
            automates fee reminders with a UPI payment link, and gives a principal a private, non-public
            signal on teaching quality.
          </p>
          <p className="max-w-2xl">
            It is not a full administrative ERP replacement — it is a focused parent-engagement and
            fee-communication layer that sits alongside a school&apos;s existing systems. Every message a
            parent receives is real, gated by real consent, and sent through one accountable channel.
          </p>
        </Container>
      </section>

      <section className="bg-sapphire">
        <Container className="flex flex-col items-start gap-4 py-16 text-off-white">
          <h2 className="text-2xl font-bold">See it for your school</h2>
          <Button href="/book-demo" variant="secondary">
            Book a demo
          </Button>
        </Container>
      </section>
    </>
  );
}
