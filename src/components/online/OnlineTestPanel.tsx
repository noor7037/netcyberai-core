'use client';

import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { momentWords, numberWords } from '@/components/exams/exam-format';
import { FIELD, PRIMARY, TAP } from '@/components/exams/SchemeParts';
import { ask, childLine, type Reply } from '@/components/marking/parts';
import { Badge } from '@/components/ui/Badge';
import { Checkbox } from '@/components/ui/Checkbox';
import { Icon } from '@/components/visual/Icons';
import { ONLINE_MINUTES_MAX, ONLINE_MINUTES_MIN, type OnlineAttemptRow, type OnlineTestScreen } from '@/lib/contracts/marking';
import { isMessageKey, type MessageKey } from '@/lib/i18n';
import { isoToIndiaLocal } from '@/lib/online/time';

// A paper's online test, on its marking hub (AQ-4, C365): sit the paper online, set when the test opens and closes, the
// minutes and the shuffle, open it to the class and close it; then the class in roll order, each child's attempt as a
// word (not started, sitting now, submitted, time ran out, set aside) and how often they left the test screen. Never a
// mark or a rank here: scripts are marked and approved in the review below, and families see results at publication.
// The server and the database decide who may do what; this screen only shows it. While the test is open it asks again
// every so often.

const REFRESH_MS = 15_000;
const STATE_KEYS: Record<OnlineAttemptRow['state'], MessageKey> = {
  not_started: 'online.state.not_started',
  open: 'online.state.open',
  submitted: 'online.state.submitted',
  timed_out: 'online.state.timed_out',
  voided: 'online.state.voided',
};

export function OnlineTestPanel({ paperId, onChanged }: { paperId: string; onChanged?: () => void }) {
  const { t, lang } = useT();
  const [screen, setScreen] = useState<OnlineTestScreen | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [form, setForm] = useState<{ opensAt: string; closesAt: string; minutes: string; shuffle: boolean } | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'close' } | { kind: 'void'; studentId: string; name: string } | null>(null);

  const load = useCallback(async () => {
    const r = await ask('GET', `/api/app/marking/papers/${paperId}/online`);
    if (r.ok) {
      setScreen(r.body as unknown as OnlineTestScreen);
      setFailed(false);
    } else setFailed(true);
  }, [paperId]);
  useEffect(() => {
    void load();
  }, [load]);

  const open = !!screen?.test?.openedAt && !screen.test.closedAt;
  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => {
      if (!document.hidden) void load();
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [open, load]);

  // The form starts from what is saved, else from the paper's day: the next hour, for an hour, 30 minutes.
  useEffect(() => {
    if (!screen || form) return;
    const test = screen.test;
    const start = new Date(Math.ceil(Date.now() / 3_600_000) * 3_600_000).toISOString();
    setForm({
      opensAt: isoToIndiaLocal(test?.opensAt ?? start),
      closesAt: isoToIndiaLocal(test?.closesAt ?? new Date(new Date(start).getTime() + 3_600_000).toISOString()),
      minutes: String(test?.minutes ?? 30),
      shuffle: test?.shuffle ?? false,
    });
  }, [screen, form]);

  const refused = (r: Reply) => {
    const code = typeof r.body?.code === 'string' ? r.body.code : typeof r.body?.error === 'string' && r.status === 403 ? 'not_allowed' : '';
    const key = `online.err.${code}`;
    return isMessageKey(key) ? t(key) : t('online.err.other');
  };
  const act = async (body: Record<string, unknown>, done: MessageKey | null) => {
    setBusy(true);
    setNote(null);
    setConfirm(null);
    const r = await ask('POST', `/api/app/marking/papers/${paperId}/online`, body);
    setBusy(false);
    if (!r.ok) return setNote({ ok: false, text: refused(r) });
    setScreen(r.body as unknown as OnlineTestScreen);
    setNote(done ? { ok: true, text: t(done) } : null);
    onChanged?.();
  };

  if (failed) return <p role="alert" className="rounded-md bg-off-white px-3 py-2 text-sm text-slate">{t('online.loadFailed')}</p>;
  if (!screen || screen.sitting === 'bubble') return null;

  const { test, attempts, mayChange } = screen;
  const started = attempts.filter((a) => a.state !== 'not_started').length;
  const fixed = started > 0;
  const finished = attempts.filter((a) => a.state === 'submitted' || a.state === 'timed_out').length;
  const now = new Date(screen.now).getTime();
  const status: { key: MessageKey; variant: 'neutral' | 'success' | 'warning'; when?: string } = !test?.openedAt
    ? { key: 'online.status.draft', variant: 'warning' }
    : test.closedAt || new Date(test.closesAt).getTime() <= now
      ? { key: 'online.status.closed', variant: 'neutral' }
      : new Date(test.opensAt).getTime() > now
        ? { key: 'online.status.upcoming', variant: 'neutral', when: momentWords(test.opensAt, lang) }
        : { key: 'online.status.open', variant: 'success', when: momentWords(test.closesAt, lang) };

  if (screen.sitting !== 'online') {
    // A paper already marked from its scripts is sat as it was: nothing to offer here.
    if (screen.scripts > 0 || !mayChange) return null;
    return (
      <section data-online-test="written" className="flex flex-col gap-2 rounded-md border border-slate/10 bg-off-white p-3">
        <h3 className="text-base font-bold">{t('online.title')}</h3>
        <p className="text-slate/80">{t('online.lead')}</p>
        {note && <p role="status" className={`font-semibold ${note.ok ? 'text-slate' : 'text-red-800'}`}>{note.text}</p>}
        <button type="button" data-online-sit className={`${TAP} self-start`} disabled={busy} onClick={() => void act({ action: 'sitting', sitting: 'online' }, 'online.sittingOnline')}>
          {t('online.sitOnline')}
        </button>
        <p className="text-slate/70">{t('online.sitFixed')}</p>
      </section>
    );
  }

  const minutes = Number(form?.minutes);
  const minutesOk = Number.isInteger(minutes) && minutes >= ONLINE_MINUTES_MIN && minutes <= ONLINE_MINUTES_MAX;
  const editable = mayChange && !fixed && !test?.closedAt;

  return (
    <section data-online-test={test?.openedAt ? (test.closedAt ? 'closed' : 'open') : 'draft'} className="flex flex-col gap-3 rounded-md border border-slate/10 p-3" aria-labelledby="online-test-title">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id="online-test-title" className="text-base font-bold">{t('online.title')}</h3>
        <Badge variant={status.variant}>{t(status.key, { when: status.when ?? '' })}</Badge>
      </div>
      <p className="text-slate/80">{t('online.sittingOnline')}</p>
      {note && (
        <p role="status" data-online-note={note.ok ? 'ok' : 'error'} className={`rounded-md px-3 py-2 font-semibold ${note.ok ? 'bg-off-white text-slate' : 'border border-red-800/30 text-red-800'}`}>
          {note.text}
        </p>
      )}

      {test && !editable && (
        <p data-online-window>{t('online.window', { opens: momentWords(test.opensAt, lang), closes: momentWords(test.closesAt, lang), minutes: numberWords(test.minutes, lang) })}</p>
      )}
      {test?.openedAt && <p className="text-slate/70">{t('online.openedBy', { name: test.openedBy ?? '', when: momentWords(test.openedAt, lang) })}</p>}
      {test?.closedAt && <p className="text-slate/70">{t('online.closedBy', { name: test.closedBy ?? '', when: momentWords(test.closedAt, lang) })}</p>}

      {editable && form && (
        <form
          data-online-form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            void act({ action: 'save', opensAt: form.opensAt, closesAt: form.closesAt, minutes, shuffle: form.shuffle }, 'online.saved');
          }}
        >
          <label className="flex flex-col gap-1 font-semibold">
            {t('online.opens')}
            <input type="datetime-local" className={FIELD} required value={form.opensAt} onChange={(e) => setForm({ ...form, opensAt: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 font-semibold">
            {t('online.closes')}
            <input type="datetime-local" className={FIELD} required value={form.closesAt} onChange={(e) => setForm({ ...form, closesAt: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 font-semibold">
            {t('online.minutes')}
            <input type="number" inputMode="numeric" min={ONLINE_MINUTES_MIN} max={ONLINE_MINUTES_MAX} step={1} className={FIELD} required value={form.minutes} aria-describedby="online-minutes-how" onChange={(e) => setForm({ ...form, minutes: e.target.value })} />
            <span id="online-minutes-how" className="text-xs font-normal text-slate/70">{t('online.minutesHow')}</span>
          </label>
          <div className="flex items-end">
            <Checkbox id={`online-shuffle-${paperId}`} label={t('online.shuffle')} checked={form.shuffle} onChange={(e) => setForm({ ...form, shuffle: e.target.checked })} />
          </div>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button type="submit" data-online-save className={TAP} disabled={busy || !minutesOk}>{t('online.save')}</button>
            {!test?.openedAt && started === 0 && screen.scripts === 0 && (
              <button type="button" data-online-written className={TAP} disabled={busy} onClick={() => void act({ action: 'sitting', sitting: 'written' }, null)}>
                {t('online.sitWritten')}
              </button>
            )}
          </div>
        </form>
      )}

      {mayChange && test && !test.openedAt && (
        <div className="flex flex-col gap-2">
          <p className="text-slate/70">{t('online.openHow')}</p>
          <button type="button" data-online-open className={`${PRIMARY} self-start`} disabled={busy} onClick={() => void act({ action: 'open' }, 'online.opened')}>
            {t('online.open')}
          </button>
        </div>
      )}
      {mayChange && test?.openedAt && !test.closedAt && (
        <button type="button" data-online-close className={`${TAP} self-start`} disabled={busy} onClick={() => setConfirm({ kind: 'close' })}>
          {t('online.close')}
        </button>
      )}
      {confirm && (
        <div role="group" aria-label={confirm.kind === 'close' ? t('online.close') : t('online.void')} data-online-confirm={confirm.kind} className="flex flex-col gap-2 rounded-md bg-off-white p-3">
          <p className="font-semibold">{confirm.kind === 'close' ? t('online.closeSure') : t('online.voidSure', { name: confirm.name })}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={PRIMARY}
              disabled={busy}
              onClick={() => void (confirm.kind === 'close' ? act({ action: 'close' }, 'online.closed') : act({ action: 'void', studentId: confirm.studentId }, 'online.voided'))}
            >
              {confirm.kind === 'close' ? t('online.closeYes') : t('online.voidYes')}
            </button>
            <button type="button" className={TAP} onClick={() => setConfirm(null)}>{t('online.cancel')}</button>
          </div>
        </div>
      )}

      {test?.openedAt && (
        <div className="flex flex-col gap-2">
          <h4 className="font-bold">{t('online.class')}</h4>
          <p className="text-slate/70">{t('online.classHow')}</p>
          <p data-online-counts>{t('online.counts', { started: numberWords(started, lang), all: numberWords(attempts.length, lang), done: numberWords(finished, lang) })}</p>
          <ul data-online-attempts className="flex flex-col divide-y divide-slate/10 rounded-md border border-slate/10">
            {attempts.map((a) => (
              <li key={a.student.studentId} data-online-attempt={a.state} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span className="min-w-0 break-words font-semibold">{childLine(a.student)}</span>
                <span className="flex flex-wrap items-center gap-2">
                  <Badge variant={a.state === 'submitted' ? 'success' : a.state === 'open' ? 'neutral' : a.state === 'timed_out' ? 'warning' : 'neutral'}>{t(STATE_KEYS[a.state])}</Badge>
                  {a.state !== 'not_started' && (
                    <span data-online-left={a.leftCount} className={a.leftCount > 0 ? 'font-semibold text-amber-text' : 'text-slate/70'}>
                      {a.leftCount === 0 ? t('online.leftNone') : a.leftCount === 1 ? t('online.leftOne') : t('online.left', { n: numberWords(a.leftCount, lang) })}
                    </span>
                  )}
                  {a.marked && <span className="text-slate/70">{t('online.marked')}</span>}
                  {mayChange && !a.marked && (a.state === 'open' || a.state === 'submitted' || a.state === 'timed_out') && (
                    <button type="button" data-online-void={a.student.studentId} className={TAP} disabled={busy} onClick={() => setConfirm({ kind: 'void', studentId: a.student.studentId, name: a.student.name })}>
                      {t('online.void')}
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="flex items-start gap-2 text-slate/70">
        <Icon name="info" className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        {t('online.noCamera')}
      </p>
    </section>
  );
}
