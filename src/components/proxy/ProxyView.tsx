'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { explainError } from '@/lib/errors/catalogue';
import type { MessageKey } from '@/lib/i18n';
import { needsCover, PROXY_AHEAD_DAYS, type Cover, type MyCover, type ProxyDay, type Suggestion } from '@/lib/proxy/rules';
import { isLeaveDate } from '@/lib/staff/leave-rules';

// Proxy Auto (docs/26 slice 8c, C202).
//
// For the principal, the school admin and the academic coordinator (ProxyArranger): one date (today unless
// another is chosen), every period of a teacher on approved leave, and for each the free teachers in the order
// of the rule, with the reason beside every name. "Assign" is one person's tap and "Undo" takes it back; the
// screen assigns nothing by itself and sends no message. For a teacher (ProxyMine): the covers they hold, today,
// tomorrow and the days after, each as its period, class and subject. Not whose class it was: who is on leave is
// for the person and the office.
//
// A period whose cover cannot be taken any more (its teacher is now on leave, has left, or was given a class of
// their own then) is badged "Needs cover" again and says why, with the cover's own "Undo".
//
// The order of the names belongs to that one period. Nothing here adds up covers by person or sorts staff by them.

const TAP = 'min-h-[44px] rounded-md border border-slate/20 px-4 text-sm font-semibold text-slate disabled:opacity-60';
const PRIMARY = 'min-h-[44px] rounded-md bg-sapphire px-5 text-sm font-semibold text-white disabled:opacity-60';
const GO = 'inline-flex min-h-[44px] items-center justify-center rounded-md bg-sapphire px-4 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal';
const BOX = 'flex flex-col gap-3 rounded-lg border border-slate/10 bg-white p-4';
const SOFT = 'rounded-md bg-off-white px-3 py-2';
const REFUSALS = ['date', 'day_off', 'not_needed', 'already_covered', 'substitute', 'on_leave', 'not_free', 'already_covering', 'changed', 'elsewhere', 'undone', 'past'];
// How many names a period shows before "Show more": the top of the order is what the decision needs first.
const FIRST = 3;

type Days = { today: string; tomorrow: string; last: string };
export type ProxyArrangerData = Days & { arranger: true; mayRecordLeave: boolean; day: ProxyDay };
export type ProxyMineData = Days & { arranger: false; mine: MyCover[] };
type Data = ProxyArrangerData | ProxyMineData;
export type ProxyNote = { ok: boolean; text: string } | null;
export type AssignTap = { date: string; period: number; classId: string; substituteUserId: string; name: string };

// A school day has no time of day: it is said as the calendar day it is.
function useDayWords() {
  const { lang } = useT();
  const locale = lang === 'hi' ? 'hi-IN' : 'en-IN';
  const dayWords = new Intl.DateTimeFormat(locale, { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });
  const stampWords = new Intl.DateTimeFormat(locale, { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' });
  return { day: (iso: string) => dayWords.format(new Date(`${iso}T00:00:00Z`)), stamp: (at: string) => stampWords.format(new Date(at)) };
}

// A teacher: the covers they hold, and what a cover does and does not give them.
export function ProxyMine({ data }: { data: ProxyMineData }) {
  const { t, lang } = useT();
  const { day } = useDayWords();
  const on = (date: string) => data.mine.filter((c) => c.on_date === date);
  const later = data.mine.filter((c) => c.on_date > data.tomorrow);
  const line = (c: MyCover, withDay: boolean) => (
    <li key={c.substitution_id} data-proxy-mine={c.on_date} className="flex flex-col gap-1 rounded-md border border-slate/10 p-3">
      {withDay && <p className="text-slate/70">{day(c.on_date)}</p>}
      <p className="font-bold">{t('px.mine.line', { period: c.period, class: c.class_name, subject: c.subject_name })}</p>
    </li>
  );
  return (
    <div lang={lang} data-proxy="teacher" className="flex flex-col gap-4 text-sm text-slate">
      <section className={BOX}>
        <div>
          <h2 className="text-base font-bold">{t('px.mine.title')}</h2>
          <p className="max-w-prose text-slate/70">{t('px.mine.how')}</p>
        </div>
        <h3 className="font-bold">{t('px.mine.today', { date: day(data.today) })}</h3>
        {on(data.today).length === 0 ? (
          <p data-proxy-mine-none="today" className={SOFT}>
            {t('px.mine.noneToday')}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">{on(data.today).map((c) => line(c, false))}</ul>
        )}
        <h3 className="font-bold">{t('px.mine.tomorrow', { date: day(data.tomorrow) })}</h3>
        {on(data.tomorrow).length === 0 ? (
          <p data-proxy-mine-none="tomorrow" className={SOFT}>
            {t('px.mine.noneTomorrow')}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">{on(data.tomorrow).map((c) => line(c, false))}</ul>
        )}
        {later.length > 0 && (
          <>
            <h3 className="font-bold">{t('px.mine.later')}</h3>
            <ul className="flex flex-col gap-2">{later.map((c) => line(c, true))}</ul>
          </>
        )}
        <p className="max-w-prose text-slate/70">{t('px.mine.scope')}</p>
      </section>
    </div>
  );
}

// The people who arrange cover: one date, its periods, the free teachers for each, and the two taps.
export function ProxyArranger({ data, busy, note, onPick, onAssign, onUndo }: { data: ProxyArrangerData; busy: boolean; note: ProxyNote; onPick: (date: string) => void; onAssign: (tap: AssignTap) => void; onUndo: (cover: Cover) => void }) {
  const { t, tCount, lang } = useT();
  const { day, stamp } = useDayWords();
  // What is in the "Another day" box while it is being typed; null: the box shows the day on the screen.
  const [typed, setTyped] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const d = data.day;
  const pick = (date: string) => {
    setTyped(null);
    onPick(date);
  };
  // Why this name is offered here: the facts that gave it its place, for this period only.
  const why = (s: Suggestion, subject: string) =>
    [
      t('px.why.free'),
      ...(s.teachesSubject ? [t('px.why.subject', { subject })] : []),
      s.periodsThatDay === 0 ? t('px.why.periodsNone') : tCount('px.why.periods', s.periodsThatDay),
      s.coversThatWeek === 0 ? t('px.why.coversNone') : tCount('px.why.covers', s.coversThatWeek),
    ].join(' · ');
  const undo = (c: Cover) => (
    <button type="button" data-proxy-undo disabled={busy} aria-label={t('px.undo.label', { period: c.period, class: c.class_name })} className={`${TAP} self-start`} onClick={() => onUndo(c)}>
      {t('px.undo')}
    </button>
  );

  return (
    <div lang={lang} data-proxy="arranger" className="flex flex-col gap-4 text-sm text-slate">
      {note && (
        <p role="status" data-proxy-note={note.ok ? 'ok' : 'refused'} className={`rounded-md px-3 py-2 font-semibold ${note.ok ? 'bg-off-white text-slate' : 'border border-red-800/30 text-red-800'}`}>
          {note.text}
        </p>
      )}

      <section data-proxy-days className={BOX}>
        <p className="max-w-prose text-slate/70">{t('px.how')}</p>
        <div role="group" aria-label={t('px.day.label')} className="flex flex-wrap items-end gap-2">
          <button type="button" data-proxy-day="today" aria-pressed={d.date === data.today} disabled={busy} className={d.date === data.today ? PRIMARY : TAP} onClick={() => pick(data.today)}>
            {t('px.day.today')}
          </button>
          <button type="button" data-proxy-day="tomorrow" aria-pressed={d.date === data.tomorrow} disabled={busy} className={d.date === data.tomorrow ? PRIMARY : TAP} onClick={() => pick(data.tomorrow)}>
            {t('px.day.tomorrow')}
          </button>
          <div className="w-full sm:w-52">
            <Input
              id="proxy-date"
              type="date"
              label={t('px.day.other')}
              min={data.today}
              max={data.last}
              value={typed ?? d.date}
              onChange={(e) => {
                setTyped(e.target.value);
                // Only a whole, real day is asked for: a year still being typed would be refused by the server.
                if (isLeaveDate(e.target.value)) onPick(e.target.value);
              }}
              onBlur={() => setTyped(null)}
            />
          </div>
        </div>
      </section>

      <section data-proxy-date={d.date} className="flex flex-col gap-3">
        <h2 className="text-base font-bold">{t('px.day.showing', { date: day(d.date) })}</h2>
        {!d.open && (
          <p data-proxy-closed className={SOFT}>
            {d.date < data.today ? t('px.closed.past') : t('px.closed.far', { days: PROXY_AHEAD_DAYS })}
          </p>
        )}

        {d.open && d.dayOff && (
          <p data-proxy-empty={d.dayOff.kind} className="rounded-xl border border-dashed border-slate/20 bg-white p-5">
            {d.dayOff.kind === 'holiday' ? t('px.off.holiday', { date: day(d.date), name: d.dayOff.name }) : t('px.off.notWorking', { date: day(d.date) })}
          </p>
        )}
        {d.open && !d.dayOff && d.away.length === 0 && (
          <div data-proxy-empty="nobody" className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-slate/20 bg-white p-5">
            <p className="text-base font-bold">{t('px.none.title', { date: day(d.date) })}</p>
            <p className="max-w-prose">{t(data.mayRecordLeave ? 'px.none.office' : 'px.none.coordinator')}</p>
            {data.mayRecordLeave && (
              <Link href="/app/staff" className={GO}>
                {t('px.none.action')}
              </Link>
            )}
          </div>
        )}
        {!d.dayOff && d.away.length > 0 && (
          <p data-proxy-away className="font-semibold">
            {t('px.away', { names: d.away.map((p) => p.name).join(', ') })}
          </p>
        )}
        {!d.dayOff && d.away.length > 0 && d.periods.length === 0 && (
          <p data-proxy-empty="no-periods" className="rounded-xl border border-dashed border-slate/20 bg-white p-5">
            {t('px.noPeriods')}
          </p>
        )}

        {d.periods.length > 0 && (
          <ul className="grid items-start gap-3 lg:grid-cols-2">
            {d.periods.map((p) => {
              const key = `${p.period}:${p.class_id}`;
              const names = open[key] ? p.suggestions : p.suggestions.slice(0, FIRST);
              // The badge is the rule My Day counts by: no cover, or a cover that cannot be taken any more.
              const needs = needsCover(p);
              return (
                <li key={key} data-proxy-period={key} data-covered={needs ? 'no' : 'yes'} className={BOX}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="break-words text-base font-bold">{t('px.period.title', { period: p.period, class: p.class_name, subject: p.subject_name })}</h3>
                      <p className="text-slate/70">{t('px.inPlaceOf', { name: p.absent_name })}</p>
                    </div>
                    <Badge variant={needs ? 'warning' : 'success'}>{t(needs ? 'px.needs' : 'px.covered')}</Badge>
                  </div>

                  {p.cover && (
                    <>
                      <p data-proxy-cover className="font-semibold">
                        {t(p.cover.problem ? 'px.assignedTo' : 'px.coveredBy', { name: p.cover.substitute_name, by: p.cover.assigned_by, date: stamp(p.cover.assigned_at) })}
                      </p>
                      {p.cover.problem && (
                        <p data-proxy-problem={p.cover.problem} className="rounded-md border border-red-800/30 px-3 py-2 font-semibold text-red-800">
                          {t(`px.problem.${p.cover.problem}` as MessageKey, { name: p.cover.substitute_name })}
                        </p>
                      )}
                      {undo(p.cover)}
                    </>
                  )}

                  {!p.cover && p.suggestions.length === 0 && (
                    <div data-proxy-none-free className={SOFT}>
                      <p className="font-bold">{t('px.noneFree.title')}</p>
                      <p>{t('px.noneFree')}</p>
                    </div>
                  )}

                  {!p.cover && p.suggestions.length > 0 && (
                    <>
                      <div>
                        <p className="font-bold">{t('px.suggestions')}</p>
                        <p className="text-slate/70">{t('px.order')}</p>
                      </div>
                      <ol className="flex flex-col gap-2">
                        {names.map((s) => (
                          <li key={s.user_id} data-proxy-suggestion={s.user_id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate/10 p-3">
                            <div className="min-w-0">
                              <p className="break-words font-bold">{s.name}</p>
                              <p data-proxy-why className="text-slate/70">
                                {why(s, p.subject_name)}
                              </p>
                            </div>
                            <button
                              type="button"
                              data-proxy-assign
                              disabled={busy}
                              aria-label={t('px.assign.label', { name: s.name, period: p.period, class: p.class_name })}
                              className={PRIMARY}
                              onClick={() => onAssign({ date: d.date, period: p.period, classId: p.class_id, substituteUserId: s.user_id, name: s.name })}
                            >
                              {t('px.assign')}
                            </button>
                          </li>
                        ))}
                      </ol>
                      {p.suggestions.length > FIRST && !open[key] && (
                        <button type="button" data-proxy-more className={`${TAP} self-start`} onClick={() => setOpen({ ...open, [key]: true })}>
                          {tCount('px.more', p.suggestions.length - FIRST)}
                        </button>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {d.noLongerNeeded.length > 0 && (
        <section data-proxy-stale className={BOX}>
          <div>
            <h2 className="text-base font-bold">{t('px.stale.title')}</h2>
            <p className="max-w-prose text-slate/70">{t('px.stale.how')}</p>
          </div>
          <ul className="flex flex-col gap-2">
            {d.noLongerNeeded.map((c) => (
              <li key={c.substitution_id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate/10 p-3">
                <p className="min-w-0 break-words font-semibold">{t('px.stale.line', { period: c.period, class: c.class_name, subject: c.subject_name, name: c.substitute_name, absent: c.absent_name })}</p>
                {undo(c)}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// The screen: reads what this person is given (the day to arrange, or their own covers) and sends the two taps.
export function ProxyView() {
  const { t, lang } = useT();
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<ProxyNote>(null);

  // Only the answer to the latest reading is drawn, and a reading after a change asks for the same day.
  const asked = useRef(0);
  const shown = useRef('');
  const load = useCallback(async (date: string) => {
    const mine = ++asked.current;
    shown.current = date;
    const res = await fetch(`/api/app/proxy${date ? `?date=${encodeURIComponent(date)}` : ''}`).catch(() => null);
    const got = res?.ok ? ((await res.json().catch(() => null)) as Data | null) : null;
    if (mine !== asked.current) return;
    setFailed(!got);
    if (got) setData(got);
  }, []);
  useEffect(() => {
    void load('');
  }, [load]);

  // What the server refused, in the person's language: this screen's own reasons from the message files; a
  // standard refusal (a read-only school, a role that may not) from the error catalogue.
  const refusal = (body: unknown, status?: number) => {
    const code = (body as { code?: unknown } | null)?.code;
    if (typeof code === 'string' && REFUSALS.includes(code)) return t(`px.err.${code}` as MessageKey, { days: PROXY_AHEAD_DAYS });
    return explainError(body, t('px.err.other'), lang, status);
  };
  // After a change, and after a refusal too, the list is read again: the screen shows what is true now.
  const send = async (url: string, payload: unknown, done: string) => {
    setBusy(true);
    setNote(null);
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => null);
    const got = res ? await res.json().catch(() => null) : null;
    setNote(res?.ok ? { ok: true, text: done } : { ok: false, text: refusal(got, res?.status) });
    await load(shown.current);
    setBusy(false);
  };

  if (failed) {
    return (
      <p role="alert" data-proxy="failed" className={`${SOFT} text-sm text-slate`}>
        {t('px.failed')}
      </p>
    );
  }
  if (!data) {
    return (
      <p role="status" data-proxy="loading" className="text-sm text-slate/70">
        {t('px.loading')}
      </p>
    );
  }
  if (!data.arranger) return <ProxyMine data={data} />;
  return (
    <ProxyArranger
      data={data}
      busy={busy}
      note={note}
      onPick={(date) => {
        setNote(null);
        void load(date);
      }}
      onAssign={(tap) => void send('/api/app/proxy', { date: tap.date, period: tap.period, classId: tap.classId, substituteUserId: tap.substituteUserId }, t('px.assigned', { name: tap.name }))}
      onUndo={(c) => void send(`/api/app/proxy/${c.substitution_id}`, { action: 'undo' }, t('px.undone', { name: c.substitute_name }))}
    />
  );
}
