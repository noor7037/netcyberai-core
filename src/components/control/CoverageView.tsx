'use client';

import { useMemo, useState } from 'react';
import { useWords } from '@/components/app-shell/Words';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Select } from '@/components/ui/Select';
import type { Coverage, UnitStatus } from '@/lib/content/coverage';
import type { MessageKey } from '@/lib/i18n';

// Control → Content → Coverage (W9-D, docs/39 §4): every unit of every published syllabus with the chapters published,
// reviewed, draft and missing, the open requests and the last day a chapter was published; the totals above it. Cards
// at phone width, a table from 768 px. Filters work on the rows already loaded; the export takes the same filter.
// Every word comes from the message files (control.coverage.*). It shows only what the database holds: no estimate.

const STATUS_VARIANT: Record<UnitStatus, 'success' | 'warning' | 'danger'> = { published: 'success', partly: 'warning', missing: 'danger' };
const STEP = 100;

export function CoverageView({ initial }: { initial: Coverage }) {
  const { t, has } = useWords();
  const [board, setBoard] = useState('');
  const [cls, setCls] = useState('');
  const [subject, setSubject] = useState('');
  const [shown, setShown] = useState(STEP);

  const boards = useMemo(() => Array.from(new Set(initial.units.map((u) => u.boardId))).sort(), [initial]);
  const classes = useMemo(() => Array.from(new Set(initial.units.map((u) => u.classLevel))).sort((a, b) => a - b), [initial]);
  const subjects = useMemo(() => Array.from(new Set(initial.units.map((u) => u.subject))).sort(), [initial]);

  const subjectLabel = (s: string) => (has(`fam.subject.${s}`) ? t(`fam.subject.${s}` as MessageKey) : s.replace(/_/g, ' '));
  const keep = (x: { boardId: string; classLevel: number; subject: string }) => (!board || x.boardId === board) && (!cls || x.classLevel === Number(cls)) && (!subject || x.subject === subject);
  const units = useMemo(() => initial.units.filter(keep), [initial, board, cls, subject]); // eslint-disable-line react-hooks/exhaustive-deps
  const totals = useMemo(() => initial.totals.filter(keep), [initial, board, cls, subject]); // eslint-disable-line react-hooks/exhaustive-deps
  const chapters = totals.reduce((n, g) => n + g.chapters, 0);
  const published = totals.reduce((n, g) => n + g.published, 0);
  const pct = chapters > 0 ? Math.round((published / chapters) * 100) : null;
  const query = new URLSearchParams({ ...(board ? { board } : {}), ...(cls ? { class: cls } : {}), ...(subject ? { subject } : {}) }).toString();
  const onFilter = (set: (v: string) => void) => (e: { target: { value: string } }) => {
    set(e.target.value);
    setShown(STEP);
  };
  const status = (s: UnitStatus) => <Badge variant={STATUS_VARIANT[s]}>{t(`control.coverage.status.${s}` as MessageKey)}</Badge>;
  const share = (p: number | null) => (p === null ? t('control.coverage.noChapters') : `${p}%`);

  if (initial.units.length === 0) return <EmptyState title={t('control.coverage.empty.title')} description={t('control.coverage.empty.body')} />;

  return (
    <div className="flex flex-col gap-4" data-coverage-view>
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
                  {status(u.status)}
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
                    <td className="px-3 py-2">{status(u.status)}</td>
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
