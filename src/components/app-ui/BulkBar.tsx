'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import type { BulkActionDefinition, BulkPreview, BulkPreviewRequest, BulkRun, BulkSelection } from '@/lib/contracts/bulk';
import type { SchoolRole } from '@/lib/contracts/modules';
import type { Options } from './list-query';

// The bulk-action bar (17 §1a, C113): shown while rows are selected; the
// actions this role may run; preview → confirm (count, the first rows and
// what happens to each, warnings) → progress → Undo while the window is
// open. Escape clears the selection. The server re-checks everything.

export type BulkApi = {
  preview(req: BulkPreviewRequest): Promise<BulkPreview>;
  confirm(previewId: string): Promise<BulkRun>;
  get(runId: string): Promise<BulkRun>;
  undo(runId: string): Promise<BulkRun>;
};

const MESSAGES: Record<string, string> = {
  selection_changed: 'The list changed since you selected. Refresh it and try again.',
  preview_expired: 'The preview expired. Preview again.',
  undo_window_closed: 'The undo window has closed.',
};

async function call<T>(url: string, body?: unknown, pick?: string): Promise<T> {
  const r = await fetch(url, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(MESSAGES[json.error] ?? json.error ?? 'Something went wrong');
  return (pick ? json[pick] : json) as T;
}

// The PR-2b bulk API (C113).
export const bulkApi: BulkApi = {
  preview: (req) => call('/api/app/bulk/preview', req, 'preview'),
  confirm: (previewId) => call('/api/app/bulk/confirm', { previewId }, 'run'),
  get: (runId) => call(`/api/app/bulk/${runId}`, undefined, 'run'),
  undo: (runId) => call(`/api/app/bulk/${runId}/undo`, {}, 'run'),
};

type Step = { kind: 'params'; action: BulkActionDefinition } | { kind: 'preview'; action: BulkActionDefinition; preview: BulkPreview } | { kind: 'run'; action: BulkActionDefinition; run: BulkRun };

const RUNNING = ['queued', 'running'];
const STATUS_WORDS: Record<string, string> = {
  queued: 'Waiting to start',
  running: 'Working',
  succeeded: 'Done',
  partially_failed: 'Done, some rows failed',
  failed: 'Failed',
  undone: 'Undone',
};

export function BulkBar({
  actions,
  role,
  count,
  selection,
  onClear,
  api = bulkApi,
  options = {},
  initialStep,
}: {
  actions: readonly BulkActionDefinition[];
  role: SchoolRole;
  count: number;
  selection: BulkSelection | null;
  onClear: () => void;
  api?: BulkApi;
  options?: Options;
  initialStep?: Step;
}) {
  const [step, setStep] = useState<Step | null>(initialStep ?? null);
  const [params, setParams] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const allowed = actions.filter((a) => a.allowedRoles.includes(role));

  // Follow a queued or running job until it finishes.
  useEffect(() => {
    if (step?.kind !== 'run' || !RUNNING.includes(step.run.status)) return;
    const t = setTimeout(() => api.get(step.run.runId).then((run) => setStep({ ...step, run })).catch(() => undefined), 1500);
    return () => clearTimeout(t);
  }, [step, api]);

  async function act<T>(fn: () => Promise<T>, then: (v: T) => void) {
    setBusy(true);
    setError(null);
    try {
      then(await fn());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  const start = (action: BulkActionDefinition) => {
    setParams({});
    if (action.params?.length) return setStep({ kind: 'params', action });
    preview(action, {});
  };
  const preview = (action: BulkActionDefinition, p: Record<string, string>) =>
    selection && act(() => api.preview({ actionId: action.actionId, selection, params: p }), (pv) => setStep({ kind: 'preview', action, preview: pv }));

  if (count === 0 && !step) return null;
  const close = () => {
    setStep(null);
    setError(null);
  };
  const fill = (text: string, n: number) => text.replace(/\{count\}/g, String(n));
  const undoOpen = step?.kind === 'run' && step.run.undoUntil && new Date(step.run.undoUntil) > new Date() && step.action.undoWindowSeconds;

  return (
    <>
      {count > 0 && (
        <div role="region" aria-label="Bulk actions" onKeyDown={(e) => e.key === 'Escape' && onClear()} className="sticky bottom-2 z-20 flex flex-wrap items-center gap-2 rounded-xl bg-midnight p-3 text-white shadow-2xl">
          <p className="text-sm font-semibold">{count} selected</p>
          {allowed.map((a) => (
            <button key={a.actionId} type="button" disabled={busy} onClick={() => start(a)} className={`min-h-[44px] rounded-md px-4 text-sm font-semibold disabled:opacity-60 ${a.destructive ? 'bg-coral text-slate' : 'bg-white text-sapphire'}`}>
              {a.label}
            </button>
          ))}
          {allowed.length === 0 && <p className="text-sm">No bulk action is available for your role.</p>}
          <button type="button" onClick={onClear} className="ml-auto min-h-[44px] bg-midnight px-3 text-sm font-semibold text-white underline">
            Clear
          </button>
        </div>
      )}

      <Modal open={!!step} onClose={close} title={step ? fill(step.action.confirmTitle, step.kind === 'preview' ? step.preview.count : count) : ''}>
        {error && (
          <p role="alert" className="mb-3 rounded-md border border-coral/40 bg-coral/10 p-3 text-sm text-slate">
            {error}
          </p>
        )}
        {step?.kind === 'params' && (
          <form className="flex flex-col gap-3" onSubmit={(e) => (e.preventDefault(), preview(step.action, params))}>
            {step.action.params!.map((p) => {
              const opts = p.options ?? (p.optionsFrom ? options[p.optionsFrom] : undefined) ?? [];
              const cls = 'mt-1 min-h-[44px] w-full rounded-md border border-slate/20 px-3 text-sm';
              return (
                <label key={p.key} className="text-sm font-semibold text-slate">
                  {p.label}
                  {p.type === 'select' ? (
                    <select required value={params[p.key] ?? ''} onChange={(e) => setParams({ ...params, [p.key]: e.target.value })} className={cls}>
                      <option value="">Choose…</option>
                      {opts.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input required type={p.type} value={params[p.key] ?? ''} onChange={(e) => setParams({ ...params, [p.key]: e.target.value })} className={cls} />
                  )}
                </label>
              );
            })}
            <button type="submit" disabled={busy} className="min-h-[44px] rounded-md bg-sapphire px-4 text-sm font-semibold text-white disabled:opacity-60">
              {busy ? 'Checking…' : 'Preview'}
            </button>
          </form>
        )}
        {step?.kind === 'preview' && (
          <div className="flex flex-col gap-3 text-sm text-slate">
            <p>{fill(step.action.confirmBody, step.preview.count)}</p>
            <ul aria-label="First rows" className="flex flex-col gap-1">
              {step.preview.firstRows.map((r) => (
                <li key={r.id} className="flex flex-wrap justify-between gap-2 rounded-md border border-slate/10 p-2">
                  <span className="font-semibold">{r.label}</span>
                  <span className="text-slate/70">{r.change}</span>
                </li>
              ))}
              {step.preview.count > step.preview.firstRows.length && <li className="text-slate/70">and {step.preview.count - step.preview.firstRows.length} more</li>}
            </ul>
            {step.preview.warnings.map((w) => (
              <p key={w} className="rounded-md border border-tangerine/40 bg-tangerine/10 p-2">
                {w}
              </p>
            ))}
            {step.preview.runsAsJob && <p className="text-slate/70">This runs in the background; you can leave this page.</p>}
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={() => act(() => api.confirm(step.preview.previewId), (run) => setStep({ kind: 'run', action: step.action, run }))} className={`min-h-[44px] rounded-md px-4 text-sm font-semibold disabled:opacity-60 ${step.action.destructive ? 'bg-coral-deep text-white' : 'bg-sapphire text-white'}`}>
                {busy ? 'Working…' : `Confirm for ${step.preview.count}`}
              </button>
              <button type="button" onClick={close} className="min-h-[44px] px-4 text-sm font-semibold text-slate">
                Cancel
              </button>
            </div>
          </div>
        )}
        {step?.kind === 'run' && (
          <div className="flex flex-col gap-3 text-sm text-slate" aria-live="polite">
            <p className="font-semibold">{STATUS_WORDS[step.run.status] ?? step.run.status}</p>
            <span className="block h-2 overflow-hidden rounded-full bg-slate/10" role="progressbar" aria-valuemin={0} aria-valuemax={step.run.total} aria-valuenow={step.run.done + step.run.failed}>
              <span className="block h-full rounded-full bg-turquoise" style={{ width: `${step.run.total ? ((step.run.done + step.run.failed) / step.run.total) * 100 : 0}%` }} />
            </span>
            <p>
              {step.run.done} of {step.run.total} done{step.run.failed ? `, ${step.run.failed} failed` : ''}.
            </p>
            {step.run.failures.map((f) => (
              <p key={f.id} className="text-coral-deep">
                {f.reason}
              </p>
            ))}
            <div className="flex flex-wrap gap-2">
              {undoOpen && (
                <button type="button" disabled={busy} onClick={() => act(() => api.undo(step.run.runId), (run) => setStep({ ...step, run }))} className="min-h-[44px] rounded-md border-2 border-sapphire px-4 text-sm font-semibold text-sapphire disabled:opacity-60">
                  Undo
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  close();
                  if (!RUNNING.includes(step.run.status)) onClear();
                }}
                className="min-h-[44px] rounded-md bg-sapphire px-4 text-sm font-semibold text-white"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
