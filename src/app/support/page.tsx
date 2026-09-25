import Link from 'next/link';
import { Container } from '@/components/ui/Container';
import { Button } from '@/components/ui/Button';
import { PageHero } from '@/components/marketing/PageHero';
import { SectionHeading } from '@/components/visual/Primitives';
import { Icon, type IconName } from '@/components/visual/Icons';
import { tones, type Tone } from '@/lib/semantic';
import { breadcrumbListJsonLd, buildMetadata, pageMeta, serializeJsonLd } from '@/lib/seo';
import { contactEmail, whatsappLink } from '@/lib/site-config';

export const metadata = buildMetadata(pageMeta.support);

const CHECKLIST = [
  'Your school’s name and your role',
  'The page or screen you were on',
  'What you expected, and what happened instead',
  'A screenshot, if you can take one',
];

// Only links to pages that exist and are marked available.
const SELF_HELP: { title: string; body: string; href: string; icon: IconName; tone: Tone }[] = [
  { title: 'Help Center', body: 'How onboarding, imports and attendance work.', href: '/resources/help-center', icon: 'support', tone: 'communication' },
  { title: 'FAQs', body: 'Short answers to the questions schools ask most.', href: '/resources/faqs', icon: 'chat', tone: 'product' },
  { title: 'Data ownership & security', body: 'What runs today and what is still planned.', href: '/security/data-ownership', icon: 'shield', tone: 'trust' },
  { title: 'Release notes', body: 'What has changed on the platform.', href: '/resources/release-notes', icon: 'sparkle', tone: 'intelligence' },
];

export default function SupportPage() {
  return (
    <>
      <PageHero
        id="support-title"
        eyebrow="Support"
        tone="communication"
        title="Help from a real person"
        lead={
          <>
            NetCyberAI support is run by the same team that builds the platform. Schools on a pilot or a full rollout
            can reach a real person by WhatsApp or email, and nobody is routed through a chatbot. Tell us what you
            were trying to do and what happened, and we will work through it with you.
          </>
        }
      >
        <div className="flex flex-wrap gap-3">
          <Button href={whatsappLink('Hi, I need help with NetCyberAI.')} variant="secondary">
            WhatsApp support
          </Button>
          <Button href={`mailto:${contactEmail}?subject=${encodeURIComponent('Support request')}`} variant="outlineLight">
            Email support
          </Button>
          <Button href="/login" variant="outlineLight">
            Log in
          </Button>
        </div>
      </PageHero>

      <section aria-labelledby="support-channels-title" className="bg-off-white">
        <Container wide className="grid grid-cols-1 gap-10 py-16 lg:grid-cols-2">
          <div className="flex flex-col gap-6">
            <SectionHeading id="support-channels-title" eyebrow="Reach us" tone="success" title="Two ways to get help" />
            <ul className="flex flex-col gap-4">
              <li className="flex gap-4 rounded-3xl border border-slate/10 bg-white p-5">
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${tones.success.solid}`}>
                  <Icon name="chat" className="h-5 w-5" />
                </span>
                <span className="flex flex-col gap-1">
                  <span className="font-extrabold text-slate">WhatsApp</span>
                  <span className="text-sm text-slate/70">Best for anything time-sensitive during the school day.</span>
                </span>
              </li>
              <li className="flex gap-4 rounded-3xl border border-slate/10 bg-white p-5">
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${tones.product.solid}`}>
                  <Icon name="mail" className="h-5 w-5" />
                </span>
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="font-extrabold text-slate">Email</span>
                  <span className="break-all text-sm text-slate/70">{contactEmail}</span>
                  <span className="text-sm text-slate/70">Best when you need to attach files, such as a CSV that will not import.</span>
                </span>
              </li>
            </ul>
          </div>
          <div className="flex flex-col gap-4 rounded-3xl border border-slate/10 bg-white p-6">
            <h2 className="text-xl font-extrabold text-slate">What to include</h2>
            <ul className="flex flex-col gap-2">
              {CHECKLIST.map((c) => (
                <li key={c} className="flex items-start gap-2 text-slate">
                  <Icon name="check" className="mt-1 h-4 w-4 shrink-0 text-emerald" />
                  {c}
                </li>
              ))}
            </ul>
            <p className="rounded-2xl bg-off-white p-4 text-sm text-slate/70">
              Please never send a parent&apos;s or student&apos;s full details in a support message unless we ask for
              them. A student ID or class name is usually enough for us to find the record.
            </p>
          </div>
        </Container>
      </section>

      <section aria-labelledby="self-help-title" className="bg-white">
        <Container wide className="flex flex-col gap-8 py-16">
          <SectionHeading id="self-help-title" eyebrow="Self-help" tone="product" title="Answers you can read now" />
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {SELF_HELP.map((s) => (
              <li key={s.href}>
                <Link
                  href={s.href}
                  className="flex h-full flex-col gap-3 rounded-3xl border border-slate/10 bg-off-white p-5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal"
                >
                  <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${tones[s.tone].solid}`}>
                    <Icon name={s.icon} className="h-5 w-5" />
                  </span>
                  <span className="font-extrabold text-slate">{s.title}</span>
                  <span className="text-sm text-slate/70">{s.body}</span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="text-sm text-slate/70">
            Not a NetCyberAI school yet?{' '}
            <Link href="/contact" className="font-semibold text-royal underline">
              Contact sales
            </Link>{' '}
            or{' '}
            <Link href="/contact#callback" className="font-semibold text-royal underline">
              request a callback
            </Link>
            .
          </p>
        </Container>
      </section>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbListJsonLd(pageMeta.support)) }} />
    </>
  );
}
