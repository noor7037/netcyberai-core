'use client';

import { useMemo, useState } from 'react';
import { useWords } from '@/components/app-shell/Words';
import { Badge } from '@/components/ui/Badge';
import { Checkbox } from '@/components/ui/Checkbox';
import { EmptyState } from '@/components/ui/EmptyState';
import { Select } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import type { Coverage, UnitStatus } from '@/lib/content/coverage';
import { inPilot, pilotScopeIsEmpty, type PilotScope } from '@/lib/content/pilot-scope';
import type { MessageKey } from '@/lib/i18n';

// Control → Content → Coverage (W9-D, docs/39 §4): every unit of every published syllabus with the chapters published,
// reviewed, draft and missing, the open requests and the last day a chapter was published; the totals above it. Cards
// at phone width, a table from 768 px. Filters work on the rows already loaded; the export takes the same filter.
// Every word comes from the message files (control.coverage.*). It shows only what the database holds: no estimate.
// W12-D: the Pilot scope panel (board, classes, subjects of the first real school; the super admin sets it), a "Pilot only"
// filter that applies it and a Pilot pill on every unit inside it. With no scope set the panel says so and nothing is Pilot.

const STATUS_VARIANT: Record<UnitStatus, 'success' | 'warning' | 'danger'> = { published: 'success', partly: 'warning', missing: 'danger' };
const STEP = 100;

export function CoverageView({ initial, initialScope, canEdit }: { initial: Coverage; initialScope: PilotScope; canEdit: boolean }) {
  const { t, has } = useWords();
  const [board, setBoard] = useState('');
  const [cls, setCls] = useState('');
  const [subject, setSubject] = useState('');
  const [shown, setShown] = useState(STEP);
  const [scope, setScope] = useState<PilotScope>(initialScope);
  const [pilot, setPilot] = useState(false);
  const [draft, setDraft] = useState<PilotScope>(initialScope);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const boards = useMemo(() => Array.from(new Set(initial.units.map((u) => u.boardId))).sort(), [initial]);
  const classes = useMemo(() => Array.from(new Set(initial.units.map((u) => u.classLevel))).sort((a, b) => a - b), [initial]);
  const subjects = useMemo(() => Array.from(new Set(initial.units.map((u) => u.subject))).sort(), [initial]);

  const subjectLabel = (s: string) => (has(`fam.subject.${s}`) ? t(`fam.subject.${s}` as MessageKey) : s.replace(/_/g, ' '));
  const keep = (x: { boardId: string; classLevel: number; subject: string }) => (!board || x.boardId === board) && (!cls || x.classLevel === Number(cls)) && (!subject || x.subject === subject) && (!pilot || inPilot(scope, x));
  const units = useMemo(() => initial.units.filter(keep), [initial, board, cls, subject, pilot, scope]); // eslint-disable-line react-hooks/exhaustive-deps
  const totals = useMemo(() => initial.totals.filter(keep), [initial, board, cls, subject, pilot, scope]); // eslint-disable-line react-hooks/exhaustive-deps
  const chapters = totals.reduce((n, g) => n + g.chapters, 0);
  const published = totals.reduce((n, g) => n + g.published, 0);
  const pct = chapters > 0 ? Math.round((published / chapters) * 100) : null;
  const query = new URLSearchParams({ ...(board ? { board } : {}), ...(cls ? { class: cls } : {}), ...(subject ? { subject } : {}), ...(pilot ? { pilot: '1' } : {}) }).toString();
  const onFilter = (set: (v: string) => void) => (e: { target: { value: string } }) => {
    set(e.target.value);
    setShown(STEP);
  };
  const status = (s: UnitStatus) => <Badge variant={STATUS_VARIANT[s]}>{t(`control.coverage.status.${s}` as MessageKey)}</Badge>;
  const pill = (u: { boardId: string; classLevel: number; subject: string }) => (inPilot(scope, u) ? <Badge className="border border-slate/30" data-coverage-pilot-pill>{t('control.coverage.pilot.pill')}</Badge> : null);
  const share = (p: number | null) => (p === null ? t('control.coverage.noChapters') : `${p}%`);

  const toggle = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const summary = (s: PilotScope) =>
    [s.boardId ?? t('control.coverage.pilot.anyBoard'), s.classLevels.length ? t('control.coverage.pilot.classes', { list: s.classLevels.join(', ') }) : t('control.coverage.pilot.anyClass'), s.subjects.length ? s.subjects.map(subjectLabel).join(', ') : t('control.coverage.pilot.anySubject')].join(' · ');
  const save = async (next: PilotScope) => {
    setBusy(true);
    setNote(null);
    const res = await fetch('/api/control/content/pilot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) }).catch(() => null);
    const got = res ? await res.json().catch(() => null) : null;
    setBusy(false);
    if (!res?.ok || !got?.scope) {
      setNote({ ok: false, text: t('control.coverage.pilot.error') });
      return;
    }
    setScope(got.scope);
    setDraft(got.scope);
    if (pilotScopeIsEmpty(got.scope)) setPilot(false);
    setNote({ ok: true, text: t(pilotScopeIsEmpty(got.scope) ? 'control.coverage.pilot.cleared' : 'control.coverage.pilot.saved') });
  };

  if (initial.units.length === 0) return <EmptyState title={t('control.coverage.empty.title')} description={t('control.coverage.empty.body')} />;

  return (
    <div className="flex flex-col gap-4" data-coverage-view>
      <section aria-labelledby="coverage-pilot" data-coverage-pilot className="rounded-2xl border border-slate/10 bg-white p-4 shadow-sm">
        <h2 id="coverage-pilot" className="text-lg font-bold text-slate">
          {t('control.coverage.pilot.title')}
        </h2>
        <p className="mt-1 text-sm text-slate" data-coverage-pilot-state>
          {pilotScopeIsEmpty(scope) ? t('control.coverage.pilot.none') : t('control.coverage.pilot.current', { scope: summary(scope) })}
        </p>
        {canEdit ? (
          <div className="mt-3 flex flex-col gap-3">
            <p className="text-sm text-slate/70">{t('control.coverage.pilot.help')}</p>
            <Select id="pilot-board" label={t('control.coverage.filter.board')} value={draft.boardId ?? ''} onChange={(e) => setDraft({ ...draft, boardId: e.target.value || null })}>
              <option value="">{t('control.coverage.pilot.anyBoard')}</option>
              {boards.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </Select>
            <fieldset>
              <legend className="text-sm font-semibold text-slate">{t('control.coverage.filter.class')}</legend>
              <div className="grid grid-cols-2 gap-x-3 sm:grid-cols-4 md:grid-cols-6">
                {classes.map((c) => (
                  <Checkbox key={c} id={`pilot-class-${c}`} label={t('control.coverage.class', { n: c })} checked={draft.classLevels.includes(c)} onChange={() => setDraft({ ...draft, classLevels: toggle(draft.classLevels, c).sort((a, b) => a - b) })} />
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="text-sm font-semibold text-slate">{t('control.coverage.filter.subject')}</legend>
              <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2 md:grid-cols-3">
                {subjects.map((s) => (
                  <Checkbox key={s} id={`pilot-subject-${s}`} label={subjectLabel(s)} checked={draft.subjects.includes(s)} onChange={() => setDraft({ ...draft, subjects: toggle(draft.subjects, s) })} />
                ))}
              </div>
            </fieldset>
            <div className="flex flex-wrap gap-3">
              <button type="button" disabled={busy} onClick={() => save(draft)} className="min-h-[44px] rounded-full bg-sapphire px-5 text-sm font-semibold text-off-white hover:bg-sapphire/90 disabled:cursor-not-allowed disabled:opacity-60" data-coverage-pilot-save>
                {t('control.coverage.pilot.save')}
              </button>
              {!pilotScopeIsEmpty(scope) && (
                <button type="button" disabled={busy} onClick={() => save({ boardId: null, classLevels: [], subjects: [] })} className="min-h-[44px] rounded-full border-2 border-sapphire px-5 text-sm font-semibold text-sapphire hover:bg-sapphire/10 disabled:cursor-not-allowed disabled:opacity-60">
                  {t('control.coverage.pilot.clear')}
                </button>
              )}
            </div>
            {note && (
              <p role="status" className={`text-sm font-semibold ${note.ok ? 'text-emerald-text' : 'text-red-800'}`}>
                {note.text}
              </p>
            )}
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate/70">{t('control.coverage.pilot.readonly')}</p>
        )}
      </section>

      <Switch id="coverage-pilot-only" label={t('control.coverage.pilot.only')} checked={pilot} disabled={pilotScopeIsEmpty(scope)} onChange={(e) => { setPilot(e.target.checked); setShown(STEP); }} stateText={pilotScopeIsEmpty(scope) ? t('control.coverage.pilot.none') : undefined} />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Select id="coverage-board" label={t('control.coverage.filter.board')} value={board} onChange={onFilter(setBoard)}>
          <option value="">{t('control.coverage.filter.all')}</option>
          {boards.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </Select>
        <Select id="coverage-class" label={t('control.coverage.filter.class')} value={cls} onChange={onFilter(setCls)}>
          <option value="">{t('control.coverage.filter.all')}</option>
          {classes.map((c) => (
            <option key={c} value={c}>
              {t('control.coverage.class', { n: c })}
            </option>
          ))}
        </Select>
        <Select id="coverage-subject" label={t('control.coverage.filter.subject')} value={subject} onChange={onFilter(setSubject)}>
          <option value="">{t('control.coverage.filter.all')}</option>
          {subjects.map((s) => (
            <option key={s} value={s}>
              {subjectLabel(s)}
            </option>
          ))}
        </Select>
      </div>

      <section aria-labelledby="coverage-totals" data-coverage-totals className="rounded-2xl border border-slate/10 bg-white p-4 shadow-sm">
        <h2 id="coverage-totals" className="text-lg font-bold text-slate">
          {t('control.coverage.totals.title')}
        </h2>
        <p className="mt-1 text-sm text-slate" data-coverage-all>
          {chapters > 0 ? t('control.coverage.totals.all', { published, chapters, share: pct ?? 0, units: units.length }) : t('control.coverage.totals.none', { units: units.length })}
        </p>
        <ul className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
          {totals.map((g) => (
            <li key={`${g.boardId}-${g.classLevel}-${g.subject}`} className="rounded-xl border border-slate/10 p-3" data-coverage-group>
              <p className="text-sm font-semibold text-slate">{t('control.coverage.group', { board: g.boardId, n: g.classLevel, subject: subjectLabel(g.subject) })}</p>
              <p className="text-sm text-slate/70">
                {t('control.coverage.group.line', { published: g.published, chapters: g.chapters, share: share(g.publishedShare), units: g.units, unitsPublished: g.unitsPublished })}
              </p>
              <div aria-hidden="true" className="mt-2 h-2 overflow-hidden rounded-full bg-slate/10">
                <div className="h-2 bg-sapphire" style={{ width: `${g.publishedShare ?? 0}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-slate/70" aria-live="polite">
          {t('control.coverage.rows', { n: units.length })}
        </span>
        <a
          href={`/api/control/content/coverage/export${query ? `?${query}` : ''}`}
          download
          className="inline-flex min-h-[44px] items-center rounded-full border-2 border-sapphire px-5 text-sm font-semibold text-sapphire hover:bg-sapphire/10"
          data-coverage-export
        >
          {t('control.coverage.export')}
        </a>
      </div>

      {units.length === 0 ? (
        <EmptyState title={t('control.coverage.none')} />
      ) : (
        <>
          <ul className="flex flex-col gap-3 md:hidden" data-coverage-cards>
            {units.slice(0, shown).map((u) => (
              <li key={`${u.boardId}-${u.classLevel}-${u.subject}-${u.unitKey}`} className="rounded-2xl border border-slate/10 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-slate">{u.unitTitleEn}</p>
                  <span className="flex shrink-0 flex-wrap justify-end gap-1">
                    {pill(u)}
                    {status(u.status)}
                  </span>
                </div>
                <p className="text-sm text-slate/70">{t('control.coverage.group', { board: u.boardId, n: u.classLevel, subject: subjectLabel(u.subject) })}</p>
                <p className="mt-1 text-sm text-slate">{t('control.coverage.card.chapters', { chapters: u.chapters, topics: u.topics })}</p>
                <p className="text-sm text-slate">{t('control.coverage.card.states', { published: u.published, reviewed: u.reviewed, draft: u.draft, none: u.none })}</p>
                <p className="mt-1 text-xs text-slate/70">
                  {t('control.coverage.card.requests', { n: u.openRequests })} · {u.lastPublished ? t('control.coverage.card.last', { date: u.lastPublished }) : t('control.coverage.card.never')}
                </p>
              </li>
            ))}
          </ul>

          <div className="hidden overflow-x-auto rounded-2xl border border-slate/10 bg-white md:block">
            <table className="w-full text-left text-sm" data-coverage-table>
              <thead className="bg-slate/5 text-xs uppercase text-slate/70">
                <tr>
                  {(['unit', 'board', 'class', 'subject', 'topics', 'published', 'reviewed', 'draft', 'none', 'requests', 'last', 'status'] as const).map((c) => (
                    <th key={c} scope="col" className="px-3 py-2 font-semibold">
                      {t(`control.coverage.col.${c}` as MessageKey)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {units.slice(0, shown).map((u) => (
                  <tr key={`${u.boardId}-${u.classLevel}-${u.subject}-${u.unitKey}`} className="border-t border-slate/10 align-top">
                    <td className="px-3 py-2 font-semibold text-slate">{u.unitTitleEn}</td>
                    <td className="px-3 py-2 text-slate">{u.boardId}</td>
                    <td className="px-3 py-2 text-slate">{u.classLevel}</td>
                    <td className="px-3 py-2 text-slate">{subjectLabel(u.subject)}</td>
                    <td className="px-3 py-2 text-slate">{u.topics}</td>
                    <td className="px-3 py-2 text-slate">{u.published}</td>
                    <td className="px-3 py-2 text-slate">{u.reviewed}</td>
                    <td className="px-3 py-2 text-slate">{u.draft}</td>
                    <td className="px-3 py-2 text-slate">{u.none}</td>
                    <td className="px-3 py-2 text-slate">{u.openRequests}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate/70">{u.lastPublished ?? '—'}</td>
                    <td className="px-3 py-2"><span className="flex flex-wrap gap-1">{pill(u)}{status(u.status)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {units.length > shown && (
            <button type="button" onClick={() => setShown(shown + STEP)} className="min-h-[44px] self-start rounded-full border-2 border-sapphire px-5 text-sm font-semibold text-sapphire hover:bg-sapphire/10">
              {t('control.coverage.more', { n: units.length - shown })}
            </button>
          )}
        </>
      )}
    </div>
  );
}
