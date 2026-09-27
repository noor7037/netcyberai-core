'use client';

import { useState } from 'react';
import { SEGMENTS, type Segment } from '@/demo-fixture/role-apps';
import { PhoneShell } from './PhoneShell';

// The homepage phone: the school's WhatsApp, seen by each audience.
// Choosing Parents, Teachers, Principal or "No WhatsApp" swaps the chat,
// and the three cards under the phone say how it works for that person.
// Fixture data only.

export function HeroWhatsApp() {
  const [seg, setSeg] = useState<Segment>('parents');
  const s = SEGMENTS.find((x) => x.id === seg)!;

  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label="See it as" className="mx-auto grid w-full max-w-[20rem] grid-cols-4 gap-1 rounded-full bg-white p-1 shadow-sm">
        {SEGMENTS.map((x) => (
          <button
            key={x.id}
            type="button"
            aria-pressed={seg === x.id}
            onClick={() => setSeg(x.id)}
            className={`min-h-[36px] rounded-full px-1 text-[11px] font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal ${seg === x.id ? 'bg-emerald text-white' : 'text-slate hover:bg-slate/5'}`}
          >
            {x.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-4">
        <PhoneShell
          label={`Demo WhatsApp chat: ${s.chatTitle}`}
          bar="emerald"
          screen="bg-peach/25"
          height="h-[30rem]"
          header={
            <div className="flex items-center gap-2.5 bg-emerald px-3 pb-2.5 pt-1 text-white">
              <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-xs font-extrabold text-emerald">
                SI
              </span>
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-sm font-semibold">{s.chatTitle}</span>
                <span className="block truncate text-xs">{s.chatSub}</span>
              </span>
            </div>
          }
        >
          <ol key={seg} className="flex flex-col gap-2 p-3">
            {s.feed.map((m, i) =>
              m.from === 'user' ? (
                <li key={i} className="nca-pop ml-10 self-end rounded-xl rounded-tr-none bg-leaf/25 px-3 py-2 text-xs text-slate shadow-sm" style={{ animationDelay: `${i * 90}ms` }}>
                  {m.text}
                  <span className="block text-right text-[10px] text-slate/70">{`${m.time} ✓✓`}</span>
                </li>
              ) : (
                <li key={i} className="nca-pop mr-6 self-start overflow-hidden rounded-xl rounded-tl-none bg-white text-xs text-slate shadow-sm" style={{ animationDelay: `${i * 90}ms` }}>
                  {m.tag && <p className="bg-emerald/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald">{m.tag}</p>}
                  <p className="px-3 pb-1 pt-2">{m.text}</p>
                  <span className="block px-3 pb-1.5 text-right text-[10px] text-slate/70">{m.time}</span>
                </li>
              ),
            )}
          </ol>
        </PhoneShell>

        <div className="flex flex-col gap-2">
          <p className="text-xs font-extrabold uppercase tracking-wide text-slate/70">{`How it works for ${s.id === 'offline' ? 'families without WhatsApp' : s.label.toLowerCase()}`}</p>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {s.how.map((h) => (
              <li key={h.title} className="nca-lift rounded-xl border border-slate/10 bg-white p-3">
                <b className="block text-sm text-slate">{h.title}</b>
                <span className="block text-xs text-slate/70">{h.body}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate/70">{s.status}</p>
        </div>
      </div>
    </div>
  );
}
