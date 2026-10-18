'use client';

import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { InfoTip } from '@/components/app-ui/InfoTip';
import { useShownRefresh } from '@/components/dashboards/useShownRefresh';
import { Badge } from '@/components/ui/Badge';
import { Checkbox } from '@/components/ui/Checkbox';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import type { MessageKey } from '@/lib/i18n';

// Parent-teacher meetings (docs/25 slice 7k, C193). The office makes a meeting day and invites; parents book by
// replying with a time; staff can book for a parent who phoned; after the meeting the teacher marks who came.
//
// `shownAbove` (C203): the page was opened from the dashboard's "Meetings coming", and those meetings are drawn
// above this list with their booked times. After a change made here (a meeting made, cancelled or invited, a
// time booked), that list is read again too.

type Meeting = { ptm_id: string; title: string; held_on: string; starts_at: string; ends_at: string; slot_minutes: number; status: 'draft' | 'invited' | 'cancelled'; classes: string; slots: number; booked: number; attended: number };
type Booking = { booking_id: string; parent_id: string; guardian: string; children: string; via: 'reply' | 'staff'; attended: boolean | null; note: string | null };
type Detail = { ptm: Meeting; teachers: { teacher_id: string; teacher: string; slots: { slot_id: string; time: string; booking: Booking | null }[]; guardians: { parent_id: string; guardian: string; children: string }[] }[]; mayManage: boolean; hasBegun: boolean; isOver: boolean };
type Data = { meetings: Meeting[]; classes: { class_id: string; name: string; teacher: string | null }[]; mayManage: boolean };
const ERRORS = ['title', 'date', 'times', 'classes', 'no_teacher', 'too_many_slots', 'not_draft', 'past', 'nobody', 'already_cancelled', 'not_open', 'not_invited', 'taken', 'too_early', 'note'];
const VARIANT = { draft: 'neutral', invited: 'success', cancelled: 'danger' } as const;
const TAP = 'min-h-[44px] rounded-md border border-slate/20 px-4 text-sm font-semibold text-slate disabled:opacity-60';
const PRIMARY = 'min-h-[44px] rounded-md bg-sapphire px-5 text-sm font-semibold text-white disabled:opacity-60';
const sayTime = (t: string) => `${((Number(t.slice(0, 2)) + 11) % 12) + 1}:${t.slice(3, 5)} ${Number(t.slice(0, 2)) < 12 ? 'am' : 'pm'}`;

export function PtmView({ shownAbove = false }: { shownAbove?: boolean }) {
  const { t, lang } = useT();
  const refreshShown = useShownRefresh(shownAbove);
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<Detail | null>(null);
  const [form, setForm] = useState({ title: '', heldOn: '', startsAt: '10:00', endsAt: '13:00', slotMinutes: 15, classIds: [] as string[], withSubjectTeachers: false });
  const [pick, setPick] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/app/ptm').catch(() => null);
    const got = res?.ok ? ((await res.json().catch(() => null)) as Data | null) : null;
    setFailed(!got);
    if (got) setData(got);
  }, []);
  const show = useCallback(async (ptmId: string) => {
    const res = await fetch(`/api/app/ptm/${ptmId}`).catch(() => null);
    const got = res?.ok ? ((await res.json().catch(() => null)) as Detail | null) : null;
    if (got) setOpen(got);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const send = async (url: string, payload: unknown, done: (r: Record<string, number | string>) => string) => {
    setBusy(true);
    setNote(null);
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => null);
    const got = res ? await res.json().catch(() => null) : null;
    setBusy(false);
    if (!res?.ok) return setNote({ ok: false, text: ERRORS.includes(got?.code) ? t(`ptm.err.${got.code}` as MessageKey, { classes: Array.isArray(got?.classes) ? got.classes.join(', ') : '' }) : t('ptm.err.other') });
    setNote({ ok: true, text: done(got ?? {}) });
    await load();
    const id = (got?.ptmId as string | undefined) ?? open?.ptm.ptm_id;
    if (id) await show(id);
    // The meetings behind the dashboard's number, drawn above this list, are read again too: a meeting just
    // cancelled is no longer among them, and a time just booked is counted.
    refreshShown();
  };

  if (failed) return <p role="alert" className="rounded-md bg-off-white px-3 py-2 text-sm text-slate">{t('ptm.failed')}</p>;
  if (!data) return null;
  const day = new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const sayDay = (iso: string) => day.format(new Date(`${iso}T00:00:00Z`));
  const m = open?.ptm;

  return (
    <div lang={lang} data-ptm className="flex flex-col gap-4 text-sm text-slate">
      {note && <p role="status" data-ptm-note className={`rounded-md px-3 py-2 font-semibold ${note.ok ? 'bg-off-white text-slate' : 'border border-red-800/30 text-red-800'}`}>{note.text}</p>}

      {data.mayManage && (
        <section data-ptm-new className="flex flex-col gap-3 rounded-lg border border-slate/10 bg-white p-4">
          <div className="flex flex-wrap items-center gap-x-1">
            <h2 className="text-base font-bold">{t('ptm.new.title')}</h2>
            <InfoTip>{t('ptm.new.how')}</InfoTip>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="lg:col-span-2"><Input id="ptm-title" label={t('ptm.new.name')} maxLength={120} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <Input id="ptm-date" type="date" label={t('ptm.new.date')} value={form.heldOn} onChange={(e) => setForm({ ...form, heldOn: e.target.value })} />
            <Input id="ptm-from" type="time" label={t('ptm.new.from')} value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
            <Input id="ptm-to" type="time" label={t('ptm.new.to')} value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />
          </div>
          <div className="sm:max-w-xs">
            <Select id="ptm-minutes" label={t('ptm.new.minutes')} value={form.slotMinutes} onChange={(e) => setForm({ ...form, slotMinutes: Number(e.target.value) })}>
              {[10, 15, 20, 30].map((n) => (
                <option key={n} value={n}>{t('ptm.new.minutesEach', { count: n })}</option>
              ))}
            </Select>
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="font-semibold">{t('ptm.new.classes')}</legend>
            {data.classes.length === 0 && <p className="rounded-md bg-off-white px-3 py-2">{t('ptm.new.noClasses')}</p>}
            <div className="flex flex-wrap gap-x-4">
              {data.classes.map((c) => (
                <Checkbox key={c.class_id} id={`ptm-class-${c.class_id}`} data-ptm-class label={`${c.name} · ${c.teacher ?? t('ptm.new.noTeacher')}`} checked={form.classIds.includes(c.class_id)} onChange={(e) => setForm({ ...form, classIds: e.target.checked ? [...form.classIds, c.class_id] : form.classIds.filter((x) => x !== c.class_id) })} />
              ))}
            </div>
          </fieldset>
          <div className="flex flex-wrap items-center gap-x-1">
            <Checkbox id="ptm-subject-teachers" data-ptm-subject-teachers label={t('ptm.new.subjectTeachers')} checked={form.withSubjectTeachers} onChange={(e) => setForm({ ...form, withSubjectTeachers: e.target.checked })} />
            <InfoTip>{t('ptm.new.subjectTeachersHow')}</InfoTip>
          </div>
          <button type="button" data-ptm-make disabled={busy || !form.title.trim() || !form.heldOn || form.classIds.length === 0} className={`${PRIMARY} self-start`} onClick={() => void send('/api/app/ptm', form, (r) => t('ptm.made', { slots: r.slots ?? 0, teachers: r.teachers ?? 0 }))}>
            {t('ptm.new.make')}
          </button>
        </section>
      )}

      <section className="flex flex-col gap-3 rounded-lg border border-slate/10 bg-white p-4">
        <h2 className="text-base font-bold">{t('ptm.list.title')}</h2>
        {data.meetings.length === 0 ? (
          <p data-ptm-empty className="rounded-md bg-off-white px-3 py-2">{t(data.mayManage ? 'ptm.none' : 'ptm.noneTeacher')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.meetings.map((x) => (
              <li key={x.ptm_id}>
                <button type="button" data-ptm-meeting={x.status} aria-pressed={m?.ptm_id === x.ptm_id} className={`flex min-h-[44px] w-full flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-left ${m?.ptm_id === x.ptm_id ? 'border-midnight' : 'border-slate/10'}`} onClick={() => void show(x.ptm_id)}>
                  <Badge variant={VARIANT[x.status]}>{t(`ptm.status.${x.status}` as MessageKey)}</Badge>
                  <span className="font-bold">{x.title}</span>
                  <span className="text-slate/70">{sayDay(x.held_on)} · {x.classes} · {t('ptm.list.counts', { booked: x.booked, slots: x.slots })}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {open && m && (
        <section data-ptm-open={m.status} className="flex flex-col gap-4 rounded-lg border border-slate/10 bg-white p-4">
          <div>
            <h2 className="text-base font-bold">{m.title}</h2>
            <p className="text-slate/70">{t('ptm.open.when', { date: sayDay(m.held_on), from: sayTime(m.starts_at), to: sayTime(m.ends_at) })}</p>
            <p className="font-semibold">{t(`ptm.open.${m.status}` as MessageKey)}</p>
          </div>
          {open.mayManage && m.status !== 'cancelled' && (
            <div className="flex flex-wrap gap-2">
              {m.status === 'draft' && (
                <button type="button" data-ptm-invite disabled={busy} className={PRIMARY} onClick={() => void send(`/api/app/ptm/${m.ptm_id}`, { action: 'invite' }, (r) => t('ptm.invited', { queued: r.queued ?? 0, held: r.held ?? 0, withoutNumber: r.withoutNumber ?? 0 }))}>
                  {t('ptm.invite')}
                </button>
              )}
              <button type="button" data-ptm-cancel disabled={busy} className={TAP} onClick={() => void send(`/api/app/ptm/${m.ptm_id}`, { action: 'cancel' }, (r) => t('ptm.cancelled', { told: r.told ?? 0 }))}>
                {t('ptm.cancel')}
              </button>
            </div>
          )}
          {open.teachers.map((tr) => (
            <div key={tr.teacher_id} data-ptm-teacher className="flex flex-col gap-2">
              <h3 className="font-bold">{tr.teacher}</h3>
              <ul className="flex flex-col gap-2">
                {tr.slots.map((s) => (
                  <li key={s.slot_id} data-ptm-slot={s.booking ? 'booked' : 'free'} className="flex flex-col gap-2 rounded-md border border-slate/10 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold">{sayTime(s.time)}</span>
                      {s.booking ? (
                        <>
                          <span>{!s.booking.guardian ? t('ptm.slot.guardianHidden') : s.booking.children ? t('ptm.slot.with', { guardian: s.booking.guardian, children: s.booking.children }) : s.booking.guardian}</span>
                          <span className="text-slate/70">{t(s.booking.via === 'reply' ? 'ptm.slot.byReply' : 'ptm.slot.byStaff')}</span>
                          {s.booking.attended !== null && <Badge variant={s.booking.attended ? 'success' : 'warning'}>{t(s.booking.attended ? 'ptm.came' : 'ptm.didNotCome')}</Badge>}
                        </>
                      ) : (
                        <span className="text-slate/70">{t('ptm.slot.free')}</span>
                      )}
                    </div>
                    {s.booking?.note && <p>{s.booking.note}</p>}
                    {!s.booking && m.status !== 'cancelled' && !open.isOver && tr.guardians.length > 0 && (
                      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                        <Select id={`ptm-pick-${s.slot_id}`} label={t('ptm.slot.choose')} value={pick[s.slot_id] ?? ''} onChange={(e) => setPick({ ...pick, [s.slot_id]: e.target.value })}>
                          <option value="">—</option>
                          {tr.guardians.map((g) => (
                            <option key={g.parent_id} value={g.parent_id}>{g.guardian} ({g.children})</option>
                          ))}
                        </Select>
                        <button type="button" data-ptm-book disabled={busy || !pick[s.slot_id]} className={TAP} onClick={() => void send(`/api/app/ptm/${m.ptm_id}`, { action: 'book', slotId: s.slot_id, parentId: pick[s.slot_id] }, (r) => t(r.moved ? 'ptm.moved' : 'ptm.booked'))}>
                          {t('ptm.slot.book')}
                        </button>
                      </div>
                    )}
                    {s.booking && m.status !== 'cancelled' && open.hasBegun && s.booking.attended === null && (
                      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end">
                        <Input id={`ptm-note-${s.slot_id}`} label={t('ptm.note')} maxLength={500} value={notes[s.slot_id] ?? ''} onChange={(e) => setNotes({ ...notes, [s.slot_id]: e.target.value })} />
                        {[true, false].map((came) => (
                          <button key={String(came)} type="button" data-ptm-attend={came ? 'yes' : 'no'} disabled={busy} className={TAP} onClick={() => void send(`/api/app/ptm/${m.ptm_id}`, { action: 'attend', bookingId: s.booking?.booking_id, attended: came, note: notes[s.slot_id] ?? '' }, () => t('ptm.marked'))}>
                            {t(came ? 'ptm.came' : 'ptm.didNotCome')}
                          </button>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
