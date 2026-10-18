'use client';

import { useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { InfoTip } from '@/components/app-ui/InfoTip';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import { CARD, dayKey, HEAD_ROW, PRIMARY, send, type GeneratorData } from './generator-ui';

// When a teacher cannot teach (C229): for one teacher, a whole day or single periods of the school's days. Saved as a
// set; the generator never puts the teacher there, and a swap that would is refused. Design system v5 (C243): how it
// works sits behind the ⓘ; a marked period or day is drawn filled (and is pressed for a screen reader).

type Marks = Record<number, 'all' | number[]>;

export function GeneratorUnavailable({ data, onChanged }: { data: GeneratorData; onChanged: () => void }) {
  const { t, tCount } = useT();
  const toast = useToast();
  const [teacherId, setTeacherId] = useState('');
  const [marks, setMarks] = useState<Marks>({});
  const [busy, setBusy] = useState(false);
  const { days, periods } = data.rules;

  const choose = (id: string) => {
    setTeacherId(id);
    const next: Marks = {};
    for (const u of data.unavailable.filter((x) => x.teacherUserId === id)) {
      if (u.period === null) next[u.weekday] = 'all';
      else if (next[u.weekday] !== 'all') next[u.weekday] = [...((next[u.weekday] as number[] | undefined) ?? []), u.period];
    }
    setMarks(next);
  };
  const toggleDay = (d: number) => setMarks({ ...marks, [d]: marks[d] === 'all' ? [] : 'all' });
  const togglePeriod = (d: number, p: number) => {
    const now = marks[d] === 'all' ? [] : ((marks[d] as number[] | undefined) ?? []);
    setMarks({ ...marks, [d]: now.includes(p) ? now.filter((x) => x !== p) : [...now, p] });
  };
  const slots = Object.entries(marks).flatMap(([d, m]): { weekday: number; period: number | null }[] => (m === 'all' ? [{ weekday: Number(d), period: null }] : m.map((p) => ({ weekday: Number(d), period: p }))));

  async function save() {
    setBusy(true);
    const r = await send('/api/app/timetable/generator/constraints', 'PUT', { kind: 'unavailable', teacherUserId: teacherId, slots });
    setBusy(false);
    if (!r.ok) {
      toast.show(t('ttg.away.failed'), 'danger');
      return;
    }
    toast.show(tCount('ttg.away.saved', Number(r.body.periods ?? 0)), 'success');
    onChanged();
  }

  const active = data.names.teachers.filter((p) => p.active);
  return (
    <section data-ttg-unavailable className={CARD} aria-labelledby="ttg-away-title">
      <div className={HEAD_ROW}>
        <h2 id="ttg-away-title" className="text-base font-bold text-slate">
          {t('ttg.away.title')}
        </h2>
        <InfoTip>{t('ttg.away.how')}</InfoTip>
      </div>
      <div className="max-w-sm">
        <Select id="ttg-away-teacher" label={t('tt.teacher')} value={teacherId} onChange={(e) => choose(e.target.value)}>
          <option value="">{t('tt.teacher.choose')}</option>
          {active.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </div>
      {teacherId && (
        <>
          <div className="flex flex-col gap-2">
            {days.map((d) => (
              <fieldset key={d} data-ttg-away-day={d} className="flex flex-col gap-2 rounded-md bg-off-white p-2">
                <legend className="sr-only">{t(dayKey(d))}</legend>
                <div className="flex flex-wrap items-center gap-2">
                  <span aria-hidden="true" className="w-24 text-sm font-bold text-slate">
                    {t(dayKey(d))}
                  </span>
                  <button type="button" aria-pressed={marks[d] === 'all'} data-ttg-away-whole={d} onClick={() => toggleDay(d)} className={`min-h-[44px] rounded-md border px-3 text-sm font-semibold ${marks[d] === 'all' ? 'border-sapphire bg-sapphire text-white' : 'border-slate/20 bg-white text-slate'}`}>
                    {t('ttg.away.wholeDay')}
                  </button>
                </div>
                {marks[d] !== 'all' && (
                  <div className="flex flex-wrap gap-2">
                    {Array.from({ length: periods }, (_, i) => i + 1).map((p) => {
                      const on = ((marks[d] as number[] | undefined) ?? []).includes(p);
                      return (
                        <button
                          key={p}
                          type="button"
                          aria-pressed={on}
                          aria-label={`${t(dayKey(d))}, ${t('tt.period', { period: p })}`}
                          data-ttg-away-slot={`${d}-${p}`}
                          onClick={() => togglePeriod(d, p)}
                          className={`min-h-[44px] min-w-[44px] rounded-md border px-2 text-sm font-semibold ${on ? 'border-sapphire bg-sapphire text-white' : 'border-slate/20 bg-white text-slate'}`}
                        >
                          {p}
                        </button>
                      );
                    })}
                  </div>
                )}
              </fieldset>
            ))}
          </div>
          <button type="button" data-ttg-away-save disabled={busy} onClick={save} className={`${PRIMARY} self-start`}>
            {t('ttg.away.save')}
          </button>
        </>
      )}
    </section>
  );
}
