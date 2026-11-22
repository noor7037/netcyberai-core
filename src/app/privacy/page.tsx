import { Container } from '@/components/ui/Container';
import { Card } from '@/components/ui/Card';
import { companyAddress, companyName, contactEmail } from '@/lib/site-config';
import { breadcrumbListJsonLd, buildMetadata, pageMeta, serializeJsonLd } from '@/lib/seo';

const LAST_UPDATED = '22 November 2026';

export const metadata = buildMetadata(pageMeta.privacy);

export default function PrivacyPage() {
  return (
    <Container reading className="flex flex-col gap-10 py-12">
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold text-sapphire sm:text-3xl">Privacy Policy</h1>
        <p className="text-lg text-slate">
          This policy explains what data {companyName} collects today through this website (only
          the details you type into an enquiry form, with no third-party tracking cookies), what a
          live school deployment processes, and a parent&rsquo;s rights over their child&rsquo;s
          data under India&rsquo;s DPDP Act.
        </p>
        <p className="text-sm text-slate/70">Last updated {LAST_UPDATED}.</p>
      </div>

      <Card className="border-amber/40 bg-amber/5">
        <p className="text-sm font-semibold text-slate">Draft — pending legal review</p>
        <p className="mt-2 text-base leading-relaxed text-slate">
          This is a structurally complete draft, written to align with the Digital Personal Data
          Protection Act, 2023 (DPDP Act) and its rules. It is not a substitute for review by a
          qualified lawyer before this site or any school deployment goes live, and it will be
          updated as that review happens.
        </p>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold text-slate">1. Who we are</h2>
        <p className="text-base leading-relaxed text-slate">
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
        <p className="text-base leading-relaxed text-slate">
          This website does not use third-party analytics or advertising cookies, and browsing it
          does not require an account. When you submit an enquiry form (Get Started, Book a Demo,
          Start a Pilot, Contact or Request a Callback), we store what you type: your name, phone
          number, school or organisation, and any optional details such as email, city, school
          size or message. We use it only to reply to your enquiry and to spot repeat requests
          from the same number. It is stored in our own database in India and is not sold. To have
          an enquiry deleted, email us at the address above. If you message us on WhatsApp using a
          link on this site, WhatsApp processes that conversation under its own privacy terms, and
          we receive and respond to what you send us.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold text-slate">
          3. What a school deployment will process (once live)
        </h2>
        <p className="text-base leading-relaxed text-slate">
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
        <p className="text-base leading-relaxed text-slate">
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
        <h2 className="text-xl font-bold text-slate">5. Focus Lock (NetCyberAI Focus app)</h2>
        <p className="text-base leading-relaxed text-slate">
          NetCyberAI Focus is a separate Android app for parents. A parent chooses entertainment
          apps and study times, and the app keeps those apps closed in those times until the
          child&rsquo;s study for the day is done. It is for a parent to use on a phone their own
          child uses. It runs with a visible &ldquo;Focus Lock is on&rdquo; notification and is
          not hidden. Its children&rsquo;s data is handled under the terms of this page, including
          the DPDP Act terms in sections 4 and 7.
        </p>
        <h3 className="text-base font-semibold text-slate">What the app reads on the phone</h3>
        <p className="text-base leading-relaxed text-slate">
          With the parent&rsquo;s permission (usage access and display over other apps, both
          switched on by the parent in Android Settings), the app reads which app is in front, so
          it can show a &ldquo;Study first&rdquo; screen over a locked app. This stays on the
          phone. Which apps are opened, and when, is never sent to us or to anyone, and the list
          of apps the parent chose from is not sent either. The app does not use the Accessibility
          service and is not a device administrator.
        </p>
        <h3 className="text-base font-semibold text-slate">What is sent to our server</h3>
        <ul className="list-disc pl-5 text-sm text-slate">
          <li>
            The phone reads from our server whether today&rsquo;s study is done and the titles of
            what is still pending, so the block screen can show them.
          </li>
          <li>
            About every 30 minutes while the lock is on, the phone sends three facts and nothing
            else: the lock is on, its permissions are on, and the phone&rsquo;s clock was changed.
            We use them only to tell the parent in the parent area when the lock has stopped or
            been tampered with.
          </li>
          <li>
            A random id made on the phone identifies it to us, and we keep only a keyed hash of
            it.
          </li>
        </ul>
        <h3 className="text-base font-semibold text-slate">The parent PIN</h3>
        <p className="text-base leading-relaxed text-slate">
          The parent PIN is checked once against our server when the parent sets the app up. The
          phone then keeps it only as a salted hash and never shows it.
        </p>
        <h3 className="text-base font-semibold text-slate">
          No advertising, no selling, and how to delete
        </h3>
        <p className="text-base leading-relaxed text-slate">
          The app shows no advertising and we do not sell data. To delete what we hold for a
          phone, a parent removes the phone in the Focus Lock part of the parent area of the
          NetCyberAI Family app, or uninstalls NetCyberAI Focus, which removes everything it
          keeps on the phone. A parent can also ask us to delete data at the address in section
          1.
        </p>
      </section>

      <section id="delete-account" className="flex flex-col gap-3">
        <h2 className="text-xl font-bold text-slate">Deleting a NetCyberAI Family account</h2>
        <p className="text-base leading-relaxed text-slate">
          In the NetCyberAI Family app, open the parent area with the parent PIN and tap Delete the
          account. This deletes the account, every child, every answer and all progress, for good.
          A parent can also ask us by email at the address in section 1; we delete the account and
          its data and reply when it is done. Uninstalling NetCyberAI Focus removes everything it
          keeps on the phone.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold text-slate">6. Purpose limitation and consent</h2>
        <p className="text-base leading-relaxed text-slate">
          Each category of communication — daily updates, weekly summaries, recognition
          messages, fee reminders — is treated as a separately consentable purpose, defaulting
          to off until a parent or guardian has agreed to it, and withdrawable independently of the
          others at any time.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold text-slate">7. Your rights as a data principal</h2>
        <p className="text-base leading-relaxed text-slate">
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
        <h2 className="text-xl font-bold text-slate">8. Where data is stored</h2>
        <p className="text-base leading-relaxed text-slate">
          For a live school deployment, operational data is intended to be stored in a database
          hosted in India. See{' '}
          <a href="/security/data-ownership" className="underline">
            Data Ownership &amp; Security
          </a>{' '}
          for the specifics and current status of that commitment.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold text-slate">9. Retention</h2>
        <p className="text-base leading-relaxed text-slate">
          We retain personal data only for as long as necessary for the purpose it was collected
          for, or as required by applicable law. A specific retention schedule for school data will
          be published once a live deployment exists to define one against.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold text-slate">10. Changes to this policy</h2>
        <p className="text-base leading-relaxed text-slate">
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
