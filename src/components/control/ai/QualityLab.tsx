'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { InfoTip } from '@/components/app-ui/InfoTip';
import { ModelSelect } from './ModelSelect';
import { CARD, NUM, PRIMARY, TAP } from './shared';
import { flatRows, nextSort, sortRows, type Sort, type SortKey } from '@/lib/ai/lab/rows';
import { hasDuplicate, validModel } from '@/lib/ai/model-options';
import type { LabArea, LabCaseSummary } from '@/lib/ai/lab/cases';
import type { LabErrorClass } from '@/lib/ai/lab/runner';
import type { LabLink, LabResult, LabRun, LabRunSummary, LabSetup } from '@/lib/ai/lab/store';
import { columnSummaries, labTable } from '@/lib/ai/lab/table';
import type { MessageKey } from '@/lib/i18n';

// Control → AI → Quality Lab (G4, C372), the screen. The founder picks areas of made-up questions and two to four
// models, and the browser runs the table one cell at a time (one request a case and model, two at once), so a run of
// any length never outlives a route's time. Each answer is shown as it lands, with its time, tokens, whether the
// format was kept and the check passed, or the kind of failure; the founder scores each 1–5 and exports the run.

export type LabData = LabSetup & { cases: LabCaseSummary[]; runs: LabRunSummary[] };

const AREAS: LabArea[] = ['maths', 'science', 'humanities', 'hindi', 'english_roleplay', 'multi_turn', 'edge'];
const ERRORS = ['cases', 'models', 'provider', 'model', 'not_found', 'not_configured', 'score', 'request', 'aal2'];
const MOTION = 'transition duration-150 motion-reduce:transition-none';
const FIELD = `min-h-[44px] rounded-lg border border-slate/30 bg-white px-2 text-sm text-slate ${MOTION}`;
const LETTERS = ['A', 'B', 'C', 'D'];
const CONCURRENCY = 2;
const day = (v: string) => new Date(v).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });

export function QualityLab({ initial }: { initial: LabData }) {
  const { t } = useT();
  const [data] = useState<LabData>(initial);
  const [areas, setAreas] = useState<Set<LabArea>>(() => new Set(AREAS));
  const first = initial.suggestions;
  const [models, setModels] = useState<LabLink[]>(() => {
    const pick = (i: number): LabLink => first[i] ?? { provider: initial.providers[Math.min(i, initial.providers.length - 1)] ?? '', model: '' };
    return [pick(0), pick(1)];
  });
  const [run, setRun] = useState<LabRun | null>(null);
  const [runs, setRuns] = useState<LabRunSummary[]>(initial.runs);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [blind, setBlind] = useState(false);
  const [sort, setSort] = useState<Sort>(null);
  const [drafts, setDrafts] = useState<Record<string, { score: string; notes: string }>>({});
  const stop = useRef(false);

  const caseById = new Map(data.cases.map((c) => [c.id, c]));
  const chosen = data.cases.filter((c) => areas.has(c.area));
  const cleanModels = models.map((m) => ({ provider: m.provider, model: m.model.trim() }));
  const distinct = !hasDuplicate(cleanModels);
  const canRun = !busy && chosen.length > 0 && cleanModels.length >= 2 && distinct && cleanModels.every((m) => m.provider && validModel(m.model));
  const errorText = (code: unknown) => (ERRORS.includes(code as string) ? t(`control.ai.lab.err.${code}` as MessageKey) : t('control.ai.lab.err.other'));

  const post = async (body: Record<string, unknown>) => {
    const res = await fetch('/api/control/ai/lab', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    const got = res ? await res.json().catch(() => null) : null;
    return { ok: !!res?.ok, got };
  };

  const putResult = (r: LabResult) =>
    setRun((cur) => (cur ? { ...cur, results: [...cur.results.filter((x) => !(x.caseId === r.caseId && x.provider === r.provider && x.model === r.model)), r] } : cur));

  const runCells = async (runId: string, cells: { caseId: string; link: LabLink }[]) => {
    stop.current = false;
    setBusy(true);
    setProgress({ done: 0, total: cells.length });
    let next = 0;
    let done = 0;
    let failed: string | null = null;
    const worker = async () => {
      while (!stop.current && failed === null && next < cells.length) {
        const cell = cells[next++];
        const { ok, got } = await post({ action: 'case', runId, caseId: cell.caseId, provider: cell.link.provider, model: cell.link.model });
        if (ok && got?.result) putResult(got.result as LabResult);
        else failed = (got?.code as string) ?? 'other';
        done++;
        setProgress({ done, total: cells.length });
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, cells.length) }, worker));
    setBusy(false);
    setNote(failed !== null ? { ok: false, text: errorText(failed) } : stop.current ? { ok: true, text: t('control.ai.lab.run.stopped') } : { ok: true, text: t('control.ai.lab.run.done') });
    const res = await fetch('/api/control/ai/lab', { cache: 'no-store' }).catch(() => null);
    const fresh = res?.ok ? ((await res.json().catch(() => null)) as LabData | null) : null;
    if (fresh) setRuns(fresh.runs);
  };

  const start = async () => {
    setNote(null);
    setBusy(true);
    const caseIds = chosen.map((c) => c.id);
    const { ok, got } = await post({ action: 'start', caseIds, models: cleanModels });
    if (!ok || !got?.runId) {
      setBusy(false);
      return setNote({ ok: false, text: errorText(got?.code) });
    }
    setRun({ runId: got.runId, datasetVersion: data.datasetVersion, caseIds, models: cleanModels, startedAt: new Date().toISOString(), results: [] });
    setDrafts({});
    await runCells(
      got.runId,
      caseIds.flatMap((caseId) => cleanModels.map((link) => ({ caseId, link })))
    );
  };

  const open = async (runId: string) => {
    setNote(null);
    const res = await fetch(`/api/control/ai/lab?runId=${encodeURIComponent(runId)}`, { cache: 'no-store' }).catch(() => null);
    const got = res?.ok ? ((await res.json().catch(() => null)) as { run: LabRun } | null) : null;
    if (!got) return setNote({ ok: false, text: t('control.ai.lab.err.not_found') });
    setRun(got.run);
    setDrafts({});
  };

  const saveScore = async (r: LabResult) => {
    const d = drafts[r.resultId] ?? { score: r.score === null ? '' : String(r.score), notes: r.notes ?? '' };
    const score = d.score === '' ? null : Number(d.score);
    const { ok, got } = await post({ action: 'score', resultId: r.resultId, score, notes: d.notes.trim() || null });
    if (!ok) return setNote({ ok: false, text: errorText(got?.code) });
    putResult({ ...r, score, notes: d.notes.trim() || null });
    setNote({ ok: true, text: t('control.ai.lab.table.saved') });
  };

  const modelName = (l: LabLink, i: number) => (blind ? t('control.ai.lab.table.blindName', { letter: LETTERS[i] }) : `${l.provider} · ${l.model}`);

  if (data.providers.length === 0) {
    return (
      <section data-lab-not-configured className={CARD}>
        <h2 className="text-lg font-bold">{t('control.ai.lab.notConfigured.title')}</h2>
        <p>{data.keyReady ? t('control.ai.lab.notConfigured.body') : t('control.ai.lab.notConfigured.noServerKey')}</p>
        <Link href="/control/ai" className={`${TAP} inline-flex items-center self-start`}>
          {t('control.ai.lab.notConfigured.link')}
        </Link>
      </section>
    );
  }

  const table = run ? labTable(run) : null;
  const summaries = table ? columnSummaries(table) : [];
  const calls = chosen.length * cleanModels.length;
  const rows = table ? sortRows(flatRows(table), sort, (r) => modelName(r.link, r.column)) : [];
  const head = (k: SortKey) => <SortHead key={k} k={k} sort={sort} onSort={(key) => setSort(nextSort(sort, key))} label={t(`control.ai.lab.col.${k}` as MessageKey)} t={t} />;

  return (
    <div className="flex flex-col gap-4">
      {note && (
        <p role="status" data-lab-note className={`rounded-md border px-3 py-2 text-sm font-semibold ${note.ok ? 'border-emerald-800/30 text-emerald-800' : 'border-red-800/30 text-red-800'}`}>
          {note.text}
        </p>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-2">
      <section data-lab-cases className={CARD}>
        <div className="flex flex-wrap items-center gap-x-1">
          <h2 className="text-lg font-bold">{t('control.ai.lab.cases.title')}</h2>
          <InfoTip>{t('control.ai.lab.cases.how')}</InfoTip>
        </div>
        <p className="text-sm text-slate/80">{t('control.ai.lab.version', { version: data.datasetVersion, count: data.cases.length })}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={TAP} disabled={busy} onClick={() => setAreas(new Set(AREAS))}>
            {t('control.ai.lab.cases.all')}
          </button>
          <button type="button" className={TAP} disabled={busy} onClick={() => setAreas(new Set())}>
            {t('control.ai.lab.cases.none')}
          </button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {AREAS.map((a) => {
            const n = data.cases.filter((c) => c.area === a).length;
            const on = areas.has(a);
            return (
              <label key={a} data-lab-area={a} className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg border border-slate/20 px-3 hover:bg-slate/5">
                <input
                  type="checkbox"
                  className="h-5 w-5"
                  checked={on}
                  disabled={busy}
                  onChange={() => {
                    const nextAreas = new Set(areas);
                    if (on) nextAreas.delete(a);
                    else nextAreas.add(a);
                    setAreas(nextAreas);
                  }}
                />
                <span className="text-sm font-semibold">{t('control.ai.lab.area.line', { area: t(`control.ai.lab.area.${a}` as MessageKey), count: n })}</span>
              </label>
            );
          })}
        </div>
        <p data-lab-chosen className="text-sm">{t('control.ai.lab.cases.chosen', { count: chosen.length })}</p>
      </section>

      <section data-lab-models className={CARD}>
        <div className="flex flex-wrap items-center gap-x-1">
          <h2 className="text-lg font-bold">{t('control.ai.lab.models.title')}</h2>
          <InfoTip>{t('control.ai.lab.models.how')}</InfoTip>
        </div>
        {models.map((m, i) => (
          <div key={i} data-lab-model={i} className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <ModelSelect
                id={`lab-model-${i}`}
                label={t('control.ai.lab.models.model', { n: i + 1 })}
                value={m}
                providers={data.providers}
                lists={data.modelLists}
                taken={models.filter((_, j) => j !== i)}
                disabled={busy}
                t={t}
                onChange={(next) => setModels(models.map((x, j) => (j === i ? next : x)))}
              />
            </div>
            {models.length > 2 && (
              <button type="button" className={`${TAP} h-12`} disabled={busy} onClick={() => setModels(models.filter((_, j) => j !== i))}>
                {t('control.ai.lab.models.remove')}
              </button>
            )}
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-2">
          {models.length < 4 && (
            <button type="button" data-lab-add-model className={TAP} disabled={busy} onClick={() => setModels([...models, { provider: '', model: '' }])}>
              {t('control.ai.lab.models.add')}
            </button>
          )}
          <button type="button" data-lab-run className={PRIMARY} disabled={!canRun} onClick={() => void start()}>
            {t('control.ai.lab.run.start', { calls })}
          </button>
          {busy && progress && (
            <button type="button" data-lab-stop className={TAP} onClick={() => (stop.current = true)}>
              {t('control.ai.lab.run.stop')}
            </button>
          )}
          {progress && (
            <span data-lab-progress aria-live="polite" className={`text-sm font-semibold ${NUM}`}>
              {t('control.ai.lab.run.progress', { done: progress.done, total: progress.total })}
            </span>
          )}
        </div>
        <p className="text-xs text-slate/80">{t('control.ai.lab.run.cost')}</p>
        {!canRun && !busy && <p className="text-sm">{t('control.ai.lab.run.needTwo')}</p>}
      </section>
      </div>

      {run && table && (
        <section data-lab-results className={CARD}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold">{t('control.ai.lab.table.title')}</h2>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex min-h-[44px] cursor-pointer items-center gap-2">
                <input type="checkbox" className="h-5 w-5" checked={blind} onChange={(e) => setBlind(e.target.checked)} />
                <span className="text-sm font-semibold">{t('control.ai.lab.table.blind')}</span>
              </label>
              <a data-lab-export-csv className={`${TAP} inline-flex items-center`} href={`/api/control/ai/lab?runId=${run.runId}&format=csv`} download>
                {t('control.ai.lab.export.csv')}
              </a>
              <a data-lab-export-json className={`${TAP} inline-flex items-center`} href={`/api/control/ai/lab?runId=${run.runId}&format=json`} download>
                {t('control.ai.lab.export.json')}
              </a>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table data-lab-summary className={`w-full min-w-[32rem] border-collapse text-left text-sm ${NUM}`}>
              <thead>
                <tr>
                  <th className="border-b border-slate/20 p-2">{t('control.ai.lab.summary.title')}</th>
                  {table.columns.map((l, i) => (
                    <th key={i} className="border-b border-slate/20 p-2 font-semibold">
                      {modelName(l, i)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ['control.ai.lab.summary.answered', (s) => t('control.ai.lab.summary.count', { n: s.answered, failed: s.failed })],
                    ['control.ai.lab.summary.json', (s) => (s.jsonExpected ? t('control.ai.lab.summary.ofTotal', { n: s.jsonValid, total: s.jsonExpected }) : '–')],
                    ['control.ai.lab.summary.checks', (s) => (s.checks ? t('control.ai.lab.summary.ofTotal', { n: s.checksPassed, total: s.checks }) : '–')],
                    ['control.ai.lab.summary.median', (s) => (s.medianMs === null ? '–' : t('control.ai.lab.summary.ms', { ms: s.medianMs }))],
                    ['control.ai.lab.summary.score', (s) => (s.meanScore === null ? '–' : t('control.ai.lab.summary.meanScore', { score: s.meanScore, n: s.scored }))],
                    ['control.ai.lab.summary.cost', (s) => (s.costUsd === null ? t('control.ai.lab.summary.costUnknown') : t('control.ai.lab.summary.usd', { value: s.costUsd.toFixed(6) }))],
                  ] as [MessageKey, (s: (typeof summaries)[number]) => string][]
                ).map(([label, value]) => (
                  <tr key={label}>
                    <th scope="row" className="border-b border-slate/10 p-2 font-semibold">
                      {t(label)}
                    </th>
                    {summaries.map((s, i) => (
                      <td key={i} className="border-b border-slate/10 p-2">
                        {value(s)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* One row for each case and model. The table scrolls inside itself, so the page stays the size of the screen. */}
          <div data-lab-scroll tabIndex={0} role="region" aria-label={t('control.ai.lab.table.title')} className="max-h-[65vh] overflow-auto rounded-xl border border-slate/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sapphire">
            <table data-lab-table className={`w-full min-w-[64rem] border-collapse text-left text-sm ${NUM}`}>
              <thead className="sticky top-0 z-10 bg-off-white">
                <tr className="border-b border-slate/20">
                  {head('case')}
                  {head('model')}
                  {head('time')}
                  {head('tokens')}
                  {head('cost')}
                  <th className="px-2 py-2 font-semibold">{t('control.ai.lab.col.json')}</th>
                  <th className="px-2 py-2 font-semibold">{t('control.ai.lab.col.check')}</th>
                  {head('score')}
                  <th className="px-2 py-2 font-semibold">{t('control.ai.lab.col.note')}</th>
                  <th className="px-2 py-2 font-semibold">{t('control.ai.lab.col.answer')}</th>
                  <th className="px-2 py-2 font-semibold">
                    <span className="sr-only">{t('control.ai.lab.col.actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const c = caseById.get(row.caseId);
                  const cell = row.result;
                  return (
                    <tr key={row.key} data-lab-cell data-lab-case={row.caseId} className="border-b border-slate/10 align-top last:border-0 hover:bg-slate/5">
                      <td className="min-w-[10rem] px-2 py-2">
                        <details>
                          <summary className="flex min-h-[44px] cursor-pointer items-center font-semibold">
                            {c ? t('control.ai.lab.table.caseLine', { area: t(`control.ai.lab.area.${c.area}` as MessageKey), id: row.caseId }) : row.caseId}
                          </summary>
                          {c && <p>{c.ask}</p>}
                          {c && (
                            <>
                              <p className="mt-2 font-semibold">{t('control.ai.lab.table.rubric')}</p>
                              <ul className="list-disc pl-5">
                                {c.rubric.map((h) => (
                                  <li key={h}>{h}</li>
                                ))}
                              </ul>
                            </>
                          )}
                        </details>
                      </td>
                      <td className="min-w-[9rem] break-words px-2 py-2 font-semibold">{modelName(row.link, row.column)}</td>
                      {!cell ? (
                        <td colSpan={9} className="px-2 py-2 text-slate/80">
                          {t('control.ai.lab.table.waiting')}
                        </td>
                      ) : (
                        <Row cell={cell} draft={drafts[cell.resultId]} busy={busy} onDraft={(d) => setDrafts({ ...drafts, [cell.resultId]: d })} onSave={() => void saveScore(cell)} onAgain={() => void runCells(run.runId, [{ caseId: cell.caseId, link: row.link }])} />
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section data-lab-runs className={CARD}>
        <h2 className="text-lg font-bold">{t('control.ai.lab.runs.title')}</h2>
        {runs.length === 0 && <p>{t('control.ai.lab.runs.none')}</p>}
        <ul className="flex flex-col gap-2">
          {runs.map((r) => (
            <li key={r.runId} data-lab-run-line className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate/10 p-3">
              <span className="min-w-0 break-words text-sm">
                {t('control.ai.lab.runs.line', { date: day(r.startedAt), cases: r.cases, models: r.models.map((m) => `${m.provider} · ${m.model}`).join(', '), answered: r.answered, scored: r.scored })}
              </span>
              <button type="button" className={TAP} disabled={busy} onClick={() => void open(r.runId)}>
                {t('control.ai.lab.runs.open')}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

const ERROR_CLASS: Record<LabErrorClass, MessageKey> = {
  auth_failed: 'control.ai.lab.error.auth_failed',
  rate_limited: 'control.ai.lab.error.rate_limited',
  upstream_timeout: 'control.ai.lab.error.upstream_timeout',
  upstream_unavailable: 'control.ai.lab.error.upstream_unavailable',
  model_unavailable: 'control.ai.lab.error.model_unavailable',
  invalid_request: 'control.ai.lab.error.invalid_request',
  content_rejected: 'control.ai.lab.error.content_rejected',
  output_schema_invalid: 'control.ai.lab.error.output_schema_invalid',
  not_configured: 'control.ai.lab.error.not_configured',
  unknown_provider_error: 'control.ai.lab.error.unknown_provider_error',
};

// A sortable column header: a button that says which way it sorts (aria-sort on the cell, an arrow beside the name).
function SortHead({ k, sort, onSort, label, t }: { k: SortKey; sort: Sort; onSort: (k: SortKey) => void; label: string; t: ReturnType<typeof useT>['t'] }) {
  const on = sort?.key === k ? sort.dir : null;
  return (
    <th aria-sort={on === 'asc' ? 'ascending' : on === 'desc' ? 'descending' : 'none'} className="px-1 py-1 font-semibold">
      <button type="button" data-lab-sort={k} onClick={() => onSort(k)} className="inline-flex min-h-[44px] items-center gap-1 rounded-lg px-2 hover:bg-slate/5 motion-reduce:transition-none" title={t('control.ai.lab.col.sort')}>
        {label}
        <span aria-hidden="true" className="w-3 text-slate/70">
          {on === 'asc' ? '↑' : on === 'desc' ? '↓' : ''}
        </span>
      </button>
    </th>
  );
}

// The cells of one result row: its numbers, the score and note inline, the answer folded, and the two buttons.
function Row({ cell, draft, busy, onDraft, onSave, onAgain }: { cell: LabResult; draft?: { score: string; notes: string }; busy: boolean; onDraft: (d: { score: string; notes: string }) => void; onSave: () => void; onAgain: () => void }) {
  const { t } = useT();
  const d = draft ?? { score: cell.score === null ? '' : String(cell.score), notes: cell.notes ?? '' };
  const yes = (v: boolean | null, kind: 'json' | 'check') =>
    v === null ? (
      '–'
    ) : (
      <span data-lab-json={kind === 'json' ? String(v) : undefined} data-lab-check={kind === 'check' ? String(v) : undefined} className={v ? 'font-semibold text-emerald-800' : 'font-semibold text-red-800'}>
        {t(v ? 'control.ai.lab.col.yes' : 'control.ai.lab.col.no')}
      </span>
    );
  return (
    <>
      <td className="whitespace-nowrap px-2 py-2" title={cell.firstTokenMs === null ? undefined : t('control.ai.lab.table.time', { ms: cell.latencyMs, first: cell.firstTokenMs })}>
        {t('control.ai.lab.summary.ms', { ms: cell.latencyMs })}
      </td>
      <td className="whitespace-nowrap px-2 py-2">{!cell.errorClass || cell.errorClass === 'output_schema_invalid' ? t('control.ai.lab.col.tokensValue', { sent: cell.tokensIn, received: cell.tokensOut }) : '–'}</td>
      <td data-lab-cell-cost={cell.costUsd === null ? 'unknown' : 'known'} className="whitespace-nowrap px-2 py-2">
        {cell.costUsd === null ? t('control.ai.lab.col.costUnknown') : t('control.ai.stat.usd', { value: cell.costUsd.toFixed(6) })}
      </td>
      <td className="px-2 py-2">{yes(cell.jsonValid, 'json')}</td>
      <td className="px-2 py-2">{yes(cell.checkPassed, 'check')}</td>
      <td className="px-2 py-2">
        <select aria-label={t('control.ai.lab.table.score')} id={`score-${cell.resultId}`} className={`${FIELD} w-32`} value={d.score} onChange={(e) => onDraft({ ...d, score: e.target.value })}>
          <option value="">{t('control.ai.lab.table.scoreNone')}</option>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={String(n)}>
              {n}
            </option>
          ))}
        </select>
      </td>
      <td className="px-2 py-2">
        <input aria-label={t('control.ai.lab.table.notes')} id={`notes-${cell.resultId}`} maxLength={1000} className={`${FIELD} w-40`} value={d.notes} onChange={(e) => onDraft({ ...d, notes: e.target.value })} />
      </td>
      <td className="min-w-[14rem] max-w-[22rem] px-2 py-2">
        {cell.errorClass && (
          <p data-lab-error={cell.errorClass} className="mb-1 inline-block rounded border border-red-800/30 px-2 py-1 font-semibold text-red-800">
            {t(ERROR_CLASS[cell.errorClass])}
          </p>
        )}
        {cell.outputText && (
          <details>
            <summary className="flex min-h-[44px] cursor-pointer items-center">
              <span className="line-clamp-2 break-words">{cell.outputText}</span>
            </summary>
            <p className="whitespace-pre-wrap break-words">{cell.outputText}</p>
          </details>
        )}
      </td>
      <td className="px-2 py-2">
        <span className="flex gap-2">
          <button type="button" data-lab-score-save className={TAP} disabled={busy} onClick={onSave}>
            {t('control.ai.lab.table.save')}
          </button>
          <button type="button" data-lab-again className={TAP} disabled={busy} onClick={onAgain}>
            {t('control.ai.lab.table.again')}
          </button>
        </span>
      </td>
    </>
  );
}
