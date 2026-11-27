'use client';

import { useEffect, useRef, useState } from 'react';
import { BotFace } from './BotFace';
import { agentWords } from './words';

type Link = { label: string; href: string };
type Msg = { role: string; body: string; requestId: string | null; links: Link[]; ticket: string | null; photos: number };
type Req = { requestId: string; status: string; title: string; createdAt: string };
type Photo = { mediaType: 'image/jpeg'; base64: string; preview: string };
type Step = { key: string; detail?: string };

const MAX_PHOTOS = 3;
const MAX_SIDE = 1600;

// A phone photo made small enough to send (C549): the longest side 1600 px, JPEG. Read on the phone, never stored.
async function shrink(file: File): Promise<Photo> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = bad;
      i.src = url;
    });
    const k = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * k);
    canvas.height = Math.round(img.height * k);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL('image/jpeg', 0.82);
    return { mediaType: 'image/jpeg', base64: data.slice(data.indexOf(',') + 1), preview: data };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// The Ask screen (C546, C549): one box to type, speak or add a photo, the conversation, the assistant's face and what
// it is doing right now, and the changes waiting to be checked.
export function AgentView({ lang, scan = false }: { lang: string; scan?: boolean }) {
  const w = agentWords(lang);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [requests, setRequests] = useState<Req[]>([]);
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  const end = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

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
  }, [messages, busy, steps]);

  async function addPhotos(files: FileList | null) {
    if (!files) return;
    // From the dashboard's "Scan a document" (C554): the ask that reads the paper is written for them; they can change it.
    if (scan && !text.trim()) setText(w.scanAsk);
    const room = MAX_PHOTOS - photos.length;
    const made = await Promise.all([...files].slice(0, room).filter((f) => f.type.startsWith('image/')).map(shrink));
    setPhotos((p) => [...p, ...made].slice(0, MAX_PHOTOS));
  }

  async function send(ask: string) {
    const said = ask.trim();
    if ((!said && photos.length === 0) || busy) return;
    const sent = photos;
    setBusy(true);
    setSteps([{ key: 'thinking' }]);
    setText('');
    setPhotos([]);
    setMessages((m) => [...m, { role: 'person', body: said, requestId: null, links: [], ticket: null, photos: sent.length }]);
    let reply: { say?: string; requestId?: string | null; links?: Link[]; ticket?: string | null } | null = null;
    try {
      const res = await fetch('/api/app/agent/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: said, images: sent.map(({ mediaType, base64 }) => ({ mediaType, base64 })) }) });
      if (!res.ok || !res.body) throw new Error('not ok');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line) continue;
          const ev = JSON.parse(line);
          if (ev.type === 'status') setSteps((s) => (s[s.length - 1]?.key === ev.key && s[s.length - 1]?.detail === ev.detail ? s : [...s, { key: ev.key, detail: ev.detail }].slice(-6)));
          if (ev.type === 'done') reply = ev.reply;
        }
      }
    } catch {
      reply = { say: w.failDone };
    } finally {
      const r = reply ?? { say: w.failDone };
      setMessages((m) => [...m, { role: 'agent', body: String(r.say ?? ''), requestId: r.requestId ?? null, links: r.links ?? [], ticket: r.ticket ?? null, photos: 0 }]);
      setBusy(false);
      setSteps([]);
      if (r.requestId || r.ticket) void load();
    }
  }

  async function startNewChat() {
    if (busy) return;
    await fetch('/api/app/agent/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'new_chat' }) });
    setMessages([]);
  }

  const waiting = requests.filter((r) => r.status === 'ready');
  const done = requests.filter((r) => r.status !== 'ready');
  return (
    <div className="flex flex-col gap-4" lang={lang}>
      {scan && photos.length === 0 && (
        <section aria-label={w.scanTitle} data-scan-card className="flex flex-col gap-3 rounded-xl border-2 border-royal bg-white p-4">
          <h2 className="text-lg font-semibold text-slate">{w.scanTitle}</h2>
          <p className="text-base text-slate">{w.scanSay}</p>
          <button type="button" disabled={busy} onClick={() => fileInput.current?.click()} className="min-h-[56px] rounded-lg bg-royal px-5 text-base font-semibold text-white disabled:opacity-50">
            📷 {w.scanTake}
          </button>
          <a href="/app/students/read-register" className="inline-flex min-h-[44px] items-center text-base font-semibold text-sapphire underline">{w.scanRegister}</a>
        </section>
      )}
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

      {messages.length > 0 && (
        <button type="button" onClick={() => void startNewChat()} disabled={busy} className="ml-auto min-h-[44px] rounded-full border-2 border-royal px-4 text-sm font-semibold text-royal disabled:opacity-50">
          + {w.newChat}
        </button>
      )}
      <div className="flex min-h-[200px] flex-col gap-3 rounded-lg border border-slate/10 bg-white p-4">
        {messages.length === 0 && !busy && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <BotFace working={false} />
              <p className="text-base text-slate">{w.purpose}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {w.examples.map((e) => (
                <button key={e} type="button" onClick={() => void send(e)} className="min-h-[44px] rounded-full border border-royal/30 px-4 text-sm text-royal">
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) =>
          m.role === 'person' ? (
            <div key={i} className="ml-auto max-w-[min(36rem,90vw)] rounded-2xl bg-royal px-4 py-2 text-base text-white">
              {m.body}
              {m.photos > 0 && <span className="mt-1 block text-xs opacity-90">📎 {m.photos} {w.photos}</span>}
            </div>
          ) : (
            <div key={i} className="mr-auto flex max-w-[min(36rem,92vw)] items-start gap-2">
              <BotFace working={false} size={32} />
              <div className="min-w-0 whitespace-pre-wrap rounded-2xl bg-slate/5 px-4 py-2 text-base text-slate">
                {m.body}
                {m.ticket && <span className="mt-2 block text-sm font-semibold">{w.ticket}: {m.ticket}</span>}
                {m.links.length > 0 && (
                  <span className="mt-2 flex flex-wrap gap-2">
                    {m.links.map((l) => (
                      <a key={l.href} href={l.href} className="inline-flex min-h-[44px] items-center rounded-lg border-2 border-royal px-3 text-sm font-semibold text-royal">
                        {l.label}
                      </a>
                    ))}
                  </span>
                )}
                {m.requestId && (
                  <a href={`/app/ask/${m.requestId}`} className="mt-2 flex min-h-[44px] items-center justify-center rounded-lg bg-tangerine px-4 font-semibold text-slate">
                    {w.review}
                  </a>
                )}
              </div>
            </div>
          )
        )}
        {busy && (
          <div className="mr-auto flex items-start gap-2" role="status" aria-live="polite">
            <BotFace working size={40} />
            <ol className="flex flex-col gap-1 rounded-2xl bg-royal/5 px-4 py-2 text-sm text-slate">
              {steps.map((s, i) => (
                <li key={i} className={i === steps.length - 1 ? 'font-semibold' : 'text-slate/70'}>
                  {i === steps.length - 1 ? '● ' : '✓ '}
                  {w.steps2[s.key] ?? w.working}
                  {s.detail && s.key !== 'thinking' ? ` ${s.detail}` : ''}
                </li>
              ))}
            </ol>
          </div>
        )}
        <div ref={end} />
      </div>

      <form
        className="sticky bottom-0 flex flex-col gap-2 bg-off-white py-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}
      >
        {photos.length > 0 && (
          <div className="flex gap-2">
            {photos.map((p, i) => (
              <span key={i} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.preview} alt="" className="h-16 w-16 rounded-lg object-cover" />
                <button type="button" aria-label={w.removePhoto} onClick={() => setPhotos((x) => x.filter((_, j) => j !== i))} className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-slate text-sm text-white">
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input ref={fileInput} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => {
            void addPhotos(e.target.files);
            e.target.value = '';
          }} />
          <button type="button" aria-label={w.addPhoto} disabled={busy || photos.length >= MAX_PHOTOS} onClick={() => fileInput.current?.click()} className="flex min-h-[56px] min-w-[56px] shrink-0 items-center justify-center rounded-lg border-2 border-royal text-2xl text-royal disabled:opacity-50">
            📷
          </button>
          <label className="sr-only" htmlFor="agent-ask">{w.title}</label>
          <textarea id="agent-ask" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder={w.placeholder} className="min-h-[56px] min-w-0 flex-1 rounded-lg border border-slate/20 px-3 py-2 text-base" />
          <button type="submit" disabled={busy || (!text.trim() && photos.length === 0)} className="min-h-[56px] shrink-0 rounded-lg bg-royal px-5 text-base font-semibold text-white disabled:opacity-50">
            {w.send}
          </button>
        </div>
      </form>

      {done.length > 0 && (
        <section className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold text-slate">{w.requests}</h2>
          {done.map((r) => (
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
