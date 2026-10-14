import Link from 'next/link';
import { Container } from '@/components/ui/Container';
import { SectionHeading } from '@/components/visual/Primitives';
import { Icon } from '@/components/visual/Icons';
import { DIFFERENTIATOR_STATUS_LABEL, differentiators, type DifferentiatorStatus } from '@/content/differentiators';
import { findFreeTool } from '@/content/free-tools';
import { tones } from '@/lib/semantic';

// The follow-up work an ordinary ERP leaves to the office, each card with
// its honest status and the free tool a school can use today
// (src/content/differentiators.ts, Decision Log C198-B).

const BADGE: Record<DifferentiatorStatus, string> = {
  app: tones.success.soft,
  'switching-on': tones.communication.soft,
  planned: tones.achievement.soft,
};

export function BeyondErp() {
  return (
    <section aria-labelledby="beyond-erp-title" className="bg-off-white">
      <Container wide className="flex flex-col gap-8 py-16">
        <SectionHeading
          id="beyond-erp-title"
          eyebrow="Beyond the ERP"
          tone="intelligence"
          title="The work an ordinary school ERP leaves to the office"
          lead="Recording fees, attendance and marks is the start. NetCyberAI is built for the follow-up work offices still do by hand. Each card says where it stands today, and each has a free tool you can use now."
        />
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {differentiators.map((d) => (
            <li key={d.id}>
              <article className="flex h-full flex-col gap-4 rounded-3xl border border-slate/10 bg-white p-6">
                <div className="flex items-start justify-between gap-3">
                  <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${tones[d.tone].solid}`}>
                    <Icon name={d.icon} className="h-6 w-6" />
                  </span>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${BADGE[d.status]}`}>{DIFFERENTIATOR_STATUS_LABEL[d.status]}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <h3 className="text-xl font-extrabold text-slate">{d.title}</h3>
                  <p className="text-slate/70">{d.body}</p>
                </div>
                <ul className="flex flex-col gap-2">
                  {d.points.map((p) => (
                    <li key={p} className="flex items-start gap-2 text-sm text-slate">
                      <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-emerald" />
                      {p}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto flex flex-col gap-2 border-t border-slate/10 pt-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate/70">Free to use today</p>
                  <ul className="flex flex-col gap-1">
                    {d.freeTools.map((slug) => {
                      const t = findFreeTool(slug);
                      return t ? (
                        <li key={slug}>
                          <Link
                            href={`/free-tools/${slug}`}
                            className="inline-flex min-h-[44px] items-center gap-2 text-sm font-bold text-royal hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal"
                          >
                            <Icon name={t.icon} className="h-4 w-4" /> {t.name}
                          </Link>
                        </li>
                      ) : null;
                    })}
                  </ul>
                  {d.more && (
                    <Link
                      href={d.more.href}
                      className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold text-slate underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal"
                    >
                      {d.more.label} <Icon name="arrow" className="h-4 w-4" />
                    </Link>
                  )}
                </div>
              </article>
            </li>
          ))}
        </ul>
        <p className="text-sm text-slate/70">
          Save your school’s details once on the{' '}
          <Link href="/free-tools" className="font-semibold text-royal underline">
            free tools page
          </Link>{' '}
          and every tool fills them in. Everything you type stays in your browser.
        </p>
      </Container>
    </section>
  );
}
