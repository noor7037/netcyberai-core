'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/family/ui/Button';
import type { GuardianPtm } from '@/lib/family/school';
import { fill, type Words } from '@/lib/family/fill';
import { ptmDay, ptmTime } from '@/lib/time/ptm-words';
import { familyApi } from './client';
import { SchoolText } from './SchoolText';

// The parent-teacher meeting of a school child's class (W20-E, H5), in the parent area's "Your school": the meeting, each
// teacher the parent may meet with their times as chips (free or taken, never by whom), Book and Cancel each with a
// confirm, the confirmation line and the reminder noted. Read and written as the link's guardian; nothing shows when the
// class has no meeting to come.

type Pending = { kind: 'book'; slotId: string; time: string; teacher: string } | { kind: 'cancel'; bookingId: string; time: string };

export function SchoolPtm({ w, lang, linkId, studentId }: { w: Words; lang: 'en' | 'hi'; linkId: string; studentId: string }) {
  const [meetings, setMeetings] = useState<GuardianPtm[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    const r = await familyApi<{ meetings: GuardianPtm[] }>(`/api/family/school/ptm?linkId=${encodeURIComponent(linkId)}&studentId=${encodeURIComponent(studentId)}`, 'GET');
    if (r.ok) setMeetings(r.data.meetings);
  }, [linkId, studentId]);
  useEffect(() => {
    void load();
  }, [load]);
  const go = async () => {
    if (!pending) return;
    setBusy(true);
    setError('');
    const r =
      pending.kind === 'book'
        ? await familyApi('/api/family/school/ptm/book', 'POST', { linkId, studentId, slotId: pending.slotId })
        : await familyApi('/api/family/school/ptm/cancel', 'POST', { linkId, bookingId: pending.bookingId });
    setBusy(false);
    if (!r.ok) setError(r.error === 'taken' ? w['fam.w20.ptm.err.taken'] : r.error === 'already_booked' ? w['fam.w20.ptm.err.already_booked'] : w['fam.w20.ptm.err.other']);
    setPending(null);
    await load();
  };
  if (meetings.length === 0) return null;
  return (
    <div className="flex flex-col gap-2" data-school-ptm>
      {meetings.map((m) => (
        <div key={m.ptmId} data-ptm-meeting={m.ptmId} className="flex flex-col gap-2 rounded-lg bg-slate/5 px-3 py-2 text-sm text-slate">
          <p className="text-sm font-semibold">
            {w['fam.w20.ptm.title']}: <SchoolText text={m.title} />
          </p>
          <p>{fill(w['fam.w20.ptm.when'], { date: ptmDay(m.heldOn, lang), from: ptmTime(m.startsAt, lang), to: ptmTime(m.endsAt, lang) })}</p>
          {m.teachers.map((t) => (
            <div key={t.teacherId} data-ptm-teacher={t.teacherId} className="flex flex-col gap-2">
              <p className="font-semibold">
                <SchoolText text={t.teacher} /> · {t.classTeacher ? w['fam.w20.ptm.classTeacher'] : w['fam.w20.ptm.subjectTeacher']}
              </p>
              {t.booking ? (
                <div className="flex flex-col gap-2">
                  <p role="status" data-ptm-booked className="font-semibold text-emerald-text">
                    {fill(w['fam.w20.ptm.booked'], { time: ptmTime(t.booking.time, lang), teacher: t.teacher })}
                  </p>
                  <p>{w['fam.w20.ptm.remindNote']}</p>
                  <Button type="button" variant="outline" disabled={busy} onClick={() => setPending({ kind: 'cancel', bookingId: t.booking!.bookingId, time: t.booking!.time })}>
                    {w['fam.w20.ptm.cancel']}
                  </Button>
                </div>
              ) : t.slots.some((s) => s.free) ? (
                <>
                  <p>{w['fam.w20.ptm.pick']}</p>
                  <ul className="flex flex-wrap gap-2">
                    {t.slots.map((s) => (
                      <li key={s.slotId}>
                        <button
                          type="button"
                          data-ptm-chip={s.free ? 'free' : 'taken'}
                          disabled={!s.free || busy}
                          aria-pressed={pending?.kind === 'book' && pending.slotId === s.slotId}
                          aria-label={s.free ? ptmTime(s.time, lang) : `${ptmTime(s.time, lang)} · ${w['fam.w20.ptm.taken']}`}
                          onClick={() => setPending({ kind: 'book', slotId: s.slotId, time: s.time, teacher: t.teacher })}
                          className={`fam-press min-h-[44px] min-w-[44px] rounded-xl px-3 text-base font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
                            !s.free ? 'cursor-not-allowed bg-slate/10 text-slate line-through' : pending?.kind === 'book' && pending.slotId === s.slotId ? 'bg-saffron text-ink' : 'border-2 border-ink bg-paper text-ink'
                          }`}
                        >
                          {ptmTime(s.time, lang)}
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p>{w['fam.w20.ptm.noFree']}</p>
              )}
            </div>
          ))}
        </div>
      ))}
      {pending && (
        <div role="dialog" aria-live="polite" data-ptm-confirm className="flex flex-col gap-2 rounded-lg bg-white p-3 text-sm text-slate ring-1 ring-slate/20">
          <p className="font-semibold">{pending.kind === 'book' ? fill(w['fam.w20.ptm.confirmBook'], { time: ptmTime(pending.time, lang), teacher: pending.teacher }) : fill(w['fam.w20.ptm.confirmCancel'], { time: ptmTime(pending.time, lang) })}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={busy} onClick={() => void go()}>
              {pending.kind === 'book' ? w['fam.w20.ptm.yesBook'] : w['fam.w20.ptm.yesCancel']}
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setPending(null)}>
              {w['fam.w20.ptm.keep']}
            </Button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm font-semibold text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}
