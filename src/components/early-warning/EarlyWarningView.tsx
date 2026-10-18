'use client';

import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { InfoTip } from '@/components/app-ui/InfoTip';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { ACTION_KINDS, ACTION_TEXT_MAX, CLOSED_SHOWN_DAYS, openEmptyState, type ClassCount, type EarlyWarningSettings, type Flag, type LastCheck, type MarksExam } from '@/lib/early-warning/rules';
import { explainError } from '@/lib/errors/catalogue';
import type { MessageKey } from '@/lib/i18n';

// Early Warning (v1: docs/26 slice 8j, C209; v2, the marks reason: docs/27 row 9f, C218).
//
// For the principal, the school admin and the academic coordinator: when the school was last checked and "Check
// now"; how many flags are open in each class; every open flag with its reasons, the evidence behind each, the
// rule and its version, what was done about it, and "Add what was done"; and the flags closed lately. For a
// teacher: the same list for the children of their own classes, which the database decides, with no "Check now".
//
// A flag is a reason to look, not a verdict. Every list is in the order of class and name: nothing here ranks a
// child, a class or a teacher. Nothing on this screen is sent to a parent.
//
// What the check could not look at is said, never passed over: the last check's line says for how many students
// attendance could be used, an empty list is an all-clear only when it could be used for all of them, and an
// attendance reason that a later check could not work out again says so on its flag.
//
// A marks reason names the child's latest exam with every paper entered and their own exam before it, each paper's
// percent, by how much the percent fell and the school's line, and the subjects below the pass mark: the child is
// compared only with themselves.

type Data = { mayCheck: boolean; ruleVersion: number; settings: EarlyWarningSettings | null; lastCheck: LastCheck | null; summary: ClassCount[]; open: Flag[]; closed: Flag[]; truncated: boolean };
type Draft = { kind: string; note: string; outcome: string };
const REFUSALS = ['kind', 'note', 'outcome', 'say_what', 'elsewhere'];
const TAP = 'min-h-[44px] rounded-md border border-slate/20 px-4 text-sm font-semibold text-slate disabled:opacity-60';
const PRIMARY = 'min-h-[44px] rounded-md bg-sapphire px-5 text-sm font-semibold text-white disabled:opacity-60';
const BOX = 'flex flex-col gap-3 rounded-lg border border-slate/10 bg-white p-4';
const SOFT = 'rounded-md bg-off-white px-3 py-2';
const WHY = 'inline-flex min-h-[44px] cursor-pointer items-center font-semibold text-sapphire underline';
const EMPTY = 'flex flex-col items-start gap-2 rounded-xl border border-dashed border-slate/20 bg-white p-4';

export function EarlyWarningView() {
  const { t, lang } = useT();
  const [data, setData] = useState<Data | null>(null);
  // What the server answered when the screen could not be read: said in the person's language when drawn.
  const [failed, setFailed] = useState<{ body: unknown; status?: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  // The flag whose "Add what was done" is open, and what has been typed for it.
  const [adding, setAdding] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({ kind: '', note: '', outcome: '' });

  const load = useCallback(async () => {
    const res = await fetch('/api/app/early-warning').catch(() => null);
    const got = res ? await res.json().catch(() => null) : null;
    if (res?.ok && got) {
      setData(got as Data);
      setFailed(null);
    } else setFailed({ body: got, status: res?.status });
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const locale = lang === 'hi' ? 'hi-IN' : 'en-IN';
  const stamp = new Intl.DateTimeFormat(locale, { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  const dayWords = new Intl.DateTimeFormat(locale, { timeZone: 'UTC', day: 'numeric', month: 'short' });
  const when = (at: string) => stamp.format(new Date(at));
  // A school day has no time of day: it is said as the calendar day it is.
  const day = (iso: string) => dayWords.format(new Date(`${iso}T00:00:00Z`));

  const refusal = (body: unknown, status?: number) => {
    const code = (body as { code?: unknown } | null)?.code;
    if (typeof code === 'string' && REFUSALS.includes(code)) return t(`ew.err.${code}` as MessageKey, { max: ACTION_TEXT_MAX });
    return explainError(body, t('ew.err.other'), lang, status);
  };
  // After a change, and after a refusal too, the screen is read again: it shows what is true now.
  const send = async (url: string, payload: unknown, done: (got: Record<string, number>) => string, after?: () => void) => {
    setBusy(true);
    setNote(null);
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => null);
    const got = res ? await res.json().catch(() => null) : null;
    if (res?.ok) {
      setNote({ ok: true, text: done(got ?? {}) });
      after?.();
    } else setNote({ ok: false, text: refusal(got, res?.status) });
    await load();
    setBusy(false);
  };

  if (failed && !data) {
    return (
      <p role="alert" data-early-warning="failed" className={`${SOFT} text-sm text-slate`}>
        {explainError(failed.body, t('ew.failed'), lang, failed.status)}
      </p>
    );
  }
  if (!data) return null;

  // How many subjects a marks reason found below the pass mark (a subject below in two parts is one subject).
  const belowCount = (f: Flag) => new Set(f.evidence.marks?.belowPass?.subjects.map((b) => b.paperId) ?? []).size;
  // One exam's papers and their percents, as the class result shows them.
  const papers = (exam: MarksExam) => (
    <ul className="flex flex-col gap-1 text-slate/70">
      {exam.papers.map((p) => (
        <li key={p.paperId} data-ew-marks-paper={exam.examId} className="break-words">
          {p.percent === null ? t('ew.why.marks.paper.none', { subject: p.subject }) : t('ew.why.marks.paper', { subject: p.subject, percent: p.percent })}
        </li>
      ))}
    </ul>
  );

  // One line a reason, in plain words: what was counted, never a judgement of the child.
  const lines = (f: Flag) => {
    const e = f.evidence;
    return (
      <ul className="flex flex-col gap-1">
        {e.attendance && !e.attendance.held && <li data-ew-line="attendance">{t('ew.line.attendance', { inSchool: e.attendance.present + e.attendance.late, counted: e.attendance.counted, from: day(e.attendance.from) })}</li>}
        {e.attendance?.held && <li data-ew-line="attendance">{t('ew.line.attendance.then', { inSchool: e.attendance.present + e.attendance.late, counted: e.attendance.counted, from: day(e.attendance.from), to: day(e.attendance.to) })}</li>}
        {e.attendance?.held && (
          <li data-ew-line="attendance-held" className="font-semibold">
            {t('ew.line.attendance.held', { on: day(e.attendance.held.on), from: day(e.attendance.held.from), counted: e.attendance.held.counted, min: e.attendance.held.minDays })}
          </li>
        )}
        {e.homework && <li data-ew-line="homework">{t(e.homework.notDone === 1 ? 'ew.line.homework.one' : 'ew.line.homework.other', { count: e.homework.notDone, from: day(e.homework.from) })}</li>}
        {e.needs_help && <li data-ew-line="needs_help">{t(e.needs_help.open.length === 1 ? 'ew.line.needs_help.one' : 'ew.line.needs_help.other', { count: e.needs_help.open.length })}</li>}
        {e.marks?.fell && e.marks.previous && (
          <li data-ew-line="marks-fell">{t('ew.line.marks.fell', { exam: e.marks.exam.name, now: e.marks.exam.percent, by: e.marks.fell.by, before: e.marks.previous.percent, previous: e.marks.previous.name })}</li>
        )}
        {e.marks?.belowPass && <li data-ew-line="marks-below">{t(belowCount(f) === 1 ? 'ew.line.marks.below.one' : 'ew.line.marks.below.other', { exam: e.marks.exam.name, count: belowCount(f) })}</li>}
      </ul>
    );
  };

  // "Why this?" (docs/21): each reason with the numbers and dates it rests on, the rule and its version, and when
  // the flag was opened and last checked.
  const why = (f: Flag) => {
    const e = f.evidence;
    return (
      <details data-ew-why={f.reasons.join(' ')} className="text-sm text-slate">
        <summary className={WHY}>{t('myDay.why')}</summary>
        <div className="flex flex-col gap-2 pb-2">
          {e.attendance && (
            <div data-ew-evidence="attendance" className="flex flex-col gap-1">
              <p className="font-semibold">{t('ew.reason.attendance')}</p>
              <p>{t('ew.why.attendance', { from: day(e.attendance.from), to: day(e.attendance.to), present: e.attendance.present, late: e.attendance.late, absent: e.attendance.absent, rate: e.attendance.rate, below: e.attendance.below, min: e.attendance.minDays })}</p>
              {e.attendance.leave > 0 && <p className="text-slate/70">{t('ew.why.attendance.leave', { leave: e.attendance.leave })}</p>}
              {e.attendance.absentDates.length > 0 && <p className="break-words text-slate/70">{t('ew.why.attendance.dates', { dates: e.attendance.absentDates.map(day).join(', ') })}</p>}
            </div>
          )}
          {e.homework && (
            <div data-ew-evidence="homework" className="flex flex-col gap-1">
              <p className="font-semibold">{t('ew.reason.homework')}</p>
              <p>{t('ew.why.homework', { from: day(e.homework.from), to: day(e.homework.to), count: e.homework.notDone, threshold: e.homework.threshold, days: e.homework.schoolDays })}</p>
              <ul className="flex flex-col gap-1 text-slate/70">
                {e.homework.missed.map((m, i) => (
                  <li key={i} className="break-words">
                    {t('ew.why.homework.item', { subject: m.subject, title: m.title, date: day(m.dueDate) })}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {e.needs_help && (
            <div data-ew-evidence="needs_help" className="flex flex-col gap-1">
              <p className="font-semibold">{t('ew.reason.needs_help')}</p>
              <ul className="flex flex-col gap-1">
                {e.needs_help.open.map((o, i) => (
                  <li key={i}>{t(o.source === 'parent_reply' ? 'ew.why.needs_help.parent_reply' : 'ew.why.needs_help.staff', { kind: t(`help2.kind.${o.kind}` as MessageKey), date: day(o.since) })}</li>
                ))}
              </ul>
            </div>
          )}
          {e.marks && (
            <div data-ew-evidence="marks" className="flex flex-col gap-1">
              <p className="font-semibold">{t('ew.reason.marks')}</p>
              <p className="break-words">{t('ew.why.marks.exam', { exam: e.marks.exam.name, class: e.marks.exam.className, percent: e.marks.exam.percent })}</p>
              {papers(e.marks.exam)}
              {e.marks.previous ? (
                <>
                  <p className="break-words">{t('ew.why.marks.previous', { exam: e.marks.previous.name, class: e.marks.previous.className, percent: e.marks.previous.percent })}</p>
                  {papers(e.marks.previous)}
                </>
              ) : (
                <p>{t('ew.why.marks.first')}</p>
              )}
              {e.marks.fell && <p data-ew-marks-fell={e.marks.fell.by}>{t('ew.why.marks.fell', { by: e.marks.fell.by, points: e.marks.fell.points })}</p>}
              {e.marks.belowPass && (
                <>
                  <p data-ew-marks-below={belowCount(f)}>{t(belowCount(f) === 1 ? 'ew.why.marks.below.one' : 'ew.why.marks.below.other', { count: belowCount(f), atLeast: e.marks.belowPass.atLeast })}</p>
                  <ul className="flex flex-col gap-1 text-slate/70">
                    {e.marks.belowPass.subjects.map((b, i) => (
                      <li key={i} className="break-words">
                        {b.part ? t('ew.why.marks.below.part', { subject: b.subject, part: b.part, percent: b.percent, passMark: b.passMark }) : t('ew.why.marks.below.item', { subject: b.subject, percent: b.percent, passMark: b.passMark })}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <p className="text-slate/70">{e.marks.scheme === null ? t('ew.why.marks.noScheme') : t('ew.why.marks.scheme', { version: e.marks.scheme })}</p>
              <p className="text-slate/70">{t('ew.why.marks.self')}</p>
            </div>
          )}
          <p data-ew-rule className="text-slate/70">
            {t('ew.why.rule', { version: f.rule_version })}
          </p>
          <p className="text-slate/70">
            {f.opened_by_nightly ? t('ew.why.openedNightly', { when: when(f.detected_at) }) : f.opened_by ? t('ew.why.opened', { when: when(f.detected_at), name: f.opened_by }) : t('ew.why.openedNoName', { when: when(f.detected_at) })} {t('ew.why.checked', { when: when(f.checked_at) })}
          </p>
        </div>
      </details>
    );
  };

  // What was done about a flag, oldest first, and the way to add to it.
  const log = (f: Flag) => (
    <div className="flex flex-col gap-2">
      <h3 className="font-bold">{t('ew.log.title')}</h3>
      {f.actions.length === 0 ? (
        <p data-ew-log-none className={SOFT}>
          {t('ew.log.none')}
        </p>
      ) : (
        <ul className="flex flex-col gap-2 border-l-2 border-slate/10 pl-3">
          {f.actions.map((a) => (
            <li key={a.action_id} data-ew-action={a.kind} className="flex flex-col gap-0.5">
              <span className="font-semibold">{a.by ? t('ew.log.line', { kind: t(`ew.kind.${a.kind}` as MessageKey), by: a.by, when: when(a.at) }) : t('ew.log.lineNoName', { kind: t(`ew.kind.${a.kind}` as MessageKey), when: when(a.at) })}</span>
              {a.note && <span className="whitespace-pre-wrap break-words">{t('ew.log.note', { note: a.note })}</span>}
              {a.outcome && <span className="whitespace-pre-wrap break-words">{t('ew.log.outcome', { outcome: a.outcome })}</span>}
            </li>
          ))}
        </ul>
      )}
      {adding === f.flag_id ? (
        <div data-ew-add className="flex flex-col gap-3 rounded-md border border-slate/10 p-3">
          <Select id={`ew-kind-${f.flag_id}`} data-ew-kind label={t('ew.add.kind')} value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}>
            <option value="">{t('ew.add.choose')}</option>
            {ACTION_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`ew.kind.${k}` as MessageKey)}
              </option>
            ))}
          </Select>
          <Input id={`ew-note-${f.flag_id}`} label={t('ew.add.note')} maxLength={ACTION_TEXT_MAX} value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
          <Input id={`ew-outcome-${f.flag_id}`} label={t('ew.add.outcome')} maxLength={ACTION_TEXT_MAX} value={draft.outcome} onChange={(e) => setDraft({ ...draft, outcome: e.target.value })} />
          <div className="flex flex-wrap items-center gap-2">
            <InfoTip tone="white">{t('ew.add.how')}</InfoTip>
            <button
              type="button"
              data-ew-save
              disabled={busy || !draft.kind || (draft.kind === 'other' && !draft.note.trim())}
              className={PRIMARY}
              onClick={() =>
                void send(`/api/app/early-warning/${f.flag_id}/actions`, { kind: draft.kind, note: draft.note, outcome: draft.outcome }, () => t('ew.added'), () => {
                  setAdding(null);
                  setDraft({ kind: '', note: '', outcome: '' });
                })
              }
            >
              {t('ew.add.save')}
            </button>
            <button type="button" disabled={busy} className={TAP} onClick={() => setAdding(null)}>
              {t('ew.add.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          data-ew-add-open
          disabled={busy}
          className={`${TAP} self-start`}
          onClick={() => {
            setAdding(f.flag_id);
            setDraft({ kind: '', note: '', outcome: '' });
          }}
        >
          {t('ew.add.open')}
        </button>
      )}
    </div>
  );

  const card = (f: Flag) => (
    <li key={f.flag_id} data-ew-flag={f.resolved_at ? 'closed' : 'open'} data-ew-reasons={f.reasons.join(',')} className="flex flex-col gap-2 rounded-md border border-slate/10 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="break-words font-bold">{f.student_name}</span>
        <span className="text-slate/70">{t('ew.flag.class', { class: f.class_name })}</span>
        {f.reasons.map((r) => (
          <Badge key={r} variant="neutral">
            {t(`ew.reason.${r}` as MessageKey)}
          </Badge>
        ))}
      </div>
      {f.resolved_at && f.closed_reason && (
        <p data-ew-closed={f.closed_reason} data-ew-closed-by={f.closed_by_nightly ? 'nightly' : 'person'} className="font-semibold">
          {t(`ew.closed.${f.closed_reason}` as MessageKey, { when: when(f.resolved_at) })}
          {f.closed_by_nightly && <> {t('ew.closed.byNightly')}</>}
        </p>
      )}
      {lines(f)}
      {why(f)}
      {log(f)}
    </li>
  );

  const d = data;
  // For how many of the students the last check looked at attendance could be used at all, with the two numbers
  // that decided it: said from the check's own record, and left unsaid when the record does not carry them.
  const last = d.lastCheck;
  const attendanceUsed = last && last.students > 0 && last.attendanceUsed !== null && last.minDays !== null && last.windowDays !== null ? { used: last.attendanceUsed, students: last.students, min: last.minDays, days: last.windowDays } : null;
  // An empty list is an all-clear only when attendance could be used for every student looked at.
  const empty = openEmptyState(d.mayCheck, last);
  return (
    <div lang={lang} data-early-warning={d.mayCheck ? 'office' : 'teacher'} className="flex flex-col gap-4 text-sm text-slate">
      {note && (
        <p role="status" data-ew-note={note.ok ? 'ok' : 'refused'} className={`rounded-md px-3 py-2 font-semibold ${note.ok ? 'bg-off-white text-slate' : 'border border-red-800/30 text-red-800'}`}>
          {note.text}
        </p>
      )}

      <section data-ew-what className={BOX}>
        <div className="flex flex-wrap items-center gap-x-1">
          <h2 className="text-base font-bold">{t('ew.what.title')}</h2>
          <InfoTip>
            <p>{t('ew.what.text')}</p>
            <p>{t('ew.what.order')}</p>
          </InfoTip>
        </div>
        <p className="max-w-prose font-semibold">{t('ew.what.staffOnly')}</p>
      </section>

      {d.mayCheck && (
        <section data-ew-check className={BOX}>
          <div className="flex flex-wrap items-center gap-x-1">
            <h2 className="text-base font-bold">{t('ew.check.title')}</h2>
            <InfoTip>{t('ew.check.how')}</InfoTip>
          </div>
          {d.lastCheck ? (
            <div data-ew-last-check="yes" data-ew-last-check-by={d.lastCheck.nightly ? 'nightly' : 'person'} className={`${SOFT} flex flex-col gap-1`}>
              <p>
                {d.lastCheck.nightly ? t('ew.check.lastNightly', { when: when(d.lastCheck.at) }) : d.lastCheck.by ? t('ew.check.last', { when: when(d.lastCheck.at), name: d.lastCheck.by }) : t('ew.check.lastNoName', { when: when(d.lastCheck.at) })} {t('ew.check.lastCounts', { students: d.lastCheck.students, open: d.lastCheck.open })}
              </p>
              {attendanceUsed && (
                <p data-ew-attendance-used={`${attendanceUsed.used}/${attendanceUsed.students}`} className={attendanceUsed.used < attendanceUsed.students ? 'font-semibold' : undefined}>
                  {t(attendanceUsed.used >= attendanceUsed.students ? 'ew.check.attendance.all' : attendanceUsed.used === 0 ? 'ew.check.attendance.none' : 'ew.check.attendance.some', attendanceUsed)}
                </p>
              )}
            </div>
          ) : (
            <p data-ew-last-check="never" className={SOFT}>
              {t('ew.check.never')}
            </p>
          )}
          <button type="button" data-ew-check-now disabled={busy} className={`${PRIMARY} self-start`} onClick={() => void send('/api/app/early-warning', {}, (got) => t('ew.check.done', { opened: got.opened ?? 0, changed: got.changed ?? 0, closed: got.closed ?? 0, open: got.open ?? 0 }))}>
            {t(busy ? 'ew.check.running' : 'ew.check.now')}
          </button>
          {d.settings && (
            <details data-ew-rule-now className="text-sm text-slate">
              <summary className={WHY}>{t('myDay.why')}</summary>
              <div className="flex max-w-prose flex-col gap-1 pb-2">
                <p>{t('ew.rule.attendance', { below: d.settings.attendanceBelow, days: d.settings.windowDays, min: d.settings.minMarkedDays })}</p>
                <p>{t('ew.rule.homework')}</p>
                <p>{t('ew.rule.needs_help')}</p>
                <p data-ew-rule-marks>{t('ew.rule.marks', { points: d.settings.marksDropPoints, subjects: d.settings.marksBelowPassSubjects })}</p>
                <p className="text-slate/70">{t('ew.rule.version', { version: d.ruleVersion })}</p>
                <p className="text-slate/70">{t('ew.rule.settings')}</p>
              </div>
            </details>
          )}
        </section>
      )}

      {d.summary.length > 0 && (
        <section data-ew-summary className={BOX}>
          <div className="flex flex-wrap items-center gap-x-1">
            <h2 className="text-base font-bold">{t('ew.summary.title')}</h2>
            <InfoTip>{t('ew.summary.note')}</InfoTip>
          </div>
          <ul className="flex flex-wrap gap-2">
            {d.summary.map((c) => (
              <li key={c.class_id} data-ew-class-count={c.open} className={SOFT}>
                {t(c.open === 1 ? 'ew.summary.one' : 'ew.summary.other', { class: c.class_name, count: c.open })}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section data-ew-open className={BOX}>
        <h2 className="text-base font-bold">{t('ew.open.title')}</h2>
        {d.open.length === 0 ? (
          <div data-ew-empty={empty} className={EMPTY}>
            <p className="text-base font-bold">{t(`ew.open.empty.${empty}.title` as MessageKey)}</p>
            <p className="max-w-prose">{t(`ew.open.empty.${empty}.do` as MessageKey, attendanceUsed ?? undefined)}</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">{d.open.map(card)}</ul>
        )}
        {d.truncated && <p className={SOFT}>{t('ew.truncated', { count: d.open.length + d.closed.length })}</p>}
      </section>

      <section data-ew-closed className={BOX}>
        <div className="flex flex-wrap items-center gap-x-1">
          <h2 className="text-base font-bold">{t('ew.closed.title', { days: CLOSED_SHOWN_DAYS })}</h2>
          <InfoTip>{t('ew.closed.how')}</InfoTip>
        </div>
        {d.closed.length === 0 ? <p className={SOFT}>{t('ew.closed.none', { days: CLOSED_SHOWN_DAYS })}</p> : <ul className="flex flex-col gap-3">{d.closed.map(card)}</ul>}
      </section>
    </div>
  );
}
