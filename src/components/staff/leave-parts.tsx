'use client';

import Link from 'next/link';
import { useT } from '@/components/app-shell/LangContext';
import { Badge } from '@/components/ui/Badge';
import { explainError } from '@/lib/errors/catalogue';
import type { MessageKey } from '@/lib/i18n';
import { LEAVE_BACK_DAYS, LEAVE_KINDS, LEAVE_MAX_DAYS, LEAVE_TEXT_MAX, type LeaveRow } from '@/lib/staff/leave-rules';

// The parts "My leave" (the account page) and the office's leave lists (Staff) share (C201): how a day and a
// request are said, and one request drawn the same way on both screens.

const REFUSALS = ['dates', 'past', 'too_far', 'too_long', 'kind', 'reason', 'overlap', 'person', 'elsewhere', 'own', 'decided', 'note', 'begun', 'not_approved', 'closed'];
export const TAP = 'min-h-[44px] rounded-md border border-slate/20 px-4 text-sm font-semibold text-slate disabled:opacity-60';
export const PRIMARY = 'min-h-[44px] rounded-md bg-sapphire px-5 text-sm font-semibold text-white disabled:opacity-60';
export const FIELD = 'min-h-[44px] rounded-md border border-slate/20 bg-white px-3 text-sm text-slate';
export const BOX = 'flex flex-col gap-3 rounded-lg border border-slate/10 bg-white p-4';
export type LeaveNote = { ok: boolean; text: string } | null;

// Who decides this person's own request, as the line under "My leave" says it. Nobody decides their own, so the only
// person in a school's office is told that nobody can decide theirs yet, and how that changes.
export const myLeaveHow = (who: { office: boolean; alone: boolean }): MessageKey => (who.alone ? 'leave.my.howAlone' : who.office ? 'leave.my.howOffice' : 'leave.my.how');
// The same on Staff, under an office person's own waiting request.
export const ownRequestLine = (alone: boolean): MessageKey => (alone ? 'leave.office.ownAlone' : 'leave.office.own');

export function useLeaveWords() {
  const { t, tCount, lang } = useT();
  const locale = lang === 'hi' ? 'hi-IN' : 'en-IN';
  // A leave day has no time of day: it is said as the calendar day it is.
  const dayWords = new Intl.DateTimeFormat(locale, { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const stampWords = new Intl.DateTimeFormat(locale, { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' });
  const day = (iso: string) => dayWords.format(new Date(`${iso}T00:00:00Z`));
  return {
    t,
    tCount,
    lang,
    day,
    stamp: (at: string | null) => (at ? stampWords.format(new Date(at)) : ''),
    dates: (r: Pick<LeaveRow, 'from_date' | 'to_date'>) => (r.from_date === r.to_date ? day(r.from_date) : t('leave.range', { from: day(r.from_date), to: day(r.to_date) })),
    // What the server refused, in the person's language: leave's own reasons from the message files; a standard
    // refusal (a read-only school, a role that may not) from the error catalogue; anything else said plainly.
    refusal: (body: unknown, status?: number) => {
      const code = (body as { code?: unknown } | null)?.code;
      if (typeof code === 'string' && REFUSALS.includes(code)) return t(`leave.err.${code}` as MessageKey, { days: code === 'past' ? LEAVE_BACK_DAYS : LEAVE_MAX_DAYS, max: LEAVE_TEXT_MAX });
      return explainError(body, t('leave.err.other'), lang, status);
    },
  };
}

// The Help Center guide for leave, in the person's language. The page's own "Show me how" stays the guide for
// the screen's first task (signing in, a reset code); this one sits with the leave it explains.
export function LeaveGuideLink() {
  const { t, lang } = useT();
  return (
    <Link
      lang={lang}
      href={`/app/help/staff-leave${lang === 'hi' ? '?lang=hi' : ''}`}
      data-leave-guide
      className="inline-flex min-h-[44px] items-center rounded-md px-2 text-sm font-semibold text-sapphire underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal print:hidden"
    >
      {t('leave.guide')}
    </Link>
  );
}

export function LeaveNoteLine({ note }: { note: LeaveNote }) {
  if (!note) return null;
  return (
    <p role="status" data-leave-note={note.ok ? 'ok' : 'refused'} className={`rounded-md px-3 py-2 font-semibold ${note.ok ? 'bg-off-white text-slate' : 'border border-red-800/30 text-red-800'}`}>
      {note.text}
    </p>
  );
}

export function LeaveKindSelect({ id, value, onChange }: { id: string; value: string; onChange: (kind: string) => void }) {
  const { t } = useT();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-slate">{t('leave.kind')}</label>
      <select id={id} className={FIELD} value={value} onChange={(e) => onChange(e.target.value)}>
        {LEAVE_KINDS.map((k) => (
          <option key={k} value={k}>{t(`leave.kind.${k}` as MessageKey)}</option>
        ))}
      </select>
    </div>
  );
}

// One request: its state, days, kind and reason, then what was answered and by whom. `showName`: the office's
// lists name the person; "My leave" does not need to.
export function LeaveSummary({ r, showName }: { r: LeaveRow; showName: boolean }) {
  const { t, tCount, stamp, dates } = useLeaveWords();
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={r.status === 'approved' ? 'success' : r.status === 'waiting' ? 'warning' : r.status === 'refused' ? 'danger' : 'neutral'}>{t(`leave.status.${r.status}` as MessageKey)}</Badge>
        {showName && <span className="font-bold">{r.name}</span>}
        <span className={showName ? '' : 'font-bold'}>{dates(r)}</span>
        <span className="text-slate/70">{`${tCount('leave.days', r.days)} · ${t(`leave.kind.${r.kind}` as MessageKey)}`}</span>
      </div>
      <p className="whitespace-pre-wrap break-words">{r.reason}</p>
      <p className="text-slate/70">{r.byOffice ? t('leave.byOffice', { name: r.recorded_by }) : t('leave.askedOn', { date: stamp(r.asked_at) })}</p>
      {r.status === 'waiting' && <p className="text-slate/70">{t('leave.answer.waiting')}</p>}
      {r.decided_at && !r.byOffice && <p data-leave-answer className="font-semibold">{t(r.status === 'refused' ? 'leave.answer.refused' : 'leave.answer.approved', { name: r.decided_by ?? '', date: stamp(r.decided_at) })}</p>}
      {r.decision_note && <p className="whitespace-pre-wrap break-words">{t('leave.answer.note', { note: r.decision_note })}</p>}
      {r.withdrawn_at && <p className="font-semibold">{r.withdrawnByOffice ? t('leave.answer.cancelled', { date: stamp(r.withdrawn_at), note: r.withdrawn_note ?? '' }) : t('leave.answer.withdrawn', { date: stamp(r.withdrawn_at) })}</p>}
    </>
  );
}
