'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { TeachEmpty } from '@/components/app-ui/TeachEmpty';
import { useT } from '@/components/app-shell/LangContext';
import { useOffline } from '@/components/app-shell/OfflineContext';
import type { Operation } from '@/lib/offline/outbox';
import { ATTENDANCE_MARK, CLASSES_KEY, differencesKey, rosterKey, type AttendanceMark, type Difference, type KeptRoster, type KeptRosterRow, type MarkStatus } from '@/lib/offline/attendance-sender';
import { indiaDate } from '@/lib/time/india';

// Mirrors src/lib/attendance/attendance.ts (FREE_EDIT_WINDOW_MINUTES,
// ATTENDANCE_STATUSES, LEAVE_CODES) for display only -- that module pulls in
// the `pg` driver (server-only) and must never be imported at runtime from
// a client component. test/attendance/phone.test.ts keeps the two the same.
const FREE_EDIT_WINDOW_MINUTES_DISPLAY = 10;
export const STATUSES = ['present', 'absent', 'late', 'leave'] as const;
export const LEAVE_CODES_DISPLAY = ['sick', 'family', 'school_activity', 'other'] as const;

type ClassOption = { class_id: string; name: string };
type Draft = Record<string, { status: MarkStatus; leaveCode: string | null }>;

const STATUS_VARIANT: Record<MarkStatus, 'success' | 'danger' | 'warning' | 'neutral'> = {
  present: 'success',
  absent: 'danger',
  late: 'warning',
  leave: 'neutral',
};
const TAP = 'min-h-[48px] rounded-md border px-3 text-sm font-semibold';

// 04_SYSTEM_DESIGN_PRD.md Sec3.2's primary capture mode: everyone
// defaults to present, the teacher taps only the exceptions, then submits
// once. On a phone this works with no network (docs/20 §4, C144): the
// class list and the roster are the last ones loaded on this phone, the
// submission waits in the outbox and is sent once when the network returns.
// A saved mark is changed through a correction (PATCH), which needs the
// network.
// `office`: the principal or school admin, who can add students and record consent.
export function AttendanceView({ canManage, initialClassId, office = false }: { canManage: boolean; initialClassId?: string; office?: boolean }) {
  const { t, tCount, lang } = useT();
  const { ready, online, store, sync, queue, operations, retry, remove } = useOffline();
  const toast = useToast();
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [classId, setClassId] = useState(initialClassId ?? '');
  const [roster, setRoster] = useState<KeptRosterRow[]>([]);
  const [rosterDate, setRosterDate] = useState('');
  const [source, setSource] = useState<'server' | 'phone' | 'none' | 'failed'>('server');
  const [draft, setDraft] = useState<Draft>({});
  const [waiting, setWaiting] = useState<Draft>({});
  const [failed, setFailed] = useState<Operation<AttendanceMark>[]>([]);
  const [differences, setDifferences] = useState<Difference[]>([]);
  const [correctTarget, setCorrectTarget] = useState<{ row: KeptRosterRow; status: MarkStatus; leaveCode: string | null; own?: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const openedAt = useRef(0);
  const reloadWhenSaved = useRef(false);

  const statusWord = (s: MarkStatus) => t(`att.status.${s}`);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        const res = await fetch('/api/app/classes');
        const body = await res.json();
        if (!res.ok) throw new Error('not loaded');
        const list = ((body.classes ?? []) as ClassOption[]).map((c) => ({ class_id: c.class_id, name: c.name }));
        setClasses(list);
        await store?.put(CLASSES_KEY, list).catch(() => undefined);
      } catch {
        setClasses((await store?.get<ClassOption[]>(CLASSES_KEY).catch(() => undefined)) ?? []);
      }
    })();
  }, [ready, store]);

  // What this phone still holds for the class: marks waiting to be sent,
  // submissions that were refused, and marks the server already had differently.
  const loadPhoneState = useCallback(
    async (id: string, date: string) => {
      const ops = (await operations().catch(() => [])).filter((o) => o.kind === ATTENDANCE_MARK) as Operation<AttendanceMark>[];
      const queued: Draft = {};
      for (const op of ops) {
        if (op.state !== 'waiting' || op.payload.classId !== id || op.forDate !== date) continue;
        for (const e of op.payload.entries) queued[e.studentId] = { status: e.status, leaveCode: e.leaveCode ?? null };
      }
      setWaiting(queued);
      setFailed(ops.filter((o) => o.state === 'failed'));
      setDifferences((await store?.get<Difference[]>(differencesKey(id, date)).catch(() => undefined)) ?? []);
    },
    [operations, store]
  );

  const loadRoster = useCallback(
    async (id: string) => {
      setLoading(true);
      let kept: KeptRoster | undefined;
      let from: typeof source = 'server';
      try {
        const res = await fetch(`/api/app/attendance?classId=${id}`);
        const body = await res.json();
        if (!res.ok) {
          from = 'failed';
        } else {
          kept = { date: body.date, roster: body.roster };
          // The phone keeps names and roll numbers for the day, no more (docs/20 §4).
          await store?.put(rosterKey(id), { date: kept.date, roster: kept.roster.map((r) => ({ ...r, admission_no: '' })) } satisfies KeptRoster).catch(() => undefined);
        }
      } catch {
        // No network: the list as last loaded on this phone, if it is today's.
        const onPhone = await store?.get<KeptRoster>(rosterKey(id)).catch(() => undefined);
        if (onPhone && onPhone.date === indiaDate()) {
          kept = onPhone;
          from = 'phone';
        } else {
          from = 'none';
          if (onPhone) await store?.delete(rosterKey(id)).catch(() => undefined); // another day's list is not kept
        }
      }
      const rows = kept?.roster ?? [];
      const date = kept?.date ?? indiaDate();
      setSource(from);
      setRoster(rows);
      setRosterDate(date);
      const next: Draft = {};
      for (const row of rows) if (!row.status) next[row.student_id] = { status: 'present', leaveCode: null };
      setDraft(next);
      await loadPhoneState(id, date);
      openedAt.current = Date.now();
      setLoading(false);
    },
    [store, loadPhoneState]
  );

  useEffect(() => {
    if (classId && ready) void loadRoster(classId);
  }, [classId, ready, loadRoster]);

  // When what waited has been sent, show what the server now holds.
  useEffect(() => {
    if (!classId || !ready) return;
    if (sync.state === 'saved' && reloadWhenSaved.current) {
      reloadWhenSaved.current = false;
      void loadRoster(classId);
    } else if (sync.state !== 'saved') {
      reloadWhenSaved.current = true;
      void loadPhoneState(classId, rosterDate || indiaDate());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sync.state]);

  const toMark = roster.filter((r) => !r.status && !waiting[r.student_id]);
  const markOf = (id: string) => draft[id] ?? { status: 'present' as MarkStatus, leaveCode: null };
  const counts = STATUSES.map((s) => [s, toMark.filter((r) => markOf(r.student_id).status === s).length] as const);

  async function handleSubmit() {
    if (submitting || toMark.length === 0) return;
    setSubmitting(true);
    const mark: AttendanceMark = {
      classId,
      entries: toMark.map((r) => ({ studentId: r.student_id, status: markOf(r.student_id).status, leaveCode: markOf(r.student_id).status === 'leave' ? markOf(r.student_id).leaveCode ?? 'other' : null })),
      secondsToMark: openedAt.current ? Math.round((Date.now() - openedAt.current) / 1000) : null,
    };
    reloadWhenSaved.current = true;
    const op = await queue(ATTENDANCE_MARK, rosterDate || indiaDate(), mark).catch(() => null);
    if (!op) {
      // The phone refused to keep anything: send it directly, with its own id all the same.
      const res = await fetch('/api/app/attendance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...mark, operationId: crypto.randomUUID(), forDate: rosterDate || indiaDate() }) }).catch(() => null);
      setSubmitting(false);
      if (!res?.ok) {
        toast.show(t('att.submit.failed'), 'danger');
        return;
      }
      toast.show(tCount('att.submitted', mark.entries.length), 'success');
      void loadRoster(classId);
      return;
    }
    await loadPhoneState(classId, rosterDate || indiaDate());
    setSubmitting(false);
    toast.show(online ? tCount('att.submitted', mark.entries.length) : t('att.queued'), 'success');
  }

  async function handleCorrect(row: KeptRosterRow, status: MarkStatus, leaveCode: string | null, note?: string, attendanceId?: string) {
    const id = attendanceId ?? row.attendance_id;
    if (!online || !id) {
      toast.show(t('att.correct.needsNetwork'), 'danger');
      return;
    }
    const res = await fetch(`/api/app/attendance/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, leaveCode, note }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => ({}))) ?? {};
    if (!res?.ok) {
      if (body.noteRequired) {
        setCorrectTarget({ row, status, leaveCode }); // the reason is asked below
        return;
      }
      toast.show(res ? t('att.correct.failed') : t('att.correct.needsNetwork'), 'danger');
      return;
    }
    toast.show(t('att.corrected'), 'success');
    setCorrectTarget(null);
    await settleDifference(row.student_id);
    void loadRoster(classId);
  }

  async function settleDifference(studentId: string) {
    const left = differences.filter((d) => d.studentId !== studentId);
    if (left.length === differences.length) return;
    setDifferences(left);
    const key = differencesKey(classId, rosterDate);
    await (left.length ? store?.put(key, left) : store?.delete(key))?.catch(() => undefined);
  }

  const nameOf = (studentId: string) => roster.find((r) => r.student_id === studentId)?.name ?? '';
  const className = (id: string) => classes.find((c) => c.class_id === id)?.name ?? '';

  return (
    <section lang={lang} className="flex flex-col gap-4">
      <div className="max-w-xs">
        <Select id="attendance-class" label={t('att.class')} value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="">{t('att.class.choose')}</option>
          {classes.map((c) => (
            <option key={c.class_id} value={c.class_id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>

      {failed.length > 0 && (
        <div role="alert" data-attendance-failed className="flex flex-col gap-2 rounded-md border border-red-800/30 bg-white p-3 text-sm text-slate">
          <p className="font-semibold text-red-800">{t('att.failed.title')}</p>
          {failed.map((op) => (
            <div key={op.id} className="flex flex-wrap items-center gap-2">
              <p className="min-w-0 flex-1">{t(op.reason === 'day_passed' ? 'att.failed.day_passed' : 'att.failed.other', { date: op.forDate, class: className(op.payload.classId) })}</p>
              {op.reason !== 'day_passed' && (
                <button type="button" className={`${TAP} border-slate/20 text-slate`} onClick={() => void retry(op.id)}>
                  {t('att.failed.retry')}
                </button>
              )}
              <button type="button" className={`${TAP} border-slate/20 text-slate`} onClick={() => void remove(op.id).then(() => loadPhoneState(classId, rosterDate))}>
                {t('att.failed.remove')}
              </button>
            </div>
          ))}
        </div>
      )}

      {loading && (
        <p role="status" className="text-sm text-slate/70">
          {t('att.loading')}
        </p>
      )}

      {!loading && classId && roster.length > 0 && (source === 'phone' || !online) && (
        <p role="status" data-attendance-offline className="rounded-md bg-tangerine/10 px-3 py-2 text-sm font-semibold text-slate">
          {t('att.offline.roster')}
        </p>
      )}

      {!loading && classId && differences.length > 0 && (
        <div role="alert" data-attendance-differences className="flex flex-col gap-2 rounded-md border border-tangerine/40 bg-tangerine/10 p-3 text-sm text-slate">
          <p className="font-semibold">{t('att.diff.title')}</p>
          {differences.map((d) => (
            <div key={d.studentId} className="flex flex-wrap items-center gap-2">
              <p className="min-w-0 flex-1">{t('att.diff.text', { name: nameOf(d.studentId), saved: statusWord(d.saved), yours: statusWord(d.yours) })}</p>
              <button type="button" className={`${TAP} border-slate/20 bg-white text-slate`} onClick={() => void settleDifference(d.studentId)}>
                {t('att.diff.keep')}
              </button>
              <button
                type="button"
                className={`${TAP} border-slate/20 bg-white text-slate`}
                onClick={() => {
                  const row = roster.find((r) => r.student_id === d.studentId);
                  if (row) setCorrectTarget({ row: { ...row, attendance_id: d.attendanceId }, status: d.yours, leaveCode: d.yours === 'leave' ? 'other' : null, own: true });
                }}
              >
                {t('att.diff.mine')}
              </button>
            </div>
          ))}
        </div>
      )}

      {!loading && classId && roster.length > 0 && (
        <>
          {roster.some((r) => r.consent_pending) && <p className="text-sm text-slate/70">{t('att.consentPending.hint')}</p>}
          {canManage && toMark.length > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                data-present-all
                className={`${TAP} border-sapphire bg-white text-sapphire`}
                onClick={() => setDraft(Object.fromEntries(toMark.map((r) => [r.student_id, { status: 'present' as MarkStatus, leaveCode: null }])))}
              >
                {t('att.presentAll')}
              </button>
              <p role="status" className="text-sm text-slate/70">
                {counts.map(([s, c]) => `${statusWord(s)}: ${c}`).join(' · ')}
              </p>
            </div>
          )}
          <ul className="flex flex-col gap-2">
            {roster.map((row) => {
              const queued = waiting[row.student_id];
              const isUnmarked = !row.status && !queued;
              const current: MarkStatus = row.status ?? queued?.status ?? markOf(row.student_id).status;
              return (
                <li key={row.student_id} data-student-row className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate/10 p-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate">{row.name}</p>
                    <p className="text-xs text-slate/70">{[row.roll_no ? `${t('att.roll')} ${row.roll_no}` : '', row.admission_no].filter(Boolean).join(' · ')}</p>
                    {row.consent_pending && (
                      <Badge variant="warning" data-consent-pending>
                        {t('att.consentPending')}
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {!isUnmarked && <Badge variant={STATUS_VARIANT[current]}>{statusWord(current)}</Badge>}
                    {queued && !row.status && (
                      <span data-waiting className="text-xs font-semibold text-slate/70">
                        {t('att.waiting')}
                      </span>
                    )}
                    {canManage && isUnmarked && (
                      <div className="flex flex-wrap gap-1" role="group" aria-label={row.name}>
                        {STATUSES.map((s) => (
                          <button
                            key={s}
                            type="button"
                            aria-pressed={current === s}
                            onClick={() => setDraft((d) => ({ ...d, [row.student_id]: { status: s, leaveCode: s === 'leave' ? d[row.student_id]?.leaveCode ?? 'sick' : null } }))}
                            className={`${TAP} ${current === s ? 'border-sapphire bg-sapphire/10 text-sapphire' : 'border-slate/10 text-slate hover:bg-slate/5'}`}
                          >
                            {statusWord(s)}
                          </button>
                        ))}
                        {current === 'leave' && (
                          <select
                            aria-label={t('att.leave.why')}
                            value={markOf(row.student_id).leaveCode ?? 'sick'}
                            onChange={(e) => setDraft((d) => ({ ...d, [row.student_id]: { status: 'leave', leaveCode: e.target.value } }))}
                            className="min-h-[48px] rounded-md border border-slate/20 bg-white px-2 text-sm text-slate"
                          >
                            {LEAVE_CODES_DISPLAY.map((c) => (
                              <option key={c} value={c}>
                                {t(`att.leave.${c}`)}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    )}
                    {canManage && row.status && row.locked && <span className="text-xs text-slate/70">{t('att.locked')}</span>}
                    {canManage && row.status && !row.locked && row.attendance_id && (
                      <div className="flex flex-wrap gap-1">
                        {STATUSES.filter((s) => s !== current).map((s) => (
                          <button key={s} type="button" onClick={() => handleCorrect(row, s, s === 'leave' ? 'other' : null)} className={`${TAP} border-slate/10 text-slate hover:bg-slate/5`}>
                            {t('att.change', { status: statusWord(s) })}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {canManage && toMark.length > 0 && (
            <button type="button" onClick={handleSubmit} disabled={submitting} data-submit-attendance className="min-h-[48px] self-start rounded-md bg-sapphire px-6 text-sm font-semibold text-white hover:bg-sapphire/90 disabled:opacity-60">
              {tCount('att.submit', toMark.length)}
            </button>
          )}
        </>
      )}

      {!loading && classId && roster.length === 0 && source === 'none' && (
        <p role="status" data-attendance-offline className="rounded-md bg-tangerine/10 px-3 py-2 text-sm font-semibold text-slate">
          {t('att.offline.noRoster')}
        </p>
      )}
      {!loading && classId && roster.length === 0 && source !== 'none' && (source === 'failed' ? <TeachEmpty id="not-loaded" /> : office ? <TeachEmpty id="attendance-roster" href="/app/students" /> : <TeachEmpty id="attendance-roster-view" />)}

      <Modal open={correctTarget !== null} onClose={() => setCorrectTarget(null)} title={t('att.note.title')}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const note = new FormData(e.currentTarget).get('note');
            if (correctTarget && typeof note === 'string') {
              void handleCorrect(correctTarget.row, correctTarget.status, correctTarget.leaveCode, note, correctTarget.row.attendance_id ?? undefined);
            }
          }}
          className="flex flex-col gap-3"
        >
          <p className="text-sm text-slate/70">
            {correctTarget?.own
              ? t('att.note.text.own', { status: correctTarget ? statusWord(correctTarget.status) : '' })
              : t('att.note.text', { minutes: FREE_EDIT_WINDOW_MINUTES_DISPLAY, status: correctTarget ? statusWord(correctTarget.status) : '' })}
          </p>
          <Input id="note" name="note" label={t('att.note.label')} required />
          <button type="submit" className="min-h-[48px] rounded-md bg-sapphire px-4 text-sm font-semibold text-white">
            {t('att.note.save')}
          </button>
        </form>
      </Modal>
    </section>
  );
}
