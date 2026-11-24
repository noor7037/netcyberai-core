'use client';

import { useEffect, useRef, useState } from 'react';
import { agentWords } from './words';

type Msg = { role: string; body: string; requestId: string | null };
type Req = { requestId: string; status: string; title: string; createdAt: string };

// The Ask screen (C546): one box to type or speak into, the conversation, and the changes waiting to be checked.
// Every change the assistant prepares opens its own page to check, see in the app, and go live.
export function AgentView({ lang }: { lang: string }) {
  const w = agentWords(lang);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [requests, setRequests] = useState<Req[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  async function load() {
    const [m, r] = await Promise.all([fetch('/api/app/agent/ask').then((x) => (x.ok ? x.json() : { messages: [] })), fetch('/api/app/agent/requests').then((x) => (x.ok ? x.json() : { requests: [] }))]);
    setMessages(m.messages ?? []);
    setRequests(r.requests ?? []);
  }
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [messages, busy]);

  async function send(ask: string) {
    const said = ask.trim();
    if (!said || busy) return;
    setBusy(true);
    setText('');
    setMessages((m) => [...m, { role: 'person', body: said, requestId: null }]);
    try {
      const res = await fetch('/api/app/agent/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: said }) });
      const out = res.ok ? await res.json() : { say: w.failDone, requestId: null };
      setMessages((m) => [...m, { role: 'agent', body: String(out.say ?? ''), requestId: out.requestId ?? null }]);
      if (out.requestId) void load();
    } finally {
      setBusy(false);
    }
  }

  const waiting = requests.filter((r) => r.status === 'ready');
  return (
    <div className="flex flex-col gap-4" lang={lang}>
      {waiting.length > 0 && (
        <section aria-label={w.ready} className="flex flex-col gap-2">
          {waiting.map((r) => (
            <a key={r.requestId} href={`/app/ask/${r.requestId}`} className="flex min-h-[56px] items-center justify-between gap-3 rounded-lg border-2 border-tangerine bg-tangerine/10 px-4 py-3 text-base font-semibold text-slate">
              <span className="min-w-0">{r.title}</span>
              <span className="shrink-0 text-sm underline">{w.review}</span>
            </a>
          ))}
        </section>
      )}

      <div className="flex min-h-[200px] flex-col gap-3 rounded-lg border border-slate/10 bg-white p-4">
        {messages.length === 0 && !busy && (
          <div className="flex flex-wrap gap-2">
            {w.examples.map((e) => (
              <button key={e} type="button" onClick={() => void send(e)} className="min-h-[44px] rounded-full border border-royal/30 px-4 text-sm text-royal">
                {e}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'person' ? 'ml-auto max-w-[min(36rem,90vw)] rounded-2xl bg-royal px-4 py-2 text-base text-white' : 'mr-auto max-w-[min(36rem,90vw)] whitespace-pre-wrap rounded-2xl bg-slate/5 px-4 py-2 text-base text-slate'}>
            {m.body}
            {m.requestId && (
              <a href={`/app/ask/${m.requestId}`} className="mt-2 flex min-h-[44px] items-center justify-center rounded-lg bg-tangerine px-4 font-semibold text-slate">
                {w.review}
              </a>
            )}
          </div>
        ))}
        {busy && <p className="text-sm text-slate/70" role="status">{w.thinking}</p>}
        <div ref={end} />
      </div>

      <form
        className="sticky bottom-0 flex gap-2 bg-off-white py-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}
      >
        <label className="sr-only" htmlFor="agent-ask">{w.title}</label>
        <textarea id="agent-ask" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder={w.placeholder} className="min-h-[56px] min-w-0 flex-1 rounded-lg border border-slate/20 px-3 py-2 text-base" />
        <button type="submit" disabled={busy || !text.trim()} className="min-h-[56px] shrink-0 rounded-lg bg-royal px-5 text-base font-semibold text-white disabled:opacity-50">
          {w.send}
        </button>
      </form>

      {requests.some((r) => r.status !== 'ready') && (
        <section className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold text-slate">{w.requests}</h2>
          {requests.filter((r) => r.status !== 'ready').map((r) => (
            <a key={r.requestId} href={`/app/ask/${r.requestId}`} className="flex min-h-[44px] items-center justify-between gap-3 border-b border-slate/10 text-sm text-slate">
              <span className="min-w-0 truncate">{r.title}</span>
              <span className="shrink-0 text-slate/70">{w.status[r.status] ?? r.status}</span>
            </a>
          ))}
        </section>
      )}
    </div>
  );
}
