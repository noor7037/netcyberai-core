import { Container } from '@/components/ui/Container';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { FaqBlock } from '@/components/content/FaqBlock';
import { SourceLink } from '@/components/content/SourceLink';
import { companyName, contactEmail, whatsappLink } from '@/lib/site-config';
import { breadcrumbListJsonLd, buildMetadata, pageMeta, serializeJsonLd } from '@/lib/seo';

export const metadata = buildMetadata(pageMeta.dataOwnership);

const faqs = [
  {
    question: 'Can a school export all of its own data?',
    answer:
      'This is planned for Phase 1, not live today. Once a school’s data exists, it is intended to be exportable in standard formats — CSV or SQL — rather than a proprietary format, so a school is never locked into the platform.',
  },
  {
    question: 'Where is school data stored?',
    answer:
      'The Phase 1 database is planned to be provisioned on Supabase in its Mumbai, India region (AWS ap-south-1), so operational school data would be stored in India by default. No live database exists yet in Phase 0.',
  },
  {
    question: 'How is children’s data handled under the DPDP Act?',
    answer:
      'No student record becomes active without a verifiable consent record from a parent or guardian. A bulk import creates records in a pending-consent state rather than an active one, and each communication type — Daily Pulse, recognition, Weekly Brief — is separately consentable and defaults to off until specifically granted.',
  },
  {
    question: 'What happens to our data if we leave?',
    answer:
      'This is planned for Phase 1: on offboarding, a school is intended to receive a full export of its data before deletion, with a specific retention and deletion timeline published once that operational process actually exists and has been tested.',
  },
  {
    question: 'Does NetCyberAI use third-party analytics?',
    answer:
      'No third-party analytics script, advertising pixel, or session-replay tool runs on any authenticated page where school or student data would be visible. This Phase 0 public website itself also sets no third-party tracking cookies.',
  },
];

export default function DataOwnershipPage() {
  return (
    <Container className="flex flex-col gap-12 py-12">
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold text-sapphire sm:text-3xl">
          Data Ownership &amp; Security
        </h1>
        <p className="text-lg text-slate">
          {companyName} is designed so each school&rsquo;s data stays isolated from every other
          school, enforced at the database level, and a school can export a full copy of its own
          records instead of being locked into the platform. As of Phase 0 no live database exists
          yet, so these are locked design commitments for the first release, not features running
          today.
        </p>
      </div>

      <Card className="border-amber/40 bg-amber/5">
        <p className="text-sm font-semibold text-slate">Current status: Phase 0</p>
        <p className="mt-2 text-sm text-slate">
          Today, {companyName} operates only this public website. No school, student, or parent
          data is collected, stored, or processed by us yet — there is no live database, no login,
          and no messaging integration. The commitments below describe how the platform is
          designed to work once a school is actually onboarded, and each one is marked as such.
        </p>
      </Card>

      <div className="flex flex-col gap-3">
        <h2 className="text-xl font-bold text-slate">Consent, before anything else (DPDP)</h2>
        <p className="text-sm text-slate">
          <strong>Planned, Phase 1 design already locked in the schema:</strong> every student
          record is created in a quarantined <code>pending_consent</code> state, including bulk
          CSV imports of hundreds of students at once. No outbound message and no recognition
          scoring reaches a student until consent is recorded. Daily Pulse, Weekly Brief, and
          Recognition are each a separately consentable purpose, defaulting to off, independently
          withdrawable at any time — turning one off does not require turning the others off.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-xl font-bold text-slate">WhatsApp privacy</h2>
        <p className="text-sm text-slate">
          <strong>Permanent policy, not a configurable setting:</strong> every parent message is
          sent 1-on-1. WhatsApp Groups are never used for parent communication, because a group
          would expose every parent&rsquo;s phone number to every other parent in that group —
          a privacy problem with no consent basis, and one we refuse to build regardless of how a
          school asks for it.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-xl font-bold text-slate">No third-party tracking on your data</h2>
        <p className="text-sm text-slate">
          No third-party analytics script, advertising pixel, or session-replay tool runs on any
          authenticated page where school or student data would be visible — this is a standing
          rule, not a Phase 1 promise. It already applies to this Phase 0 site: this website itself
          sets no third-party tracking cookies and loads no ad or analytics pixels.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-xl font-bold text-slate">Where your data lives</h2>
        <p className="text-sm text-slate">
          <strong>Planned commitment for Phase 1:</strong> the school database will be provisioned
          on Supabase in its Mumbai, India region (AWS <code>ap-south-1</code>), so operational
          school data is stored in India by default. Supabase&rsquo;s own platform guarantees that
          all customer data is encrypted at rest with AES-256 and encrypted in transit via TLS —
          this is a default of the underlying infrastructure we would be provisioning, not a
          feature we would build ourselves, and it applies automatically once that project exists.
        </p>
        <p className="text-xs text-slate/70">
          Source:{' '}
          <SourceLink href="https://supabase.com/security">
            Supabase&rsquo;s security page
          </SourceLink>
          . Checked 16 September 2026.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-xl font-bold text-slate">Every query scoped to your school</h2>
        <p className="text-sm text-slate">
          <strong>Locked architectural decision, already reflected in the schema design:</strong>{' '}
          every operational table carries a school identifier, and access is restricted using
          Postgres Row-Level Security — enforced by the database itself, not only by
          application code that a future bug could bypass. No table is exempt from this rule.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-xl font-bold text-slate">Exporting your data</h2>
        <p className="text-sm text-slate">
          <strong>Planned for Phase 1:</strong> a school will be able to request a full export of
          its own records in standard formats (CSV / SQL), not a proprietary format that locks you
          into the platform. This does not exist yet because there is no live database yet — we
          are not claiming an export button exists today.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-xl font-bold text-slate">If you leave</h2>
        <p className="text-sm text-slate">
          <strong>Planned for Phase 1:</strong> on offboarding, a school receives a full export of
          its data before deletion, and we intend to publish a specific retention and deletion
          timeline once that operational process actually exists, rather than promise a number now
          that nothing has tested.
        </p>
      </div>

      <div>
        <h2 className="text-xl font-bold text-slate">Frequently asked questions</h2>
        <div className="mt-6">
          <FaqBlock items={faqs} />
        </div>
      </div>

      <div className="rounded-lg bg-sapphire p-8 text-off-white">
        <h2 className="text-xl font-bold">Have a specific question?</h2>
        <p className="mt-2 text-off-white/90">
          Ask us directly on WhatsApp, or write to{' '}
          <a href={`mailto:${contactEmail}`} className="min-h-[44px] inline-flex items-center underline">
            {contactEmail}
          </a>
          .
        </p>
        <div className="mt-4">
          <Button
            href={whatsappLink('Hi, I have a question about how NetCyberAI handles school data.')}
            variant="secondary"
          >
            Ask on WhatsApp
          </Button>
        </div>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbListJsonLd(pageMeta.dataOwnership)) }}
      />
    </Container>
  );
}
