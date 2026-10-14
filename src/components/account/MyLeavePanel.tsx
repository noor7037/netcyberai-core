'use client';

import { useCallback, useEffect, useState } from 'react';
import { BOX, LeaveGuideLink, LeaveKindSelect, LeaveNoteLine, LeaveSummary, myLeaveHow, PRIMARY, TAP, useLeaveWords, type LeaveNote } from '@/components/staff/leave-parts';
import { Input } from '@/components/ui/Input';
import { addDays, LEAVE_AHEAD_DAYS, LEAVE_TEXT_MAX, type LeaveRow } from '@/lib/staff/leave-rules';

// "My leave" on every staff member's account page (docs/26 slice 8b, C201): put in a request for whole days,
// see the answer, withdraw it while it waits or before its first day. The principal or the school admin
// decides; nobody decides their own, so the only person in a school's office is told that theirs has nobody to
// decide it yet. Only the person and the office can read a request.

type Mine = { me: string; office: boolean; alone: boolean; today: string; mine: LeaveRow[] };
const EMPTY = { fromDate: '', toDate: '', kind: 'casual', reason: '' };

export function MyLeavePanel() {
  const { t, lang, refusal } = useLeaveWords();
  const [data, setData] = useState<Mine | null>(null);
  const [failed, setFailed] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<LeaveNote>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/app/staff/leave').catch(() => null);
    const got = res?.ok ? ((await res.json().catch(() => null)) as Mine | null) : null;
    setFailed(!got);
    if (got) setData(got);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const send = async (url: string, payload: unknown, done: string, after?: () => void) => {
    setBusy(true);
    setNote(null);
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => null);
    const got = res ? await res.json().catch(() => null) : null;
    setBusy(false);
    if (!res?.ok) return setNote({ ok: false, text: refusal(got, res?.status) });
    setNote({ ok: true, text: done });
    after?.();
    await load();
  };

  if (failed) {
    return (
      <section lang={lang} data-my-leave="failed" className={`${BOX} w-full max-w-2xl text-sm text-slate`}>
        <h2 className="text-base font-bold">{t('leave.my.title')}</h2>
        <p role="alert" className="rounded-md bg-off-white px-3 py-2">{t('leave.failed')}</p>
      </section>
    );
  }
  if (!data) return null;
  const ready = Boolean(form.fromDate && form.toDate && form.reason.trim());

  return (
    <section lang={lang} data-my-leave className={`${BOX} w-full max-w-2xl text-sm text-slate`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-bold">{t('leave.my.title')}</h2>
          <p data-my-leave-how={data.alone ? 'alone' : 'decided'} className="text-slate/70">{t(myLeaveHow(data))}</p>
        </div>
        <LeaveGuideLink />
      </div>
      <LeaveNoteLine note={note} />

      <div className="grid gap-3 sm:grid-cols-3">
        <Input id="my-leave-from" type="date" label={t('leave.from')} min={data.today} max={addDays(data.today, LEAVE_AHEAD_DAYS)} value={form.fromDate} onChange={(e) => setForm({ ...form, fromDate: e.target.value, toDate: !form.toDate || form.toDate < e.target.value ? e.target.value : form.toDate })} />
        <Input id="my-leave-to" type="date" label={t('leave.to')} min={form.fromDate || data.today} value={form.toDate} onChange={(e) => setForm({ ...form, toDate: e.target.value })} />
        <LeaveKindSelect id="my-leave-kind" value={form.kind} onChange={(kind) => setForm({ ...form, kind })} />
      </div>
      <Input id="my-leave-reason" label={t('leave.reason')} helperText={t('leave.reasonHelp', { max: LEAVE_TEXT_MAX })} maxLength={LEAVE_TEXT_MAX} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
      <button type="button" data-my-leave-send disabled={busy || !ready} className={`${PRIMARY} self-start`} onClick={() => void send('/api/app/staff/leave', form, t('leave.my.asked'), () => setForm(EMPTY))}>
        {t('leave.my.ask')}
      </button>

      <h3 className="mt-2 font-bold">{t('leave.my.list')}</h3>
      {data.mine.length === 0 ? (
        <p data-my-leave-empty className="rounded-md bg-off-white px-3 py-2">{t('leave.my.none')}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {data.mine.map((r) => (
            <li key={r.leave_id} data-my-leave-row={r.status} className="flex flex-col gap-2 rounded-md border border-slate/10 p-3">
              <LeaveSummary r={r} showName={false} />
              {r.mayWithdraw && (
                <button type="button" data-my-leave-withdraw disabled={busy} className={`${TAP} self-start`} onClick={() => void send(`/api/app/staff/leave/${r.leave_id}`, { action: 'withdraw' }, t('leave.my.withdrawn'))}>
                  {t('leave.my.withdraw')}
                </button>
              )}
              {r.status === 'approved' && !r.mayWithdraw && r.to_date >= data.today && <p className="text-slate/70">{t('leave.my.begun')}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
