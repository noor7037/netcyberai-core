import Link from 'next/link';
import { Container } from '@/components/ui/Container';
import { PageHero } from '@/components/marketing/PageHero';
import { QuickLeadForm } from '@/components/marketing/QuickLeadForm';
import { SectionHeading } from '@/components/visual/Primitives';
import { Icon, type IconName } from '@/components/visual/Icons';
import { FaqBlock } from '@/components/content/FaqBlock';
import { HowItWorks } from '@/components/home/HowItWorks';
import { DEMO_FAQS } from '@/content/faqs';
import { heroChips } from '@/content/pricing';
import { tones, type Tone } from '@/lib/semantic';
import { breadcrumbListJsonLd, buildMetadata, pageMeta, serializeJsonLd } from '@/lib/seo';
import { companyAddress, contactEmail, displayPhone, whatsappLink } from '@/lib/site-config';

export const metadata = buildMetadata(pageMeta.contact);

// Contact page laid out to the founder's 2026-09-28 reference: direct
// channels beside the enquiry form, then the three onboarding steps and
// demo FAQs. Only NetCyberAI's own, real contact details are shown.

function Channel({ icon, tone, title, value, note, href }: { icon: IconName; tone: Tone; title: string; value: string; note: string; href?: string }) {
  const body = (
    <>
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${tones[tone].solid}`}>
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-sm font-bold text-slate/70">{title}</span>
        <span className="break-words font-extrabold text-slate">{value}</span>
        <span className="text-xs text-slate/70">{note}</span>
      </span>
    </>
  );
  const cls = 'flex items-center gap-4 rounded-2xl border border-slate/10 bg-off-white p-4';
  return href ? (
    <a
      href={href}
      {...(href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className={`${cls} nca-lift hover:border-royal/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal`}
    >
      {body}
    </a>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export default function ContactPage() {
  const phone = displayPhone();
  return (
    <>
      <PageHero
        id="contact-title"
        eyebrow="Contact us"
        tone="communication"
        title="Let’s build the future of your school"
        lead={
          <>
            Talk to the NetCyberAI team for a free one-to-one demo, a custom quote or help getting started. A real person
            replies to every message. Write to us, call or WhatsApp, or fill in the form and we will reach you on the number
            you share, at a time that suits your school.
          </>
        }
      />

      <section aria-labelledby="contact-form-title" className="bg-off-white">
        <Container wide className="grid grid-cols-1 gap-6 py-14 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <aside aria-labelledby="channels-title" className="flex flex-col gap-4 rounded-3xl border border-slate/10 bg-white p-6 shadow-sm">
            <div>
              <h2 id="channels-title" className="text-xl font-extrabold text-slate">
                Direct channels
              </h2>
              <p className="text-sm text-slate/70">Reach the NetCyberAI team directly by call, WhatsApp or email.</p>
            </div>
            <Channel icon="mail" tone="product" title="Email us" value={contactEmail} note="For demos, quotes and support" href={`mailto:${contactEmail}`} />
            <Channel icon="phone" tone="success" title="Call or WhatsApp" value={phone} note="Chat directly with our team" href={whatsappLink('Hi, I would like to talk to the NetCyberAI team.')} />
            <Channel icon="school" tone="trust" title="Office" value={companyAddress} note="Working with schools across India" />
            <div className="rounded-2xl border border-slate/10 p-4">
              <p className="font-extrabold text-slate">Already a NetCyberAI school?</p>
              <p className="mt-1 text-sm text-slate/70">
                Visit{' '}
                <Link href="/support" className="font-semibold text-royal underline">
                  Support
                </Link>{' '}
                or{' '}
                <Link href="/login" className="font-semibold text-royal underline">
                  log in
                </Link>
                .
              </p>
            </div>
            <ul className="mt-auto grid grid-cols-1 gap-2 sm:grid-cols-2">
              <li className="flex items-center gap-2 rounded-xl border border-slate/10 p-3 text-xs font-semibold text-slate">
                <Icon name="shield" className="h-4 w-4 shrink-0 text-emerald-text" /> Your data stays in India
              </li>
              <li className="flex items-center gap-2 rounded-xl border border-slate/10 p-3 text-xs font-semibold text-slate">
                <Icon name="lock" className="h-4 w-4 shrink-0 text-emerald-text" /> Nothing sent to parents until you say so
              </li>
            </ul>
          </aside>

          <div className="flex flex-col gap-4 rounded-3xl border border-slate/10 bg-white p-6 shadow-sm">
            <p className="inline-flex w-fit items-center gap-2 rounded-lg bg-off-white px-3 py-1.5 text-sm font-bold text-slate">
              <Icon name="sparkle" className="h-4 w-4 text-royal" /> Schedule your free one-to-one demo
            </p>
            <h2 id="contact-form-title" className="sr-only">
              Send us a message
            </h2>
            <QuickLeadForm source="contact" />
            <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs font-semibold text-slate/70" aria-label="What every school gets">
              {heroChips().map((c) => (
                <li key={c} className="flex items-center gap-1">
                  <Icon name="check" className="h-3.5 w-3.5 text-emerald-text" /> {c}
                </li>
              ))}
            </ul>
          </div>
        </Container>
      </section>

      <HowItWorks id="contact-steps" tint="white" ctas={false} />

      <section aria-labelledby="contact-faq-title" className="bg-off-white">
        <Container className="flex flex-col gap-6 py-14">
          <SectionHeading id="contact-faq-title" eyebrow="Got questions?" tone="product" title="Frequently asked questions" center />
          <FaqBlock items={DEMO_FAQS} />
        </Container>
      </section>

      <section id="callback" aria-labelledby="callback-title" className="scroll-mt-24 bg-white">
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
