import { Container } from '@/components/ui/Container';
import { LeadForm } from '@/components/marketing/LeadForm';
import { buildMetadata, pageMeta } from '@/lib/seo';
import { companyName } from '@/lib/site-config';

export const metadata = buildMetadata(pageMeta.bookDemo);

export default function BookDemoPage() {
  return (
    <>
      <section className="bg-gradient-to-br from-sapphire via-violet to-azure">
        <Container className="flex flex-col gap-4 py-16 text-off-white">
          <h1 className="max-w-2xl text-3xl font-bold sm:text-4xl">Book a demo of {companyName}</h1>
          <p className="max-w-2xl text-lg text-off-white/90">
            Pick a preferred date and time, tell us what to cover, and we&apos;ll confirm a real
            walkthrough — Principal, Teacher, and Parent views, on your own data model.
          </p>
        </Container>
      </section>
      <section className="bg-off-white">
        <Container className="py-12">
          <div className="mx-auto max-w-2xl">
            <LeadForm source="book_demo" />
          </div>
        </Container>
      </section>
    </>
  );
}
