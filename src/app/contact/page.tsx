import Link from 'next/link';
import { Container } from '@/components/ui/Container';
import { PageHero } from '@/components/marketing/PageHero';
import { QuickLeadForm } from '@/components/marketing/QuickLeadForm';
import { SectionHeading } from '@/components/visual/Primitives';
import { Icon, type IconName } from '@/components/visual/Icons';
import { tones, type Tone } from '@/lib/semantic';
import { breadcrumbListJsonLd, buildMetadata, pageMeta, serializeJsonLd } from '@/lib/seo';
import { companyAddress, contactEmail, whatsappLink } from '@/lib/site-config';

export const metadata = buildMetadata(pageMeta.contact);

const NEXT_STEPS: { title: string; detail: string; icon: IconName; tone: Tone }[] = [
  { title: 'A person reads it', detail: 'Every enquiry lands in our own onboarding queue, not an auto-responder.', icon: 'users', tone: 'trust' },
  { title: 'We call or write back', detail: 'On the phone number or email you shared, to understand your school first.', icon: 'phone', tone: 'communication' },
  { title: 'You choose the next step', detail: 'A demo, a pilot, or just answers. Nothing is switched on without you.', icon: 'check', tone: 'success' },
];

export default function ContactPage() {
  return (
    <>
      <PageHero
        id="contact-title"
        eyebrow="Contact sales"
        tone="communication"
        title="Talk to the NetCyberAI team"
        lead={
          <>
            Tell us about your school and a real person on the NetCyberAI team will reply. Use the form for a sales
            question, a pilot enquiry, or anything about how WhatsApp updates, fees and Personal Best recognition
            would work for your students and parents. Prefer a phone call? Request a callback below instead.
          </>
        }
      />

      <section aria-labelledby="contact-form-title" className="bg-off-white">
        <Container wide className="grid grid-cols-1 gap-10 py-16 lg:grid-cols-5">
          <div className="flex flex-col gap-6 lg:col-span-3">
            <h2 id="contact-form-title" className="text-2xl font-extrabold text-slate">
              Send us a message
            </h2>
            <QuickLeadForm source="contact" />
          </div>
          <aside aria-label="Other ways to reach us" className="flex flex-col gap-4 lg:col-span-2">
            <a
              href={whatsappLink('Hi, I would like to talk to your team.')}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-4 rounded-3xl border border-slate/10 bg-white p-5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal"
            >
              <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${tones.success.solid}`}>
                <Icon name="chat" className="h-6 w-6" />
              </span>
              <span className="flex flex-col">
                <span className="font-extrabold text-slate">WhatsApp</span>
                <span className="text-sm text-slate/70">Message the team directly</span>
              </span>
            </a>
            <a
              href={`mailto:${contactEmail}`}
              className="flex items-center gap-4 rounded-3xl border border-slate/10 bg-white p-5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal"
            >
              <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${tones.product.solid}`}>
                <Icon name="mail" className="h-6 w-6" />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="font-extrabold text-slate">Email</span>
                <span className="break-all text-sm text-slate/70">{contactEmail}</span>
              </span>
            </a>
            <div className="flex items-center gap-4 rounded-3xl border border-slate/10 bg-white p-5">
              <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${tones.trust.solid}`}>
                <Icon name="school" className="h-6 w-6" />
              </span>
              <span className="flex flex-col">
                <span className="font-extrabold text-slate">Office</span>
                <span className="text-sm text-slate/70">{companyAddress}</span>
              </span>
            </div>
            <div className="rounded-3xl border border-slate/10 bg-white p-5">
              <p className="font-extrabold text-slate">Already a NetCyberAI school?</p>
              <p className="mt-1 text-sm text-slate/70">
                Visit{' '}
                <Link href="/support" className="font-semibold text-royal underline">
                  Support
                </Link>{' '}
                for help with your account, or{' '}
                <Link href="/login" className="font-semibold text-royal underline">
                  log in
                </Link>
                .
              </p>
            </div>
          </aside>
        </Container>
      </section>

      <section aria-labelledby="next-steps-title" className="bg-white">
        <Container wide className="flex flex-col gap-8 py-16">
          <SectionHeading id="next-steps-title" eyebrow="What happens next" tone="trust" title="From your message to a working school" />
          <ol className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {NEXT_STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-4 rounded-3xl border border-slate/10 bg-off-white p-5">
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${tones[s.tone].solid}`}>
                  <Icon name={s.icon} className="h-5 w-5" />
                </span>
                <span className="flex flex-col gap-1">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate/70">{`Step ${i + 1}`}</span>
                  <span className="font-extrabold text-slate">{s.title}</span>
                  <span className="text-sm text-slate/70">{s.detail}</span>
                </span>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      <section id="callback" aria-labelledby="callback-title" className="scroll-mt-24 bg-off-white">
        <Container wide className="grid grid-cols-1 items-start gap-10 py-16 lg:grid-cols-2">
          <div className="flex flex-col gap-4">
            <SectionHeading
              id="callback-title"
              eyebrow="Request a callback"
              tone="action"
              title="Rather talk it through?"
              lead="Leave your number and the best time to reach you. A member of the team calls you back to answer questions, with no slides and no obligation."
            />
          </div>
          <QuickLeadForm source="callback" />
        </Container>
      </section>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbListJsonLd(pageMeta.contact)) }} />
    </>
  );
}
