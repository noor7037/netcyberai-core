'use client';

import { useEffect, useRef, useState } from 'react';
import type { LabBlock } from '@/lib/family/blocks';
import type { Words } from '@/lib/family/fill';

// W23-C: a ready-built lab inside the tutor's answer, embedded as the chapter reader embeds it (reader/reader.js): the
// lab page of /family/learn/labs in a frame, with ?embed=1 and the child's language. Nothing loads until the child taps
// "Open the lab", so an answer with a lab costs no data until it is wanted; the frame is lazy besides. The lab tells the
// page its height (so the frame fits it) and when it is finished; only a message from this frame, from this origin, is
// read. The lab itself, its steps and its starting values are the founder's own definition: the engine takes nothing
// from the address but the id, `embed` and `lang` (labs/CONTRACT.md), so the tutor cannot change a lab's starting state.
const MIN = 560;
const MAX = 1800;

export function LabBlockView({ b, w, tone }: { b: LabBlock; w: Words; tone: string }) {
  const root = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [open, setOpen] = useState(false);
  const [height, setHeight] = useState(MIN);
  const [done, setDone] = useState(false);
  const [lang, setLang] = useState<'en' | 'hi'>('en');

  useEffect(() => {
    if (!open) return;
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== frame.current?.contentWindow) return;
      const m = e.data as { source?: unknown; type?: unknown; height?: unknown; id?: unknown } | null;
      if (!m || m.source !== 'nca-labs') return;
      if (m.type === 'height' && typeof m.height === 'number' && Number.isFinite(m.height)) setHeight(Math.min(Math.max(MIN, Math.ceil(m.height) + 8), MAX));
      else if (m.type === 'done' && m.id === b.id) setDone(true);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [open, b.id]);

  const show = () => {
    setLang(root.current?.closest('[lang]')?.getAttribute('lang') === 'hi' ? 'hi' : 'en');
    setOpen(true);
  };
  const src = `/family/learn/labs/index.html?embed=1&lang=${lang}#${encodeURIComponent(b.id)}`;
  return (
    <div ref={root} data-block="lab" data-lab={b.id} data-tone={tone} className="fam-card flex flex-col gap-3 bg-white p-4">
      <p className="fam-lesson-eyebrow">{w['fam.lab.title']}</p>
      <p className="text-base text-ink">{b.why}</p>
      {open ? (
        <>
          <iframe ref={frame} title={w['fam.lab.frame']} src={src} loading="lazy" style={{ height }} className="w-full rounded-2xl border-0 bg-white" allow="fullscreen" />
          {done && (
            <p data-lab-done className="text-sm font-bold text-emerald">
              {w['fam.lab.done']}
            </p>
          )}
          <button type="button" onClick={() => setOpen(false)} className="fam-press flex min-h-[44px] items-center self-start rounded-full bg-white px-4 text-sm font-bold text-ink ring-1 ring-ink/15">
            {w['fam.lab.close']}
          </button>
        </>
      ) : (
        <button type="button" onClick={show} data-lab-open className="fam-press flex min-h-[44px] items-center self-start rounded-full bg-emerald px-5 text-sm font-bold text-white">
          {w['fam.lab.open']}
        </button>
      )}
    </div>
  );
}
