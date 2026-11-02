'use client';

import { createPortal } from 'react-dom';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Words } from '@/lib/family/fill';
import { PAPER, PAPER_RATIO, SKETCH_COLOURS, addStroke, clear, exportSize, isBlank, redrawList, smallerScale, undo, type SketchColour, type SketchTool, type Stroke } from '@/lib/family/sketch';
import { TUTOR_FILE_MAX_BYTES } from '@/lib/family/tutor-shape';

// The child's sketch pad (W18-P3): white 4:3 paper, a pen in three family colours, an eraser, undo and clear; "Send to
// tutor" exports a PNG and hands it to the tutor window, which sends it through the same file door as Attach (so the file
// check, the 10 MB limit and the parent's photo consent apply unchanged). The stroke model is src/lib/family/sketch.ts;
// this file only draws it. Lazy-loaded from the composer, so the Study bundle does not carry it. jsdom has no canvas, so
// the drawing itself is checked in the harness, not in unit tests.

type Props = {
  w: Words;
  // Sends the picture; resolves with the words of an error to show, or null when it was sent.
  onSend: (file: File) => Promise<string | null>;
  onClose: () => void;
};

const ICON = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const BTN = 'fam-press flex h-11 min-w-[44px] shrink-0 items-center justify-center rounded-full px-1';

type Ctx = CanvasRenderingContext2D;

// Draws the strokes on white paper of the canvas' current pixel size. Scale to the paper's own units first.
function paint(ctx: Ctx, width: number, height: number, strokes: readonly Stroke[]) {
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, width, height);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const op of redrawList(strokes, width, height)) {
    if (op.kind === 'dot') {
      ctx.fillStyle = op.colour;
      ctx.beginPath();
      ctx.arc(op.at.x, op.at.y, op.width / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = op.colour;
      ctx.lineWidth = op.width;
      ctx.beginPath();
      op.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
    }
  }
}

// The picture as a PNG at a scale of the full export size (a fresh canvas, so the screen's pixel ratio never matters).
function toPng(strokes: readonly Stroke[], scale: number): Promise<Blob | null> {
  const { width, height } = exportSize(scale);
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d');
  if (!ctx) return Promise.resolve(null);
  paint(ctx, width, height, strokes);
  return new Promise((resolve) => c.toBlob(resolve, 'image/png'));
}

export function SketchPad({ w, onSend, onClose }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const first = useRef<HTMLButtonElement>(null);
  // The strokes live in a ref as well as state: pointer events fire faster than renders.
  const strokesRef = useRef<Stroke[]>([]);
  const live = useRef<Stroke | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [tool, setTool] = useState<SketchTool>('pen');
  const [colour, setColour] = useState<SketchColour>('ink');
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const commit = (next: Stroke[]) => {
    strokesRef.current = next;
    setStrokes(next);
  };

  // The backing store follows the box and the screen's pixel ratio (at most 2: a sharper line is not worth the memory).
  const redraw = useCallback(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(el.clientWidth * dpr));
    const height = Math.round(width * PAPER_RATIO);
    if (el.width !== width || el.height !== height) {
      el.width = width;
      el.height = height;
    }
    paint(ctx, width, height, live.current ? [...strokesRef.current, live.current] : strokesRef.current);
  }, []);

  useEffect(() => {
    redraw();
    const el = canvas.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(redraw);
    ro.observe(el);
    return () => ro.disconnect();
  }, [redraw]);

  useEffect(() => {
    first.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [onClose]);

  const at = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!e.isPrimary || busy || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setSure(false);
    setError(null);
    live.current = { tool, colour, points: [at(e)] };
    redraw();
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!live.current || !e.isPrimary) return;
    // The finger's in-between points make the line smooth where the browser batches its events.
    const batch = typeof e.nativeEvent.getCoalescedEvents === 'function' ? e.nativeEvent.getCoalescedEvents() : [];
    const r = e.currentTarget.getBoundingClientRect();
    const events = batch.length > 0 ? batch : [e.nativeEvent];
    for (const p of events) live.current.points.push({ x: Math.min(1, Math.max(0, (p.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (p.clientY - r.top) / r.height)) });
    redraw();
  };
  const up = () => {
    const done = live.current;
    live.current = null;
    if (done) commit(addStroke(strokesRef.current, done));
  };
  // A stroke the system cancelled (an incoming call, a palm) is dropped, not kept half-drawn.
  const cancelled = () => {
    live.current = null;
    redraw();
  };

  // Redraw after undo and clear (the strokes changed, not the pointer).
  useEffect(redraw, [strokes, redraw]);

  const clearAll = () => {
    if (!sure) return setSure(true);
    setSure(false);
    commit(clear());
  };

  const send = async () => {
    if (busy || isBlank(strokes)) return;
    setBusy(true);
    setError(null);
    let blob = await toPng(strokes, 1);
    // Over the file door's limit: once more at a smaller scale.
    const next = blob ? smallerScale(blob.size, TUTOR_FILE_MAX_BYTES, 1) : null;
    if (blob && next !== null) blob = await toPng(strokes, next);
    if (!blob) {
      setBusy(false);
      return setError(w['fam.err.network']);
    }
    if (blob.size > TUTOR_FILE_MAX_BYTES) {
      setBusy(false);
      return setError(w['fam.tutor.err.file_too_large']);
    }
    const failed = await onSend(new File([blob], 'sketch.png', { type: 'image/png' }));
    if (failed) {
      setBusy(false);
      return setError(failed);
    }
    onClose();
  };

  const colours: SketchColour[] = ['ink', 'blue', 'coral'];
  const on = 'bg-ink text-white';
  const off = 'bg-white text-ink ring-1 ring-ink/20';

  // In the page's body, not the composer: the dock is its own stacking layer, and the pad must sit above the tab bar.
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={w['fam.sketch.open']} data-sketch-pad className="fixed inset-0 z-50 flex flex-col items-center overflow-y-auto bg-off-white px-4 py-4">
      <div className="flex w-full max-w-xl flex-col gap-3">
        <canvas
          ref={canvas}
          data-sketch-canvas
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={cancelled}
          // The page must not scroll or zoom while a finger draws on the paper.
          style={{ touchAction: 'none', aspectRatio: '4 / 3' }}
          className="w-full rounded-2xl bg-white shadow-sm ring-1 ring-ink/20"
        />
        <div role="toolbar" aria-label={w['fam.sketch.open']} className="flex flex-wrap items-center gap-1.5">
          <button ref={first} type="button" data-sketch-tool="pen" aria-pressed={tool === 'pen'} aria-label={w['fam.sketch.pen']} onClick={() => setTool('pen')} className={`${BTN} ${tool === 'pen' ? on : off}`}>
            <svg aria-hidden="true" className="h-5 w-5" {...ICON}>
              <path d="M4 20l1-4L16 5l3 3L8 19z" />
            </svg>
          </button>
          <button type="button" data-sketch-tool="eraser" aria-pressed={tool === 'eraser'} aria-label={w['fam.sketch.eraser']} onClick={() => setTool('eraser')} className={`${BTN} ${tool === 'eraser' ? on : off}`}>
            <svg aria-hidden="true" className="h-5 w-5" {...ICON}>
              <path d="M7 20h12M5 14l8-8 6 6-6 6H9z" />
            </svg>
          </button>
          {colours.map((c) => (
            <button
              key={c}
              type="button"
              data-sketch-colour={c}
              aria-pressed={colour === c && tool === 'pen'}
              aria-label={w[`fam.sketch.colour.${c}`]}
              onClick={() => {
                setColour(c);
                setTool('pen');
              }}
              className={`${BTN} ${colour === c && tool === 'pen' ? 'ring-2 ring-ink' : 'ring-1 ring-ink/20'} bg-white`}
            >
              <span aria-hidden="true" className="h-6 w-6 rounded-full" style={{ backgroundColor: SKETCH_COLOURS[c] }} />
            </button>
          ))}
          <button type="button" data-sketch-undo aria-label={w['fam.sketch.undo']} disabled={strokes.length === 0 || busy} onClick={() => commit(undo(strokes))} className={`${BTN} ${off} disabled:opacity-50`}>
            <svg aria-hidden="true" className="h-5 w-5" {...ICON}>
              <path d="M9 14L4 9l5-5M4 9h9a6 6 0 0 1 0 12h-3" />
            </svg>
          </button>
          <button
            type="button"
            data-sketch-clear={sure ? 'sure' : undefined}
            aria-label={sure ? w['fam.sketch.clearSure'] : w['fam.sketch.clear']}
            disabled={strokes.length === 0 || busy}
            onClick={clearAll}
            className={`${BTN} px-3 text-sm font-bold disabled:opacity-50 ${sure ? 'bg-coral-deep text-white' : off}`}
          >
            {sure ? w['fam.sketch.clearSure'] : w['fam.sketch.clear']}
          </button>
        </div>
        {error && (
          <p role="alert" data-sketch-error className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-slate ring-1 ring-slate/10">
            {error}
          </p>
        )}
        <div className="flex items-center gap-2">
          <button type="button" data-sketch-cancel onClick={onClose} className="fam-press flex min-h-[44px] items-center rounded-full bg-white px-5 text-base font-bold text-ink ring-1 ring-ink/20">
            {w['fam.sketch.cancel']}
          </button>
          <button
            type="button"
            data-sketch-send
            disabled={busy || isBlank(strokes)}
            aria-busy={busy || undefined}
            onClick={() => void send()}
            className="fam-press fam-cta flex min-h-[44px] flex-1 items-center justify-center rounded-full bg-saffron px-5 text-base font-bold text-ink shadow-md disabled:opacity-50"
          >
            {busy ? w['fam.tutor.fileSending'] : w['fam.sketch.send']}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
