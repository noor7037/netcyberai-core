'use client';

import { useT } from '@/components/app-shell/LangContext';
import { Badge } from '@/components/ui/Badge';
import type { MessageKey } from '@/lib/i18n';
import type { Change } from '@/lib/timetable/generator';
import type { Slot } from '@/lib/timetable/plan';
import { dayKey, type namer } from './generator-ui';

// One class's week, two timetables side by side, period by period: the timetable now beside the proposal, or the
// timetable before a publish beside the one after it (C229). A period that differs is highlighted and says how
// (new, changed, emptied). Each day is its own block, so a phone reads it day by day and a wide screen shows several.
// With `onPick`, the right-hand periods are buttons: a person taps two of them to swap them.

type At = { weekday: number; period: number };
const CHANGE_WORD: Record<Change['kind'], MessageKey> = { added: 'ttg.change.added', changed: 'ttg.change.changed', removed: 'ttg.change.removed' };

export function WeekCompare({
  classId,
  days,
  periods,
  left,
  right,
  leftLabel,
  rightLabel,
  names,
  changes,
  onPick,
  picked = null,
  busy = false,
}: {
  classId: string;
  days: readonly number[];
  periods: number;
  left: readonly Slot[];
  right: readonly Slot[];
  leftLabel: string;
  rightLabel: string;
  names: ReturnType<typeof namer>;
  changes: readonly Change[];
  onPick?: (at: At) => void;
  picked?: At | null;
  busy?: boolean;
}) {
  const { t } = useT();
  const mine = (list: readonly Slot[]) => list.filter((s) => s.classId === classId);
  const l = mine(left);
  const r = mine(right);
  const shown = [...new Set([...days, ...l.map((s) => s.weekday), ...r.map((s) => s.weekday)])].sort((a, b) => a - b);
  const rows = Math.max(periods, ...l.map((s) => s.period), ...r.map((s) => s.period));
  const words = (list: Slot[], d: number, p: number) => {
    const s = list.find((x) => x.weekday === d && x.period === p);
    return s ? `${names.subject(s.subjectId)} · ${names.teacher(s.teacherUserId)}` : t('tt.free');
  };
  const changeAt = (d: number, p: number) => changes.find((c) => c.classId === classId && c.weekday === d && c.period === p)?.kind ?? null;

  return (
    <div data-ttg-week={classId} className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
      {shown.map((d) => (
        <div key={d} data-day={d} className="flex flex-col gap-1 rounded-xl border border-slate/10 bg-white p-2 sm:p-3">
          <h3 className="text-sm font-bold text-slate">{t(dayKey(d))}</h3>
          <div className="grid grid-cols-[auto_1fr_1fr] gap-2 px-2 text-xs font-semibold text-slate">
            <span aria-hidden="true" />
            <span>{leftLabel}</span>
            <span>{rightLabel}</span>
          </div>
          {Array.from({ length: rows }, (_, i) => i + 1).map((p) => {
            const kind = changeAt(d, p);
            const isPicked = picked?.weekday === d && picked.period === p;
            const after = words(r, d, p);
            return (
              <div key={p} data-ttg-row={`${d}-${p}`} data-change={kind ?? undefined} className={`grid grid-cols-[auto_1fr_1fr] items-center gap-2 rounded-md px-2 py-1 ${kind ? 'bg-amber/10' : ''}`}>
                <span className="text-xs font-semibold text-slate">{t('tt.period', { period: p })}</span>
                <span className="break-words text-sm text-slate">{words(l, d, p)}</span>
                {onPick ? (
                  <button
                    type="button"
                    data-ttg-pick={`${d}-${p}`}
                    aria-pressed={isPicked}
                    disabled={busy}
                    onClick={() => onPick({ weekday: d, period: p })}
                    className={`flex min-h-[44px] flex-col items-start justify-center gap-1 rounded-md border px-2 text-left text-sm text-slate ${isPicked ? 'border-sapphire bg-white font-semibold ring-2 ring-sapphire' : 'border-slate/20 bg-white'}`}
                  >
                    <span className="break-words">{after}</span>
                    {kind && <Badge variant="warning">{t(CHANGE_WORD[kind])}</Badge>}
                  </button>
                ) : (
                  <span className="flex flex-col items-start gap-1 break-words text-sm text-slate">
                    <span>{after}</span>
                    {kind && <Badge variant="warning">{t(CHANGE_WORD[kind])}</Badge>}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
