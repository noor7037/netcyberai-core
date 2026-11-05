'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { Skeleton } from '@/components/app-ui/States';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { explainError } from '@/lib/errors/catalogue';
import type { MessageKey } from '@/lib/i18n';
import type { PromotionClassView, PromotionStudentView, PromotionView as Promotion } from '@/lib/setup/promotion';

// Setup -> Promotion to the next session (W21-M2). The dry run first: each class of the current session and where it
// goes, with counts, and the students a principal must decide (repeat, leave, move section), saved as a list. Then the
// promotion in one step, and an undo for 24 hours. The school admin sees the dry run; only the principal acts.

const CARD = 'flex max-w-3xl flex-col gap-3 rounded-2xl border border-slate/10 bg-white p-4 shadow-sm md:p-5';
const PRIMARY = 'min-h-[44px] rounded-md bg-sapphire px-5 text-sm font-semibold text-white disabled:opacity-60';
const TAP = 'min-h-[44px] rounded-md border border-slate/20 bg-white px-4 text-sm font-semibold text-slate disabled:opacity-60';
const DECISIONS = ['promote', 'repeat', 'leave', 'move_section'] as const;
type Decision = (typeof DECISIONS)[number];
const OUTCOME: Record<PromotionStudentView['outcome'], MessageKey> = {
  promoted: 'promotion.outcome.promoted',
  repeated: 'promotion.outcome.repeated',
  moved_section: 'promotion.outcome.moved_section',
  left: 'promotion.outcome.left',
  undecided: 'promotion.outcome.undecided',
};
const DECISION: Record<Decision, MessageKey> = {
  promote: 'promotion.decision.promote',
  repeat: 'promotion.decision.repeat',
  leave: 'promotion.decision.leave',
  move_section: 'promotion.decision.move_section',
};
const REFUSED: Record<string, MessageKey> = {
  promotion_reason: 'promotion.refused.reason',
  promotion_reason_aadhaar: 'promotion.refused.aadhaar',
  promotion_section: 'promotion.refused.section',
  promotion_student: 'promotion.refused.student',
  promotion_no_session: 'promotion.refused.no_session',
  promotion_no_next_session: 'promotion.refused.no_next_session',
  promotion_already_promoted: 'promotion.refused.already',
  promotion_students_undecided: 'promotion.refused.undecided',
  promotion_nothing_to_undo: 'promotion.refused.nothing_to_undo',
  promotion_undo_too_late: 'promotion.refused.too_late',
};
const decisionOf = (s: PromotionStudentView): Decision =>
  s.outcome === 'repeated' ? 'repeat' : s.outcome === 'moved_section' ? 'move_section' : s.outcome === 'left' && s.reason ? 'leave' : 'promote';

export function PromotionView({ canAct }: { canAct: boolean }) {
  const { t, lang } = useT();
  const toast = useToast();
  const [data, setData] = useState<Promotion | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ studentId: string; decision: Decision; toSection: string; reason: string } | null>(null);
  const [asking, setAsking] = useState<'promote' | 'undo' | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/app/setup/promotion', { cache: 'no-store' }).catch(() => null);
    const body = res?.ok ? ((await res.json().catch(() => null)) as { promotion?: Promotion } | null) : null;
    if (body?.promotion) {
      setData(body.promotion);
      setFailed(false);
    } else setFailed(true);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const when = (iso: string) => new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(new Date(iso));

  async function send(url: string, body?: unknown): Promise<boolean> {
    setBusy(true);
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }).catch(() => null);
    const answer = (await res?.json().catch(() => null)) as { code?: string } | null;
    setBusy(false);
    if (!res?.ok) {
      const own = answer?.code ? REFUSED[answer.code] : undefined;
      setProblem(own ? t(own) : explainError(answer, t('promotion.failed'), lang, res?.status));
    } else setProblem(null);
    return Boolean(res?.ok);
  }

  async function saveDecision(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    if (await send('/api/app/setup/promotion/overrides', editing)) {
      setEditing(null);
      toast.show(t('promotion.saved'), 'success');
      await load();
    }
  }
  async function promote() {
    if (await send('/api/app/setup/promotion')) {
      setAsking(null);
      toast.show(t('promotion.done'), 'success');
    }
    await load();
  }
  async function undo() {
    if (await send('/api/app/setup/promotion/undo')) {
      setAsking(null);
      toast.show(t('promotion.undone'), 'success');
    }
    await load();
  }

  if (failed && !data)
    return (
      <p role="alert" data-promotion="failed" className={`${CARD} text-sm text-slate`}>
        {t('promotion.failed.load')}
      </p>
    );
  if (!data) return <Skeleton lines={5} className={CARD} />;

  const exceptions = data.classes.flatMap((c) => c.students.filter((s) => s.outcome !== 'promoted' && !(s.outcome === 'left' && !s.reason)).map((s) => ({ ...s, className: c.name })));
  const toLabel = (c: PromotionClassView) =>
    c.to.kind === 'leaving' ? t('promotion.to.leaving') : c.to.kind === 'none' ? t('promotion.to.none') : c.to.kind === 'make' ? t('promotion.to.make', { name: c.to.name ?? '' }) : (c.to.name ?? '');

  return (
    <div lang={lang} data-promotion className="flex flex-col gap-4">
      {problem && (
        <p role="alert" data-promotion-problem className="max-w-3xl rounded-md bg-off-white px-3 py-2 text-sm text-red-800">
          {problem}
        </p>
      )}

      {data.lastRun && (
        <section aria-labelledby="promotion-last" data-promotion-last className={CARD}>
          <h2 id="promotion-last" className="text-base font-bold text-slate">
            {t('promotion.last.title', { from: data.lastRun.fromLabel, to: data.lastRun.toLabel })}
          </h2>
          <p className="text-sm text-slate">{t('promotion.last.at', { at: when(data.lastRun.at) })}</p>
          {data.lastRun.canUndo ? (
            <>
              <p className="text-sm text-slate">{t('promotion.last.undoUntil', { until: when(data.lastRun.undoUntil) })}</p>
              {canAct &&
                (asking === 'undo' ? (
                  <div role="group" aria-labelledby="promotion-undo-confirm" className="flex flex-col gap-2 rounded-xl border border-amber/40 bg-amber/10 p-3 text-sm text-slate">
                    <p id="promotion-undo-confirm" className="font-bold">
                      {t('promotion.undo.confirm')}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" data-promotion-undo-yes disabled={busy} className={PRIMARY} onClick={() => void undo()}>
                        {t('promotion.undo.yes')}
                      </button>
                      <button type="button" disabled={busy} className={TAP} onClick={() => setAsking(null)}>
                        {t('promotion.no')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button type="button" data-promotion-undo disabled={busy} className={`${TAP} self-start`} onClick={() => setAsking('undo')}>
                    {t('promotion.undo')}
                  </button>
                ))}
            </>
          ) : (
            <p className="text-sm text-slate">{t('promotion.last.final')}</p>
          )}
        </section>
      )}

      {!data.from ? (
        <p data-promotion-none className={`${CARD} text-sm text-slate`}>
          {t('promotion.noCurrent')}
        </p>
      ) : !data.to ? (
        <div data-promotion-no-next className={`${CARD} text-sm text-slate`}>
          <p>{t('promotion.noNext', { from: data.from.label })}</p>
          <Link href="/app/setup/sessions" className={`${TAP} inline-flex items-center self-start`}>
            {t('promotion.addSession')}
          </Link>
        </div>
      ) : (
        <>
          <section aria-labelledby="promotion-summary" data-promotion-summary className={CARD}>
            <h2 id="promotion-summary" className="text-base font-bold text-slate">
              {t('promotion.summary.title', { from: data.from.label, to: data.to.label })}
            </h2>
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {(
                [
                  ['promotion.count.promoted', data.counts.promoted],
                  ['promotion.count.repeated', data.counts.repeated],
                  ['promotion.count.movedSection', data.counts.movedSection],
                  ['promotion.count.left', data.counts.left],
                  ['promotion.count.undecided', data.counts.undecided],
                ] as [MessageKey, number][]
              ).map(([k, n]) => (
                <div key={k} className="rounded-xl bg-off-white p-3">
                  <dt className="text-sm text-slate">{t(k)}</dt>
                  <dd className="text-xl font-bold text-slate">{n}</dd>
                </div>
              ))}
            </dl>
            {data.toMake.length > 0 && <p className="text-sm text-slate">{t('promotion.toMake', { names: data.toMake.join(', ') })}</p>}
            <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-slate">
              <li>{t('promotion.note.kept')}</li>
              <li>{t('promotion.note.fees')}</li>
              <li>{t('promotion.note.rolls')}</li>
              <li>{t('promotion.note.current', { to: data.to.label })}</li>
            </ul>
          </section>

          <section aria-labelledby="promotion-classes" data-promotion-classes className={CARD}>
            <h2 id="promotion-classes" className="text-base font-bold text-slate">
              {t('promotion.classes.title')}
            </h2>
            {data.classes.length === 0 ? (
              <p className="text-sm text-slate">{t('promotion.classes.none')}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-slate/10">
                {data.classes.map((c) => (
                  <li key={c.classId} data-promotion-class={c.name} data-promotion-to={c.to.kind} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <p className="min-w-0 flex-1 text-base text-slate">
                        <span className="font-bold">{c.name}</span>
                        <span aria-hidden="true"> → </span>
                        <span className="sr-only">{t('promotion.goesTo')}</span>
                        <span className={c.to.kind === 'none' ? 'font-semibold text-red-800' : ''}>{toLabel(c)}</span>
                      </p>
                      <button
                        type="button"
                        aria-expanded={open === c.classId}
                        aria-controls={`promotion-students-${c.classId}`}
                        disabled={c.students.length === 0}
                        className={TAP}
                        onClick={() => setOpen(open === c.classId ? null : c.classId)}
                      >
                        {t('promotion.students', { count: c.students.length })}
                      </button>
                    </div>
                    {open === c.classId && (
                      <ul id={`promotion-students-${c.classId}`} className="flex flex-col gap-2 rounded-xl bg-off-white p-3">
                        {c.students.map((s) => (
                          <li key={s.studentId} data-promotion-student={s.studentId} className="flex flex-col gap-2">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                              <p className="min-w-0 flex-1 text-sm text-slate">
                                <span className="font-semibold">{s.name}</span>
                                {s.rollNo ? ` · ${t('promotion.roll', { roll: s.rollNo })}` : ''}
                                {' · '}
                                {t(OUTCOME[s.outcome], { to: s.toName ?? '' })}
                              </p>
                              {canAct && (
                                <button
                                  type="button"
                                  data-promotion-change
                                  className={TAP}
                                  aria-label={t('promotion.changeFor', { name: s.name })}
                                  onClick={() => setEditing(editing?.studentId === s.studentId ? null : { studentId: s.studentId, decision: decisionOf(s), toSection: s.toSection ?? '', reason: s.reason ?? '' })}
                                >
                                  {t('promotion.change')}
                                </button>
                              )}
                            </div>
                            {editing?.studentId === s.studentId && (
                              <form data-promotion-form onSubmit={(e) => void saveDecision(e)} className="flex flex-col gap-3 rounded-xl border border-slate/10 bg-white p-3">
                                <fieldset className="flex flex-col gap-1">
                                  <legend className="text-sm font-semibold text-slate">{t('promotion.decision', { name: s.name })}</legend>
                                  {DECISIONS.map((d) => (
                                    <label key={d} className="flex min-h-[44px] items-center gap-2 text-sm text-slate">
                                      <input type="radio" name={`decision-${s.studentId}`} value={d} checked={editing.decision === d} onChange={() => setEditing({ ...editing, decision: d })} className="h-5 w-5" />
                                      {t(DECISION[d])}
                                    </label>
                                  ))}
                                </fieldset>
                                {editing.decision === 'move_section' && (
                                  <Input id={`section-${s.studentId}`} label={t('promotion.section')} maxLength={10} required value={editing.toSection} onChange={(e) => setEditing({ ...editing, toSection: e.target.value })} />
                                )}
                                {editing.decision !== 'promote' && (
                                  <Input id={`reason-${s.studentId}`} label={t('promotion.reason')} maxLength={200} required value={editing.reason} onChange={(e) => setEditing({ ...editing, reason: e.target.value })} />
                                )}
                                <div className="flex flex-wrap gap-2">
                                  <button type="submit" data-promotion-save disabled={busy} className={PRIMARY}>
                                    {t('promotion.save')}
                                  </button>
                                  <button type="button" disabled={busy} className={TAP} onClick={() => setEditing(null)}>
                                    {t('promotion.no')}
                                  </button>
                                </div>
                              </form>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="promotion-exceptions" data-promotion-exceptions className={CARD}>
            <h2 id="promotion-exceptions" className="text-base font-bold text-slate">
              {t('promotion.exceptions.title')}
            </h2>
            {exceptions.length === 0 ? (
              <p className="text-sm text-slate">{t('promotion.exceptions.none')}</p>
            ) : (
              <ul className="flex flex-col gap-1 text-sm text-slate">
                {exceptions.map((s) => (
                  <li key={s.studentId} data-promotion-exception={s.outcome}>
                    <span className="font-semibold">{s.name}</span> ({s.className}) · {t(OUTCOME[s.outcome], { to: s.toName ?? '' })}
                    {s.reason ? ` · ${s.reason}` : ''}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {canAct && (
            <section aria-labelledby="promotion-go" data-promotion-go className={CARD}>
              <h2 id="promotion-go" className="text-base font-bold text-slate">
                {t('promotion.go.title', { to: data.to.label })}
              </h2>
              {data.alreadyPromoted ? (
                <p className="text-sm text-slate">{t('promotion.refused.already')}</p>
              ) : data.counts.undecided > 0 ? (
                <p className="text-sm text-slate">{t('promotion.go.undecided', { count: data.counts.undecided })}</p>
              ) : asking === 'promote' ? (
                <div role="group" aria-labelledby="promotion-confirm" className="flex flex-col gap-2 rounded-xl border border-amber/40 bg-amber/10 p-3 text-sm text-slate">
                  <p id="promotion-confirm" className="font-bold">
                    {t('promotion.go.confirm', { from: data.from.label, to: data.to.label })}
                  </p>
                  <p>{t('promotion.go.undoNote')}</p>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" data-promotion-yes disabled={busy} className={PRIMARY} onClick={() => void promote()}>
                      {t('promotion.go.yes')}
                    </button>
                    <button type="button" disabled={busy} className={TAP} onClick={() => setAsking(null)}>
                      {t('promotion.no')}
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" data-promotion-promote disabled={busy} className={`${PRIMARY} self-start`} onClick={() => setAsking('promote')}>
                  {t('promotion.go.button')}
                </button>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
