'use client';

import { useEffect, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { InfoTip } from '@/components/app-ui/InfoTip';
import { StatTile } from '@/components/app-ui/StatTile';

// Teacher workload on the timetable page (docs/28 slice 10g, C231): periods a week per teacher, counted by the server
// from the published timetable (only the school's working days and its periods a day). The office (principal, school
// admin, academic coordinator) sees every teacher, the most loaded first; a teacher sees their own count. Every number
// is read from the timetable: nothing is estimated. Each line's bar is that teacher's share of the most loaded
// teacher's periods, drawn beside the number and hidden from screen readers, which read the number.
// Design system v5 (C243): a teacher's own count is a figure tile; how it is counted sits behind the ⓘ.

type Line = { teacherUserId: string; name: string; active: boolean; periods: number };
type Workload = { days: number[]; periods: number; teachers: Line[] };

export function TeacherWorkload({ mine }: { mine: boolean }) {
  const { t, tCount } = useT();
  const [data, setData] = useState<Workload | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch('/api/app/timetable?workload=1')
      .then(async (res) => {
        if (!res.ok) throw new Error('not loaded');
        setData((await res.json()) as Workload);
      })
      .catch(() => setFailed(true));
  }, []);

  if (failed)
    return (
      <p role="alert" data-workload-failed className="text-sm text-slate">
        {t('tt.workload.failed')}
      </p>
    );
  if (!data) return null;
  const most = Math.max(1, ...data.teachers.map((l) => l.periods));
  const week = data.days.length * data.periods;

  if (mine) {
    const me = data.teachers[0];
    return (
      <section data-workload="mine" aria-label={t('tt.workload.mineTitle')} className="flex flex-wrap items-start gap-x-1">
        <StatTile icon="timetable" label={t('tt.workload.mineTitle')} value={me?.periods ?? 0} valueAttrs={{ 'data-workload-mine': me?.periods ?? 0 }} className="min-w-[10rem]" />
        <InfoTip>{t('tt.workload.from', { week })}</InfoTip>
      </section>
    );
  }

  return (
    <section data-workload="office" aria-labelledby="tt-workload-title" className="flex flex-col gap-3 rounded-xl border border-slate/10 bg-white p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-x-1">
        <h2 id="tt-workload-title" className="text-base font-bold text-slate">
          {t('tt.workload.title')}
        </h2>
        <InfoTip>{t('tt.workload.how', { week })}</InfoTip>
      </div>
      {data.teachers.length === 0 ? (
        <p className="text-sm text-slate">{t('tt.workload.none')}</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {data.teachers.map((l) => (
            <li key={l.teacherUserId} data-workload-line={l.periods} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
              <span className="min-w-0 break-words text-sm font-semibold text-slate">{l.active ? l.name : t('tt.workload.gone', { name: l.name })}</span>
              <span className="text-sm font-bold tabular-nums text-slate">
                <span aria-hidden="true">{l.periods}</span>
                <span className="sr-only">{tCount('tt.workload.periods', l.periods)}</span>
              </span>
              <span aria-hidden className="col-span-2 h-2 w-full overflow-hidden rounded-full bg-off-white">
                <span className="block h-full rounded-full bg-sapphire" style={{ width: `${Math.round((l.periods / most) * 100)}%` }} />
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
