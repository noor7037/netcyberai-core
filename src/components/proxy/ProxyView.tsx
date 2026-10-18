'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { InfoTip } from '@/components/app-ui/InfoTip';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { explainError } from '@/lib/errors/catalogue';
import type { MessageKey } from '@/lib/i18n';
import { PROXY_SHOW, type ProxyShow } from '@/lib/insights/screens';
import { needsCover, PROXY_AHEAD_DAYS, type Cover, type MyCover, type ProxyDay, type Suggestion } from '@/lib/proxy/rules';
import { isLeaveDate } from '@/lib/staff/leave-rules';

// Proxy Auto (docs/26 slice 8c, C202).
//
// For the principal, the school admin and the academic coordinator (ProxyArranger): one date (today unless
// another is chosen), every period of a teacher on approved leave, and for each the free teachers in the order
// of the rule, with the reason beside every name. "Assign" is one person's tap and "Undo" takes it back; the
// screen assigns nothing by itself and sends no message. For a teacher (ProxyMine): the covers they hold, today,
// tomorrow and the days after, each as its period, class and subject, and the covers released because the leave
// behind them was cancelled (C210). Not whose class it was: who is on leave is for the person and the office.
//
// A period whose cover cannot be taken any more (its teacher is now on leave, has left, or was given a class of
// their own then) is badged "Needs cover" again and says why, with the cover's own "Undo".
//
// The order of the names belongs to that one period. Nothing here adds up covers by person or sorts staff by them.
//
// OPENED FROM A DASHBOARD NUMBER (/app/proxy?show=needs-cover; docs/26 slice 8d, C203), the same screen lists
// today's periods that still need cover and no others: the periods needsCover() is true for, each with its free
// teachers and "Assign" as always, under a title that says how many of the day's periods they are. So the number
// on the dashboard is the rows a person then reads, and with 26 of 28 periods covered nobody hunts for the two.
// The list is this screen's own reading: a period leaves it the moment a teacher is assigned. The covered
// periods, the covers nothing needs any more and the other days are one tap away, under "Show everything".

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
// `released`: covers the teacher had from today on that were released because the leave behind them was cancelled
// (C210). Each is the day, the period, the class and the subject, like `mine`; never whose leave it was or why.
export type ProxyMineData = Days & { arranger: false; mine: MyCover[]; released: MyCover[] };
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
        <div className="flex flex-wrap items-center gap-x-1">
          <h2 className="text-base font-bold">{t('px.mine.title')}</h2>
          <InfoTip>
            <p>{t('px.mine.how')}</p>
            <p className="mt-2">{t('px.mine.scope')}</p>
          </InfoTip>
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
      </section>
      {/* Covers released because the leave behind them was cancelled (C210): the periods this teacher no longer
          takes, from today on. What My Day's "covers-released" card counts. */}
      {data.released.length > 0 && (
        <section data-proxy-released className={BOX}>
          <div className="flex flex-wrap items-center gap-x-1">
            <h2 className="text-base font-bold">{t('px.released.title')}</h2>
            <InfoTip>{t('px.released.how')}</InfoTip>
          </div>
          <ul className="flex flex-col gap-2">
            {data.released.map((c) => (
              <li key={c.substitution_id} data-proxy-released-row={c.on_date} className="flex flex-col gap-1 rounded-md border border-slate/10 p-3">
                <p className="text-slate/70">{day(c.on_date)}</p>
                <p className="font-bold">{t('px.released.line', { period: c.period, class: c.class_name, subject: c.subject_name })}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// The people who arrange cover: one date, its periods, the free teachers for each, and the two taps.
// `show`: the filter of the address. 'needs-cover' lists only the periods that still need cover (see the top).
export function ProxyArranger({ data, show, busy, note, onPick, onAssign, onUndo }: { data: ProxyArrangerData; show?: ProxyShow; busy: boolean; note: ProxyNote; onPick: (date: string) => void; onAssign: (tap: AssignTap) => void; onUndo: (cover: Cover) => void }) {
  const { t, tCount, lang } = useT();
  const { day, stamp } = useDayWords();
  // What is in the "Another day" box while it is being typed; null: the box shows the day on the screen.
  const [typed, setTyped] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const d = data.day;
  // The periods with no teacher: the rule of the badges, of My Day's card and of the dashboard's number.
  const needing = d.periods.filter(needsCover);
  const onlyNeeding = show === PROXY_SHOW;
  const listed = onlyNeeding ? needing : d.periods;
  // "x of y" while the day has a period to cover; on a day with none, the plain 0 the dashboard's tile says.
  const countWords = d.periods.length > 0 ? t('px.count', { open: needing.length, all: d.periods.length }) : t('px.count.only', { open: 0 });
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

      {/* Opened from the dashboard's number: what the rows below are and how many, in the frame every such list
          has (ShownRows), and the way back to the whole screen. The day is today: the other days, like the covered
          periods, are under "Show everything". */}
      {onlyNeeding && (
        <section data-shown="proxy-needs-cover" className={BOX}>
          <div className="flex flex-wrap items-center gap-x-1">
            <h2 data-shown-title data-proxy-count data-needs={needing.length} data-periods={d.periods.length} className="text-base font-bold">
              {countWords}
            </h2>
            <InfoTip>{t('px.shown.how')}</InfoTip>
          </div>
          {needing.length === 0 && (
            <p data-shown-none className={SOFT}>
              {t('shown.none')}
            </p>
          )}
          <Link href="/app/proxy" data-shown-back className="inline-flex min-h-[44px] items-center self-start font-semibold text-sapphire underline">
            {t('shown.back')}
          </Link>
        </section>
      )}

      {!onlyNeeding && (
        <section data-proxy-days className={BOX}>
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
            <InfoTip>{t('px.how')}</InfoTip>
          </div>
        </section>
      )}

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

        {/* How many of the day's periods still have no teacher: the rule of the badges below, counted. For today
            it is the number the dashboard's tile and My Day's card say (C203). Opened on that number, the same
            words are the title of the list, in the frame above. */}
        {!onlyNeeding && d.periods.length > 0 && (
          <p data-proxy-count data-needs={needing.length} data-periods={d.periods.length} className="font-semibold">
            {countWords}
          </p>
        )}

        {listed.length > 0 && (
          <ul className="grid items-start gap-3 lg:grid-cols-2">
            {listed.map((p) => {
              const key = `${p.period}:${p.class_id}`;
              const names = open[key] ? p.suggestions : p.suggestions.slice(0, FIRST);
              // The badge is the rule My Day counts by: no cover, or a cover that cannot be taken any more.
              const needs = needsCover(p);
              return (
                <li key={key} data-proxy-period={key} data-covered={needs ? 'no' : 'yes'} data-shown-row={onlyNeeding || undefined} className={BOX}>
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
                      <div className="flex flex-wrap items-center gap-x-1">
                        <p className="font-bold">{t('px.suggestions')}</p>
                        <InfoTip>{t('px.order')}</InfoTip>
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

      {!onlyNeeding && d.noLongerNeeded.length > 0 && (
        <section data-proxy-stale className={BOX}>
          <div className="flex flex-wrap items-center gap-x-1">
            <h2 className="text-base font-bold">{t('px.stale.title')}</h2>
            <InfoTip>{t('px.stale.how')}</InfoTip>
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
// `show`: the filter of the address, handed down by the page (only 'needs-cover' is one; see the top).
export function ProxyView({ show }: { show?: ProxyShow }) {
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
  // The screen opens on today. The filter of the address is about today too, so when it is put on or taken off
  // (a tap on "Show everything", the browser's Back) the day read is today's again, whatever day was chosen before.
  useEffect(() => {
    void load('');
  }, [load, show]);

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
  // Under the filter only today is drawn: another day's reading still on the screen is waited out.
  if (!data || (show === PROXY_SHOW && data.arranger && data.day.date !== data.today)) {
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
      show={show}
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
