import { Container } from '@/components/ui/Container';
import { Card } from '@/components/ui/Card';
import { companyAddress, companyName, contactEmail } from '@/lib/site-config';
import { breadcrumbListJsonLd, buildMetadata, pageMeta, serializeJsonLd } from '@/lib/seo';

const LAST_UPDATED = '16 September 2026';

export const metadata = buildMetadata(pageMeta.terms);

export default function TermsPage() {
  return (
    <Container className="flex flex-col gap-10 py-12">
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold text-sapphire sm:text-3xl">Terms of Use</h1>
        <p className="text-lg text-slate">
          These terms explain what a visitor may and may not do on {companyName}&rsquo;s public
          website and its interactive concept demo, including that all demo content is fictional
          and comes with no warranty. This page is a draft pending legal review, not a finished
          document you should treat as final.
        </p>
        <p className="text-sm text-slate/70">Last updated {LAST_UPDATED}.</p>
      </div>

      <Card className="border-amber/40 bg-amber/5">
        <p className="text-sm font-semibold text-slate">Draft — pending legal review</p>
        <p className="mt-2 text-sm text-slate">
          This is a structurally complete draft covering the current public website and concept
          demo. It is not a substitute for review by a qualified lawyer, and it does not yet cover
          a commercial school subscription — that will be governed by a separate signed
          agreement once pricing and terms are finalised with a school.
        </p>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold text-slate">1. Scope</h2>
        <p className="text-sm text-slate">
          These terms govern your use of the {companyName} public website, including the{' '}
          <code>/demo</code> concept demo, operated by {companyName} ({companyAddress}). They do
          not govern a live school&rsquo;s use of the platform itself, which will be covered by a
          separate service agreement.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold text-slate">2. The concept demo</h2>
        <p className="text-sm text-slate">
          The <code>/demo</code> section of this site shows a read-only, clearly-labelled concept
          demonstration using a fictional school and fictional data. It cannot send real messages,
          process real payments, or store any information you enter. Nothing shown in the demo
          reflects real outcomes, real customers, or real data from any actual school.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold text-slate">3. Acceptable use</h2>
        <p className="text-sm text-slate">
          You agree not to misuse this website: no attempt to gain unauthorised access to any
          system, no scraping at a rate that degrades the service for others, and no use of the
          site to transmit unlawful content.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold text-slate">4. Intellectual property</h2>
        <p className="text-sm text-slate">
          The {companyName} name, logo, and the content of this website belong to {companyName}
          unless otherwise stated. You may not reproduce or redistribute this content for
          commercial purposes without our written permission.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold text-slate">5. No warranty on illustrative content</h2>
        <p className="text-sm text-slate">
          Example messages, illustrative dashboards, and illustrative figures on this site are labelled
          as such and are provided to explain how a feature is designed to work. They are not a
          guarantee of a specific result for any school.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold text-slate">6. Limitation of liability</h2>
        <p className="text-sm text-slate">
          To the maximum extent permitted by applicable law, {companyName} is not liable for any
          indirect or consequential loss arising from your use of this website. This does not limit
          any liability that cannot lawfully be excluded.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold text-slate">7. Governing law</h2>
        <p className="text-sm text-slate">
          These terms are governed by the laws of India, and courts at Haryana shall have
          jurisdiction, subject to applicable law.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold text-slate">8. Changes to these terms</h2>
        <p className="text-sm text-slate">
          We may update these terms as the website and product evolve, and will update the
          &ldquo;last updated&rdquo; date above whenever we do. Continued use of the site after a
          change means you accept the updated terms.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold text-slate">9. Contact</h2>
        <p className="text-sm text-slate">
          Questions about these terms can be sent to{' '}
          <a href={`mailto:${contactEmail}`} className="underline">
            {contactEmail}
          </a>
          .
        </p>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbListJsonLd(pageMeta.terms)) }}
      />
    </Container>
  );
}
