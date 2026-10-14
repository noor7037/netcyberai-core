'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useShownRefresh } from '@/components/dashboards/useShownRefresh';
import { Input } from '@/components/ui/Input';
import type { MessageKey } from '@/lib/i18n';
import { addDays, isLeaveDate, LEAVE_AHEAD_DAYS, LEAVE_BACK_DAYS, LEAVE_LIST_MAX, LEAVE_TEXT_MAX, leaveByToday, type LeaveRow } from '@/lib/staff/leave-rules';
import { BOX, coversReleasedIn, FIELD, LeaveGuideLink, LeaveKindSelect, LeaveNoteLine, LeaveSummary, ownRequestLine, PRIMARY, TAP, useLeaveWords, type LeaveNote } from './leave-parts';

// Leave, for the principal and the school admin, on Staff (docs/26 slice 8b, C201): the requests waiting for a
// decision, the approved leave, and recording leave for someone who phoned in. Nobody decides their own request:
// one's own shows here with no buttons, for the other person in the office to decide.
//
// EVERY APPROVED LEAVE THE OFFICE MAY NEED TO CANCEL IS ON THIS SCREEN, each with "Cancel this leave": what is
// running today or still to come, however far ahead, and what has already ended (leave written down late, or for
// the wrong person, is still wrong after its days). The list starts as far back as the office may record leave;
// "Show leave from" moves that first day earlier or later, so no approved leave is out of reach.
// The lists are in the order of the days. Nothing here counts or compares people.
//
// `shownAbove` (C203): the page was opened from a dashboard number, and the requests waiting (or the people on
// leave today) behind that number are drawn above these lists. After a change made here (a request approved or
// refused, leave cancelled or recorded), that list is read again too.

type Office = { me: string; alone: boolean; today: string; from: string; to: string | null; waiting: LeaveRow[]; calendar: LeaveRow[]; calendarMore: boolean; staff: { user_id: string; name: string; role: string }[] };
const EMPTY = { userId: '', fromDate: '', toDate: '', kind: 'sick', reason: '' };

export function StaffLeaveOffice({ shownAbove = false }: { shownAbove?: boolean }) {
  const { t, tCount, lang, day, refusal } = useLeaveWords();
  const refreshShown = useShownRefresh(shownAbove);
  const [data, setData] = useState<Office | null>(null);
  // What is in the "Show leave from" box once the office has typed there. null: the box shows the day the list on
  // the screen starts from. (A day half typed is empty here; the list is read again only for a whole, real day.)
  const [typed, setTyped] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [cancelling, setCancelling] = useState('');
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<LeaveNote>(null);

  // Only the answer to the latest reading is drawn: a slower, earlier one never puts an older list back.
  const asked = useRef(0);
  // The first day the approved-leave list was last read from; empty: where the server starts it. Every reading
  // after a change starts from the same day, so a row the office is looking at does not drop off the screen.
  const start = useRef('');
  const load = useCallback(async (from: string) => {
    const mine = ++asked.current;
    start.current = from;
    const res = await fetch(`/api/app/staff/leave?view=office${from ? `&from=${encodeURIComponent(from)}` : ''}`).catch(() => null);
    const got = res?.ok ? ((await res.json().catch(() => null)) as Office | null) : null;
    if (mine !== asked.current) return;
    setFailed(!got);
    if (got) setData(got);
  }, []);
  useEffect(() => {
    void load('');
  }, [load]);

  const send = async (url: string, payload: unknown, done: string | ((answer: unknown) => string), after?: () => void) => {
    setBusy(true);
    setNote(null);
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => null);
    const got = res ? await res.json().catch(() => null) : null;
    setBusy(false);
    if (!res?.ok) return setNote({ ok: false, text: refusal(got, res?.status) });
    setNote({ ok: true, text: typeof done === 'string' ? done : done(got) });
    after?.();
    await load(start.current);
    // The leave behind the dashboard's number, drawn above these lists, is read again too: a request just decided
    // no longer waits, and leave just cancelled no longer covers today.
    refreshShown();
  };
  // Cancelling approved leave releases the covers assigned for its days from today on, by that same tap (C210): the
  // line that says "Cancelled" also says how many were released, and that their teachers are told on My Day.
  const doneWords = (done: MessageKey, name: string) => (answer: unknown) => {
    const released = coversReleasedIn(answer);
    return released > 0 ? `${t(done, { name })} ${tCount('leave.office.coversReleased', released)}` : t(done, { name });
  };
  const step = (r: LeaveRow, action: 'approve' | 'refuse' | 'withdraw', done: MessageKey) =>
    send(`/api/app/staff/leave/${r.leave_id}`, { action, note: texts[r.leave_id] ?? '' }, doneWords(done, r.name), () => {
      setTexts({ ...texts, [r.leave_id]: '' });
      setCancelling('');
    });
  const record = (name: string) =>
    send('/api/app/staff/leave', form, t('leave.office.recorded', { name }), () => {
      // A list moved to start after these days goes back to where it starts by itself, so the new leave is on it.
      if (start.current > form.toDate) {
        start.current = '';
        setTyped(null);
      }
      setForm(EMPTY);
    });

  if (failed) return <p role="alert" data-leave-office="failed" className="rounded-md bg-off-white px-3 py-2 text-sm text-slate">{t('leave.failed')}</p>;
  if (!data) return null;
  const written = (id: string) => Boolean((texts[id] ?? '').trim());
  const noteField = (r: LeaveRow, label: MessageKey) => (
    <Input id={`leave-text-${r.leave_id}`} label={t(label, { name: r.name })} maxLength={LEAVE_TEXT_MAX} value={texts[r.leave_id] ?? ''} onChange={(e) => setTexts({ ...texts, [r.leave_id]: e.target.value })} />
  );
  const recordFor = data.staff.find((s) => s.user_id === form.userId);
  const { ahead, ended } = leaveByToday(data.calendar, data.today);
  const approvedRow = (r: LeaveRow) => (
    <li key={r.leave_id} data-leave-calendar-row className="flex flex-col gap-2 rounded-md border border-slate/10 p-3">
      <LeaveSummary r={r} showName />
      {r.mine && <p className="text-slate/70">{t('leave.office.ownApproved')}</p>}
      {r.mayCancel && cancelling !== r.leave_id && (
        <button type="button" data-leave-cancel-open disabled={busy} className={`${TAP} self-start`} onClick={() => setCancelling(r.leave_id)}>
          {t('leave.office.cancel')}
        </button>
      )}
      {r.mayCancel && cancelling === r.leave_id && (
        <>
          {noteField(r, 'leave.office.cancelNote')}
          <button type="button" data-leave-cancel disabled={busy || !written(r.leave_id)} className={`${PRIMARY} self-start`} onClick={() => void step(r, 'withdraw', 'leave.office.cancelled')}>
            {t('leave.office.cancel')}
          </button>
        </>
      )}
    </li>
  );

  return (
    <div lang={lang} data-leave-office className="flex flex-col gap-4 text-sm text-slate">
      <LeaveNoteLine note={note} />

      <section data-leave-waiting className={BOX}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-base font-bold">{t('leave.office.waiting')}</h2>
            <p className="text-slate/70">{t('leave.office.waitingHow')}</p>
          </div>
          <LeaveGuideLink />
        </div>
        {data.waiting.length === 0 ? (
          <p data-leave-none-waiting className="rounded-md bg-off-white px-3 py-2">{t('leave.office.noneWaiting')}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {data.waiting.map((r) => (
              <li key={r.leave_id} data-leave-waiting-row={r.mine ? 'own' : 'theirs'} className="flex flex-col gap-2 rounded-md border border-slate/10 p-3">
                <LeaveSummary r={r} showName />
                {r.mine && <p data-leave-own={data.alone ? 'alone' : 'decided'} className="font-semibold">{t(ownRequestLine(data.alone))}</p>}
                {r.mayDecide && (
                  <>
                    {noteField(r, 'leave.office.note')}
                    <div className="flex flex-wrap gap-2">
                      <button type="button" data-leave-approve disabled={busy} className={PRIMARY} onClick={() => void step(r, 'approve', 'leave.office.approved')}>
                        {t('leave.office.approve')}
                      </button>
                      <button type="button" data-leave-refuse disabled={busy || !written(r.leave_id)} className={TAP} onClick={() => void step(r, 'refuse', 'leave.office.refused')}>
                        {t('leave.office.refuse')}
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section data-leave-calendar className={BOX}>
        <div>
          <h2 className="text-base font-bold">{t('leave.office.calendar')}</h2>
          <p className="text-slate/70">{t('leave.office.calendarHow')}</p>
        </div>
        <div className="sm:max-w-xs">
          <Input
            id="leave-calendar-from"
            type="date"
            label={t('leave.office.calendarFrom')}
            value={typed ?? data.from}
            onChange={(e) => {
              setTyped(e.target.value);
              // Only a whole, real day is asked for: a year still being typed would be refused by the server.
              if (isLeaveDate(e.target.value)) void load(e.target.value);
            }}
            onBlur={() => {
              if (typed === '') setTyped(null);
            }}
          />
        </div>
        {data.calendarMore && <p data-leave-more className="rounded-md bg-off-white px-3 py-2 font-semibold">{t('leave.office.more', { count: LEAVE_LIST_MAX })}</p>}
        <div data-leave-ahead className="flex flex-col gap-3">
          <h3 className="font-bold">{t('leave.office.ahead')}</h3>
          {ahead.length === 0 ? (
            <p data-leave-none-away className="rounded-md bg-off-white px-3 py-2">{t('leave.office.noneAway', { date: day(data.from > data.today ? data.from : data.today) })}</p>
          ) : (
            <ul className="flex flex-col gap-3">{ahead.map(approvedRow)}</ul>
          )}
        </div>
        {data.from < data.today && (
          <div data-leave-ended className="flex flex-col gap-3">
            <h3 className="font-bold">{t('leave.office.ended')}</h3>
            {ended.length === 0 ? (
              <p data-leave-none-ended className="rounded-md bg-off-white px-3 py-2">{t('leave.office.noneEnded', { date: day(data.from) })}</p>
            ) : (
              <ul className="flex flex-col gap-3">{ended.map(approvedRow)}</ul>
            )}
          </div>
        )}
      </section>

      <section data-leave-record className={BOX}>
        <div>
          <h2 className="text-base font-bold">{t('leave.office.record')}</h2>
          <p className="text-slate/70">{t('leave.office.recordHow')}</p>
        </div>
        {data.staff.length === 0 ? (
          <p className="rounded-md bg-off-white px-3 py-2">{t('leave.office.noStaff')}</p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="leave-record-who" className="text-sm font-medium text-slate">{t('leave.office.who')}</label>
                <select id="leave-record-who" className={FIELD} value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })}>
                  <option value="">{t('leave.office.choose')}</option>
                  {data.staff.map((s) => (
                    <option key={s.user_id} value={s.user_id}>{`${s.name} · ${t(`role.${s.role}` as MessageKey)}`}</option>
                  ))}
                </select>
              </div>
              <LeaveKindSelect id="leave-record-kind" value={form.kind} onChange={(kind) => setForm({ ...form, kind })} />
              <Input id="leave-record-from" type="date" label={t('leave.from')} min={addDays(data.today, -LEAVE_BACK_DAYS)} max={addDays(data.today, LEAVE_AHEAD_DAYS)} value={form.fromDate} onChange={(e) => setForm({ ...form, fromDate: e.target.value, toDate: !form.toDate || form.toDate < e.target.value ? e.target.value : form.toDate })} />
              <Input id="leave-record-to" type="date" label={t('leave.to')} min={form.fromDate || addDays(data.today, -LEAVE_BACK_DAYS)} value={form.toDate} onChange={(e) => setForm({ ...form, toDate: e.target.value })} />
            </div>
            <Input id="leave-record-reason" label={t('leave.reason')} maxLength={LEAVE_TEXT_MAX} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
            <button type="button" data-leave-record-send disabled={busy || !recordFor || !form.fromDate || !form.toDate || !form.reason.trim()} className={`${PRIMARY} self-start`} onClick={() => void record(recordFor?.name ?? '')}>
              {t('leave.office.recordButton')}
            </button>
          </>
        )}
      </section>
    </div>
  );
}
