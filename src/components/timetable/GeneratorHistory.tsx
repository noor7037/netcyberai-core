'use client';

import { useEffect, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { Select } from '@/components/ui/Select';
import type { Change } from '@/lib/timetable/generator';
import type { Slot } from '@/lib/timetable/plan';
import { CARD, namer, SECONDARY, when, type Names } from './generator-ui';
import { WeekCompare } from './WeekCompare';

// The timetable's change history (C229): each publish of a proposal, newest first: who, when, and how many periods it
// filled, changed and emptied. One publish opens to the timetable before it beside the timetable after it, class by
// class: the earlier timetable read back.

type Line = { versionId: string; publishedAt: string; publishedByName: string; classes: number; added: number; removed: number; changed: number };
type Detail = Line & { classIds: string[]; before: Slot[]; after: Slot[]; changes: Change[] };

export function GeneratorHistory({ refreshKey, days, periods }: { refreshKey: number; days: readonly number[]; periods: number }) {
  const { t, lang } = useT();
  const [lines, setLines] = useState<Line[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<{ version: Detail; names: Names } | null>(null);
  const [classId, setClassId] = useState('');

  useEffect(() => {
    fetch('/api/app/timetable/history')
      .then(async (res) => {
        if (!res.ok) throw new Error('not loaded');
        setLines(((await res.json()) as { versions: Line[] }).versions);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, [refreshKey]);

  async function show(versionId: string) {
    const res = await fetch(`/api/app/timetable/history?versionId=${versionId}`).catch(() => null);
    if (!res?.ok) {
      setFailed(true);
      return;
    }
    const body = (await res.json()) as { version: Detail; names: Names };
    setOpen(body);
    setClassId(body.version.classIds[0] ?? '');
  }

  return (
    <section data-ttg-history className={CARD} aria-labelledby="ttg-history-title">
      <h2 id="ttg-history-title" className="text-base font-bold text-slate">
        {t('ttg.history.title')}
      </h2>
      <p className="text-sm text-slate">{t('ttg.history.how')}</p>
      {failed && (
        <p role="alert" className="text-sm text-slate">
          {t('ttg.history.failed')}
        </p>
      )}
      {lines && lines.length === 0 && <p className="text-sm text-slate/70">{t('ttg.history.none')}</p>}
      {lines && lines.length > 0 && (
        <ul className="flex flex-col gap-2">
          {lines.map((v) => (
            <li key={v.versionId} data-ttg-version={v.versionId} className="flex flex-wrap items-center gap-2 rounded-md bg-off-white px-3 py-2">
              <span className="min-w-0 flex-1 text-sm text-slate">
                {t('ttg.history.line', { date: when(v.publishedAt, lang), name: v.publishedByName, classes: v.classes, added: v.added, changed: v.changed, removed: v.removed })}
              </span>
              <button type="button" data-ttg-version-open onClick={() => show(v.versionId)} className={SECONDARY}>
                {t('ttg.history.open')}
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && (
        <div data-ttg-version-detail={open.version.versionId} className="flex flex-col gap-3 border-t border-slate/10 pt-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="max-w-sm flex-1">
              <Select id="ttg-history-class" label={t('tt.class')} value={classId} onChange={(e) => setClassId(e.target.value)}>
                {open.version.classIds.map((id) => (
                  <option key={id} value={id}>
                    {namer(open.names).cls(id)}
                  </option>
                ))}
              </Select>
            </div>
            <button type="button" onClick={() => setOpen(null)} className={SECONDARY}>
              {t('ttg.history.close')}
            </button>
          </div>
          {classId && (
            <WeekCompare
              classId={classId}
              days={days}
              periods={periods}
              left={open.version.before}
              right={open.version.after}
              leftLabel={t('ttg.history.before')}
              rightLabel={t('ttg.history.after')}
              names={namer(open.names)}
              changes={open.version.changes}
            />
          )}
        </div>
      )}
    </section>
  );
}
