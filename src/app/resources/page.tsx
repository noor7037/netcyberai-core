import Link from 'next/link';
import { Container } from '@/components/ui/Container';
import { breadcrumbListJsonLd, buildMetadata, pageMeta, serializeJsonLd } from '@/lib/seo';

export const metadata = buildMetadata(pageMeta.resources);

const AVAILABLE = [{ title: 'Blog', description: 'Guides on WhatsApp fee automation, Form 6 compliance, and student recognition.', href: '/blog' }] as const;

const PLANNED = [
  'Guides',
  'FAQs',
  'Case Studies',
  'Videos',
  'Webinars',
  'Compliance resources',
  'API docs',
  'Release notes',
] as const;

export default function ResourcesPage() {
  return (
    <>
      <section className="bg-gradient-to-br from-sapphire via-sapphire to-azure">
        <Container className="flex flex-col gap-4 py-16 text-off-white">
          <h1 className="max-w-2xl text-3xl font-bold sm:text-4xl">Resources</h1>
          <p className="max-w-2xl text-lg text-off-white/90">
            Real guides and references for Indian school leaders evaluating NetCyberAI — no fabricated case
            studies or testimonials, and no invented statistics. What is published here reflects what the
            platform actually does today, with plainly-marked gaps where a claim has not yet been verified.
          </p>
        </Container>
      </section>

      <section className="bg-off-white">
        <Container className="py-16">
          <h2 className="mb-4 text-lg font-bold text-slate">Available now</h2>
          <div className="mb-10 grid grid-cols-1 gap-6 sm:grid-cols-2">
            {AVAILABLE.map((r) => (
              <Link
                key={r.title}
                href={r.href}
                className="flex flex-col gap-2 rounded-lg border border-slate/10 bg-white p-6 shadow-sm hover:border-sapphire/30"
              >
                <h3 className="text-lg font-bold text-slate">{r.title}</h3>
                <p className="text-sm text-slate/70">{r.description}</p>
              </Link>
            ))}
          </div>

          <h2 className="mb-4 text-lg font-bold text-slate">Coming next</h2>
          <ul className="grid grid-cols-2 gap-3 text-sm text-slate/70 sm:grid-cols-4">
            {PLANNED.map((p) => (
              <li key={p} className="rounded-md border border-dashed border-slate/20 px-3 py-2">
                {p}
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbListJsonLd(pageMeta.resources)) }}
      />
    </>
  );
}
