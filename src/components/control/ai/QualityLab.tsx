'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { InfoTip } from '@/components/app-ui/InfoTip';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
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
const TAP = 'min-h-[44px] rounded-md border border-slate/20 px-4 text-sm font-semibold text-slate disabled:opacity-60';
const PRIMARY = 'min-h-[44px] rounded-md bg-sapphire px-5 text-sm font-semibold text-white disabled:opacity-60';
const CARD = 'flex flex-col gap-3 rounded-xl border border-slate/10 bg-white p-4';
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
  const [drafts, setDrafts] = useState<Record<string, { score: string; notes: string }>>({});
  const stop = useRef(false);

  const caseById = new Map(data.cases.map((c) => [c.id, c]));
  const chosen = data.cases.filter((c) => areas.has(c.area));
  const cleanModels = models.map((m) => ({ provider: m.provider, model: m.model.trim() }));
  const distinct = new Set(cleanModels.map((m) => `${m.provider} ${m.model}`)).size === cleanModels.length;
  const canRun = !busy && chosen.length > 0 && cleanModels.length >= 2 && distinct && cleanModels.every((m) => m.provider && m.model);
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

  return (
    <div className="flex flex-col gap-4">
      {note && (
        <p role="status" data-lab-note className={`rounded-md border px-3 py-2 text-sm font-semibold ${note.ok ? 'border-emerald-800/30 text-emerald-800' : 'border-red-800/30 text-red-800'}`}>
          {note.text}
        </p>
      )}

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
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {AREAS.map((a) => {
            const n = data.cases.filter((c) => c.area === a).length;
            const on = areas.has(a);
            return (
              <label key={a} data-lab-area={a} className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-md border border-slate/20 px-3">
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
          <div key={i} data-lab-model={i} className="grid gap-2 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto] sm:items-end">
            <Select id={`lab-provider-${i}`} label={t('control.ai.lab.models.provider', { n: i + 1 })} value={m.provider} disabled={busy} onChange={(e) => setModels(models.map((x, j) => (j === i ? { ...x, provider: e.target.value } : x)))}>
              {data.providers.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
            <Input
              id={`lab-model-${i}`}
              maxLength={80}
              spellCheck={false}
              list={`lab-models-${i}`}
              label={t('control.ai.lab.models.model', { n: i + 1 })}
              value={m.model}
              disabled={busy}
              onChange={(e) => setModels(models.map((x, j) => (j === i ? { ...x, model: e.target.value } : x)))}
            />
            <datalist id={`lab-models-${i}`}>
              {data.suggestions
                .filter((s) => s.provider === m.provider)
                .map((s) => (
                  <option key={s.model} value={s.model} />
                ))}
            </datalist>
            {models.length > 2 && (
              <button type="button" className={TAP} disabled={busy} onClick={() => setModels(models.filter((_, j) => j !== i))}>
                {t('control.ai.lab.models.remove')}
              </button>
            )}
          </div>
        ))}
        {models.length < 4 && (
          <button type="button" data-lab-add-model className={`${TAP} self-start`} disabled={busy} onClick={() => setModels([...models, { provider: data.providers[0], model: '' }])}>
            {t('control.ai.lab.models.add')}
          </button>
        )}
        <p className="text-sm text-slate/80">{t('control.ai.lab.run.cost')}</p>
        {!canRun && !busy && <p className="text-sm">{t('control.ai.lab.run.needTwo')}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" data-lab-run className={PRIMARY} disabled={!canRun} onClick={() => void start()}>
            {t('control.ai.lab.run.start', { calls })}
          </button>
          {busy && progress && (
            <button type="button" data-lab-stop className={TAP} onClick={() => (stop.current = true)}>
              {t('control.ai.lab.run.stop')}
            </button>
          )}
          {progress && (
            <span data-lab-progress aria-live="polite" className="text-sm font-semibold">
              {t('control.ai.lab.run.progress', { done: progress.done, total: progress.total })}
            </span>
          )}
        </div>
      </section>

      {run && table && (
        <section data-lab-results className={CARD}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold">{t('control.ai.lab.table.title')}</h2>
            <div className="flex flex-wrap gap-2">
              <a data-lab-export-csv className={`${TAP} inline-flex items-center`} href={`/api/control/ai/lab?runId=${run.runId}&format=csv`} download>
                {t('control.ai.lab.export.csv')}
              </a>
              <a data-lab-export-json className={`${TAP} inline-flex items-center`} href={`/api/control/ai/lab?runId=${run.runId}&format=json`} download>
                {t('control.ai.lab.export.json')}
              </a>
            </div>
          </div>
          <label className="flex min-h-[44px] cursor-pointer items-center gap-3 self-start">
            <input type="checkbox" className="h-5 w-5" checked={blind} onChange={(e) => setBlind(e.target.checked)} />
            <span className="text-sm font-semibold">{t('control.ai.lab.table.blind')}</span>
          </label>

          <div className="overflow-x-auto">
            <table data-lab-summary className="w-full min-w-[32rem] border-collapse text-left text-sm">
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

          <ul className="flex flex-col gap-3">
            {table.rows.map((row) => {
              const c = caseById.get(row.caseId);
              return (
                <li key={row.caseId} data-lab-case={row.caseId} className="flex flex-col gap-2 rounded-md border border-slate/10 p-3">
                  <p className="font-bold">
                    {c ? t('control.ai.lab.table.caseLine', { area: t(`control.ai.lab.area.${c.area}` as MessageKey), id: row.caseId }) : row.caseId}
                  </p>
                  {c && <p className="text-sm">{c.ask}</p>}
                  {c && (
                    <details className="text-sm">
                      <summary className="flex min-h-[44px] cursor-pointer items-center font-semibold">{t('control.ai.lab.table.rubric')}</summary>
                      <ul className="list-disc pl-5">
                        {c.rubric.map((h) => (
                          <li key={h}>{h}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                  <div className={`grid gap-3 ${table.columns.length > 2 ? 'md:grid-cols-2 xl:grid-cols-4' : 'md:grid-cols-2'}`}>
                    {row.cells.map((cell, i) => (
                      <div key={i} data-lab-cell className="flex min-w-0 flex-col gap-2 rounded-md bg-off-white p-3">
                        <p className="break-words text-sm font-bold">{modelName(table.columns[i], i)}</p>
                        {!cell ? (
                          <p className="text-sm text-slate/80">{t('control.ai.lab.table.waiting')}</p>
                        ) : (
                          <Cell cell={cell} draft={drafts[cell.resultId]} busy={busy} onDraft={(d) => setDrafts({ ...drafts, [cell.resultId]: d })} onSave={() => void saveScore(cell)} onAgain={() => void runCells(run.runId, [{ caseId: cell.caseId, link: table.columns[i] }])} />
                        )}
                      </div>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
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

function Cell({ cell, draft, busy, onDraft, onSave, onAgain }: { cell: LabResult; draft?: { score: string; notes: string }; busy: boolean; onDraft: (d: { score: string; notes: string }) => void; onSave: () => void; onAgain: () => void }) {
  const { t } = useT();
  const d = draft ?? { score: cell.score === null ? '' : String(cell.score), notes: cell.notes ?? '' };
  const excerpt = cell.outputText.length > 400 ? `${cell.outputText.slice(0, 400)}…` : cell.outputText;
  return (
    <>
      {cell.errorClass && (
        <p data-lab-error={cell.errorClass} className="self-start rounded border border-red-800/30 px-2 py-1 text-sm font-semibold text-red-800">
          {t(ERROR_CLASS[cell.errorClass])}
        </p>
      )}
      {cell.outputText && <p className="whitespace-pre-wrap break-words text-sm">{excerpt}</p>}
      {cell.outputText.length > 400 && (
        <details className="text-sm">
          <summary className="flex min-h-[44px] cursor-pointer items-center font-semibold">{t('control.ai.lab.table.showAll')}</summary>
          <p className="whitespace-pre-wrap break-words">{cell.outputText}</p>
        </details>
      )}
      <ul className="text-sm text-slate/80">
        <li>{cell.firstTokenMs === null ? t('control.ai.lab.table.timeNoFirst', { ms: cell.latencyMs }) : t('control.ai.lab.table.time', { ms: cell.latencyMs, first: cell.firstTokenMs })}</li>
        {!cell.errorClass || cell.errorClass === 'output_schema_invalid' ? <li>{t('control.ai.lab.table.tokens', { sent: cell.tokensIn, received: cell.tokensOut })}</li> : null}
        {cell.jsonValid !== null && <li data-lab-json={String(cell.jsonValid)}>{t(cell.jsonValid ? 'control.ai.lab.table.jsonYes' : 'control.ai.lab.table.jsonNo')}</li>}
        {cell.checkPassed !== null && <li data-lab-check={String(cell.checkPassed)}>{t(cell.checkPassed ? 'control.ai.lab.table.checkYes' : 'control.ai.lab.table.checkNo')}</li>}
      </ul>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,8rem)_minmax(0,1fr)] sm:items-end">
        <Select id={`score-${cell.resultId}`} label={t('control.ai.lab.table.score')} value={d.score} onChange={(e) => onDraft({ ...d, score: e.target.value })}>
          <option value="">{t('control.ai.lab.table.scoreNone')}</option>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={String(n)}>
              {n}
            </option>
          ))}
        </Select>
        <Input id={`notes-${cell.resultId}`} maxLength={1000} label={t('control.ai.lab.table.notes')} value={d.notes} onChange={(e) => onDraft({ ...d, notes: e.target.value })} />
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" data-lab-score-save className={TAP} disabled={busy} onClick={onSave}>
          {t('control.ai.lab.table.save')}
        </button>
        <button type="button" data-lab-again className={TAP} disabled={busy} onClick={onAgain}>
          {t('control.ai.lab.table.again')}
        </button>
      </div>
    </>
  );
}
