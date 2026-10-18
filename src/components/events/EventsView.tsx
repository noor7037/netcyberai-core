'use client';

import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { InfoTip } from '@/components/app-ui/InfoTip';
import { useShownRefresh } from '@/components/dashboards/useShownRefresh';
import { Badge } from '@/components/ui/Badge';
import { Checkbox } from '@/components/ui/Checkbox';
import { Input } from '@/components/ui/Input';
import type { MessageKey } from '@/lib/i18n';

// School events (docs/25 slice 7l, C194). The office makes an event for some classes or for every class and invites;
// parents answer YES or NO by reply and the answers are counted; cancelling tells those invited.
//
// `shownAbove` (C210): the page was opened from the dashboard's "Events coming", and those events are drawn above
// this list. After a change made here, that list is read again too.

type Event = { event_id: string; title: string; held_on: string; starts_at: string | null; details: string; status: 'draft' | 'invited' | 'cancelled'; classes: string | null; invited: number; yes: number; no: number };
type Data = { events: Event[]; classes: { class_id: string; name: string }[]; mayManage: boolean };
const ERRORS = ['title', 'date', 'time', 'details', 'classes', 'not_draft', 'past', 'nobody', 'already_cancelled'];
const VARIANT = { draft: 'neutral', invited: 'success', cancelled: 'danger' } as const;
const TAP = 'min-h-[44px] rounded-md border border-slate/20 px-4 text-sm font-semibold text-slate disabled:opacity-60';
const PRIMARY = 'min-h-[44px] rounded-md bg-sapphire px-5 text-sm font-semibold text-white disabled:opacity-60';
const sayTime = (t: string) => `${((Number(t.slice(0, 2)) + 11) % 12) + 1}:${t.slice(3, 5)} ${Number(t.slice(0, 2)) < 12 ? 'am' : 'pm'}`;

export function EventsView({ shownAbove = false }: { shownAbove?: boolean }) {
  const { t, lang } = useT();
  const refreshShown = useShownRefresh(shownAbove);
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [form, setForm] = useState({ title: '', heldOn: '', startsAt: '', details: '', all: true, classIds: [] as string[] });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/app/events').catch(() => null);
    const got = res?.ok ? ((await res.json().catch(() => null)) as Data | null) : null;
    setFailed(!got);
    if (got) setData(got);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const send = async (url: string, payload: unknown, done: (r: Record<string, number>) => string, clear = false) => {
    setBusy(true);
    setNote(null);
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => null);
    const got = res ? await res.json().catch(() => null) : null;
    setBusy(false);
    if (!res?.ok) return setNote({ ok: false, text: ERRORS.includes(got?.code) ? t(`evt.err.${got.code}` as MessageKey) : t('evt.err.other') });
    setNote({ ok: true, text: done(got ?? {}) });
    if (clear) setForm({ title: '', heldOn: '', startsAt: '', details: '', all: true, classIds: [] });
    await load();
    // The events coming, drawn above this list, are read again too: an event just made is among them, one just
    // cancelled is not.
    refreshShown();
  };

  if (failed) return <p role="alert" className="rounded-md bg-off-white px-3 py-2 text-sm text-slate">{t('evt.failed')}</p>;
  if (!data) return null;
  const day = new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div lang={lang} data-events className="flex flex-col gap-4 text-sm text-slate">
      {note && <p role="status" data-events-note className={`rounded-md px-3 py-2 font-semibold ${note.ok ? 'bg-off-white text-slate' : 'border border-red-800/30 text-red-800'}`}>{note.text}</p>}

      {data.mayManage && (
        <section data-event-new className="flex flex-col gap-3 rounded-lg border border-slate/10 bg-white p-4">
          <div className="flex flex-wrap items-center gap-x-1">
            <h2 className="text-base font-bold">{t('evt.new.title')}</h2>
            <InfoTip>{t('evt.new.how')}</InfoTip>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="lg:col-span-2"><Input id="event-title" label={t('evt.new.name')} maxLength={120} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <Input id="event-date" type="date" label={t('evt.new.date')} value={form.heldOn} onChange={(e) => setForm({ ...form, heldOn: e.target.value })} />
            <Input id="event-time" type="time" label={t('evt.new.time')} value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
          </div>
          <Input id="event-details" label={t('evt.new.details')} maxLength={300} value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} />
          <fieldset className="flex flex-col gap-2">
            <legend className="font-semibold">{t('evt.new.who')}</legend>
            <div className="flex flex-wrap gap-x-4">
              <Checkbox id="event-all" data-event-all label={t('evt.allClasses')} checked={form.all} onChange={(e) => setForm({ ...form, all: e.target.checked, classIds: e.target.checked ? [] : form.classIds })} />
              {!form.all && data.classes.map((c) => (
                <Checkbox key={c.class_id} id={`event-class-${c.class_id}`} data-event-class label={c.name} checked={form.classIds.includes(c.class_id)} onChange={(e) => setForm({ ...form, classIds: e.target.checked ? [...form.classIds, c.class_id] : form.classIds.filter((x) => x !== c.class_id) })} />
              ))}
            </div>
          </fieldset>
          <button type="button" data-event-make disabled={busy || !form.title.trim() || !form.heldOn || !form.details.trim() || (!form.all && form.classIds.length === 0)} className={`${PRIMARY} self-start`} onClick={() => void send('/api/app/events', { title: form.title, heldOn: form.heldOn, startsAt: form.startsAt || null, details: form.details, classIds: form.all ? [] : form.classIds }, () => t('evt.made'), true)}>
            {t('evt.new.make')}
          </button>
        </section>
      )}

      <section className="flex flex-col gap-3 rounded-lg border border-slate/10 bg-white p-4">
        <h2 className="text-base font-bold">{t('evt.list.title')}</h2>
        {data.events.length === 0 ? (
          <p data-events-empty className="rounded-md bg-off-white px-3 py-2">{t(data.mayManage ? 'evt.none' : 'evt.noneTeacher')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.events.map((e) => (
              <li key={e.event_id} data-event={e.status} className="flex flex-col gap-2 rounded-md border border-slate/10 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={VARIANT[e.status]}>{t(`evt.status.${e.status}` as MessageKey)}</Badge>
                  <span className="font-bold">{e.title}</span>
                  <span className="text-slate/70">{day.format(new Date(`${e.held_on}T00:00:00Z`))}{e.starts_at ? `, ${sayTime(e.starts_at)}` : ''} · {e.classes ?? t('evt.allClasses')}</span>
                </div>
                <p>{e.details}</p>
                {e.status !== 'draft' && <p data-event-counts className="font-semibold">{t('evt.counts', { invited: e.invited, yes: e.yes, no: e.no })}</p>}
                {data.mayManage && e.status !== 'cancelled' && (
                  <div className="flex flex-wrap gap-2">
                    {e.status === 'draft' && (
                      <button type="button" data-event-invite disabled={busy} className={PRIMARY} onClick={() => void send(`/api/app/events/${e.event_id}`, { action: 'invite' }, (r) => t('evt.invited', { queued: r.queued ?? 0, held: r.held ?? 0, withoutNumber: r.withoutNumber ?? 0 }))}>
                        {t('evt.invite')}
                      </button>
                    )}
                    <button type="button" data-event-cancel disabled={busy} className={TAP} onClick={() => void send(`/api/app/events/${e.event_id}`, { action: 'cancel' }, (r) => t('evt.cancelled', { told: r.told ?? 0 }))}>
                      {t('evt.cancel')}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
