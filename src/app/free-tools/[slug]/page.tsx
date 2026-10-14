import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Container } from '@/components/ui/Container';
import { Button } from '@/components/ui/Button';
import { EyebrowOnDark } from '@/components/visual/Primitives';
import { Icon } from '@/components/visual/Icons';
import { FaqBlock } from '@/components/content/FaqBlock';
import { CertificateStudio } from '@/components/free-tools/CertificateStudio';
import { ImportCheckerTool } from '@/components/free-tools/ImportCheckerTool';
import { MarksAnalyzerTool } from '@/components/free-tools/MarksAnalyzerTool';
import { StudentDataCheckTool } from '@/components/free-tools/StudentDataCheckTool';
import { RteClaimTool } from '@/components/free-tools/RteClaimTool';
import { TeacherRegisterTool } from '@/components/free-tools/TeacherRegisterTool';
import { AdmissionsTrackerTool } from '@/components/free-tools/AdmissionsTrackerTool';
import { FeePromiseTool } from '@/components/free-tools/FeePromiseTool';
import { RemarksBuilderTool } from '@/components/free-tools/RemarksBuilderTool';
import { LessonPlanTool } from '@/components/free-tools/LessonPlanTool';
import { ToolShell } from '@/components/free-tools/ToolShell';
import { TrialCta } from '@/components/free-tools/TrialCta';
import { LockedFeatures } from '@/components/free-tools/LockedFeatures';
import { FREE_TOOLS_UPDATED, KIND_LABELS, findFreeTool, freeTools, toolsOfKind, type FreeTool } from '@/content/free-tools';
import { getBlogPost } from '@/content/blog';
import { findCertDef } from '@/lib/certificates/definitions';
import { MARKS_EXAMPLE, TOOL_EXAMPLES } from '@/demo-fixture/free-tool-examples';
import { absoluteUrl, breadcrumbListJsonLd, buildMetadata, howToJsonLd, serializeJsonLd } from '@/lib/seo';
import { companyName } from '@/lib/site-config';

export function generateStaticParams() {
  return freeTools.map((t) => ({ slug: t.slug }));
}

export const dynamicParams = false;

export function generateMetadata({ params }: { params: { slug: string } }) {
  const t = findFreeTool(params.slug);
  if (!t) return {};
  return buildMetadata({ path: `/free-tools/${t.slug}`, title: t.title, description: t.description });
}

// Tools with their own screen; every other calculator runs in ToolShell.
const OWN_SCREEN: Record<string, () => JSX.Element> = {
  'student-import-checker': ImportCheckerTool,
  'student-data-check': StudentDataCheckTool,
  'rte-claim-sheet-builder': RteClaimTool,
  'teacher-qualification-register': TeacherRegisterTool,
  'admissions-enquiry-tracker': AdmissionsTrackerTool,
  'fee-promise-tracker': FeePromiseTool,
  'report-card-remarks-builder': RemarksBuilderTool,
  'lesson-plan-worksheet-maker': LessonPlanTool,
};

function Tool({ t }: { t: FreeTool }) {
  const path = `/free-tools/${t.slug}`;
  if (t.kind === 'certificate') {
    const def = findCertDef(t.slug);
    return def ? <CertificateStudio initialType={def.type} /> : null;
  }
  if (t.slug === 'exam-marks-analyzer') return <MarksAnalyzerTool example={MARKS_EXAMPLE} />;
  const Own = OWN_SCREEN[t.slug];
  if (Own) return <Own />;
  return <ToolShell slug={t.slug} example={TOOL_EXAMPLES[t.slug]} name={t.name} path={path} />;
}

// A free web application with a zero-price offer: what the page is, for
// answer engines. No ratings or reviews are ever added (C31).
function appJsonLd(t: FreeTool) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: t.name,
    url: absoluteUrl(`/free-tools/${t.slug}`),
    description: t.description,
    applicationCategory: 'EducationalApplication',
    operatingSystem: 'Any (runs in a web browser)',
    isAccessibleForFree: true,
    inLanguage: ['en-IN', 'hi-Latn'],
    dateModified: '2026-09-27',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'INR' },
    publisher: { '@type': 'Organization', name: companyName },
  };
}

export default function FreeToolPage({ params }: { params: { slug: string } }) {
  const t = findFreeTool(params.slug);
  if (!t) notFound();
  const post = t.blogSlug ? getBlogPost(t.blogSlug) : undefined;
  const siblings = toolsOfKind(t.kind).filter((o) => o.slug !== t.slug);
  const others = freeTools.filter((o) => o.kind !== t.kind);

  return (
    <>
      <section aria-labelledby="tool-title" className="relative overflow-hidden bg-midnight text-white print:hidden">
        <div aria-hidden="true" className="nca-mesh-dark absolute inset-0" />
        <div aria-hidden="true" className="nca-spectrum-bar absolute inset-x-0 top-0 h-1" />
        <Container wide className="relative flex flex-col gap-5 py-12 sm:py-14">
          <nav aria-label="Breadcrumb" className="text-sm opacity-90">
            <Link href="/free-tools" className="font-semibold underline-offset-4 hover:underline">
              Free tools
            </Link>{' '}
            <span aria-hidden="true">/</span> {KIND_LABELS[t.kind].title}
          </nav>
          <EyebrowOnDark tone={t.tone}>Free tool</EyebrowOnDark>
          <h1 id="tool-title" className="max-w-4xl text-4xl font-extrabold tracking-tight sm:text-5xl">
            {t.name}
          </h1>
          <p className="max-w-3xl text-lg opacity-90">{t.heroLead}</p>
          <ul className="flex flex-wrap gap-2 text-sm font-semibold">
            <li className="inline-flex items-center gap-2 rounded-full border border-white/25 px-3 py-1">
              <Icon name="check" className="h-4 w-4" /> Free, no login, no limit
            </li>
            <li className="inline-flex items-center gap-2 rounded-full border border-white/25 px-3 py-1">
              <Icon name="lock" className="h-4 w-4" /> Runs in your browser
            </li>
            <li className="inline-flex items-center gap-2 rounded-full border border-white/25 px-3 py-1">
              <Icon name="chat" className="h-4 w-4" /> {t.kind === 'certificate' ? 'Print-ready A4 PDF' : t.kind === 'decision' ? 'English and Hinglish' : 'Print, PDF and CSV'}
            </li>
            <li className="inline-flex items-center gap-2 rounded-full border border-white/25 px-3 py-1">Last updated {FREE_TOOLS_UPDATED}</li>
          </ul>
        </Container>
      </section>

      <section aria-labelledby="tool-problem-title" className="bg-white print:hidden">
        <Container wide className="grid grid-cols-1 gap-6 py-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:items-center">
          <div className="flex flex-col gap-2">
            <h2 id="tool-problem-title" className="text-2xl font-extrabold text-slate">
              The problem this solves
            </h2>
            <p className="text-slate/80">{t.problem}</p>
          </div>
          <TrialCta compact />
        </Container>
      </section>

      <section aria-label={t.name} className="bg-off-white">
        <Container wide className="py-10">
          <Tool t={t} />
          {t.kind !== 'certificate' && (
            <div className="mt-10 print:hidden">
              <LockedFeatures kind={t.kind} />
            </div>
          )}
        </Container>
      </section>

      <section aria-labelledby="tool-guide-title" className="bg-white print:hidden">
        <Container wide className="grid grid-cols-1 gap-10 py-14 lg:grid-cols-2">
          <div className="flex flex-col gap-5">
            <h2 id="tool-guide-title" className="text-2xl font-extrabold text-slate">
              How to use the {t.name}
            </h2>
            <ol className="flex flex-col gap-4">
              {t.steps.map((s, i) => (
                <li key={s.name} className="flex gap-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sapphire text-sm font-extrabold text-white">{i + 1}</span>
                  <span>
                    <b className="block text-slate">{s.name}</b>
                    <span className="text-slate/80">{s.text}</span>
                  </span>
                </li>
              ))}
            </ol>
            {post && (
              <p className="rounded-2xl bg-off-white p-4 text-slate">
                <span className="font-bold">Read the guide: </span>
                <Link href={`/blog/${post.slug}`} className="font-semibold text-royal underline">
                  {post.title}
                </Link>
              </p>
            )}
          </div>
          <div className="flex flex-col gap-5">
            <h2 className="text-2xl font-extrabold text-slate">Questions schools ask</h2>
            <FaqBlock items={t.faqs} />
          </div>
        </Container>
      </section>

      <section aria-labelledby="tool-more-title" className="bg-off-white print:hidden">
        <Container wide className="flex flex-col gap-6 py-14">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex max-w-2xl flex-col gap-2">
              <h2 id="tool-more-title" className="text-2xl font-extrabold text-slate">
                How NetCyberAI does this for you
              </h2>
              <p className="text-slate/80">{t.product.text}</p>
            </div>
            <Button href={t.product.href} variant="outline">
              {t.product.cta}
            </Button>
          </div>
          <TrialCta />
        </Container>
      </section>

      <section aria-labelledby="other-tools-title" className="bg-white print:hidden">
        <Container wide className="flex flex-col gap-4 py-12">
          <h2 id="other-tools-title" className="text-lg font-extrabold text-slate">
            More free tools
          </h2>
          <ul className="flex flex-wrap gap-2">
            {[...siblings, ...others].map((o) => (
              <li key={o.slug}>
                <Link
                  href={`/free-tools/${o.slug}`}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-off-white px-4 text-sm font-bold text-slate hover:text-royal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal"
                >
                  <Icon name={o.icon} className="h-4 w-4" /> {o.name}
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbListJsonLd({ path: `/free-tools/${t.slug}`, title: t.name })) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(howToJsonLd({ name: `How to use the ${t.name}`, description: t.description, steps: t.steps })) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(appJsonLd(t)) }} />
    </>
  );
}
