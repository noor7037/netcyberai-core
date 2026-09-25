import Image from 'next/image';
import { Container } from '@/components/ui/Container';
import { Button } from '@/components/ui/Button';
import { PrintButton } from '@/components/marketing/PrintButton';
import { Icon } from '@/components/visual/Icons';
import { products } from '@/content/catalog';
import { tones } from '@/lib/semantic';
import { breadcrumbListJsonLd, buildMetadata, pageMeta, serializeJsonLd } from '@/lib/seo';
import { contactEmail, siteUrl, whatsappNumber } from '@/lib/site-config';

export const metadata = buildMetadata(pageMeta.brochure);

const ROLES = [
  { role: 'Principal', value: 'School health, exceptions and teaching signals in one view.' },
  { role: 'Teacher', value: 'One Today screen for attendance, homework and the Pulse.' },
  { role: 'Parent', value: 'A short WhatsApp update on what was taught, with one-tap replies.' },
  { role: 'Finance', value: 'Dues, WhatsApp reminders with a UPI link, and receipts.' },
];

const PRINCIPLES = [
  'WhatsApp first. Parents need no app.',
  'Personal Best recognition, never a public ranking of teachers.',
  'Consent recorded before anything reaches a parent.',
  'Every school isolated in the database, every change audited.',
];

export default function BrochurePage() {
  return (
    <>
      <section aria-labelledby="brochure-title" className="bg-off-white print:hidden">
        <Container wide className="flex flex-col gap-4 pt-12">
          <h1 id="brochure-title" className="text-3xl font-extrabold tracking-tight text-slate sm:text-4xl">
            NetCyberAI brochure
          </h1>
          <p className="max-w-3xl text-lg text-slate/70">
            This is the NetCyberAI brochure as a single printable page. It summarises what the connected school
            platform does for principals, teachers, parents and finance teams. Use the button to print it or save
            it as a PDF from your browser, then share it with your management committee or trust.
          </p>
          <div className="flex flex-wrap gap-3">
            <PrintButton />
            <Button href="/book-demo" variant="outline">
              Book a demo
            </Button>
          </div>
        </Container>
      </section>

      <section aria-label="Brochure" className="bg-off-white py-10 print:bg-white print:py-0">
        <Container wide className="print:px-0">
          <article className="mx-auto flex max-w-4xl flex-col gap-6 rounded-3xl bg-white p-6 shadow-xl sm:p-10 print:max-w-none print:gap-3 print:rounded-none print:p-0 print:shadow-none">
            <div aria-hidden="true" className="nca-spectrum-bar h-1.5 rounded-full" />
            <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/wordmark.webp" srcSet="/brand/wordmark.webp 1x, /brand/wordmark@2x.webp 2x" alt="NetCyberAI" className="h-10 w-auto self-start" />
              <p className="text-sm font-bold text-slate/70">The connected school platform for India</p>
            </header>

            <div className="grid grid-cols-1 items-center gap-6 sm:grid-cols-5">
              <div className="flex flex-col gap-3 sm:col-span-3">
                <h2 className="text-2xl font-extrabold text-slate sm:text-3xl">One school record. Every role connected.</h2>
                <p className="text-slate/70">
                  NetCyberAI keeps students, guardians, classes, attendance, fees and results in one validated record,
                  and turns it into a short WhatsApp update parents actually read. Principals see exceptions early,
                  teachers stop retyping, and families know what was taught today.
                </p>
              </div>
              <Image
                src="/brand/ecosystem-art.webp"
                alt="A student, a teacher and a family connected by one colourful ribbon"
                width={880}
                height={716}
                className="h-auto w-full sm:col-span-2 print:w-36 print:justify-self-end"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 print:gap-2">
              {ROLES.map((r) => (
                <div key={r.role} className="rounded-2xl border border-slate/10 p-4 print:break-inside-avoid print:p-3">
                  <p className="font-extrabold text-slate">{r.role}</p>
                  <p className="text-sm text-slate/70">{r.value}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-3">
              <h3 className="text-lg font-extrabold text-slate">What the platform covers</h3>
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {products.map((p) => (
                  <li key={p.slug} className="flex items-start gap-2 print:break-inside-avoid">
                    <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${tones[p.tone].solid}`}>
                      <Icon name={p.icon} className="h-4 w-4" />
                    </span>
                    <span className="text-sm">
                      <span className="font-bold text-slate">{p.name}</span>
                      <span className="block text-slate/70">{p.menuBlurb}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col gap-3 rounded-2xl bg-off-white p-5 print:p-4">
              <h3 className="text-lg font-extrabold text-slate">Rules the product keeps</h3>
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {PRINCIPLES.map((t) => (
                  <li key={t} className="flex items-start gap-2 text-sm text-slate">
                    <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-emerald" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>

            <p className="text-xs text-slate/70">
              Module availability varies while NetCyberAI is in its pilot phase. Ask us which modules are live for
              your school today.
            </p>

            <footer className="flex flex-col gap-1 border-t border-slate/10 pt-4 text-sm text-slate sm:flex-row sm:flex-wrap sm:gap-x-6">
              <span className="font-bold">{siteUrl.replace('https://', '')}</span>
              <span>{contactEmail}</span>
              <span>{`WhatsApp +${whatsappNumber}`}</span>
            </footer>
          </article>
        </Container>
      </section>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbListJsonLd(pageMeta.brochure)) }} />
    </>
  );
}
