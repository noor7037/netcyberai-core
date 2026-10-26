'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { InfoTip } from '@/components/app-ui/InfoTip';
import { numberWords } from '@/components/exams/exam-format';
import { PRIMARY, SECTION, TAP } from '@/components/exams/SchemeParts';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { Icon } from '@/components/visual/Icons';
import { ERROR_TYPES, type ErrorType, type MarkingOverview, type SetupScreen, type SheetDetail, type SheetQuestion } from '@/lib/contracts/marking';
import type { MessageKey } from '@/lib/i18n';
import { layoutBadges } from '@/lib/marking/margin';
import { changesOf, clampMark, countedOf, emptyDraft, finalOf, flagsInOrder, grandTotal, noteOf, parseMark, stepMark, sureness, totalsOf, type SheetDraft } from '@/lib/marking/review-view';
import { PagesPane, type PagesPaneHandle } from './PagesPane';
import { ask, childLine, ERROR_TYPE_KEYS, errorWords, FLAG_HOW_KEYS, FLAG_KEYS, scriptsHref, sheetHref, STATE_KEYS } from './parts';

// One script, beside its pages (docs/35, C347). The scanned pages are on one side, zoomable, with each question's mark
// in the margin at its answer; the questions are on the other: marks with − and + in half marks and a field (never above
// the question's marks), what the AI gave and why, the note for the child, the kind of mistake, and how sure the AI
// was in words. Totals per part follow the marks as they are typed. The teacher can change who the script is, approve it
// (alone, or and go to the next), ask the AI to mark it again, or set it aside. Changes are kept as they are made.
// On a phone the pages sit above the questions and the actions stay at the bottom. Nothing ranks or compares children.

const SAVE_AFTER_MS = 1200;
const REFRESH_MS = 4000;

const SURE_KEYS = { check: 'mk.sure.check', fair: 'mk.sure.fair', sure: 'mk.sure.sure', none: 'mk.sure.none' } as const;
const BY_KEYS: Record<string, MessageKey> = { seat: 'mk.id.by.seat', roll: 'mk.id.by.roll', name: 'mk.id.by.name', teacher: 'mk.id.by.teacher' };

export function ScriptReviewView({ paperId, sheetId }: { paperId: string; sheetId: string }) {
  const { t, lang } = useT();
  const [detail, setDetail] = useState<SheetDetail | null>(null);
  const [overview, setOverview] = useState<MarkingOverview | null>(null);
  const [setup, setSetup] = useState<SetupScreen | null>(null);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState<SheetDraft>(emptyDraft());
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [confirm, setConfirm] = useState<'again' | 'aside' | null>(null);
  const [barBottom, setBarBottom] = useState(0);
  const pane = useRef<PagesPaneHandle>(null);
  const live = useRef<{ detail: SheetDetail | null; draft: SheetDraft }>({ detail: null, draft: emptyDraft() });
  live.current = { detail, draft };

  const loadDetail = useCallback(async () => {
    const r = await ask('GET', `/api/app/marking/sheets/${sheetId}`);
    if (!r.ok) return false;
    setDetail(r.body as unknown as SheetDetail);
    return true;
  }, [sheetId]);
  const loadSide = useCallback(async () => {
    const [o, s] = await Promise.all([ask('GET', `/api/app/marking/papers/${paperId}`), ask('GET', `/api/app/marking/papers/${paperId}/setup`)]);
    if (o.ok) setOverview(o.body as unknown as MarkingOverview);
    if (s.ok) setSetup(s.body as unknown as SetupScreen);
  }, [paperId]);
  useEffect(() => {
    void (async () => {
      const [ok] = await Promise.all([loadDetail(), loadSide()]);
      setFailed(!ok);
    })();
  }, [loadDetail, loadSide]);

  // While the script waits to be marked or is being marked, ask again every few seconds.
  const waiting = detail ? detail.sheet.state === 'waiting' || detail.sheet.state === 'marking' : false;
  useEffect(() => {
    if (!waiting) return;
    const id = window.setInterval(() => {
      if (!document.hidden) void loadDetail();
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [waiting, loadDetail]);

  // The phone's quick bar, when this person's shell has one, would sit over the action bar: keep the bar above it.
  useLayoutEffect(() => {
    const measure = () => {
      const bar = Array.from(document.querySelectorAll('nav')).find((n) => {
        const s = getComputedStyle(n);
        return s.position === 'fixed' && s.bottom === '0px' && n.offsetHeight > 0;
      });
      setBarBottom(bar ? bar.offsetHeight : 0);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const counts = setup?.setup.choiceCounts ?? {};
  const pending = detail ? changesOf(detail, draft) : null;

  // Keeps what was changed: sends only the fields that differ, then reads the script again.
  const flush = useCallback(async (): Promise<boolean> => {
    const { detail: d, draft: sent } = live.current;
    if (!d) return true;
    const changes = changesOf(d, sent);
    if (!changes) return true;
    setSaving('saving');
    const r = await ask('POST', `/api/app/marking/sheets/${sheetId}`, { action: 'change', ...changes });
    if (!r.ok) {
      setSaving('error');
      setNote({ ok: false, text: errorWords(t, r, 'mk.err.not_saved') });
      return false;
    }
    await loadDetail();
    // What was typed while that was being saved stays; what was saved is no longer a difference.
    setDraft((now) => (JSON.stringify(now) === JSON.stringify(sent) ? emptyDraft() : now));
    setSaving('saved');
    setNote(null);
    return true;
  }, [sheetId, loadDetail, t]);

  useEffect(() => {
    if (!pending) return;
    const id = window.setTimeout(() => void flush(), SAVE_AFTER_MS);
    return () => window.clearTimeout(id);
  }, [pending, draft, flush]);
  useEffect(() => {
    if (!pending) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [pending]);

  const setQuestion = (questionId: string, patch: SheetDraft['questions'][string]) => setDraft({ ...draft, questions: { ...draft.questions, [questionId]: { ...draft.questions[questionId], ...patch } } });

  const badges = useMemo(
    () => (detail ? layoutBadges(detail.questions.map((q) => ({ questionId: q.questionId, place: q.place, final: finalOf(q, draft), max: q.maxMarks, counted: countedOf(detail, counts, draft).has(q.questionId) }))) : []),
    [detail, draft, counts]
  );

  if (failed) return <p role="alert" className="rounded-md bg-off-white px-3 py-2 text-sm text-slate">{t('mk.sheet.failed')}</p>;
  if (!detail) return null;

  const { sheet, paper } = detail;
  const reviewBelow = overview?.reviewBelow ?? 0.75;
  const countedSet = countedOf(detail, counts, draft);
  const totals = totalsOf(detail, counts, draft);
  const grand = grandTotal(totals);
  const editable = detail.mayChange && (sheet.state === 'marked' || sheet.state === 'approved');
  const hasMarks = detail.questions.some((q) => q.ai.marks !== null || q.teacher.marks !== null);
  const allMarked = detail.questions.every((q) => finalOf(q, draft) !== null);
  const flags = flagsInOrder(sheet.flags);
  const taken = new Set((overview?.sheets ?? []).filter((s) => s.student && s.sheetId !== sheetId).map((s) => s.student!.studentId));
  const mayApprove = detail.mayChange && !!sheet.student && (sheet.state === 'marked' || (sheet.state === 'approved' && sheet.flags.includes('changed'))) && allMarked;
  const approveWhy: MessageKey | null = !detail.mayChange ? (paper.published ? 'mk.q.published' : 'mk.q.readOnly') : !sheet.student ? 'mk.sheet.needChild' : !allMarked ? 'mk.sheet.needMarks' : null;
  const hasTeacherChanges = detail.questions.some((q) => q.teacher.marks !== null || q.teacher.note !== null) || pending !== null;
  const mistakeOptions: ErrorType[] = [...ERROR_TYPES];

  const go = (href: string) => window.location.assign(href);
  const doApprove = async (thenNext: boolean) => {
    setBusy(true);
    setNote(null);
    if (!(await flush())) return setBusy(false);
    const r = await ask('POST', `/api/app/marking/papers/${paperId}/approve`, { sheetIds: [sheetId] });
    if (!r.ok) {
      setBusy(false);
      return setNote({ ok: false, text: errorWords(t, r) });
    }
    if (thenNext) return go(detail.next ? sheetHref(paperId, detail.next) : scriptsHref(paperId));
    await Promise.all([loadDetail(), loadSide()]);
    setBusy(false);
    setNote({ ok: true, text: t('mk.sheet.approved') });
  };
  const doChoose = async (studentId: string | null) => {
    setBusy(true);
    setNote(null);
    const r = await ask('POST', `/api/app/marking/sheets/${sheetId}`, { action: 'child', studentId });
    if (!r.ok) {
      setBusy(false);
      return setNote({ ok: false, text: errorWords(t, r) });
    }
    await Promise.all([loadDetail(), loadSide()]);
    setPicking(false);
    setBusy(false);
    setNote({ ok: true, text: studentId ? t('mk.id.chosen') : t('mk.id.cleared') });
  };
  const doAgain = async () => {
    setBusy(true);
    setNote(null);
    setConfirm(null);
    const r = await ask('POST', `/api/app/marking/sheets/${sheetId}/mark-again`);
    if (!r.ok) {
      setBusy(false);
      return setNote({ ok: false, text: errorWords(t, r) });
    }
    setDraft(emptyDraft());
    await loadDetail();
    setBusy(false);
    setNote({ ok: true, text: t('mk.sheet.againDone') });
  };
  const doAside = async (aside: boolean) => {
    setBusy(true);
    setNote(null);
    setConfirm(null);
    const r = await ask('POST', `/api/app/marking/sheets/${sheetId}`, { action: aside ? 'aside' : 'restore' });
    if (!r.ok) {
      setBusy(false);
      return setNote({ ok: false, text: errorWords(t, r) });
    }
    if (aside) return go(scriptsHref(paperId));
    await Promise.all([loadDetail(), loadSide()]);
    setBusy(false);
    setNote({ ok: true, text: t('mk.sheet.restored') });
  };

  const showQuestion = (q: SheetQuestion) => {
    setActive(q.questionId);
    if (q.place) pane.current?.scrollToPlace(q.place.pageId, q.place.yFrom);
  };

  const idLine = sheet.student
    ? t('mk.id.matched', { name: sheet.student.name, roll: sheet.student.rollNo ?? '—', by: sheet.matchedBy in BY_KEYS ? t(BY_KEYS[sheet.matchedBy]) : '' }).replace(/\s+,/g, ',').replace(/,\s*$/, '')
    : t('mk.id.none');
  const read = detail.match.read;

  return (
    <div lang={lang} data-script-review={sheetId} data-sheet-state={sheet.state} className="flex flex-col gap-4 text-sm text-slate">
      {note && (
        <p role="status" data-sheet-note={note.ok ? 'ok' : 'error'} className={`rounded-md px-3 py-2 font-semibold ${note.ok ? 'bg-off-white text-slate' : 'border border-red-800/30 text-red-800'}`}>
          {note.text}
        </p>
      )}

      <section data-identity className={SECTION}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p data-identity-line className="flex items-center gap-2 text-base font-bold">
              <Icon name="student" className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span>{idLine}</span>
            </p>
            {read && (read.name || read.rollNo || read.seatNo) && (
              <p className="text-slate/70">{t('mk.id.read', { name: read.name ?? '—', roll: read.rollNo ?? '—' })}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={sheet.state === 'approved' && !sheet.flags.includes('changed') ? 'success' : sheet.state === 'failed' ? 'danger' : 'neutral'}>{t(STATE_KEYS[sheet.state])}</Badge>
            {hasMarks && <span data-sheet-total className="font-bold">{t('mk.review.total', { score: numberWords(grand.score, lang), max: numberWords(grand.max, lang) })}</span>}
            <a href={scriptsHref(paperId)} className={TAP}>{t('mk.sheet.back')}</a>
          </div>
        </div>
        {flags.length > 0 && (
          <ul data-sheet-flags className="flex flex-col gap-1">
            {flags.map((f) => (
              <li key={f} className="flex flex-wrap items-center gap-x-2">
                <Badge variant="warning">{t(FLAG_KEYS[f])}</Badge>
                <span className="text-slate/70">{t(FLAG_HOW_KEYS[f])}</span>
              </li>
            ))}
          </ul>
        )}
        {detail.mayChange && sheet.state !== 'approved' && sheet.state !== 'set_aside' && (
          <div className="flex flex-col gap-2">
            <button type="button" data-identity-change className={`${TAP} self-start`} aria-expanded={picking} onClick={() => setPicking(!picking)}>
              {t('mk.id.change')}
            </button>
            {picking && (
              <div data-identity-picker role="group" aria-label={t('mk.id.pick')} className="flex flex-col gap-2 rounded-md bg-off-white p-3">
                <p className="font-semibold">{t('mk.id.pick')}</p>
                <ul className="grid gap-1 sm:grid-cols-2">
                  {detail.roster.map((c) => {
                    const possible = detail.match.candidates.some((x) => x.studentId === c.studentId);
                    const here = sheet.student?.studentId === c.studentId;
                    const other = taken.has(c.studentId);
                    return (
                      <li key={c.studentId}>
                        <button type="button" data-pick-child={c.studentId} className={`${here ? PRIMARY : TAP} w-full justify-start text-left`} disabled={busy || other || here} onClick={() => void doChoose(c.studentId)}>
                          <span className="min-w-0 break-words">{childLine(c)}{c.seatNo ? ` · ${c.seatNo}` : ''}</span>
                          {possible && !here && <Badge variant="success">{t('mk.id.possible')}</Badge>}
                          {other && <span className="text-slate/70">{t('mk.id.hasScript')}</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <div className="flex flex-wrap gap-2">
                  {sheet.student && (
                    <button type="button" className={TAP} disabled={busy} onClick={() => void doChoose(null)}>{t('mk.id.nobody')}</button>
                  )}
                  <button type="button" className={TAP} onClick={() => setPicking(false)}>{t('mk.id.cancel')}</button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {sheet.state === 'failed' && (
        <p data-sheet-failed role="alert" className="flex items-start gap-2 rounded-md border border-red-800/30 px-3 py-2 text-red-800">
          <Icon name="alert" className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <span>{t('mk.sheet.couldNot', { why: sheet.failure ? t(`mk.failure.${sheet.failure}` as MessageKey) : '' })}</span>
        </p>
      )}
      {waiting && (
        <p data-sheet-waiting role="status" className="flex items-center gap-2 rounded-md bg-off-white px-3 py-2 font-semibold">
          <span aria-hidden="true" className="inline-block h-3 w-3 rounded-full bg-royal motion-safe:animate-pulse" />
          {sheet.state === 'marking' ? t('mk.sheet.marking') : t('mk.sheet.waiting')}
        </p>
      )}
      {sheet.state === 'set_aside' && <p className="rounded-md bg-off-white px-3 py-2">{t('mk.sheet.asideNow')}</p>}
      {paper.published && <p className="rounded-md bg-off-white px-3 py-2">{t('mk.q.published')}</p>}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 lg:sticky lg:top-20 lg:w-[46%] lg:flex-none">
          <PagesPane ref={pane} pages={detail.pages} badges={badges} active={active} />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {hasMarks && (
            <>
              {totals.map((part) => (
                <section key={part.component} data-part={part.component} className="flex flex-col gap-3">
                  <h2 className="flex flex-wrap items-baseline justify-between gap-2 text-base font-bold">
                    <span>{part.name}</span>
                    <span data-part-total>{t('mk.review.total', { score: numberWords(part.score, lang), max: numberWords(part.max, lang) })}</span>
                  </h2>
                  <ol className="flex flex-col gap-3">
                    {detail.questions
                      .filter((q) => q.component === part.component)
                      .map((q) => {
                        const unit = paper.units.find((u) => u.unitId === q.unitId);
                        const d = draft.questions[q.questionId];
                        const final = finalOf(q, draft);
                        const counted = countedSet.has(q.questionId);
                        const how = sureness(q.ai.confidence, reviewBelow);
                        const overridden = d?.marks !== undefined ? d.marks !== null : q.teacher.marks !== null;
                        const errorType = d?.errorType !== undefined ? d.errorType : q.errorType;
                        return (
                          <li key={q.questionId} id={`mk-q-${q.questionId}`} data-question={q.label} data-counted={counted ? 'yes' : 'no'} className={`flex flex-col gap-3 rounded-lg border p-3 ${active === q.questionId ? 'border-royal' : 'border-slate/15'} ${counted ? 'bg-white' : 'bg-off-white'}`}>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="min-w-0">
                                <h3 className="text-base font-bold">{t('mk.q.title', { label: q.label })}</h3>
                                {unit && <p className="text-slate/70">{unit.chapter}: {unit.topic}</p>}
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                {!counted && <Badge>{t('mk.q.out')}</Badge>}
                                {q.ai.attempted === false && <Badge>{t('mk.q.notAttempted')}</Badge>}
                                <Badge variant={how === 'check' ? 'warning' : how === 'sure' ? 'success' : 'neutral'} data-sureness={how}>{t(SURE_KEYS[how])}</Badge>
                                {q.place ? (
                                  <button type="button" data-show-on-page className={TAP} onClick={() => showQuestion(q)}>{t('mk.q.show')}</button>
                                ) : (
                                  <span className="text-slate/70">{t('mk.q.noPlace')}</span>
                                )}
                              </div>
                            </div>

                            <MarkField
                              id={`mk-marks-${q.questionId}`}
                              value={final}
                              max={q.maxMarks}
                              disabled={!editable}
                              onFocus={() => setActive(q.questionId)}
                              onChange={(v) => setQuestion(q.questionId, { marks: v })}
                            />
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate/70">
                              <span data-ai-gave>{q.ai.marks === null ? t('mk.q.aiNone') : t('mk.q.aiGave', { marks: numberWords(q.ai.marks, lang), max: numberWords(q.maxMarks, lang) })}</span>
                              {overridden && editable && (
                                <button type="button" data-back-to-ai className={TAP} onClick={() => setQuestion(q.questionId, { marks: null })}>{t('mk.q.backToAi')}</button>
                              )}
                            </div>
                            {final === null && editable && <p role="alert" className="text-red-800">{t('mk.q.needMark')}</p>}

                            {q.ai.steps.length > 0 && (
                              <ul data-ai-steps className="flex flex-col gap-0.5">
                                {q.ai.steps.map((s, i) => (
                                  <li key={i} className="flex items-start gap-2">
                                    <Icon name={s.awarded > 0 ? 'check' : 'alert'} className={`mt-0.5 h-4 w-4 shrink-0 ${s.awarded > 0 ? 'text-emerald-text' : 'text-amber-text'}`} aria-hidden="true" />
                                    <span>
                                      {s.step} <span className="font-semibold">{numberWords(s.awarded, lang)}{q.steps[i] ? `/${numberWords(q.steps[i].marks, lang)}` : ''}</span>
                                      {s.note ? <span className="text-slate/70"> · {s.note}</span> : null}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                            {q.ai.reason && <p data-ai-reason className="text-slate/80"><span className="font-semibold">{t('mk.q.why')}</span> {q.ai.reason}</p>}

                            <Textarea id={`mk-note-${q.questionId}`} label={t('mk.q.noteFor')} rows={2} maxLength={1000} disabled={!editable} value={noteOf(q, draft)} onFocus={() => setActive(q.questionId)} onChange={(e) => setQuestion(q.questionId, { note: e.target.value })} />
                            <Select id={`mk-mistake-${q.questionId}`} label={t('mk.q.mistake')} disabled={!editable} value={errorType ?? ''} onChange={(e) => setQuestion(q.questionId, { errorType: (e.target.value || null) as ErrorType | null })}>
                              <option value="">{t('mk.mistake.unset')}</option>
                              {mistakeOptions.map((e) => (
                                <option key={e} value={e}>{t(ERROR_TYPE_KEYS[e])}</option>
                              ))}
                            </Select>
                          </li>
                        );
                      })}
                  </ol>
                </section>
              ))}

              <section data-totals className={SECTION}>
                <div className="flex flex-wrap items-center gap-x-1">
                  <h2 className="text-base font-bold">{t('mk.totals.title')}</h2>
                  <InfoTip>{t('mk.totals.how')}</InfoTip>
                </div>
                <ul className="flex flex-col gap-1">
                  {totals.map((p) => (
                    <li key={p.component} className="flex justify-between gap-3"><span>{p.name}</span><span className="font-bold">{t('mk.review.total', { score: numberWords(p.score, lang), max: numberWords(p.max, lang) })}</span></li>
                  ))}
                </ul>
              </section>

              <section data-overall className={SECTION}>
                <h2 className="text-base font-bold">{t('mk.overall.title')}</h2>
                <Textarea id="mk-strengths" label={t('mk.overall.strengths')} rows={3} maxLength={1000} disabled={!editable} value={draft.strengths ?? detail.strengths ?? ''} onChange={(e) => setDraft({ ...draft, strengths: e.target.value })} />
                <Textarea id="mk-improve" label={t('mk.overall.improve')} rows={3} maxLength={1000} disabled={!editable} value={draft.improve ?? detail.improve ?? ''} onChange={(e) => setDraft({ ...draft, improve: e.target.value })} />
                <fieldset className="flex flex-col gap-2">
                  <legend className="flex flex-wrap items-center gap-x-1 font-semibold">
                    {t('mk.overall.practice')}
                    <InfoTip>{t('mk.overall.practiceHow')}</InfoTip>
                  </legend>
                  {(draft.practice ?? detail.practice).map((p, i) => {
                    const rows = draft.practice ?? detail.practice;
                    const put = (patch: Partial<typeof p>) => setDraft({ ...draft, practice: rows.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
                    return (
                      <div key={i} data-practice={i} className="flex flex-col gap-2 rounded-md border border-slate/10 p-2">
                        <Select id={`mk-practice-unit-${i}`} label={t('mk.overall.topic')} disabled={!editable} value={p.unitId ?? ''} onChange={(e) => put({ unitId: e.target.value || null })}>
                          <option value="">{t('mk.q.noTopic')}</option>
                          {paper.units.map((u) => (
                            <option key={u.unitId} value={u.unitId}>{u.chapter}: {u.topic}</option>
                          ))}
                        </Select>
                        <Textarea id={`mk-practice-text-${i}`} label={t('mk.overall.practiceText')} rows={2} maxLength={300} disabled={!editable} value={p.text} onChange={(e) => put({ text: e.target.value })} />
                        {editable && <button type="button" className={`${TAP} self-start`} onClick={() => setDraft({ ...draft, practice: rows.filter((_, j) => j !== i) })}>{t('mk.overall.practiceRemove')}</button>}
                      </div>
                    );
                  })}
                  {editable && (draft.practice ?? detail.practice).length < 8 && (
                    <button type="button" data-practice-add className={`${TAP} self-start`} onClick={() => setDraft({ ...draft, practice: [...(draft.practice ?? detail.practice), { unitId: null, text: '' }] })}>
                      {t('mk.overall.practiceAdd')}
                    </button>
                  )}
                </fieldset>
              </section>
            </>
          )}

          <div
            data-action-bar
            style={{ bottom: barBottom }}
            className="sticky z-40 -mx-4 flex flex-col gap-2 border-t border-slate/15 bg-white px-4 py-3 shadow-[0_-4px_12px_rgba(30,41,59,0.08)] md:mx-0 md:rounded-lg md:border"
          >
            {confirm === 'again' && (
              <div role="group" aria-label={t('mk.actions.again')} data-confirm="again" className="flex flex-col gap-2 rounded-md bg-off-white p-3">
                <p className="font-semibold">{hasTeacherChanges ? t('mk.actions.againSure') : t('mk.actions.againPlain')}</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={PRIMARY} disabled={busy} onClick={() => void doAgain()}>{t('mk.actions.againYes')}</button>
                  <button type="button" className={TAP} onClick={() => setConfirm(null)}>{t('mk.review.confirmNo')}</button>
                </div>
              </div>
            )}
            {confirm === 'aside' && (
              <div role="group" aria-label={t('mk.actions.aside')} data-confirm="aside" className="flex flex-col gap-2 rounded-md bg-off-white p-3">
                <p className="font-semibold">{t('mk.actions.asideSure')}</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={PRIMARY} disabled={busy} onClick={() => void doAside(true)}>{t('mk.actions.asideYes')}</button>
                  <button type="button" className={TAP} onClick={() => setConfirm(null)}>{t('mk.review.confirmNo')}</button>
                </div>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              {sheet.state !== 'set_aside' && (
                <>
                  <button type="button" data-approve className={PRIMARY} disabled={busy || !mayApprove} onClick={() => void doApprove(false)}>
                    {sheet.state === 'approved' && !sheet.flags.includes('changed') ? t('mk.actions.approved') : t('mk.actions.approve')}
                  </button>
                  {detail.next && (
                    <button type="button" data-approve-next className={TAP} disabled={busy || !mayApprove} onClick={() => void doApprove(true)}>{t('mk.actions.approveNext')}</button>
                  )}
                  {detail.mayChange && (sheet.state === 'marked' || sheet.state === 'failed') && (
                    <button type="button" data-mark-again className={TAP} disabled={busy} onClick={() => setConfirm('again')}>{t('mk.actions.again')}</button>
                  )}
                  {detail.mayChange && sheet.state !== 'approved' && (
                    <button type="button" data-set-aside className={TAP} disabled={busy} onClick={() => setConfirm('aside')}>{t('mk.actions.aside')}</button>
                  )}
                </>
              )}
              {sheet.state === 'set_aside' && detail.mayChange && (
                <button type="button" data-restore className={PRIMARY} disabled={busy} onClick={() => void doAside(false)}>{t('mk.actions.restore')}</button>
              )}
              {detail.next && sheet.state !== 'set_aside' && (
                <a href={sheetHref(paperId, detail.next)} className={TAP}>{t('mk.actions.skip')}</a>
              )}
              <span data-save-state={saving} role="status" className="ml-auto text-slate/80">
                {pending ? (saving === 'error' ? t('mk.save.error') : t('mk.save.pending')) : saving === 'saving' ? t('mk.save.saving') : saving === 'saved' ? t('mk.save.saved') : ''}
              </span>
              {saving === 'error' && pending && <button type="button" className={TAP} onClick={() => void flush()}>{t('mk.save.retry')}</button>}
            </div>
            {approveWhy && !mayApprove && sheet.state !== 'approved' && sheet.state !== 'set_aside' && sheet.state !== 'failed' && !waiting && <p className="text-slate/70">{t(approveWhy)}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

// A mark: − and + in half marks, and a field to type it; never above the question's marks.
function MarkField({ id, value, max, disabled, onChange, onFocus }: { id: string; value: number | null; max: number; disabled: boolean; onChange: (v: number | null) => void; onFocus: () => void }) {
  const { t, lang } = useT();
  const [text, setText] = useState(value === null ? '' : String(value));
  const [problem, setProblem] = useState<'bad' | 'over' | null>(null);
  // The field follows the mark when it changes elsewhere (the − and + buttons, "back to the AI's mark").
  useEffect(() => {
    const typed = parseMark(text, max);
    if ((typed.kind === 'ok' && typed.value !== value) || (typed.kind === 'empty' && value !== null) || typed.kind === 'bad' || typed.kind === 'over') {
      if (!(problem && typed.kind === 'bad') && !(problem && typed.kind === 'over')) setText(value === null ? '' : String(value));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const type = (raw: string) => {
    setText(raw);
    const m = parseMark(raw, max);
    if (m.kind === 'ok') {
      setProblem(null);
      onChange(m.value);
    } else if (m.kind === 'empty') {
      setProblem(null);
      onChange(null);
    } else setProblem(m.kind);
  };
  const step = (delta: 0.5 | -0.5) => {
    setProblem(null);
    const next = stepMark(value, delta, max);
    setText(String(next));
    onChange(next);
  };
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" data-marks-minus className={TAP} disabled={disabled || (value ?? 0) <= 0} aria-label={t('mk.q.less')} onClick={() => step(-0.5)}>
          <span aria-hidden="true">−</span>
          <span className="sr-only">{t('mk.q.less')}</span>
        </button>
        <label htmlFor={id} className="sr-only">{t('mk.q.marksField', { max: numberWords(max, lang) })}</label>
        <input
          id={id}
          data-marks-input
          inputMode="decimal"
          autoComplete="off"
          disabled={disabled}
          aria-invalid={problem !== null}
          aria-describedby={problem ? `${id}-problem` : undefined}
          value={text}
          onFocus={onFocus}
          onChange={(e) => type(e.target.value)}
          onBlur={() => {
            setProblem(null);
            setText(value === null ? '' : String(clampMark(value, max)));
          }}
          className="h-12 min-h-[48px] w-20 rounded-md border border-slate/50 bg-white px-3 text-center text-base font-bold text-slate disabled:opacity-60"
        />
        <button type="button" data-marks-plus className={TAP} disabled={disabled || (value ?? 0) >= max} aria-label={t('mk.q.more')} onClick={() => step(0.5)}>
          <span aria-hidden="true">+</span>
          <span className="sr-only">{t('mk.q.more')}</span>
        </button>
        <span className="text-base font-semibold">{t('mk.q.outOf', { max: numberWords(max, lang) })}</span>
      </div>
      {problem && (
        <p id={`${id}-problem`} role="alert" className="text-red-800">
          {problem === 'over' ? t('mk.q.markOver', { max: numberWords(max, lang) }) : t('mk.q.markBad')}
        </p>
      )}
    </div>
  );
}
