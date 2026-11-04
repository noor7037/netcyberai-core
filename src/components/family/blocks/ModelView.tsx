'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { colors } from '@/lib/design-tokens';
import type { ModelBlock } from '@/lib/family/blocks';
import { fill, type Words } from '@/lib/family/fill';
import { MODELS, isModelPart, partLabel, partMembers, type ModelLang } from '@/lib/family/models/catalog';
import { SKETCHES, SKETCH_H, SKETCH_W, type SketchShape } from '@/lib/family/models/sketch';
import { partSpokenIn } from '@/lib/family/models/spoken';
import { useDataSaver } from '../useDataSaver';
import { Card } from './BlockViews';
import type { ModelHandle } from './model-three';

// A model of the thing the answer explains (W19-D): the brain, the heart, a flower, the solar system. The part being
// explained is highlighted and named; the child turns the model with a finger and taps a part to see its name (and, where
// the screen wires `onAsk`, to ask about it). The 2D schematic (./models/sketch.ts) shows first, and stays when the phone
// has no WebGL; the 3D view (three.js, ./model-three.ts, its own chunk) starts by itself when the data-saver is off, and
// on the child's tap when it is on. `spokenPart`, or `said` (the sentence the voice is saying), lights the part the voice
// names. Reduced motion: nothing turns by itself and the camera jumps instead of gliding.

function webglSupported(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
}

function Shape({ s, fillHex, lit, faded, onPick }: { s: SketchShape; fillHex: string; lit: boolean; faded: boolean; onPick?: () => void }) {
  const stroke = colors.slate;
  const common = { onClick: onPick, style: onPick ? { cursor: 'pointer' } : undefined, opacity: faded ? 0.3 : 1 };
  const sw = lit ? 1.2 : 0.4;
  switch (s[0]) {
    case 'e':
      return <ellipse {...common} cx={s[1]} cy={s[2]} rx={s[3]} ry={s[4]} transform={s[5] ? `rotate(${s[5]} ${s[1]} ${s[2]})` : undefined} fill={fillHex} stroke={stroke} strokeWidth={sw} />;
    case 'c':
      return <circle {...common} cx={s[1]} cy={s[2]} r={s[3]} fill={fillHex} stroke={stroke} strokeWidth={sw} />;
    case 'r':
      return <rect {...common} x={s[1]} y={s[2]} width={s[3]} height={s[4]} rx={s[5] ?? 0} fill={fillHex} stroke={stroke} strokeWidth={sw} />;
    case 'q':
      return <rect {...common} x={s[1]} y={s[2]} width={s[3]} height={s[4]} fill="none" stroke={fillHex} strokeWidth={lit ? s[5] + 1 : s[5]} />;
    case 'o':
      return <ellipse {...common} cx={s[1]} cy={s[2]} rx={s[3]} ry={s[4]} fill="none" stroke={fillHex} strokeWidth={lit ? s[5] + 0.8 : s[5]} />;
    case 'l':
      return <line {...common} x1={s[1]} y1={s[2]} x2={s[3]} y2={s[4]} stroke={fillHex} strokeWidth={lit ? s[5] + 0.8 : s[5]} strokeLinecap="round" />;
    case 'p':
      return <path {...common} d={s[1]} fill={fillHex} stroke={stroke} strokeWidth={sw} />;
  }
}

export function ModelView({ b, w, tone, lang, spokenPart, said, onAsk }: { b: ModelBlock; w: Words; tone: string; lang?: ModelLang; spokenPart?: string | null; said?: string | null; onAsk?: (partKey: string, label: string) => void }) {
  const entry = MODELS[b.model];
  // The child's language from the words themselves (Hindi words are Devanagari), unless the screen says.
  const language: ModelLang = lang ?? (/[\u0900-\u097F]/.test(w['fam.mdl.parts'] ?? '') ? 'hi' : 'en');
  const saver = useDataSaver();
  const [selected, setSelected] = useState<string | null>(b.focus[0] ?? null);
  const [glOk, setGlOk] = useState<boolean | null>(null);
  const [asked, setAsked] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [still, setStill] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const handle = useRef<ModelHandle | null>(null);
  const picked = useRef(selected);
  picked.current = selected;

  useEffect(() => {
    setGlOk(webglSupported());
    try {
      setStill(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch {
      setStill(false);
    }
  }, []);

  // The voice names a part: light it. A part key from the screen wins over the sentence.
  const voicePart = spokenPart !== undefined ? spokenPart : said ? partSpokenIn(b.model, said, language) : null;
  useEffect(() => {
    if (voicePart && isModelPart(b.model, voicePart)) setSelected(voicePart);
  }, [voicePart, b.model]);

  // 3D when the phone can, and the child asked or the data-saver is off (never before the data-saver is read).
  const want = asked ?? (saver.ready && !saver.state.on);
  const view: '2d' | '3d' = glOk === true && !failed && saver.ready && want ? '3d' : '2d';

  useEffect(() => {
    if (view !== '3d' || !canvas.current) return;
    let gone = false;
    setLoading(true);
    void import('./model-three')
      .then((m) => m.startModel(canvas.current!, b.model, { reducedMotion: still, onPick: (p) => p && setSelected(p), onFail: () => setFailed(true) }))
      .then((h) => {
        if (gone) return h?.destroy();
        if (!h) return setFailed(true);
        handle.current = h;
        h.focus(picked.current ? partMembers(b.model, picked.current) : null);
        setLoading(false);
      })
      .catch(() => !gone && setFailed(true));
    return () => {
      gone = true;
      handle.current?.destroy();
      handle.current = null;
    };
  }, [view, b.model, still]);

  useEffect(() => {
    handle.current?.focus(selected ? partMembers(b.model, selected) : null);
  }, [selected, b.model]);

  // The chips: the parts the answer explains first, in its order, then the rest.
  const chips = useMemo(() => [...b.focus, ...entry.parts.map((p) => p.key).filter((k) => !b.focus.includes(k))], [b.focus, entry]);
  const lit = new Set(selected ? partMembers(b.model, selected) : []);
  const tones = new Map(entry.parts.map((p) => [p.key, colors[p.tone]]));
  const label = selected ? partLabel(b.model, selected, language) : null;
  const note = failed ? w['fam.model.failed'] : glOk === false ? w['fam.model.noGl'] : saver.ready && saver.state.on && view === '2d' ? w['fam.mdl.saver'] : null;
  const canSwitch = glOk === true && !failed && saver.ready;
  const title = entry.title[language];

  return (
    <Card title={b.title} tone={tone} tag="model">
      <div data-model={b.model} data-model-view={view} className="flex flex-col items-center gap-3">
        <div className="relative w-full max-w-xl">
          {view === '3d' ? (
            <canvas ref={canvas} role="img" aria-label={fill(w['fam.mdl.aria'], { title, part: label ?? '' })} data-model-canvas className="h-72 w-full touch-none rounded-2xl bg-off-white sm:h-96" />
          ) : (
            <svg viewBox={`0 0 ${SKETCH_W} ${SKETCH_H}`} className="h-72 w-full rounded-2xl bg-off-white sm:h-96" role="img" aria-label={fill(w['fam.mdl.aria'], { title, part: label ?? '' })} data-model-2d>
              {SKETCHES[b.model].map(([part, s], i) =>
                part === '_' ? <Shape key={i} s={s} fillHex={colors.offWhite} lit={false} faded={false} /> : <Shape key={i} s={s} fillHex={tones.get(part) ?? colors.offWhite} lit={lit.has(part)} faded={lit.size > 0 && !lit.has(part)} onPick={() => setSelected(part)} />
              )}
            </svg>
          )}
          {label && (
            <p data-model-label className="pointer-events-none absolute left-2 top-2 rounded-full bg-slate px-3 py-1 text-sm font-bold text-white">
              {label}
            </p>
          )}
          {view === '3d' && loading && (
            <p role="status" className="absolute inset-x-0 bottom-2 text-center text-sm text-slate">
              {w['fam.model.loading']}
            </p>
          )}
        </div>
        <p className="text-sm text-slate/80">{view === '3d' ? w['fam.mdl.hint'] : w['fam.mdl.hint2d']}</p>
        {canSwitch && (
          <button type="button" data-model-3d-ask onClick={() => setAsked(view !== '3d')} className="fam-press flex min-h-[44px] items-center rounded-full bg-ink px-5 text-sm font-bold text-white">
            {view === '3d' ? w['fam.model.back2d'] : w['fam.model.see3d']}
          </button>
        )}
        {entry.source === 'asset' && <p className="text-xs text-slate/80">{w['fam.mdl.credit']}</p>}
        {note && (
          <p role="status" data-model-note className="text-sm text-slate">
            {note}
          </p>
        )}
        <div role="group" aria-label={w['fam.mdl.parts']} className="flex w-full flex-wrap justify-center gap-2">
          {chips.map((k) => (
            <button
              key={k}
              type="button"
              data-model-part={k}
              aria-pressed={selected === k}
              onClick={() => setSelected(k)}
              className={`fam-press flex min-h-[44px] items-center gap-2 rounded-full px-4 text-sm font-bold ring-1 ring-ink/25 ${selected === k ? 'bg-slate text-white' : 'bg-white text-ink'}`}
            >
              <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full ring-1 ring-slate/40" style={{ background: tones.get(k) ?? colors.offWhite }} />
              {partLabel(b.model, k, language)}
            </button>
          ))}
        </div>
        {onAsk && selected && label && (
          <button type="button" data-model-ask onClick={() => onAsk(selected, label)} className="fam-press flex min-h-[44px] items-center rounded-full bg-white px-5 text-sm font-bold text-ink ring-2 ring-ink">
            {fill(w['fam.mdl.ask'], { part: label })}
          </button>
        )}
      </div>
      {b.caption && <p className="text-base text-slate">{b.caption}</p>}
    </Card>
  );
}
