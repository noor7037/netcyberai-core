'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useT } from '@/components/app-shell/LangContext';
import { InfoTip } from '@/components/app-ui/InfoTip';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import type { GapScreen } from '@/lib/curriculum-gap/curriculum-gap';
import { GAP_STATES, type GapState, type UnitGap } from '@/lib/curriculum-gap/rules';
import type { MessageKey } from '@/lib/i18n';

// The Curriculum Gap Detector (docs/27 row 9d, C216). Choose a class and a subject; every unit of the syllabus map is
// listed once, in the map's order, with its state and the days the state rests on: when it was taught, and the exam
// papers that assess it. A count of each state sits above the list. A class with no map for the subject says it is
// not set up, never a row of zeros. The states are worked out on the server (src/lib/curriculum-gap/rules.ts) each
// time the page is read; this screen only says them. One academic session at a time, the current one unless another
// is chosen (C219): its lessons and its exams' papers.

const BOX = 'flex flex-col gap-3 rounded-lg border border-slate/10 bg-white p-4';
const SOFT = 'rounded-md bg-off-white px-3 py-2';
const LINK = 'inline-flex min-h-[44px] items-center justify-center rounded-md bg-sapphire px-4 text-sm font-semibold text-white';
const WHY = 'inline-flex min-h-[44px] cursor-pointer items-center font-semibold text-sapphire underline';

const BADGE: Record<GapState, 'success' | 'warning' | 'danger' | 'neutral'> = {
  'assessed-before-taught': 'danger',
  'taught-assessed': 'success',
  'taught-not-assessed': 'warning',
  skipped: 'danger',
  'not-yet-taught': 'neutral',
};

export function CurriculumGapView() {
  const { t, lang } = useT();
  const [data, setData] = useState<GapScreen | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (classId: string | null, subjectId: string | null, sessionId: string | null) => {
    setBusy(true);
    const q = new URLSearchParams();
    if (classId) q.set('classId', classId);
    if (subjectId) q.set('subjectId', subjectId);
    if (sessionId) q.set('sessionId', sessionId);
    const query = q.toString();
    const res = await fetch(`/api/app/curriculum-gap${query ? `?${query}` : ''}`, { cache: 'no-store' }).catch(() => null);
    const got = res?.ok ? ((await res.json().catch(() => null)) as GapScreen | null) : null;
    setBusy(false);
    setFailed(!got);
    if (got) setData(got);
  }, []);
  useEffect(() => {
    void load(null, null, null);
  }, [load]);

  if (failed && !data) return <p role="alert" className={`${SOFT} text-sm text-slate`}>{t('cg.failed')}</p>;
  if (!data) return null;

  const dayWords = new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });
  // A school day has no time of day: it is said as the calendar day it is.
  const day = (iso: string) => dayWords.format(new Date(`${iso}T00:00:00Z`));
  const className = data.classes.find((c) => c.classId === data.classId)?.name ?? '';
  const subject = data.subjects.find((s) => s.subjectId === data.subjectId);
  const unitName = (u: Pick<UnitGap, 'chapter' | 'topic'>) => (u.chapter === u.topic ? u.topic : `${u.chapter}: ${u.topic}`);
  const session = data.sessions.find((s) => s.sessionId === data.sessionId) ?? null;

  const taughtLine = (u: UnitGap) =>
    u.taughtFirst === null ? t('cg.notTaught')
    : u.lessons > 1 && u.taughtLast && u.taughtLast !== u.taughtFirst ? t('cg.taughtMany', { count: u.lessons, first: day(u.taughtFirst), last: day(u.taughtLast) })
    : t('cg.taughtOnce', { day: day(u.taughtFirst) });

  return (
    <div lang={lang} data-curriculum-gap className="flex flex-col gap-4 text-sm text-slate">
      <section className={BOX} data-gap-pick>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Select id="gap-class" label={t('cg.class')} value={data.classId ?? ''} disabled={busy || data.classes.length === 0} onChange={(e) => void load(e.target.value, data.subjectId, data.sessionId)}>
            {data.classes.map((c) => (
              <option key={c.classId} value={c.classId}>{c.name}</option>
            ))}
          </Select>
          <Select id="gap-subject" label={t('cg.subject')} value={data.subjectId ?? ''} disabled={busy || data.subjects.length === 0} onChange={(e) => void load(data.classId, e.target.value, data.sessionId)}>
            {data.subjects.map((s) => (
              <option key={s.subjectId} value={s.subjectId}>{s.mapped ? s.name : t('cg.subjectNoMap', { subject: s.name })}</option>
            ))}
          </Select>
          <Select id="gap-session" data-gap-session label={t('cg.session')} value={data.sessionId ?? ''} disabled={busy || data.sessions.length === 0} onChange={(e) => void load(data.classId, data.subjectId, e.target.value)}>
            {data.sessions.map((s) => (
              <option key={s.sessionId} value={s.sessionId}>{s.current ? t('cg.sessionCurrent', { label: s.label }) : s.label}</option>
            ))}
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-x-1">
          <InfoTip label={t('cg.pick.more')}>
            {session && <p data-gap-session-days>{t('cg.sessionDays', { label: session.label, from: day(session.startDate), to: day(session.endDate) })}</p>}
            <p className={session ? 'mt-2' : ''}>{t(data.wholeSchool ? 'cg.whoOffice' : 'cg.whoTeacher')}</p>
          </InfoTip>
        </div>
        {failed && <p role="alert" className={SOFT}>{t('cg.failed')}</p>}
      </section>

      {data.classes.length === 0 && (
        <div data-gap-empty="classes" className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-slate/20 bg-white p-4">
          <p className="text-base font-bold">{t('cg.noClasses.title')}</p>
          <p>{t(data.wholeSchool ? 'cg.noClasses.office' : 'cg.noClasses.teacher')}</p>
        </div>
      )}
      {data.classes.length > 0 && data.subjects.length === 0 && (
        <div data-gap-empty="subjects" className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-slate/20 bg-white p-4">
          <p className="text-base font-bold">{t('cg.noSubjects.title')}</p>
          <p>{t('cg.noSubjects.do')}</p>
        </div>
      )}

      {data.gap && !data.gap.setUp && (
        <div data-gap-not-set-up className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-slate/20 bg-white p-4">
          <p className="text-base font-bold">{t('cg.notSetUp.title')}</p>
          <p data-gap-not-set-up-why={data.gap.why} className="max-w-prose">
            {data.gap.why === 'no_map'
              ? t('cg.notSetUp.text', { class: className, subject: subject?.name ?? '' })
              : data.gap.why === 'no_lessons'
                ? t('cg.notSetUp.noLessons', { class: className, subject: subject?.name ?? '', session: session?.label ?? '' })
                : t('cg.notSetUp.noSession')}
          </p>
          {data.gap.why !== 'no_session' && <Link href="/app/syllabus" className={LINK}>{t('cg.notSetUp.action')}</Link>}
        </div>
      )}

      {data.gap && data.gap.setUp && (
        <>
          <section className={BOX} data-gap-counts aria-busy={busy}>
            <h2 className="text-base font-bold">{t(data.gap.total === 1 ? 'cg.total.one' : 'cg.total.other', { count: data.gap.total, class: className, subject: subject?.name ?? '' })}</h2>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {GAP_STATES.map((s) => (
                <li key={s} data-gap-count={s} className="flex flex-col gap-1 rounded-md border border-slate/10 bg-off-white p-3">
                  <span className="text-2xl font-bold text-slate">{data.gap && data.gap.setUp ? data.gap.counts[s] : 0}</span>
                  <span className="font-semibold">{t(`cg.state.${s}` as MessageKey)}</span>
                </li>
              ))}
            </ul>
            <details>
              <summary className={WHY}>{t('cg.how.title')}</summary>
              <ul className="mt-2 flex flex-col gap-1 pl-1">
                {(['taught', 'assessed', ...GAP_STATES] as const).map((k) => (
                  <li key={k}>{t(`cg.how.${k}` as MessageKey)}</li>
                ))}
              </ul>
            </details>
          </section>

          <section className={BOX}>
            <div className="flex flex-wrap items-center gap-x-1">
              <h2 className="text-base font-bold">{t('cg.units.title')}</h2>
              <InfoTip>{t('cg.units.order')}</InfoTip>
            </div>
            <ol className="flex flex-col gap-3" data-gap-units>
              {data.gap.units.map((u) => (
                <li key={u.unitId} data-gap-unit={u.unitId} data-gap-state={u.state} className="flex flex-col gap-1 rounded-md border border-slate/10 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold">{t('cg.unit', { place: u.place, unit: unitName(u) })}</span>
                    <Badge variant={BADGE[u.state]}>{t(`cg.state.${u.state}` as MessageKey)}</Badge>
                  </div>
                  <p data-gap-taught>{taughtLine(u)}</p>
                  {u.papers.length === 0 ? (
                    <p className="text-slate/70">{t('cg.noPaper')}</p>
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {u.papers.map((p) => (
                        <li key={p.paperId} data-gap-paper={p.paperId}>
                          {p.date ? t('cg.paper', { exam: p.examName, day: day(p.date) }) : t('cg.paperNoDate', { exam: p.examName })}
                          {p.kind ? <span data-gap-paper-kind={p.kind.key}>{` · ${lang === 'hi' ? p.kind.hi : p.kind.en}`}</span> : null}
                          {u.taughtFirst !== null && u.papersBefore.some((b) => b.paperId === p.paperId) ? ` · ${t('cg.paperBefore')}` : ''}
                        </li>
                      ))}
                    </ul>
                  )}
                  {u.laterTaught && <p data-gap-later>{t('cg.later', { unit: unitName(u.laterTaught), day: day(u.laterTaught.day) })}</p>}
                </li>
              ))}
            </ol>
          </section>
        </>
      )}
    </div>
  );
}
