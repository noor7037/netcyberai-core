import { Container } from '@/components/ui/Container';
import { Card } from '@/components/ui/Card';
import { companyAddress, companyName, contactEmail } from '@/lib/site-config';
import { breadcrumbListJsonLd, buildMetadata, pageMeta, serializeJsonLd } from '@/lib/seo';

const LAST_UPDATED = '16 September 2026';

export const metadata = buildMetadata(pageMeta.privacy);

export default function PrivacyPage() {
  return (
    <Container className="flex flex-col gap-10 py-12">
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold text-sapphire sm:text-3xl">Privacy Policy</h1>
        <p className="text-lg text-slate">
          This policy explains what data {companyName} collects today (almost nothing — this
          Phase 0 site has no login and sets no third-party tracking cookies), what a future live
          school deployment will process, and a parent&rsquo;s rights over their child&rsquo;s
          data under India&rsquo;s DPDP Act.
        </p>
        <p className="text-sm text-slate/70">Last updated {LAST_UPDATED}.</p>
      </div>

      <Card className="border-amber/40 bg-amber/5">
        <p className="text-sm font-semibold text-slate">Draft — pending legal review</p>
        <p className="mt-2 text-sm text-slate">
          This is a structurally complete draft, written to align with the Digital Personal Data
          Protection Act, 2023 (DPDP Act) and its rules. It is not a substitute for review by a
          qualified lawyer before this site or any school deployment goes live, and it will be
          updated as that review happens.
        </p>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold text-slate">1. Who we are</h2>
        <p className="text-sm text-slate">
          {companyName} ({companyAddress}) operates this website and, for schools that engage us,
          the NetCyberAI school platform. For queries about this policy, contact{' '}
          <a href={`mailto:${contactEmail}`} className="underline">
            {contactEmail}
          </a>
          .
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold text-slate">2. What this website collects today</h2>
        <p className="text-sm text-slate">
          As of this policy&rsquo;s last update, this public website is a static marketing site.
          It does not use third-party analytics or advertising cookies, does not require an
          account, and does not collect personal data through the pages themselves. If you message
          us on WhatsApp using a link on this site, WhatsApp processes that conversation under its
          own privacy terms, and we receive and respond to what you send us.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold text-slate">
          3. What a school deployment will process (once live)
        </h2>
        <p className="text-sm text-slate">
          For a school that engages {companyName} for the platform itself, the categories of
          personal data involved are expected to include: student name, class, roll number, date
          of birth, attendance, academic marks, and fee records; parent/guardian name, phone
          number, and relationship to the student; and staff name, role, and class assignments. No
          such processing exists today — this section describes what will apply once a school is
          actually onboarded, and this policy will be versioned when that happens.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold text-slate">4. Children&rsquo;s personal data</h2>
        <p className="text-sm text-slate">
          Most data processed by the school platform concerns children. In line with the DPDP
          Act&rsquo;s specific obligations for children&rsquo;s data, no student record becomes
          active without a verifiable consent record tied to a parent or lawful guardian, and a
          bulk import of student records does not itself constitute consent — it places records
          in a pending state until consent is separately obtained. We do not carry out behavioural
          monitoring or tracking of a child beyond what is strictly necessary for the school&rsquo;s
          own legitimate educational purpose, and any feature that could constitute such monitoring
          is scoped to school staff only until a specific legal basis for extending it further is
          confirmed.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold text-slate">5. Purpose limitation and consent</h2>
        <p className="text-sm text-slate">
          Each category of communication — daily updates, weekly summaries, recognition
          messages, fee reminders — is treated as a separately consentable purpose, defaulting
          to off until a parent or guardian has agreed to it, and withdrawable independently of the
          others at any time.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold text-slate">6. Your rights as a data principal</h2>
        <p className="text-sm text-slate">
          Subject to the DPDP Act and its rules, you may request access to, correction of, or
          erasure of personal data we hold about you or your child, and you may withdraw consent
          previously given, at any time and as easily as it was given. To exercise any of these
          rights, contact{' '}
          <a href={`mailto:${contactEmail}`} className="underline">
            {contactEmail}
          </a>
          . We intend to publish a dedicated Grievance Officer contact once a school deployment is
          live, as required under the Act.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold text-slate">7. Where data is stored</h2>
        <p className="text-sm text-slate">
          For a live school deployment, operational data is intended to be stored in a database
          hosted in India. See{' '}
          <a href="/security/data-ownership" className="underline">
            Data Ownership &amp; Security
          </a>{' '}
          for the specifics and current status of that commitment.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold text-slate">8. Retention</h2>
        <p className="text-sm text-slate">
          We retain personal data only for as long as necessary for the purpose it was collected
          for, or as required by applicable law. A specific retention schedule for school data will
          be published once a live deployment exists to define one against.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold text-slate">9. Changes to this policy</h2>
        <p className="text-sm text-slate">
          We will update this policy as the product and its legal review progress, and will update
          the &ldquo;last updated&rdquo; date above whenever we do.
        </p>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbListJsonLd(pageMeta.privacy)) }}
      />
    </Container>
  );
}
