'use client';

import { useState } from 'react';
import type { RequestView } from '@/lib/agent/requests';
import { changeLine } from './change-text';
import { agentWords } from './words';

// One change request (C546): what will change in plain lines, "See it in the app first", and Go live. Going live runs
// it again and commits only if it still changes exactly this; otherwise nothing changes and the person asks again.
export function RequestReview({ initial, lang }: { initial: RequestView; lang: string }) {
  const w = agentWords(lang);
  const [r, setR] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function act(action: string) {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch(`/api/app/agent/requests/${r.requestId}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }) });
      const out = await res.json().catch(() => ({}));
      if (action === 'preview_on' && res.ok) {
        window.location.href = '/app';
        return;
      }
      if (action === 'undo') {
        if (out.requestId) window.location.href = `/app/ask/${out.requestId}`;
        else setNote(String(out.say ?? w.failDone));
        return;
      }
      if (res.ok && out.request) {
        setR(out.request);
        setNote(action === 'go_live' ? w.liveDone : null);
      } else {
        setNote(out.error === 'changed_since_review' ? w.staleDone : w.failDone);
        const again = await fetch(`/api/app/agent/requests/${r.requestId}`).then((x) => (x.ok ? x.json() : null));
        if (again?.request) setR(again.request);
      }
    } finally {
      setBusy(false);
    }
  }

  const live = r.status === 'live' || r.status === 'undone';
  return (
    <div className="flex flex-col gap-4" lang={lang}>
      <a href="/app/ask" className="text-sm text-royal underline">{w.back}</a>
      <div>
        <h1 className="text-xl font-bold text-slate">{r.title}</h1>
        <p className="text-sm text-slate/70">{w.status[r.status] ?? r.status}{r.createdByName ? ` · ${w.by}: ${r.createdByName}` : ''}</p>
      </div>
      {r.summary && <p className="whitespace-pre-wrap text-base text-slate">{r.summary}</p>}

      <section className="rounded-lg border border-slate/10 bg-white p-4">
        <h2 className="mb-2 text-base font-semibold text-slate">{live ? w.changed : w.changes}</h2>
        {r.changes.length === 0 ? (
          <p className="text-sm text-slate/70">{w.noChanges}</p>
        ) : (
          <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-slate">
            {r.changes.map((c, i) => (
              <li key={i} className="break-words">{changeLine(c)}</li>
            ))}
          </ol>
        )}
        <details className="mt-3 text-xs text-slate/70">
          <summary className="cursor-pointer">{w.steps} ({r.steps.length})</summary>
          <ol className="list-decimal pl-5">
            {r.steps.map((s, i) => (
              <li key={i}>{s.why ?? s.endpoint}</li>
            ))}
          </ol>
        </details>
      </section>

      {note && <p role="status" className="rounded-lg bg-royal/10 px-4 py-3 text-base font-semibold text-slate">{note}</p>}

      {r.status === 'ready' && (
        <div className="flex flex-col gap-2">
          <button type="button" disabled={busy} onClick={() => void act('preview_on')} className="min-h-[56px] rounded-lg border-2 border-royal px-4 text-base font-semibold text-royal disabled:opacity-50">
            {w.seeLive}
          </button>
          <p className="text-xs text-slate/70">{w.seeHint}</p>
          {r.mayGoLive ? (
            <button type="button" disabled={busy} onClick={() => void act('go_live')} className="min-h-[56px] rounded-lg bg-tangerine px-4 text-lg font-bold text-slate disabled:opacity-50">
              {w.goLive}
            </button>
          ) : (
            <p className="text-sm font-semibold text-slate">{w.principalOnly}</p>
          )}
          <button type="button" disabled={busy} onClick={() => void act('discard')} className="min-h-[44px] text-sm text-slate/70 underline">
            {w.discard}
          </button>
        </div>
      )}
      {r.status === 'live' && (
        <button type="button" disabled={busy} onClick={() => void act('undo')} className="min-h-[48px] rounded-lg border-2 border-slate/30 px-4 text-base text-slate disabled:opacity-50">
          {w.undo}
        </button>
      )}
    </div>
  );
}
