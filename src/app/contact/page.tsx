import { Container } from '@/components/ui/Container';
import { Button } from '@/components/ui/Button';
import { buildMetadata, pageMeta } from '@/lib/seo';
import { companyAddress, contactEmail, whatsappLink } from '@/lib/site-config';

export const metadata = buildMetadata(pageMeta.contact);

export default function ContactPage() {
  return (
    <section className="bg-off-white">
      <Container className="flex flex-col gap-6 py-16 text-slate">
        <h1 className="text-3xl font-bold sm:text-4xl">Contact us</h1>
        <p className="max-w-xl text-lg text-slate/70">
          For a demo, a pilot, or a question about how NetCyberAI works — reach us directly, or use the
          form on{' '}
          <a href="/get-started" className="text-sapphire underline">
            Get Started
          </a>{' '}
          and our team will follow up.
        </p>
        <dl className="flex flex-col gap-3 text-base">
          <div>
            <dt className="font-semibold text-slate">Email</dt>
            <dd>
              <a href={`mailto:${contactEmail}`} className="text-sapphire underline">
                {contactEmail}
              </a>
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-slate">Address</dt>
            <dd>{companyAddress}</dd>
          </div>
        </dl>
        <div className="flex flex-wrap gap-3">
          <Button href={whatsappLink('Hi, I would like to talk to your team.')}>Message us on WhatsApp</Button>
          <Button href="/book-demo" variant="outline">
            Book a demo
          </Button>
        </div>
      </Container>
    </section>
  );
}
