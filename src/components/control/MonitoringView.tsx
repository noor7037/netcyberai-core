import Link from 'next/link';
import type { ReactNode } from 'react';
import { InfoTip } from '@/components/app-ui/InfoTip';
import { QUIET_ACTION } from '@/components/app-ui/ModulePage';
import { RetryJobButton } from '@/components/control/RetryJobButton';
import { Badge } from '@/components/ui/Badge';
import { SERVICE_ROLE_SETTING_NAME } from '@/lib/auth/env';
import { HELD_FOR_US, MONITORING_SECTIONS, needsALook, type InvitationWaiting, type Monitoring, type NightlyJob, type NightlyJobState, type SchoolCheckRun, type SchoolCount, type SendGroup } from '@/lib/control/monitoring';
import { t, tCount, tOr, type Lang, type MessageKey } from '@/lib/i18n';
import { JOB_STATUSES } from '@/lib/jobs/types';
import { APPLICATION_STATES } from '@/lib/onboarding/application-machine';

// Control → Monitoring (docs/26 slice 8g, C206). Drawn on the server from loadMonitoring: one plain section for
// each thing that can stop without anyone noticing, with its counts and ages, and one line on what to do when a
// count that waits on NetCyberAI is not zero. A section says "Needs a look" only then; what runs as intended (a
// message held because a parent has not agreed, a job waiting for its next try) is counted and explained, no more.
//
// No parent's or child's name, no phone number and no words of a message are on this page: the loader reads none.
// The error and reason texts it shows were cut by cutContacts before they got here. Below the monitoring sections
// are the two onboarding lists the page has always had; the invitations list is the one place about a person (a
// member of staff a school invited), and it shows only the first letter and the domain of their email (C210).

const TH = 'px-3 py-2 text-left text-xs font-bold uppercase tracking-wider text-slate/70';
const TD = 'px-3 py-2 text-sm text-slate tabular-nums';
const NOTE = 'max-w-prose text-sm text-slate/70';
const SUB = 'text-base font-bold text-slate';
// The table of jobs by type: dead first, so that on a phone the column a person must act on is the one in view.
const STATUS_COLUMNS = ['dead' as const, ...JOB_STATUSES.filter((s) => s !== 'dead')];
const count = (n: number) => n.toLocaleString('en-IN');
const locale = (lang: Lang) => (lang === 'hi' ? 'hi-IN' : 'en-IN');
const whenInIndia = (lang: Lang, iso: string) => new Intl.DateTimeFormat(locale(lang), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(new Date(iso));
const dayInWords = (lang: Lang, day: string) => new Intl.DateTimeFormat(locale(lang), { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`));

// How long, in words: minutes up to an hour, hours up to two days, then days.
export function ageWords(lang: Lang, seconds: number): string {
  if (seconds < 60) return t(lang, 'monitoring.age.now');
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return tCount(lang, 'monitoring.age.minute', minutes);
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return tCount(lang, 'monitoring.age.hour', hours);
  return tCount(lang, 'monitoring.age.day', Math.floor(hours / 24));
}

function Section({ id, title, look, lang, info, children }: { id: string; title: string; look?: boolean; lang: Lang; info?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={`monitoring-${id}`} data-monitoring-section={id} data-monitoring-state={look === undefined ? undefined : look ? 'look' : 'clear'} className="flex min-w-0 flex-col gap-3 rounded-xl border border-slate/10 bg-white p-4">
      <div className="flex flex-wrap items-center gap-x-2">
        <h2 id={`monitoring-${id}`} className="text-lg font-bold text-slate">
          {title}
        </h2>
        {look !== undefined && <Badge variant={look ? 'danger' : 'success'}>{t(lang, look ? 'monitoring.state.look' : 'monitoring.state.clear')}</Badge>}
        {info && <InfoTip>{info}</InfoTip>}
      </div>
      {children}
    </section>
  );
}

function Facts({ items }: { items: { id: string; name: string; value: string }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((f) => (
        <div key={f.id} data-monitoring-fact={f.id} className="min-w-0 rounded-md border border-slate/10 bg-off-white p-3">
          <dt className="text-xs font-bold uppercase tracking-wider text-slate/70">{f.name}</dt>
          <dd className="break-words text-xl font-bold text-slate tabular-nums">{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

// A note that explains a figure above it: one tap away behind an ⓘ (C240).
function More({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center">
      <InfoTip label={label}>{children}</InfoTip>
    </div>
  );
}

// The one line on what to do. Only for a count that waits on NetCyberAI.
function Do({ lang, id, children }: { lang: Lang; id: string; children: ReactNode }) {
  return (
    <p data-monitoring-do={id} className="max-w-prose rounded-md border border-tangerine/40 bg-tangerine/10 p-3 text-sm text-slate">
      <strong>{t(lang, 'monitoring.do')}</strong> {children}
    </p>
  );
}

function Schools({ lang, schools }: { lang: Lang; schools: SchoolCount[] }) {
  return (
    <ul className="flex flex-col gap-0.5 text-sm text-slate">
      {schools.map((s, i) => (
        <li key={`${s.schoolName}-${i}`} data-monitoring-school className="break-words">
          {tCount(lang, 'monitoring.school', s.count, { school: s.schoolName })}
        </li>
      ))}
    </ul>
  );
}

// One reason messages did not go: how many, in which schools, and the latest reason recorded.
function Group({ lang, id, title, group, children }: { lang: Lang; id: string; title: string; group: SendGroup; children?: ReactNode }) {
  return (
    <div data-monitoring-group={id} className="flex min-w-0 flex-col gap-1 rounded-md border border-slate/10 bg-off-white p-3">
      <p className="text-sm font-bold text-slate">
        {title}: <span className="tabular-nums">{count(group.count)}</span>
      </p>
      <Schools lang={lang} schools={group.schools} />
      {group.latestReason && <p className="break-words text-sm text-slate/70">{t(lang, 'monitoring.sends.latestReason', { reason: group.latestReason })}</p>}
      {children}
    </div>
  );
}

// The colour of a scheduled run's state: done, nothing to do, a fault, or on its way.
const stateBadge = (state: NightlyJobState) => (state === 'ran' ? 'success' : state === 'not_needed' ? 'neutral' : state === 'failed' || state === 'not_queued' ? 'danger' : 'warning');

export function MonitoringView({ data: m, invitations, applications, lang }: { data: Monitoring; invitations: InvitationWaiting[]; applications: Record<string, number>; lang: Lang }) {
  const look = needsALook(m);
  const looking = MONITORING_SECTIONS.filter((s) => look[s]).length + (invitations.length > 0 ? 1 : 0);
  const ago = (seconds: number | null, none: MessageKey = 'monitoring.never') => (seconds === null ? t(lang, none) : t(lang, 'monitoring.ago', { age: ageWords(lang, seconds) }));
  const waited = (seconds: number | null) => (seconds === null ? t(lang, 'monitoring.none') : ageWords(lang, seconds));
  const night = dayInWords(lang, m.nightly.date);
  const nightJobs: [string, NightlyJob][] = [['fees', m.nightly.feesJob], ['billing', m.nightly.billingJob]];
  const nightStates = [...new Set(nightJobs.map(([, job]) => job.state))].filter((s) => s !== 'ran' && s !== 'not_needed');
  // The schools' own checks (C210): one job a school, for the night and for the week.
  const schoolChecks: [string, SchoolCheckRun][] = [['earlyWarning', m.schoolChecks.earlyWarning], ['auditor', m.schoolChecks.auditor]];
  const schoolCheckStates = [...new Set(schoolChecks.map(([, run]) => run.state))].filter((s) => s !== 'ran' && s !== 'not_needed');
  const nothingSent = m.sends.uncertain.count === 0 && m.sends.failed.length === 0 && m.sends.held.length === 0;
  const tp = m.templates;
  // Counted on record, and asking for nothing any more: a newer version took its place, or we rejected it ourselves.
  const settled = tp.waitingForUs + tp.refusedByMeta + tp.pausedByMeta - (tp.inTheWay.waitingForUs + tp.inTheWay.refusedByMeta + tp.inTheWay.pausedByMeta);
  const caughtUp = m.nightly.feeRunCaughtUp;
  return (
    <div lang={lang} data-monitoring={m.readAt} className="flex min-w-0 flex-col gap-4">
      <p data-monitoring-summary={looking} className="max-w-prose rounded-xl border border-slate/10 bg-off-white p-4 text-sm text-slate">
        <strong>{looking === 0 ? t(lang, 'monitoring.summary.clear') : tCount(lang, 'monitoring.summary.look', looking)}</strong> {t(lang, 'monitoring.privacy')} {t(lang, 'monitoring.readAt', { when: whenInIndia(lang, m.readAt) })}
      </p>

      <Section id="health" title={t(lang, 'monitoring.health.title')} look={look.health} lang={lang} info={t(lang, 'monitoring.health.how')}>
        <p data-monitoring-health={m.health.status} className="max-w-prose text-sm text-slate">
          {t(lang, m.health.jobs === 'ok' ? 'monitoring.health.ok' : 'monitoring.health.backlog', { minutes: m.health.backlogAfterMinutes })}
        </p>
        {m.health.storage !== 'ok' && (
          <p data-monitoring-storage={m.health.storage} className="max-w-prose text-sm font-semibold text-coral-deep">
            {t(lang, 'monitoring.health.storage', { setting: SERVICE_ROLE_SETTING_NAME, reason: t(lang, `shell.storage.reason.${m.health.storage}`) })}
          </p>
        )}
        {m.health.jobs !== 'ok' && (
          <Do lang={lang} id="health">
            {t(lang, 'monitoring.health.backlog.do')}
          </Do>
        )}
        {m.health.storage !== 'ok' && (
          <Do lang={lang} id="health.storage">
            {t(lang, 'monitoring.health.storage.do', { setting: SERVICE_ROLE_SETTING_NAME })}
          </Do>
        )}
      </Section>

      <Section id="jobs" title={t(lang, 'monitoring.jobs.title')} look={look.jobs} lang={lang} info={t(lang, 'monitoring.jobs.how')}>
        <Facts
          items={[
            { id: 'jobs.dead', name: t(lang, 'monitoring.jobs.dead'), value: count(m.jobs.dead) },
            { id: 'jobs.stuck', name: t(lang, 'monitoring.jobs.stuck'), value: count(m.jobs.stuck) },
            ...(m.jobs.stuckLongestSeconds === null ? [] : [{ id: 'jobs.stuckFor', name: t(lang, 'monitoring.jobs.stuckFor'), value: ageWords(lang, m.jobs.stuckLongestSeconds) }]),
            { id: 'jobs.retrying', name: t(lang, 'monitoring.jobs.retrying'), value: count(m.jobs.retrying) },
            { id: 'jobs.due', name: t(lang, 'monitoring.jobs.due'), value: count(m.jobs.due) },
            { id: 'jobs.oldestDue', name: t(lang, 'monitoring.jobs.oldestDue'), value: waited(m.jobs.oldestDueSeconds) },
            { id: 'jobs.lastDone', name: t(lang, 'monitoring.jobs.lastDone'), value: ago(m.jobs.lastDoneSeconds) },
          ]}
        />
        {m.jobs.dead > 0 && (
          <Do lang={lang} id="jobs.dead">
            {t(lang, 'monitoring.jobs.dead.do')}
          </Do>
        )}
        {m.jobs.stuck > 0 && (
          <Do lang={lang} id="jobs.stuck">
            {t(lang, 'monitoring.jobs.stuck.do')}
          </Do>
        )}

        <h3 className={SUB}>{t(lang, 'monitoring.jobs.failed.title')}</h3>
        {m.jobs.failed.length === 0 && <p className={NOTE}>{t(lang, 'monitoring.jobs.failed.none')}</p>}
        {m.jobs.failed.length > 0 && (
          <ul className="flex flex-col gap-2">
            {m.jobs.failed.map((job) => (
              <li key={job.jobId} data-monitoring-job={job.jobId} data-monitoring-job-state={job.state} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-md border border-slate/10 bg-off-white p-3 text-sm text-slate">
                <span className="min-w-0 flex-1 basis-56">
                  <code className="font-bold">{job.type}</code>
                  <span className="block">{t(lang, job.state === 'dead' ? 'monitoring.jobs.line.dead' : 'monitoring.jobs.line.retrying', { age: ageWords(lang, job.forSeconds), attempts: job.attempts, max: job.maxAttempts })}</span>
                  <span data-monitoring-job-error className="block break-words text-slate/70">
                    {job.error ?? t(lang, 'monitoring.jobs.noError')}
                  </span>
                </span>
                {job.state === 'dead' && <RetryJobButton jobId={job.jobId} />}
              </li>
            ))}
          </ul>
        )}
        {m.jobs.dead + m.jobs.retrying > m.jobs.failed.length && <p className={NOTE}>{t(lang, 'monitoring.jobs.failed.listed', { shown: m.jobs.failed.length })}</p>}

        <h3 className={SUB}>{t(lang, 'monitoring.jobs.byType')}</h3>
        {m.jobs.byType.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate/20 bg-white p-5">
            <p className="text-base font-bold text-slate">{t(lang, 'monitoring.jobs.none.title')}</p>
            <p className="max-w-prose text-sm text-slate">{t(lang, 'monitoring.jobs.none.do')}</p>
          </div>
        )}
        {m.jobs.byType.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-slate/10 bg-white">
            <table data-monitoring-jobs className="w-full min-w-[480px] border-collapse">
              <thead>
                <tr className="border-b border-slate/10">
                  <th scope="col" className={TH}>
                    {t(lang, 'monitoring.jobs.type')}
                  </th>
                  {STATUS_COLUMNS.map((s) => (
                    <th key={s} scope="col" className={TH}>
                      {t(lang, `monitoring.jobs.status.${s}` as MessageKey)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {m.jobs.byType.map((row) => (
                  <tr key={row.type} data-monitoring-job-type={row.type} className="border-b border-slate/10 last:border-0">
                    <th scope="row" className={`${TD} text-left font-semibold`}>
                      <code>{row.type}</code>
                    </th>
                    {STATUS_COLUMNS.map((s) => (
                      <td key={s} data-monitoring-job-count={s} className={s === 'dead' && row.counts.dead > 0 ? `${TD} font-bold` : TD}>
                        {count(row.counts[s])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section id="notices" title={t(lang, 'monitoring.notices.title', { days: m.days })} look={look.notices} lang={lang} info={t(lang, 'monitoring.notices.how')}>
        <Facts
          items={[
            { id: 'notices.received', name: t(lang, 'monitoring.notices.received'), value: count(m.notices.received) },
            { id: 'notices.refused', name: t(lang, 'monitoring.notices.refused'), value: count(m.notices.refused) },
            { id: 'notices.last', name: t(lang, 'monitoring.notices.last'), value: ago(m.notices.lastSeconds) },
          ]}
        />
        {m.notices.received === 0 && <p className={NOTE}>{t(lang, 'monitoring.notices.none')}</p>}
        {m.notices.refused > 0 && (
          <>
            <h3 className={SUB}>{t(lang, 'monitoring.notices.byOutcome')}</h3>
            <ul className="flex flex-col gap-0.5 text-sm text-slate">
              {m.notices.refusedByOutcome.map((o) => (
                <li key={o.outcome} data-monitoring-refused className="break-words">
                  {o.outcome === '' ? t(lang, 'monitoring.notices.noOutcome') : o.outcome}: <span className="font-bold tabular-nums">{count(o.count)}</span>
                </li>
              ))}
            </ul>
            <Do lang={lang} id="notices.refused">
              {t(lang, 'monitoring.notices.refused.do')}
            </Do>
            <More>{t(lang, 'monitoring.notices.cap', { max: m.notices.refusedKeptPerHour })}</More>
          </>
        )}
      </Section>

      <Section id="sends" title={t(lang, 'monitoring.sends.title', { days: m.days })} look={look.sends} lang={lang} info={t(lang, 'monitoring.sends.how')}>
        {nothingSent && <p className="max-w-prose text-sm text-slate">{t(lang, 'monitoring.sends.none')}</p>}
        {m.sends.uncertain.count > 0 && (
          <Group lang={lang} id="uncertain" title={t(lang, 'monitoring.sends.uncertain')} group={m.sends.uncertain}>
            <More>{t(lang, 'monitoring.sends.uncertain.how')}</More>
            <Do lang={lang} id="sends.uncertain">
              {t(lang, 'monitoring.sends.uncertain.do')}
            </Do>
          </Group>
        )}
        {m.sends.failed.map((g) => (
          <Group key={g.key} lang={lang} id={`failed:${g.key}`} title={g.key === '' ? t(lang, 'monitoring.sends.failed.noCode') : t(lang, 'monitoring.sends.failed.code', { code: g.key })} group={g} />
        ))}
        {m.sends.failed.length > 0 && (
          <Do lang={lang} id="sends.failed">
            {t(lang, 'monitoring.sends.failed.do')}
          </Do>
        )}
        {m.sends.held.map((g) => {
          // Waiting on NetCyberAI: what to do. The school's own (no consent, quiet hours): one line that says so.
          const todo = HELD_FOR_US.includes(g.key) ? tOr(lang, `monitoring.sends.held.${g.key}.do`, '') : '';
          const note = tOr(lang, `monitoring.sends.held.${g.key}.note`, '');
          return (
            <Group key={g.key} lang={lang} id={`held:${g.key}`} title={tOr(lang, `monitoring.sends.held.${g.key}`, t(lang, 'monitoring.sends.held.other'))} group={g}>
              {todo !== '' && (
                <Do lang={lang} id={`sends.${g.key}`}>
                  {todo}
                </Do>
              )}
              {todo === '' && note !== '' && <p className={NOTE}>{note}</p>}
            </Group>
          );
        })}
      </Section>

      <Section id="replies" title={t(lang, 'monitoring.replies.title')} look={look.replies} lang={lang} info={t(lang, 'monitoring.replies.how', { hours: m.replies.holdHours })}>
        <Facts
          items={[
            { id: 'replies.held', name: t(lang, 'monitoring.replies.held'), value: count(m.replies.heldNow) },
            { id: 'replies.oldest', name: t(lang, 'monitoring.replies.oldest'), value: waited(m.replies.oldestHeldSeconds) },
            { id: 'replies.past', name: t(lang, 'monitoring.replies.past', { hours: m.replies.holdHours }), value: count(m.replies.pastTheirTime) },
            { id: 'replies.dropped', name: t(lang, 'monitoring.replies.dropped', { days: m.days }), value: count(m.replies.dropped) },
            { id: 'replies.delivered', name: t(lang, 'monitoring.replies.delivered', { days: m.days }), value: count(m.replies.delivered) },
          ]}
        />
        {m.replies.pastTheirTime > 0 && (
          <Do lang={lang} id="replies.past">
            {t(lang, 'monitoring.replies.past.do')}
          </Do>
        )}
        {(m.replies.heldNow > m.replies.pastTheirTime || m.replies.dropped > 0) && (
          <More>
            {m.replies.heldNow > m.replies.pastTheirTime && <p>{t(lang, 'monitoring.replies.held.note')}</p>}
            {m.replies.dropped > 0 && <p>{t(lang, 'monitoring.replies.dropped.note')}</p>}
          </More>
        )}
      </Section>

      <Section
        id="nightly"
        title={t(lang, 'monitoring.nightly.title', { date: night })}
        look={look.nightly}
        lang={lang}
        info={
          <>
            <p>{t(lang, 'monitoring.nightly.how')}</p>
            <p>{t(lang, 'monitoring.nightly.billing.how')}</p>
          </>
        }
      >
        <ul className="flex flex-col gap-2">
          {nightJobs.map(([id, job]) => (
            <li key={id} data-monitoring-night={id} data-monitoring-night-state={job.state} className="flex flex-wrap items-center gap-2 text-sm text-slate">
              <span className="font-bold">{t(lang, `monitoring.nightly.${id}` as MessageKey)}</span>
              <code className="text-slate/70">{job.type}</code>
              <Badge variant={stateBadge(job.state)}>{t(lang, `monitoring.nightly.state.${job.state}` as MessageKey)}</Badge>
            </li>
          ))}
        </ul>
        {nightStates.map((state) => (
          <Do key={state} lang={lang} id={`nightly.${state}`}>
            {t(lang, `monitoring.nightly.${state}.do` as MessageKey, { attempts: Math.max(...nightJobs.filter(([, job]) => job.state === state).map(([, job]) => job.attempts)) })}
          </Do>
        ))}

        <div data-monitoring-school-checks className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-x-1">
            <h3 className={SUB}>{t(lang, 'monitoring.schoolChecks.title')}</h3>
            <InfoTip>{t(lang, 'monitoring.schoolChecks.how', { night, week: dayInWords(lang, m.schoolChecks.auditor.forDate) })}</InfoTip>
          </div>
          <ul className="flex flex-col gap-2">
            {schoolChecks.map(([id, run]) => (
              <li key={id} data-monitoring-school-check={id} data-monitoring-school-check-state={run.state} className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-slate">
                <span className="font-bold">{t(lang, `monitoring.schoolChecks.${id}` as MessageKey)}</span>
                <code className="text-slate/70">{run.type}</code>
                <Badge variant={stateBadge(run.state)}>{t(lang, `monitoring.nightly.state.${run.state}` as MessageKey)}</Badge>
                <span data-monitoring-school-check-counts={`${run.ran}/${run.queued}`} className="basis-full text-slate/70">
                  {t(lang, 'monitoring.schoolChecks.line', { ran: count(run.ran), queued: count(run.queued), last: ago(run.lastRanSeconds) })}
                </span>
              </li>
            ))}
          </ul>
          {schoolCheckStates.map((state) => (
            <Do key={state} lang={lang} id={`schoolChecks.${state}`}>
              {t(lang, `monitoring.schoolChecks.${state}.do` as MessageKey, { attempts: Math.max(...schoolChecks.filter(([, run]) => run.state === state).map(([, run]) => run.attempts)) })}
            </Do>
          ))}
        </div>

        <div data-monitoring-missing={m.nightly.feeRunMissing.length} className="flex flex-col gap-2">
          <h3 className={SUB}>
            {t(lang, 'monitoring.nightly.missing')}: <span className="tabular-nums">{count(m.nightly.feeRunMissing.length)}</span>
          </h3>
          {m.nightly.feeRunMissing.length === 0 && (
            <p className={NOTE}>
              {m.nightly.feeRunsExpected === 0
                ? t(lang, 'monitoring.nightly.missing.noDues')
                : t(lang, caughtUp.length === 0 ? 'monitoring.nightly.missing.none' : 'monitoring.nightly.missing.noneLeft', { done: m.nightly.feeRunsExpected - caughtUp.length, expected: m.nightly.feeRunsExpected })}
            </p>
          )}
          {m.nightly.feeRunMissing.length > 0 && (
            <>
              <ul className="flex flex-col gap-0.5 text-sm text-slate">
                {m.nightly.feeRunMissing.map((name, i) => (
                  <li key={`${name}-${i}`} data-monitoring-missing-school className="break-words">
                    {name}
                  </li>
                ))}
              </ul>
              <Do lang={lang} id="nightly.missing">
                {t(lang, 'monitoring.nightly.missing.do')}
              </Do>
            </>
          )}
        </div>

        {caughtUp.length > 0 && (
          <div data-monitoring-caught-up={caughtUp.length} className="flex flex-col gap-2">
            <h3 className={SUB}>
              {t(lang, 'monitoring.nightly.caughtUp')}: <span className="tabular-nums">{count(caughtUp.length)}</span>
            </h3>
            <ul className="flex flex-col gap-0.5 text-sm text-slate">
              {caughtUp.map((c, i) => (
                <li key={`${c.schoolName}-${i}`} data-monitoring-caught-up-school className="break-words">
                  {t(lang, 'monitoring.nightly.caughtUp.line', { school: c.schoolName, date: dayInWords(lang, c.runDate) })}
                </li>
              ))}
            </ul>
            <More>{t(lang, 'monitoring.nightly.caughtUp.note')}</More>
          </div>
        )}

        {m.nightly.runsWithProblems.length > 0 && (
          <div data-monitoring-run-problems={m.nightly.runsWithProblems.length} className="flex flex-col gap-2">
            <h3 className={SUB}>{t(lang, 'monitoring.nightly.problems')}</h3>
            <ul className="flex flex-col gap-0.5 text-sm text-slate">
              {m.nightly.runsWithProblems.map((r, i) => (
                <li key={`${r.schoolName}-${i}`} className="break-words">
                  {tCount(lang, 'monitoring.nightly.problem', r.problems, { school: r.schoolName, date: dayInWords(lang, r.runDate) })}
                </li>
              ))}
            </ul>
            <Do lang={lang} id="nightly.problems">
              {t(lang, 'monitoring.nightly.problems.do')}
            </Do>
          </div>
        )}
      </Section>

      <Section id="templates" title={t(lang, 'monitoring.templates.title')} look={look.templates} lang={lang} info={t(lang, 'monitoring.templates.how')}>
        {tp.total === 0 && <p className="max-w-prose text-sm text-slate">{t(lang, 'monitoring.templates.none')}</p>}
        {tp.total > 0 && (
          <Facts
            items={[
              { id: 'templates.total', name: t(lang, 'monitoring.templates.total'), value: count(tp.total) },
              { id: 'templates.approvedByUs', name: t(lang, 'monitoring.templates.approvedByUs'), value: count(tp.approvedByUs) },
              { id: 'templates.waitingForUs', name: t(lang, 'monitoring.templates.waitingForUs'), value: count(tp.waitingForUs) },
              { id: 'templates.rejectedByUs', name: t(lang, 'monitoring.templates.rejectedByUs'), value: count(tp.rejectedByUs) },
              { id: 'templates.withMeta', name: t(lang, 'monitoring.templates.withMeta'), value: count(tp.withMeta) },
              { id: 'templates.approvedByMeta', name: t(lang, 'monitoring.templates.approvedByMeta'), value: count(tp.approvedByMeta) },
              { id: 'templates.refusedByMeta', name: t(lang, 'monitoring.templates.refusedByMeta'), value: count(tp.refusedByMeta) },
              { id: 'templates.pausedByMeta', name: t(lang, 'monitoring.templates.pausedByMeta'), value: count(tp.pausedByMeta) },
              { id: 'templates.hindiNotReviewed', name: t(lang, 'monitoring.templates.hindiNotReviewed'), value: count(tp.hindiNotReviewed) },
            ]}
          />
        )}
        {tp.inTheWay.waitingForUs > 0 && (
          <Do lang={lang} id="templates.waitingForUs">
            {t(lang, 'monitoring.templates.waitingForUs.do')}
          </Do>
        )}
        {tp.inTheWay.refusedByMeta + tp.inTheWay.pausedByMeta > 0 && (
          <Do lang={lang} id="templates.refusedByMeta">
            {t(lang, 'monitoring.templates.refusedByMeta.do')}
          </Do>
        )}
        {settled > 0 && (
          <p data-monitoring-templates-settled={settled} className={NOTE}>
            {tCount(lang, 'monitoring.templates.settled', settled)}
          </p>
        )}
        {(tp.withMeta > 0 || tp.hindiNotReviewed > 0) && (
          <More>
            {tp.withMeta > 0 && <p>{t(lang, 'monitoring.templates.withMeta.note')}</p>}
            {tp.hindiNotReviewed > 0 && <p>{t(lang, 'monitoring.templates.hindiNotReviewed.note')}</p>}
          </More>
        )}
        <div>
          <Link href="/control/templates" className={QUIET_ACTION}>
            {t(lang, 'monitoring.templates.open')}
          </Link>
        </div>
      </Section>

      <Section id="invitations" title={t(lang, 'monitoring.invites.title')} look={invitations.length > 0} lang={lang} info={t(lang, 'monitoring.invites.how')}>
        {invitations.length === 0 && <p className="max-w-prose text-sm text-slate">{t(lang, 'monitoring.invites.none')}</p>}
        {invitations.length > 0 && (
          <ul className="flex flex-col gap-2 text-sm">
            {invitations.map((i) => (
              <li key={i.invitationId} data-monitoring-invitation className="break-words rounded-md border border-slate/10 bg-off-white p-3 text-slate">
                {t(lang, 'monitoring.invites.line', { school: i.schoolName, email: i.maskedEmail, role: tOr(lang, `role.${i.role}`, i.role) })} <span className="text-slate/70">{t(lang, 'monitoring.invites.since', { when: whenInIndia(lang, i.createdAt) })}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section id="applications" title={t(lang, 'monitoring.applications.title')} lang={lang} info={t(lang, 'monitoring.applications.how')}>
        <ul className="flex flex-wrap gap-2 text-sm">
          {APPLICATION_STATES.map((s) => (
            <li key={s}>
              <Link href={`/control/onboarding/applications?status=${s}`} data-monitoring-applications={s} className="flex min-h-[44px] items-center gap-1 rounded-md border border-slate/10 bg-white px-3 text-slate hover:border-sapphire">
                {t(lang, `monitoring.applications.state.${s}` as MessageKey)}: <strong className="tabular-nums">{count(applications[s] ?? 0)}</strong>
              </Link>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
