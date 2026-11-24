'use client';

import { useEffect, useState } from 'react';
import { agentWords } from './words';

// While a change request is open in Preview (C546), one bar on every screen says so, with the way out.
export function PreviewBanner({ lang }: { lang: string }) {
  const w = agentWords(lang);
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    const m = /(?:^|; )nca_agent_preview_on=([0-9a-f-]{36})/.exec(document.cookie);
    if (!m) return;
    setId(m[1]);
    // A change someone already made live or discarded is no longer previewed: leave Preview by itself.
    void fetch(`/api/app/agent/requests/${m[1]}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((out) => {
        if (out?.request?.status === 'ready') return;
        return fetch(`/api/app/agent/requests/${m[1]}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'preview_off' }) }).then(() => window.location.reload());
      })
      .catch(() => {});
  }, []);
  if (!id) return null;
  async function exit() {
    await fetch(`/api/app/agent/requests/${id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'preview_off' }) });
    window.location.href = `/app/ask/${id}`;
  }
  return (
    <div role="status" className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-2 bg-tangerine px-4 py-2 text-sm font-bold text-slate" lang={lang}>
      <span>{w.previewOn}</span>
      <span className="flex gap-3">
        <a href={`/app/ask/${id}`} className="underline">{w.previewReview}</a>
        <button type="button" onClick={() => void exit()} className="min-h-[36px] underline">{w.previewExit}</button>
      </span>
    </div>
  );
}
