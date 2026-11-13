'use client';

import { createPortal } from 'react-dom';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { fill, type Words } from '@/lib/family/fill';
import {
  PAPERS,
  SEND_MAX_SIDE,
  SHAPE_TOOLS,
  SKETCH_PALETTE,
  SKETCH_SIZES,
  STICKER_START,
  TEXT_MAX,
  UNDO_STEPS,
  addPoint,
  canSave,
  clampSticker,
  cleanName,
  copyName,
  downloadRoute,
  drawingSize,
  emptyHistory,
  fitWithin,
  inFamilyApp,
  isFreehand,
  isHexColour,
  isShape,
  newestFirst,
  oldestFirst,
  record,
  redoStep,
  smallerScale,
  undoStep,
  type DownloadRoute,
  type History,
  type Paper,
  type Point,
  type SketchTool,
} from '@/lib/family/sketch';
import { STICKERS, STICKER_BOX, STICKER_LINE } from '@/lib/family/sketch-stickers';
import { deleteDrawing, listDrawings, putDrawing, type SavedDrawing } from '@/lib/family/sketch-store';
import { TUTOR_FILE_MAX_BYTES, TUTOR_TEXT_MAX } from '@/lib/family/tutor-shape';
import { inks, paintPaper, paintSticker, paintStep, stepWeight, textSize, type Step } from './studio-paint';
import { StudioToolbar, ToolIcon, TOOL_BTN, type StudioPanel } from './StudioToolbar';

// The child's drawing studio (W18-P3, rebuilt in C510). Full screen above the app (a portal into the body), safe-area
// aware: a top bar (close, undo, redo, My drawings, save, Send to tutor), the paper filling the screen between it and the
// tool bar at the foot. Three stacked canvases: the paper (plain, lines, squares or dots), the drawing, and a top layer
// for what is being drawn right now (a stroke, a shape being dragged, a sticker being placed). Pointer events, pressure
// ignored, the finger's in-between points kept and smoothed; canvases at the screen's pixel ratio. The maths is
// src/lib/family/sketch.ts, the painting ./studio-paint.ts. My drawings stay on this device (IndexedDB); nothing leaves it
// unless the child sends it: Send to tutor goes through the tutor window's file door (the photo gate, the 10 MB limit and
// the type check unchanged). The test runner has no canvas, so the drawing itself is checked in a browser.

type Props = {
  w: Words;
  // Sends the picture with the child's question; resolves with the words of an error to show, or null when it was sent.
  onSend: (file: File, question: string) => Promise<string | null>;
  onClose: () => void;
  // What the composer held when Draw was tapped: the question box starts with it.
  question?: string;
};

type Sheet = 'send' | 'save' | 'mine' | 'clear' | null;
type Live =
  | { kind: 'ink'; step: Extract<Step, { k: 'ink' }> }
  | { kind: 'erase'; step: Extract<Step, { k: 'ink' }> }
  | { kind: 'shape'; step: Extract<Step, { k: 'shape' }> }
  | { kind: 'tap'; at: Point }
  | { kind: 'drag'; start: Point; from: Point }
  | { kind: 'pinch'; d0: number; px0: number }
  | null;
type Pending = { id: string; at: Point; px: number } | null;
type Note = { text: string; alert: boolean } | null;
type SendState = { state: 'idle' | 'sending' | 'sent' | 'failed'; error?: string };
type Doc = { width: number; height: number; scale: number };

const ICON = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const BAR_BTN = 'fam-press flex h-11 min-w-[44px] shrink-0 items-center justify-center rounded-full px-2 text-ink hover:bg-off-white disabled:opacity-40';
const PILL = 'fam-press flex min-h-[44px] items-center justify-center rounded-full px-4 text-base font-bold';

function canvasBlob(c: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      c.toBlob(resolve, type, quality);
    } catch {
      resolve(null);
    }
  });
}

async function imageOf(blob: Blob): Promise<CanvasImageSource | null> {
  try {
    if (typeof createImageBitmap === 'function') return await createImageBitmap(blob);
  } catch {
    /* falls through to an <img> */
  }
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export function SketchPad({ w, onSend, onClose, question: initialQuestion = '' }: Props) {
  const area = useRef<HTMLDivElement>(null);
  const paperC = useRef<HTMLCanvasElement>(null);
  const layerC = useRef<HTMLCanvasElement>(null);
  const topC = useRef<HTMLCanvasElement>(null);
  const base = useRef<HTMLCanvasElement | null>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const history = useRef<History<Step>>(emptyHistory());
  const baseInk = useRef(false);
  const live = useRef<Live>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pendingRef = useRef<Pending>(null);
  const frame = useRef(0);

  const [doc, setDoc] = useState<Doc | null>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const [paper, setPaper] = useState<Paper>('plain');
  const [tool, setTool] = useState<SketchTool>('pencil');
  const [colour, setColour] = useState<string>(SKETCH_PALETTE[0].hex);
  const [sizeAt, setSizeAt] = useState(1);
  const [panel, setPanel] = useState<StudioPanel>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [text, setText] = useState('');
  const [pending, setPendingState] = useState<Pending>(null);
  const [note, setNote] = useState<Note>(null);
  const [send, setSend] = useState<SendState>({ state: 'idle' });
  const [question, setQuestion] = useState(initialQuestion.slice(0, TUTOR_TEXT_MAX));
  const [, setVersion] = useState(0);
  const [current, setCurrent] = useState<{ id: string | null; name: string }>({ id: null, name: '' });
  const [route, setRoute] = useState<DownloadRoute>('none');
  const bump = () => setVersion((v) => v + 1);
  const setPending = (p: Pending) => {
    pendingRef.current = p;
    setPendingState(p);
  };
  const size = SKETCH_SIZES[sizeAt] * (doc?.scale ?? 1);
  const busy = send.state === 'sending';

  // ---- the canvases ----------------------------------------------------------------------------------------------

  const ctxOf = (c: HTMLCanvasElement | null) => c?.getContext('2d') ?? null;

  const redrawLayer = useCallback(() => {
    const ctx = ctxOf(layerC.current);
    if (!ctx || !doc) return;
    ctx.clearRect(0, 0, doc.width, doc.height);
    if (base.current) ctx.drawImage(base.current, 0, 0);
    for (const s of history.current.done) paintStep(ctx, s, doc.width, doc.height);
  }, [doc]);

  const drawTop = useCallback(() => {
    const ctx = ctxOf(topC.current);
    if (!ctx || !doc) return;
    ctx.clearRect(0, 0, doc.width, doc.height);
    const l = live.current;
    if (l && (l.kind === 'ink' || l.kind === 'shape')) paintStep(ctx, l.step, doc.width, doc.height);
    const p = pendingRef.current;
    if (p) {
      paintSticker(ctx, p.id, p.at, p.px);
      ctx.save();
      ctx.setLineDash([8 * doc.scale, 6 * doc.scale]);
      ctx.lineWidth = 2 * doc.scale;
      ctx.strokeStyle = '#E8702A';
      ctx.strokeRect(p.at.x - p.px / 2, p.at.y - p.px / 2, p.px, p.px);
      ctx.restore();
    }
  }, [doc]);
  const scheduleTop = () => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      drawTop();
    });
  };

  // The drawing's own size, once, from the paper's box when the studio opens.
  useLayoutEffect(() => {
    const el = area.current;
    if (!el || doc) return;
    setDoc(drawingSize(el.clientWidth, el.clientHeight, typeof window !== 'undefined' ? window.devicePixelRatio : 1));
  }, [doc]);

  // The canvases' backing stores follow the drawing's size; the base (steps older than the undo history) with them.
  useLayoutEffect(() => {
    if (!doc) return;
    for (const c of [paperC.current, layerC.current, topC.current]) {
      if (c && (c.width !== doc.width || c.height !== doc.height)) {
        c.width = doc.width;
        c.height = doc.height;
      }
    }
    if (!base.current || base.current.width !== doc.width || base.current.height !== doc.height) {
      const b = base.current ?? document.createElement('canvas');
      b.width = doc.width;
      b.height = doc.height;
      base.current = b;
    }
    redrawLayer();
    drawTop();
  }, [doc, redrawLayer, drawTop]);

  useEffect(() => {
    const ctx = ctxOf(paperC.current);
    if (ctx && doc) paintPaper(ctx, paper, doc.width, doc.height, 32 * doc.scale);
  }, [paper, doc]);

  // On screen the drawing keeps its shape inside the paper's box (a turned phone shows it whole, with a margin).
  useEffect(() => {
    const el = area.current;
    if (!el || !doc) return;
    const fit = () => {
      const k = Math.min(el.clientWidth / doc.width, el.clientHeight / doc.height);
      setBox({ w: Math.max(1, Math.floor(doc.width * k)), h: Math.max(1, Math.floor(doc.height * k)) });
    };
    fit();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [doc]);

  // ---- opening, Escape, the page under it ------------------------------------------------------------------------

  useEffect(() => {
    closeBtn.current?.focus();
    const was = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    try {
      const shareFiles = typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File([new Uint8Array(1)], 'drawing.png', { type: 'image/png' })] });
      setRoute(downloadRoute({ inApp: inFamilyApp(navigator.userAgent), shareFiles }));
    } catch {
      setRoute(downloadRoute({ inApp: inFamilyApp(navigator.userAgent), shareFiles: false }));
    }
    return () => {
      document.body.style.overflow = was;
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, []);

  const sheetRef = useRef<Sheet>(null);
  sheetRef.current = sheet;
  const panelRef = useRef<StudioPanel>(null);
  panelRef.current = panel;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (sheetRef.current) setSheet(null);
      else if (panelRef.current) setPanel(null);
      else onClose();
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [onClose]);

  // ---- the history -----------------------------------------------------------------------------------------------

  const commit = (step: Step) => {
    const { history: next, baked } = record(history.current, step, UNDO_STEPS, stepWeight);
    const bctx = ctxOf(base.current);
    if (bctx && doc) {
      for (const s of baked) {
        paintStep(bctx, s, doc.width, doc.height);
        if (s.k === 'clear') baseInk.current = false;
        else if (inks(s)) baseInk.current = true;
      }
    }
    history.current = next;
    setNote(null);
    if (send.state !== 'sending') setSend({ state: 'idle' });
    bump();
  };
  const blank = (): boolean => {
    let ink = baseInk.current;
    for (const s of history.current.done) {
      if (s.k === 'clear') ink = false;
      else if (inks(s)) ink = true;
    }
    return !ink;
  };
  const undo = () => {
    history.current = undoStep(history.current);
    redrawLayer();
    bump();
  };
  const redo = () => {
    history.current = redoStep(history.current);
    redrawLayer();
    bump();
  };
  const clearAll = () => {
    const ctx = ctxOf(layerC.current);
    if (ctx && doc) paintStep(ctx, { k: 'clear' }, doc.width, doc.height);
    commit({ k: 'clear' });
    setSheet(null);
  };

  // ---- pointer events --------------------------------------------------------------------------------------------

  const toDoc = (clientX: number, clientY: number): Point => {
    const c = topC.current;
    if (!c || !doc) return { x: 0, y: 0 };
    const r = c.getBoundingClientRect();
    return { x: Math.min(doc.width, Math.max(0, ((clientX - r.left) / r.width) * doc.width)), y: Math.min(doc.height, Math.max(0, ((clientY - r.top) / r.height) * doc.height)) };
  };
  const spread = () => {
    const [a, b] = [...pointers.current.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (busy || !doc || (e.pointerType === 'mouse' && e.button !== 0)) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* a pointer the browser already let go */
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = toDoc(e.clientX, e.clientY);
    setPanel(null);
    const sticker = pendingRef.current;
    if (sticker) {
      live.current = pointers.current.size >= 2 ? { kind: 'pinch', d0: Math.max(1, spread()), px0: sticker.px } : { kind: 'drag', start: p, from: sticker.at };
      return;
    }
    if (!e.isPrimary) return;
    if (isFreehand(tool)) {
      const step: Extract<Step, { k: 'ink' }> = { k: 'ink', tool, colour, size, points: [p] };
      if (tool === 'eraser') {
        live.current = { kind: 'erase', step };
        const ctx = ctxOf(layerC.current);
        if (ctx) paintStep(ctx, step, doc.width, doc.height);
      } else live.current = { kind: 'ink', step };
      scheduleTop();
    } else if (isShape(tool)) {
      live.current = { kind: 'shape', step: { k: 'shape', tool, colour, size, a: p, b: p } };
    } else if (tool === 'fill' || tool === 'text') {
      live.current = { kind: 'tap', at: p };
    } else if (tool === 'sticker') {
      setPanel('stickers');
    }
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pointers.current.has(e.pointerId) || !doc) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const l = live.current;
    if (!l) return;
    const sticker = pendingRef.current;
    if (l.kind === 'pinch' && sticker) {
      const k = spread() / l.d0;
      setPending({ ...sticker, px: clampSticker((l.px0 * k) / doc.scale) * doc.scale });
      return scheduleTop();
    }
    if (l.kind === 'drag' && sticker) {
      const p = toDoc(e.clientX, e.clientY);
      setPending({ ...sticker, at: { x: l.from.x + p.x - l.start.x, y: l.from.y + p.y - l.start.y } });
      return scheduleTop();
    }
    if (!e.isPrimary) return;
    // The finger's in-between points make the line smooth where the browser batches its events.
    const batch = typeof e.nativeEvent.getCoalescedEvents === 'function' ? e.nativeEvent.getCoalescedEvents() : [];
    const events = batch.length > 0 ? batch : [e.nativeEvent];
    if (l.kind === 'ink') {
      for (const ev of events) l.step.points = addPoint(l.step.points, toDoc(ev.clientX, ev.clientY), doc.scale);
      scheduleTop();
    } else if (l.kind === 'erase') {
      const ctx = ctxOf(layerC.current);
      for (const ev of events) {
        const p = toDoc(ev.clientX, ev.clientY);
        const last = l.step.points[l.step.points.length - 1];
        const next = addPoint(l.step.points, p, doc.scale);
        if (next !== l.step.points && ctx) paintStep(ctx, { ...l.step, points: [last, p] }, doc.width, doc.height);
        l.step.points = next;
      }
    } else if (l.kind === 'shape') {
      l.step.b = toDoc(e.clientX, e.clientY);
      scheduleTop();
    }
  };

  const up = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(e.pointerId);
    const l = live.current;
    if (!l || !doc) return;
    if (l.kind === 'pinch' || l.kind === 'drag') {
      // One finger of a pinch lifted: the other drags on from where it is.
      const sticker = pendingRef.current;
      const rest = [...pointers.current.values()][0];
      live.current = sticker && rest ? { kind: 'drag', start: toDoc(rest.x, rest.y), from: sticker.at } : null;
      return;
    }
    if (!e.isPrimary) return;
    live.current = null;
    const ctx = ctxOf(layerC.current);
    if (!ctx) return;
    if (l.kind === 'ink') {
      paintStep(ctx, l.step, doc.width, doc.height);
      commit(l.step);
    } else if (l.kind === 'erase') {
      commit(l.step);
    } else if (l.kind === 'shape') {
      if (Math.hypot(l.step.b.x - l.step.a.x, l.step.b.y - l.step.a.y) >= 3 * doc.scale) {
        paintStep(ctx, l.step, doc.width, doc.height);
        commit(l.step);
      }
    } else if (l.kind === 'tap') {
      if (tool === 'fill') {
        const step: Step = { k: 'fill', colour, at: l.at };
        const whole = paintStep(ctx, step, doc.width, doc.height);
        commit(step);
        if (!whole) setNote({ text: w['fam.sketch.fillBig'], alert: false });
      } else if (tool === 'text') {
        const words = text.trim();
        if (!words) setNote({ text: w['fam.sketch.textHint'], alert: false });
        else {
          const step: Step = { k: 'text', colour, size: textSize(SKETCH_SIZES[sizeAt], doc.scale), text: words, at: l.at };
          paintStep(ctx, step, doc.width, doc.height);
          commit(step);
        }
      }
    }
    drawTop();
  };

  // A stroke the system cancelled (an incoming call, a palm) is dropped, not kept half-drawn; the eraser's part is kept.
  const cancelled = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(e.pointerId);
    const l = live.current;
    live.current = null;
    if (l?.kind === 'erase') commit(l.step);
    drawTop();
  };

  // ---- stickers --------------------------------------------------------------------------------------------------

  const pickSticker = (id: string) => {
    if (!doc) return;
    setTool('sticker');
    setPanel(null);
    setPending({ id, at: { x: doc.width / 2, y: doc.height / 2 }, px: Math.min(STICKER_START * doc.scale, Math.min(doc.width, doc.height) * 0.6) });
    setNote({ text: w['fam.sketch.stickerHint'], alert: false });
    requestAnimationFrame(drawTop);
  };
  const resizeSticker = (k: number) => {
    const p = pendingRef.current;
    if (!p || !doc) return;
    setPending({ ...p, px: clampSticker((p.px * k) / doc.scale) * doc.scale });
    scheduleTop();
  };
  const stamp = () => {
    const p = pendingRef.current;
    const ctx = ctxOf(layerC.current);
    if (!p || !ctx || !doc) return;
    const step: Step = { k: 'sticker', id: p.id, at: p.at, px: p.px };
    paintStep(ctx, step, doc.width, doc.height);
    setPending(null);
    commit(step);
    drawTop();
  };
  const dropSticker = () => {
    setPending(null);
    setNote(null);
    drawTop();
  };

  // ---- the picture: send, save, download -------------------------------------------------------------------------

  const picture = (maxSide: number, type = 'image/png', quality?: number): Promise<Blob | null> => {
    if (!doc || !paperC.current || !layerC.current) return Promise.resolve(null);
    const { width, height } = fitWithin(doc.width, doc.height, maxSide);
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    const ctx = c.getContext('2d');
    if (!ctx) return Promise.resolve(null);
    ctx.drawImage(paperC.current, 0, 0, width, height);
    ctx.drawImage(layerC.current, 0, 0, width, height);
    return canvasBlob(c, type, quality);
  };

  // Within the file door's limit: a PNG up to 1600 px, smaller while it is over, then a JPEG as the last step.
  const pictureToSend = async (): Promise<File | null> => {
    let scale = 1;
    let blob = await picture(SEND_MAX_SIDE);
    for (let i = 0; blob && i < 3; i++) {
      const next = smallerScale(blob.size, TUTOR_FILE_MAX_BYTES, scale);
      if (next === null) break;
      scale = next;
      blob = await picture(Math.round(SEND_MAX_SIDE * scale));
    }
    if (blob && blob.size > TUTOR_FILE_MAX_BYTES) {
      blob = await picture(Math.round(SEND_MAX_SIDE * scale), 'image/jpeg', 0.85);
      return blob && blob.size <= TUTOR_FILE_MAX_BYTES ? new File([blob], 'drawing.jpg', { type: 'image/jpeg' }) : null;
    }
    return blob ? new File([blob], 'drawing.png', { type: 'image/png' }) : null;
  };

  const sendNow = async () => {
    if (busy) return;
    if (blank()) return setSend({ state: 'failed', error: w['fam.sketch.blank'] });
    setSend({ state: 'sending' });
    const file = await pictureToSend();
    if (!file) return setSend({ state: 'failed', error: w['fam.tutor.err.file_too_large'] });
    let failed: string | null;
    try {
      failed = await onSend(file, question);
    } catch {
      failed = w['fam.err.network'];
    }
    if (failed) return setSend({ state: 'failed', error: failed });
    setSend({ state: 'sent' });
    setTimeout(onClose, 1800);
  };

  const [saveName, setSaveName] = useState('');
  const [full, setFull] = useState<SavedDrawing | null>(null);
  const save = async () => {
    setFull(null);
    const layer = layerC.current;
    if (!layer || !doc) return;
    const list = await listDrawings();
    if (!list.ok) return setNote({ text: w['fam.sketch.noStore'], alert: true });
    const replacing = current.id !== null && list.value.some((d) => d.id === current.id);
    if (!canSave(list.value.length, replacing)) {
      setFull(oldestFirst(list.value)[0] ?? null);
      return setNote({ text: fill(w['fam.sketch.full'], { max: list.value.length }), alert: true });
    }
    const [layerBlob, thumb] = await Promise.all([canvasBlob(layer, 'image/png'), picture(240)]);
    if (!layerBlob || !thumb) return setNote({ text: w['fam.sketch.saveFailed'], alert: true });
    const id = replacing && current.id ? current.id : newId();
    const name = cleanName(saveName) || w['fam.sketch.untitled'];
    const put = await putDrawing({ id, name, updatedAt: Date.now(), paper, width: doc.width, height: doc.height, layer: layerBlob, thumb });
    if (!put.ok) return setNote({ text: put.reason === 'unavailable' ? w['fam.sketch.noStore'] : w['fam.sketch.saveFailed'], alert: true });
    setCurrent({ id, name });
    setSheet(null);
    setNote({ text: w['fam.sketch.saved'], alert: false });
  };

  const download = async () => {
    const blob = await picture(Math.max(doc?.width ?? 0, doc?.height ?? 0) || SEND_MAX_SIDE);
    if (!blob) return setNote({ text: w['fam.sketch.saveFailed'], alert: true });
    const name = `${(cleanName(saveName) || current.name || w['fam.sketch.untitled']).replace(/[\\/:*?"<>|]+/g, ' ')}.png`;
    const file = new File([blob], name, { type: 'image/png' });
    if (route === 'share') {
      try {
        await navigator.share({ files: [file] });
      } catch {
        /* the child closed the share sheet */
      }
      return;
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  const open = async (d: SavedDrawing) => {
    const img = await imageOf(d.layer);
    if (!img) return setNote({ text: w['fam.sketch.saveFailed'], alert: true });
    const b = document.createElement('canvas');
    b.width = d.width;
    b.height = d.height;
    b.getContext('2d')?.drawImage(img, 0, 0);
    base.current = b;
    baseInk.current = true;
    history.current = emptyHistory();
    setPaper(d.paper);
    setCurrent({ id: d.id, name: d.name });
    setSaveName(d.name);
    setSheet(null);
    setPending(null);
    setDoc((now) => (now && now.width === d.width && now.height === d.height ? { ...now } : { width: d.width, height: d.height, scale: now?.scale ?? 1 }));
    bump();
  };
  const fresh = () => {
    const ctx = ctxOf(base.current);
    if (ctx && doc) ctx.clearRect(0, 0, doc.width, doc.height);
    baseInk.current = false;
    history.current = emptyHistory();
    setCurrent({ id: null, name: '' });
    setSaveName('');
    setSheet(null);
    setPending(null);
    redrawLayer();
    bump();
  };

  // ---- the screen ------------------------------------------------------------------------------------------------

  const canUndo = history.current.done.length > 0 && !busy;
  const canRedo = history.current.undone.length > 0 && !busy;
  const chooseTool = (t: SketchTool) => {
    setTool(t);
    setPanel(null);
    if (pendingRef.current) dropSticker();
    setNote(t === 'text' ? { text: w['fam.sketch.textHint'], alert: false } : null);
  };
  const safe: CSSProperties = { paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)', paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)' };
  const sizes = isFreehand(tool) || isShape(tool) || tool === 'text';

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={w['fam.sketch.title']} data-sketch-pad style={safe} className="fixed inset-0 z-50 flex select-none flex-col bg-paper">
      <div className="flex h-14 shrink-0 items-center gap-0.5 px-1.5">
        <button ref={closeBtn} type="button" data-sketch-close aria-label={w['fam.sketch.close']} title={w['fam.sketch.close']} onClick={onClose} className={BAR_BTN}>
          <svg aria-hidden="true" className="h-6 w-6" {...ICON} strokeWidth={2.5}>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <p className="hidden min-w-0 flex-1 truncate text-base font-bold text-ink sm:block">{current.name || w['fam.sketch.title']}</p>
        <span className="flex-1 sm:hidden" />
        <button type="button" data-sketch-undo aria-label={w['fam.sketch.undo']} title={w['fam.sketch.undo']} disabled={!canUndo} onClick={undo} className={BAR_BTN}>
          <svg aria-hidden="true" className="h-6 w-6" {...ICON}>
            <path d="M9 14L4 9l5-5M4 9h9a6 6 0 0 1 0 12h-3" />
          </svg>
        </button>
        <button type="button" data-sketch-redo aria-label={w['fam.sketch.redo']} title={w['fam.sketch.redo']} disabled={!canRedo} onClick={redo} className={BAR_BTN}>
          <svg aria-hidden="true" className="h-6 w-6" {...ICON}>
            <path d="M15 14l5-5-5-5M20 9h-9a6 6 0 0 0 0 12h3" />
          </svg>
        </button>
        <button type="button" data-sketch-mine aria-label={w['fam.sketch.mine']} title={w['fam.sketch.mine']} disabled={busy} onClick={() => setSheet('mine')} className={BAR_BTN}>
          <svg aria-hidden="true" className="h-6 w-6" {...ICON}>
            <rect x="3" y="3" width="7" height="7" rx="1.5" />
            <rect x="14" y="3" width="7" height="7" rx="1.5" />
            <rect x="3" y="14" width="7" height="7" rx="1.5" />
            <rect x="14" y="14" width="7" height="7" rx="1.5" />
          </svg>
        </button>
        <button type="button" data-sketch-save aria-label={w['fam.sketch.save']} title={w['fam.sketch.save']} disabled={busy} onClick={() => setSheet('save')} className={BAR_BTN}>
          <svg aria-hidden="true" className="h-6 w-6" {...ICON}>
            <path d="M5 3h11l3 3v15H5z" />
            <path d="M8 3v5h7V3M8 21v-7h8v7" />
          </svg>
        </button>
        <button type="button" data-sketch-send onClick={() => setSheet('send')} disabled={busy} className={`${PILL} fam-cta ml-1 whitespace-nowrap bg-saffron !px-3 text-ink shadow-md disabled:opacity-50`}>
          {w['fam.sketch.send']}
        </button>
      </div>

      <div ref={area} data-sketch-area className="relative mx-2 flex min-h-0 flex-1 items-center justify-center">
        <div className="relative overflow-hidden rounded-2xl shadow-sm ring-1 ring-ink/15" style={box ? { width: box.w, height: box.h } : { width: '100%', height: '100%' }}>
          <canvas ref={paperC} aria-hidden="true" className="absolute inset-0 h-full w-full" />
          <canvas ref={layerC} aria-hidden="true" data-sketch-canvas className="absolute inset-0 h-full w-full" />
          <canvas
            ref={topC}
            role="img"
            aria-label={w['fam.sketch.title']}
            data-sketch-top
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={cancelled}
            onContextMenu={(e) => e.preventDefault()}
            // The page must not scroll or zoom while a finger draws on the paper.
            style={{ touchAction: 'none' }}
            className="absolute inset-0 h-full w-full"
          />
        </div>

        {panel && (
          <div data-studio-panel-open={panel} className="fam-acc-in absolute inset-x-0 bottom-2 z-10 mx-auto max-h-[22rem] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-3 shadow-xl ring-1 ring-ink/10">
            {panel === 'colours' && (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-bold text-ink">{w['fam.sketch.colours']}</p>
                <div className="grid grid-cols-6 gap-2">
                  {SKETCH_PALETTE.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      data-sketch-colour={c.id}
                      aria-pressed={colour.toLowerCase() === c.hex.toLowerCase()}
                      aria-label={w[`fam.sketch.colour.${c.id}`]}
                      title={w[`fam.sketch.colour.${c.id}`]}
                      onClick={() => {
                        setColour(c.hex);
                        setPanel(null);
                        if (tool === 'eraser' || tool === 'sticker') setTool('pencil');
                      }}
                      className={`fam-press flex h-11 w-11 items-center justify-center rounded-full ${colour.toLowerCase() === c.hex.toLowerCase() ? 'ring-[3px] ring-ink' : 'ring-1 ring-ink/20'}`}
                    >
                      <span aria-hidden="true" className="h-8 w-8 rounded-full ring-1 ring-ink/10" style={{ backgroundColor: c.hex }} />
                    </button>
                  ))}
                </div>
                <label className="flex min-h-[44px] items-center gap-3 text-sm font-bold text-ink">
                  <input type="color" data-sketch-custom value={isHexColour(colour) ? colour : '#000000'} onChange={(e) => setColour(e.target.value)} className="h-11 w-11 shrink-0 cursor-pointer rounded-full border-0 bg-transparent p-0" />
                  {w['fam.sketch.custom']}
                </label>
              </div>
            )}
            {panel === 'shapes' && (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-bold text-ink">{w['fam.sketch.shapes']}</p>
                <div className="flex flex-wrap gap-2">
                  {SHAPE_TOOLS.map((t) => (
                    <button key={t} type="button" data-studio-tool={t} aria-pressed={tool === t} aria-label={w[`fam.sketch.tool.${t}`]} title={w[`fam.sketch.tool.${t}`]} onClick={() => chooseTool(t)} className={`${TOOL_BTN} ${tool === t ? 'bg-ink text-white' : 'bg-white text-ink ring-1 ring-ink/15'}`}>
                      <ToolIcon name={t} />
                    </button>
                  ))}
                </div>
              </div>
            )}
            {panel === 'stickers' && (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-bold text-ink">{w['fam.sketch.stickers']}</p>
                <div className="grid grid-cols-5 gap-2 sm:grid-cols-8">
                  {STICKERS.map((s) => (
                    <button key={s.id} type="button" data-sketch-sticker={s.id} aria-label={w[`fam.sketch.sticker.${s.id}`]} title={w[`fam.sketch.sticker.${s.id}`]} onClick={() => pickSticker(s.id)} className="fam-press flex h-14 w-full min-w-[44px] items-center justify-center rounded-xl bg-off-white hover:bg-white hover:ring-1 hover:ring-ink/15">
                      <svg aria-hidden="true" viewBox={`0 0 ${STICKER_BOX} ${STICKER_BOX}`} className="h-11 w-11" strokeWidth={STICKER_LINE} strokeLinecap="round" strokeLinejoin="round">
                        {s.parts.map((part, i) => (
                          <path key={i} d={part.d} fill={part.fill ?? 'none'} stroke="currentColor" className="text-ink" />
                        ))}
                      </svg>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {panel === 'paper' && (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-bold text-ink">{w['fam.sketch.paper']}</p>
                <div className="grid grid-cols-4 gap-2">
                  {PAPERS.map((p) => (
                    <button key={p} type="button" data-sketch-paper={p} aria-pressed={paper === p} onClick={() => (setPaper(p), setPanel(null))} className={`fam-press flex min-h-[44px] items-center justify-center rounded-xl px-2 text-sm font-bold ${paper === p ? 'bg-ink text-white' : 'bg-white text-ink ring-1 ring-ink/15'}`}>
                      {w[`fam.sketch.paper.${p}`]}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {sheet && (
          <div className="absolute inset-0 z-20 flex items-end justify-center bg-ink/30 p-2" onPointerDown={(e) => e.target === e.currentTarget && !busy && setSheet(null)}>
            <div role="dialog" aria-label={sheet === 'send' ? w['fam.sketch.send'] : sheet === 'save' ? w['fam.sketch.save'] : sheet === 'mine' ? w['fam.sketch.mine'] : w['fam.sketch.clear']} data-sketch-sheet={sheet} className="fam-acc-in flex max-h-full w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-2xl bg-white p-4 shadow-xl">
              {sheet === 'clear' && (
                <>
                  <p className="text-base font-bold text-ink">{w['fam.sketch.clearAsk']}</p>
                  <div className="flex gap-2">
                    <button type="button" data-sketch-clear-keep onClick={() => setSheet(null)} className={`${PILL} flex-1 bg-white text-ink ring-1 ring-ink/20`}>
                      {w['fam.sketch.keep']}
                    </button>
                    <button type="button" data-sketch-clear-yes onClick={clearAll} className={`${PILL} flex-1 bg-coral-deep text-white`}>
                      {w['fam.sketch.clearYes']}
                    </button>
                  </div>
                </>
              )}
              {sheet === 'send' && (
                <>
                  <label htmlFor="sketch-question" className="text-base font-bold text-ink">
                    {w['fam.sketch.question']}
                  </label>
                  <textarea
                    id="sketch-question"
                    data-sketch-question
                    rows={2}
                    maxLength={TUTOR_TEXT_MAX}
                    value={question}
                    disabled={busy || send.state === 'sent'}
                    placeholder={w['fam.sketch.questionHint']}
                    onChange={(e) => setQuestion(e.target.value)}
                    className="min-h-[44px] w-full resize-none rounded-xl bg-off-white px-3 py-2 text-base text-slate ring-1 ring-ink/15 placeholder:text-slate/80 focus:outline-none focus:ring-2 focus:ring-ink"
                  />
                  {send.state === 'sending' && (
                    <p role="status" data-sketch-state="sending" className="text-sm font-semibold text-slate">
                      {w['fam.sketch.sending']}
                    </p>
                  )}
                  {send.state === 'sent' && (
                    <p role="status" data-sketch-state="sent" className="flex items-center gap-2 text-base font-bold text-emerald">
                      <svg aria-hidden="true" className="h-5 w-5" {...ICON} strokeWidth={2.5}>
                        <path d="M5 12l5 5 9-10" />
                      </svg>
                      {w['fam.sketch.sent']}
                    </p>
                  )}
                  {send.state === 'failed' && (
                    <p role="alert" data-sketch-state="failed" data-sketch-error className="text-sm font-semibold text-coral-deep">
                      {w['fam.sketch.failed']} {send.error}
                    </p>
                  )}
                  <div className="flex gap-2">
                    {send.state === 'sent' ? (
                      <button type="button" data-sketch-back onClick={onClose} className={`${PILL} flex-1 bg-ink text-white`}>
                        {w['fam.sketch.back']}
                      </button>
                    ) : (
                      <button type="button" data-sketch-send-now disabled={busy} aria-busy={busy || undefined} onClick={() => void sendNow()} className={`${PILL} fam-cta flex-1 bg-saffron text-ink shadow-md disabled:opacity-60`}>
                        {busy ? w['fam.sketch.sending'] : send.state === 'failed' ? w['fam.sketch.tryAgain'] : w['fam.sketch.send']}
                      </button>
                    )}
                  </div>
                </>
              )}
              {sheet === 'save' && (
                <>
                  <label htmlFor="sketch-name" className="text-base font-bold text-ink">
                    {w['fam.sketch.nameLabel']}
                  </label>
                  <input id="sketch-name" data-sketch-name value={saveName} maxLength={40} onChange={(e) => setSaveName(e.target.value)} className="min-h-[44px] w-full rounded-xl bg-off-white px-3 text-base text-slate ring-1 ring-ink/15 focus:outline-none focus:ring-2 focus:ring-ink" />
                  {full && (
                    <div data-sketch-full className="flex items-center gap-2 rounded-xl bg-off-white p-2">
                      <Thumb blob={full.thumb} alt={full.name} className="h-12 w-16 shrink-0" />
                      <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink">
                        {w['fam.sketch.oldest']}: {full.name}
                      </span>
                      <button
                        type="button"
                        data-sketch-delete-oldest
                        onClick={async () => {
                          const r = await deleteDrawing(full.id);
                          setFull(null);
                          setNote(r.ok ? null : { text: w['fam.sketch.noStore'], alert: true });
                        }}
                        className={`${PILL} bg-white text-coral-deep ring-1 ring-ink/20`}
                      >
                        {w['fam.sketch.delete']}
                      </button>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button type="button" data-sketch-save-now onClick={() => void save()} className={`${PILL} flex-1 bg-ink text-white`}>
                      {w['fam.sketch.save']}
                    </button>
                    {route !== 'none' && (
                      <button type="button" data-sketch-download onClick={() => void download()} className={`${PILL} flex-1 bg-white text-ink ring-1 ring-ink/20`}>
                        {w['fam.sketch.download']}
                      </button>
                    )}
                  </div>
                  {route === 'none' && <p data-sketch-download-note className="text-sm text-slate">{w['fam.sketch.downloadApp']}</p>}
                </>
              )}
              {sheet === 'mine' && <MyDrawings w={w} onOpen={(d) => void open(d)} onFresh={fresh} />}
              {note && sheet !== 'send' && (
                <p role={note.alert ? 'alert' : 'status'} className="text-sm font-semibold text-slate">
                  {note.text}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex min-h-[52px] shrink-0 items-center gap-1.5 overflow-x-auto px-2 pt-2 [scrollbar-width:none]">
        {pending ? (
          <>
            <button type="button" data-sketch-smaller aria-label={w['fam.sketch.smaller']} title={w['fam.sketch.smaller']} onClick={() => resizeSticker(0.8)} className={`${TOOL_BTN} bg-white text-xl font-bold text-ink ring-1 ring-ink/15`}>
              −
            </button>
            <button type="button" data-sketch-bigger aria-label={w['fam.sketch.bigger']} title={w['fam.sketch.bigger']} onClick={() => resizeSticker(1.25)} className={`${TOOL_BTN} bg-white text-xl font-bold text-ink ring-1 ring-ink/15`}>
              +
            </button>
            <button type="button" data-sketch-stamp onClick={stamp} className={`${PILL} fam-cta bg-saffron text-ink shadow-md`}>
              {w['fam.sketch.stamp']}
            </button>
            <button type="button" data-sketch-unstamp onClick={dropSticker} className={`${PILL} bg-white text-ink ring-1 ring-ink/20`}>
              {w['fam.sketch.unstamp']}
            </button>
          </>
        ) : (
          <>
            {sizes &&
              SKETCH_SIZES.map((s, i) => (
                <button
                  key={s}
                  type="button"
                  data-sketch-size={i + 1}
                  aria-pressed={sizeAt === i}
                  aria-label={fill(w['fam.sketch.size'], { n: i + 1 })}
                  title={fill(w['fam.sketch.size'], { n: i + 1 })}
                  onClick={() => setSizeAt(i)}
                  className={`${TOOL_BTN} ${sizeAt === i ? 'bg-ink/10 ring-2 ring-ink' : 'bg-white ring-1 ring-ink/15'}`}
                >
                  <span aria-hidden="true" className="rounded-full" style={{ width: Math.min(28, 4 + s), height: Math.min(28, 4 + s), backgroundColor: tool === 'eraser' ? '#9CA3AF' : colour }} />
                </button>
              ))}
            {tool === 'text' && (
              <input
                aria-label={w['fam.sketch.textLabel']}
                data-sketch-text
                value={text}
                maxLength={TEXT_MAX}
                placeholder={w['fam.sketch.textLabel']}
                onChange={(e) => setText(e.target.value)}
                className="min-h-[44px] min-w-[8rem] flex-1 rounded-xl bg-white px-3 text-base text-slate ring-1 ring-ink/15 placeholder:text-slate/80 focus:outline-none focus:ring-2 focus:ring-ink"
              />
            )}
          </>
        )}
      </div>
      {note && !sheet && (
        <p role={note.alert ? 'alert' : 'status'} data-sketch-note className="mx-3 mt-1 text-sm font-semibold text-slate">
          {note.text}
        </p>
      )}
      <StudioToolbar w={w} tool={tool} colour={colour} panel={panel} disabled={busy} onTool={chooseTool} onPanel={setPanel} onClear={() => setSheet('clear')} />
    </div>,
    document.body
  );
}

// A saved drawing's small picture (an object URL, let go when it leaves the screen).
function Thumb({ blob, alt, className }: { blob: Blob; alt: string; className: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let u: string | null = null;
    try {
      u = URL.createObjectURL(blob);
      setUrl(u);
    } catch {
      setUrl(null);
    }
    return () => {
      if (u) URL.revokeObjectURL(u);
    };
  }, [blob]);
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt={alt} className={`${className} rounded-lg bg-white object-contain ring-1 ring-ink/10`} /> : <span className={`${className} rounded-lg bg-white ring-1 ring-ink/10`} />;
}

// My drawings: the device's own list, newest first; open, copy or delete (delete asks twice). Full: the oldest is marked.
function MyDrawings({ w, onOpen, onFresh }: { w: Words; onOpen: (d: SavedDrawing) => void; onFresh: () => void }) {
  const [list, setList] = useState<SavedDrawing[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [sure, setSure] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await listDrawings();
    if (!r.ok) {
      setList([]);
      return setProblem(w['fam.sketch.noStore']);
    }
    setList(newestFirst(r.value));
  }, [w]);
  useEffect(() => {
    void load();
  }, [load]);
  const isFull = list !== null && !canSave(list.length, false);
  const oldest = list && list.length ? oldestFirst(list)[0].id : null;
  const copy = async (d: SavedDrawing) => {
    if (!list || !canSave(list.length, false)) return setProblem(fill(w['fam.sketch.full'], { max: list?.length ?? 0 }));
    const r = await putDrawing({ ...d, id: newId(), name: copyName(d.name, list.map((x) => x.name)), updatedAt: Date.now() });
    if (!r.ok) return setProblem(r.reason === 'unavailable' ? w['fam.sketch.noStore'] : w['fam.sketch.saveFailed']);
    void load();
  };
  const remove = async (d: SavedDrawing) => {
    if (sure !== d.id) return setSure(d.id);
    setSure(null);
    const r = await deleteDrawing(d.id);
    if (!r.ok) return setProblem(w['fam.sketch.noStore']);
    setProblem(null);
    void load();
  };
  return (
    <div data-sketch-mine-list className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <p className="flex-1 text-base font-bold text-ink">{w['fam.sketch.mine']}</p>
        <button type="button" data-sketch-new onClick={onFresh} className={`${PILL} bg-white text-ink ring-1 ring-ink/20`}>
          {w['fam.sketch.new']}
        </button>
      </div>
      {problem && (
        <p role="alert" className="text-sm font-semibold text-slate">
          {problem}
        </p>
      )}
      {isFull && !problem && <p className="text-sm font-semibold text-slate">{fill(w['fam.sketch.full'], { max: list?.length ?? 0 })}</p>}
      {list && list.length === 0 && !problem && <p className="text-sm text-slate">{w['fam.sketch.mineEmpty']}</p>}
      {list && list.length > 0 && (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {list.map((d) => (
            <li key={d.id} data-sketch-saved={d.id} className="flex flex-col gap-1.5 rounded-xl bg-off-white p-2">
              <button type="button" onClick={() => onOpen(d)} className="fam-press flex flex-col items-start gap-1 text-left">
                <Thumb blob={d.thumb} alt={d.name} className="aspect-[4/3] w-full" />
                <span id={`sketch-saved-${d.id}`} className="w-full truncate text-sm font-bold text-ink">
                  {d.name}
                </span>
                {isFull && d.id === oldest && <span className="rounded-full bg-sunshine/40 px-2 text-xs font-bold text-ink">{w['fam.sketch.oldest']}</span>}
              </button>
              <div className="flex gap-1">
                <button type="button" aria-describedby={`sketch-saved-${d.id}`} onClick={() => void copy(d)} className="fam-press flex min-h-[44px] flex-1 items-center justify-center rounded-lg bg-white text-xs font-bold text-ink ring-1 ring-ink/15">
                  {w['fam.sketch.duplicate']}
                </button>
                <button
                  type="button"
                  aria-describedby={`sketch-saved-${d.id}`}
                  onClick={() => void remove(d)}
                  className={`fam-press flex min-h-[44px] flex-1 items-center justify-center rounded-lg text-xs font-bold ${sure === d.id ? 'bg-coral-deep text-white' : 'bg-white text-coral-deep ring-1 ring-ink/15'}`}
                >
                  {sure === d.id ? w['fam.sketch.deleteSure'] : w['fam.sketch.delete']}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
