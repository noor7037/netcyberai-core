import { InfoTip } from '@/components/app-ui/InfoTip';
import { RetryJobButton } from '@/components/control/RetryJobButton';
import { Badge } from '@/components/ui/Badge';
import { atLimit, backedUp, markingNeedsALook, type MarkingMonitor as MarkingMonitorData } from '@/lib/control/marking-monitor';
import { t, type Lang } from '@/lib/i18n';

// Control → Monitoring → AI marking (docs/35, C347), drawn on the server from loadMarkingMonitor: for each school its
// answer-sheet pages this month against the plan's limit, and its scripts waiting, being marked, marked and waiting
// for a teacher, failed and approved, with the age of the oldest one waiting; then the marking jobs that gave up, each
// with the Retry the Background jobs section offers. COUNTS AND AGES ONLY: the loader reads no child's name, no page
// and no mark, so none can be on this page. A line on what to do appears only for what waits on NetCyberAI.

const SUB = 'text-base font-bold text-slate';
const NOTE = 'max-w-prose text-sm text-slate/70';
const count = (n: number) => n.toLocaleString('en-IN');

function Fact({ id, name, value }: { id: string; name: string; value: string }) {
  return (
    <div data-monitoring-marking-fact={id} className="min-w-0 rounded-md border border-slate/10 bg-white p-3">
      <dt className="text-xs font-bold uppercase tracking-wider text-slate/70">{name}</dt>
      <dd className="break-words text-xl font-bold text-slate tabular-nums">{value}</dd>
    </div>
  );
}

function Do({ lang, id, children }: { lang: Lang; id: string; children: string }) {
  return (
    <p data-monitoring-do={id} className="max-w-prose rounded-md border border-tangerine/40 bg-tangerine/10 p-3 text-sm text-slate">
      <strong>{t(lang, 'monitoring.do')}</strong> {children}
    </p>
  );
}

// `age`: how long, in words, as the rest of the page says it (ageWords of MonitoringView).
export function MarkingMonitor({ data: m, lang, age }: { data: MarkingMonitorData; lang: Lang; age: (seconds: number) => string }) {
  const look = markingNeedsALook(m);
  const full = m.schools.filter((s) => atLimit(s));
  const late = m.schools.filter((s) => backedUp(s, m.backlogAfterMinutes));
  const nothing = m.schools.length === 0 && m.jobs.dead === 0;
  return (
    <section aria-labelledby="monitoring-marking" data-monitoring-section="marking" data-monitoring-state={look ? 'look' : 'clear'} className="flex min-w-0 flex-col gap-3 rounded-xl border border-slate/10 bg-white p-4">
      <div className="flex flex-wrap items-center gap-x-2">
        <h2 id="monitoring-marking" className="text-lg font-bold text-slate">
          {t(lang, 'monitoring.marking.title')}
        </h2>
        <Badge variant={look ? 'danger' : 'success'}>{t(lang, look ? 'monitoring.state.look' : 'monitoring.state.clear')}</Badge>
        <InfoTip>{t(lang, 'monitoring.marking.how')}</InfoTip>
      </div>

      {nothing && (
        <div className="rounded-xl border border-dashed border-slate/20 bg-white p-5" data-monitoring-marking-empty>
          <p className="text-base font-bold text-slate">{t(lang, 'monitoring.marking.none.title')}</p>
          <p className="max-w-prose text-sm text-slate">{t(lang, 'monitoring.marking.none.do')}</p>
        </div>
      )}

      {m.schools.length > 0 && (
        <ul className="flex flex-col gap-3">
          {m.schools.map((s, i) => (
            <li key={`${s.schoolName}-${i}`} data-monitoring-marking-school={s.schoolName} className="flex min-w-0 flex-col gap-2 rounded-md border border-slate/10 bg-off-white p-3">
              <p className="flex flex-wrap items-center gap-2 break-words text-sm font-bold text-slate">
                {s.schoolName}
                {atLimit(s) && <Badge variant="danger">{t(lang, 'monitoring.marking.limitReached')}</Badge>}
              </p>
              <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                <Fact id="pages" name={t(lang, 'monitoring.marking.pages')} value={s.limit === null ? t(lang, 'monitoring.marking.pagesNoLimit', { used: count(s.pagesThisMonth) }) : t(lang, 'monitoring.marking.pagesOf', { used: count(s.pagesThisMonth), limit: count(s.limit) })} />
                <Fact id="waiting" name={t(lang, 'monitoring.marking.waiting')} value={count(s.waiting)} />
                <Fact id="marking" name={t(lang, 'monitoring.marking.marking')} value={count(s.marking)} />
                <Fact id="marked" name={t(lang, 'monitoring.marking.marked')} value={count(s.marked)} />
                <Fact id="failed" name={t(lang, 'monitoring.marking.failed')} value={count(s.failed)} />
                <Fact id="approved" name={t(lang, 'monitoring.marking.approved')} value={count(s.approved)} />
                <Fact id="oldest" name={t(lang, 'monitoring.marking.oldest')} value={s.oldestWaitingSeconds === null ? t(lang, 'monitoring.none') : age(s.oldestWaitingSeconds)} />
              </dl>
            </li>
          ))}
        </ul>
      )}
      {m.schoolsNotListed > 0 && <p className={NOTE}>{t(lang, 'monitoring.marking.notListed', { count: m.schoolsNotListed })}</p>}

      {full.length > 0 && <Do lang={lang} id="marking.limit">{t(lang, 'monitoring.marking.limit.do')}</Do>}
      {late.length > 0 && <Do lang={lang} id="marking.backlog">{t(lang, 'monitoring.marking.backlog.do', { minutes: m.backlogAfterMinutes })}</Do>}
      {m.jobs.dead > 0 && <Do lang={lang} id="marking.dead">{t(lang, 'monitoring.marking.dead.do')}</Do>}

      <h3 className={SUB}>{t(lang, 'monitoring.marking.jobs.title')}</h3>
      <p className={NOTE} data-monitoring-marking-jobs={m.jobs.dead}>
        {t(lang, 'monitoring.marking.jobs.counts', { dead: count(m.jobs.dead), retrying: count(m.jobs.retrying) })}
      </p>
      {m.jobs.listed.length === 0 && <p className={NOTE}>{t(lang, 'monitoring.marking.jobs.none')}</p>}
      {m.jobs.listed.length > 0 && (
        <ul className="flex flex-col gap-2">
          {m.jobs.listed.map((job) => (
            <li key={job.jobId} data-monitoring-marking-job={job.jobId} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-md border border-slate/10 bg-off-white p-3 text-sm text-slate">
              <span className="min-w-0 flex-1 basis-56">
                <code className="font-bold">{job.type}</code>
                {job.schoolName && <span className="block break-words">{job.schoolName}</span>}
                <span className="block">{t(lang, 'monitoring.jobs.line.dead', { age: age(job.forSeconds), attempts: job.attempts, max: job.maxAttempts })}</span>
                <span data-monitoring-marking-job-error className="block break-words text-slate/70">
                  {job.error ?? t(lang, 'monitoring.jobs.noError')}
                </span>
              </span>
              <RetryJobButton jobId={job.jobId} />
            </li>
          ))}
        </ul>
      )}
      {m.jobs.dead > m.jobs.listed.length && <p className={NOTE}>{t(lang, 'monitoring.marking.jobs.listed', { shown: m.jobs.listed.length })}</p>}
    </section>
  );
}
