'use client';

import { drawMarker } from '@/lib/family/draw-templates';
import { createPortal } from 'react-dom';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
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
  canSave,
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
  type FreehandTool,
  type History,
  type Paper,
  type Point,
  type SketchTool,
} from '@/lib/family/sketch';
import { BRUSH_LOOK, StrokeBuilder, type RawPoint } from '@/lib/family/draw-brush';
import {
  LONG_PRESS_MS,
  LONG_PRESS_SLOP,
  moveSticker,
  nearestHue,
  outlineBox,
  pushRecent,
  resizeSticker,
  turnSticker,
  twistSticker,
  wheelCentre,
  wheelColour,
  wheelHit,
  type StickerObject,
  type WheelHit,
} from '@/lib/family/draw-geometry';
import { exportLayers } from '@/lib/family/draw-layers';
import { sanitiseOutline, outlineDataUrl } from '@/lib/family/draw-svg';
import { canStartNew, dayKey } from '@/lib/family/draw-daily';
import { singleFlight } from '@/lib/family/draw-send';
import type { StudioEvent, StudioOpen } from '@/lib/family/draw-contract';
import { STICKER_BOX, STICKER_GROUPS, STICKER_LINE, stickerById } from '@/lib/family/sketch-stickers';
import { bumpDayCount, deleteDrawing, listDrawings, putDrawing, readDayCount, type SavedDrawing } from '@/lib/family/sketch-store';
import { TUTOR_FILE_MAX_BYTES, TUTOR_TEXT_MAX } from '@/lib/family/tutor-shape';
import { lessonColors } from '@/lib/design-tokens';
import { inks, liveOpacity, paintLive, paintPaper, paintRibbon, paintStep, stepWeight, textSize, type Step } from './studio-paint';
import { StudioToolbar, ToolIcon, TOOL_BTN, type StudioPanel } from './StudioToolbar';
import { RadialPicker } from './RadialPicker';
import { DrawLimit } from './DrawLimit';
import { canAdvance, guidedSteps, playSfx, readSoundOn, readStep, speak, stopSpeaking, writeSoundOn, writeStep, type Sfx } from '@/lib/family/draw-engage';

// The child's drawing studio (W18-P3, rebuilt in C510, made an art table in C513). Full screen above the app (a portal
// into the body), safe-area aware, on a warm table: a top bar (close, undo, redo, save, Send to tutor), the paper as a
// lifted sheet, the tool tray of chunky 48 px blocks at the foot. The layers (src/lib/family/draw-layers.ts): the paper
// (its grain drawn on its canvas), the drawing, a top canvas for the live stroke, the loose stickers (objects moved,
// turned and resized until "Stick"), and a template's outline on top (an <img> of the sanitised SVG), which the eraser
// and Clear never reach. Strokes follow the brush model (src/lib/family/draw-brush.ts): pressure from a stylus, else
// speed; a small stabiliser; a filled ribbon; the live stroke on the top canvas and put down on lift. A long press on
// the paper or on Colours opens the colour wheel under the finger. My drawings stay on this device (IndexedDB); nothing
// leaves it unless the child sends it: Send to tutor goes through the tutor window's file door (the photo gate, the
// 10 MB limit and the type check unchanged), one send at a time. The test runner has no canvas, so the drawing itself
// is checked in a browser (docs/screenshots/c513-draw).

type Props = {
  w: Words;
  // Sends the picture with the child's question; resolves with the words of an error to show, or null when it was sent.
  // Absent (a pre-primary child, or no tutor for this child): no Send button.
  onSend?: (file: File, question: string) => Promise<string | null>;
  onClose: () => void;
  // What the composer held when Draw was tapped: the question box starts with it.
  question?: string;
  // C513 (src/lib/family/draw-contract.ts): a template to colour, or the free canvas, and what the host hears.
  open?: StudioOpen;
  onEvent?: (e: StudioEvent) => void;
  // A drawing from My drawings to open at once (the Draw tab's gallery).
  startWith?: SavedDrawing | null;
  // The daily creation limit (the Draw tab): new drawings counted on the device for this child.
  daily?: { limit: number; child: string } | null;
  // Keep the drawing in My drawings when the studio closes (the Draw tab), instead of only on Save.
  keepOnClose?: boolean;
  // C517: the guided studio for LKG to Class 4 (sounds, the phone's voice, one step at a time); the child's language for
  // the voice; and the child's tag on this phone, under which the step a template stopped at is kept.
  engage?: boolean;
  lang?: 'en' | 'hi';
  child?: string;
};

type Sheet = 'send' | 'save' | 'mine' | 'clear' | null;
type InkStep = Extract<Step, { k: 'ink' }>;
type Live =
  | { kind: 'ink'; step: InkStep; builder: StrokeBuilder }
  | { kind: 'erase'; step: InkStep; builder: StrokeBuilder }
  | { kind: 'shape'; step: Extract<Step, { k: 'shape' }> }
  | { kind: 'tap'; at: Point }
  | { kind: 'label'; at: Point; word: string }
  | null;
type Grab = { key: string; mode: 'move' | 'twist'; start: Point; from: StickerObject } | null;
type Hold = { id: number; x: number; y: number; timer: ReturnType<typeof setTimeout> | null } | null;
type Wheel = { centre: Point; hover: WheelHit; toneHue: number } | null;
type Note = { text: string; alert: boolean } | null;
type SendState = { state: 'idle' | 'sending' | 'sent' | 'failed'; error?: string };
type Doc = { width: number; height: number; scale: number };

const ICON = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const BAR_BTN = 'fam-press flex h-12 min-w-[48px] shrink-0 items-center justify-center rounded-2xl px-2 text-ink hover:bg-white/60 disabled:opacity-40';
const PILL = 'fam-press flex min-h-[48px] items-center justify-center rounded-2xl px-4 text-base font-bold';
const SWATCH = 'fam-press flex h-12 w-12 items-center justify-center rounded-full';

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
const rawOf = (e: { clientX: number; clientY: number; timeStamp: number; pressure: number; pointerType: string }, at: Point): RawPoint => ({ x: at.x, y: at.y, t: e.timeStamp, pressure: e.pressure, pen: e.pointerType === 'pen' });

export function Studio({ w, onSend, onClose, question: initialQuestion = '', open: opened = { from: 'free' }, onEvent, startWith = null, daily = null, keepOnClose = false, engage = false, lang = 'en', child }: Props) {
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
  const frame = useRef(0);
  const grab = useRef<Grab>(null);
  const hold = useRef<Hold>(null);
  const wheelRef = useRef<Wheel>(null);
  const swallow = useRef(false);
  const counted = useRef(false);
  const dirty = useRef(false);
  const outlineImg = useRef<HTMLImageElement | null>(null);

  const template = opened.template ?? null;
  const outline = useMemo(() => (template ? sanitiseOutline(template.outlineSvg) : null), [template]);
  const outlineUrl = useMemo(() => (outline ? outlineDataUrl(outline) : null), [outline]);
  const themed = useMemo(() => (template ? template.palette.filter((c) => isHexColour(c)).slice(0, 8).map((c) => c.toUpperCase()) : []), [template]);

  const [doc, setDoc] = useState<Doc | null>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const [paper, setPaper] = useState<Paper>('plain');
  const [tool, setTool] = useState<SketchTool>(template ? 'brush' : 'pencil');
  const [colour, setColour] = useState<string>(themed[0] ?? SKETCH_PALETTE[0].hex);
  const [recent, setRecent] = useState<string[]>([]);
  const [sizeAt, setSizeAt] = useState(1);
  const [panel, setPanel] = useState<StudioPanel>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [text, setText] = useState('');
  const [stickers, setStickersState] = useState<StickerObject[]>([]);
  const stickersRef = useRef<StickerObject[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [placing, setPlacing] = useState<string | null>(null);
  const [wheel, setWheelState] = useState<Wheel>(null);
  const [note, setNote] = useState<Note>(null);
  // C517: the sticker tray's open group.
  const [stickerGroup, setStickerGroup] = useState(STICKER_GROUPS[0].id);
  // C517: engagement mode. Sound is on unless turned off on this phone; a template is walked one step at a time, and the
  // next step opens only after the child drew on this one.
  const [soundOn, setSoundOn] = useState(true);
  useEffect(() => setSoundOn(readSoundOn()), []);
  const guide = useMemo(
    () => (engage && opened.template ? guidedSteps(opened.template, { colourIt: w['fam.draw.g.colourIt'], finish: w['fam.draw.g.finish'] }) : null),
    [engage, opened.template, w]
  );
  const stepTag = child ?? daily?.child ?? null;
  const [stepAt, setStepAt] = useState(0);
  const [drew, setDrew] = useState(false);
  useEffect(() => {
    if (guide && opened.template && stepTag) setStepAt(Math.min(readStep(stepTag, opened.template.classLevel, opened.template.id), guide.length - 1));
  }, [guide, opened.template, stepTag]);
  const sfx = (k: Sfx) => engage && playSfx(k, soundOn);
  const say = (text: string) => engage && speak(text, lang, soundOn);
  useEffect(() => {
    if (!engage) return;
    say(guide ? guide[stepAt]?.text ?? '' : w['fam.draw.g.hello']);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engage, guide, stepAt]);
  useEffect(() => () => stopSpeaking(), []);
  const nextStep = () => {
    if (!guide || !canAdvance(stepAt, guide.length, drew)) return;
    const n = stepAt + 1;
    setStepAt(n);
    setDrew(false);
    sfx('step');
    if (stepTag && opened.template) writeStep(stepTag, opened.template.classLevel, opened.template.id, n);
  };
  const toggleSound = () => {
    const on = !soundOn;
    setSoundOn(on);
    writeSoundOn(on);
    if (!on) stopSpeaking();
    else playSfx('tap', true);
  };
  const [send, setSend] = useState<SendState>({ state: 'idle' });
  const [question, setQuestion] = useState(initialQuestion.slice(0, TUTOR_TEXT_MAX));
  const [, setVersion] = useState(0);
  const [current, setCurrent] = useState<{ id: string | null; name: string }>({ id: null, name: '' });
  const [route, setRoute] = useState<DownloadRoute>('none');
  const [limitHit, setLimitHit] = useState(false);
  const bump = () => setVersion((v) => v + 1);
  const setStickers = (next: StickerObject[]) => {
    stickersRef.current = next;
    setStickersState(next);
  };
  const setWheel = (v: Wheel) => {
    wheelRef.current = v;
    setWheelState(v);
  };
  const size = SKETCH_SIZES[sizeAt] * (doc?.scale ?? 1);
  const busy = send.state === 'sending';
  const ob = doc && outline ? outlineBox(doc.width, doc.height, outline.width, outline.height) : null;
  const obRef = useRef(ob);
  obRef.current = ob;
  const petals = themed.length > 0 ? themed : recent.length > 0 ? recent : SKETCH_PALETTE.slice(4, 10).map((p) => p.hex);

  // The template's outline as an image the canvas can draw (into a fill's edges and into the saved picture).
  useEffect(() => {
    if (!outlineUrl) {
      outlineImg.current = null;
      return;
    }
    const img = new Image();
    img.onload = () => {
      outlineImg.current = img;
    };
    img.src = outlineUrl;
  }, [outlineUrl]);

  // ---- the canvases ----------------------------------------------------------------------------------------------

  const ctxOf = (c: HTMLCanvasElement | null) => c?.getContext('2d') ?? null;

  // A fill's edges: the drawing with the outline over it, so the paint stops at the template's lines (never on them).
  const edges = useCallback((img: ImageData): Uint8ClampedArray | null => {
    const o = outlineImg.current;
    const b = obRef.current;
    if (!o || !b || typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const x = c.getContext('2d');
    if (!x) return null;
    x.putImageData(img, 0, 0);
    x.drawImage(o, b.x, b.y, b.w, b.h);
    return x.getImageData(0, 0, img.width, img.height).data;
  }, []);

  const redrawLayer = useCallback(() => {
    const ctx = ctxOf(layerC.current);
    if (!ctx || !doc) return;
    ctx.clearRect(0, 0, doc.width, doc.height);
    if (base.current) ctx.drawImage(base.current, 0, 0);
    for (const s of history.current.done) paintStep(ctx, s, doc.width, doc.height, edges);
  }, [doc, edges]);

  const drawTop = useCallback(() => {
    const ctx = ctxOf(topC.current);
    if (!ctx || !doc) return;
    ctx.clearRect(0, 0, doc.width, doc.height);
    const l = live.current;
    if (l?.kind === 'ink') paintLive(ctx, l.step.tool, l.step.colour, l.step.points);
    else if (l?.kind === 'shape') paintStep(ctx, l.step, doc.width, doc.height);
  }, [doc]);
  const scheduleTop = () => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      drawTop();
    });
  };
  // The top canvas carries the live tool's see-through and softness, so a frame is one plain fill.
  const styleTop = (t: FreehandTool | null) => {
    const c = topC.current;
    if (!c) return;
    c.style.opacity = t ? String(liveOpacity(t)) : '1';
    const soft = t ? BRUSH_LOOK[t].soft : 0;
    c.style.filter = t && soft > 0 && doc ? `blur(${Math.max(0.5, (size * soft) / doc.scale / 3)}px)` : '';
  };

  // The drawing's own size, once, from the paper's box when the studio opens.
  useLayoutEffect(() => {
    const el = area.current;
    if (!el || doc) return;
    setDoc(drawingSize(el.clientWidth, el.clientHeight, typeof window !== 'undefined' ? window.devicePixelRatio : 1));
  }, [doc]);

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
      if (hold.current?.timer) clearTimeout(hold.current.timer);
    };
  }, []);

  const sheetRef = useRef<Sheet>(null);
  sheetRef.current = sheet;
  const panelRef = useRef<StudioPanel>(null);
  panelRef.current = panel;
  const closeRef = useRef<() => void>(onClose);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (wheelRef.current) setWheel(null);
      else if (sheetRef.current) setSheet(null);
      else if (panelRef.current) setPanel(null);
      else closeRef.current();
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, []);

  // ---- the history -----------------------------------------------------------------------------------------------

  const commit = (step: Step) => {
    const { history: next, baked } = record(history.current, step, UNDO_STEPS, stepWeight);
    const bctx = ctxOf(base.current);
    if (bctx && doc) {
      for (const s of baked) {
        paintStep(bctx, s, doc.width, doc.height, edges);
        if (s.k === 'clear') baseInk.current = false;
        else if (inks(s)) baseInk.current = true;
      }
    }
    history.current = next;
    dirty.current = true;
    setNote(null);
    if (send.state !== 'sending') setSend({ state: 'idle' });
    // The day's count: a fresh drawing counts once, at its first colour on the paper (opening and closing costs nothing).
    if (daily && inks(step) && current.id === null && !counted.current) {
      counted.current = true;
      void bumpDayCount(dayKey(daily.child)).catch(() => undefined);
    }
    bump();
  };
  const blank = (): boolean => {
    let ink = baseInk.current;
    for (const s of history.current.done) {
      if (s.k === 'clear') ink = false;
      else if (inks(s)) ink = true;
    }
    return !ink && stickersRef.current.length === 0;
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
  // Clear empties the drawing and lets go of loose stickers; a template's outline is another layer and stays.
  const clearAll = () => {
    const ctx = ctxOf(layerC.current);
    if (ctx && doc) paintStep(ctx, { k: 'clear' }, doc.width, doc.height);
    setStickers([]);
    setSelected(null);
    commit({ k: 'clear' });
    setSheet(null);
  };

  // ---- the colour wheel ------------------------------------------------------------------------------------------

  const chooseColour = (hex: string) => {
    setColour(hex);
    setRecent((r) => pushRecent(r, hex));
    if (tool === 'eraser' || tool === 'sticker') setTool('pencil');
  };
  const clearHold = () => {
    if (hold.current?.timer) clearTimeout(hold.current.timer);
    hold.current = null;
  };
  const openWheel = (x: number, y: number) => {
    const view = { w: typeof window !== 'undefined' ? window.innerWidth : 360, h: typeof window !== 'undefined' ? window.innerHeight : 640 };
    setPanel(null);
    setWheel({ centre: wheelCentre({ x, y }, view), hover: { ring: 'centre' }, toneHue: nearestHue(colour) });
  };
  const wheelMove = (x: number, y: number) => {
    const wh = wheelRef.current;
    if (!wh) return;
    const hit = wheelHit(x - wh.centre.x, y - wh.centre.y, petals.length);
    setWheel({ ...wh, hover: hit, toneHue: hit.ring === 'hue' ? hit.index : wh.toneHue });
  };
  const wheelRelease = () => {
    const wh = wheelRef.current;
    if (!wh) return;
    const hex = wheelColour(wh.hover, petals, wh.toneHue);
    if (hex) chooseColour(hex);
    setWheel(null);
  };
  // A long press on the Colours block: the wheel opens around it, the same finger chooses.
  const colourHold = {
    onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      swallow.current = false;
      const r = e.currentTarget.getBoundingClientRect();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* a pointer the browser already let go */
      }
      clearHold();
      hold.current = { id: e.pointerId, x: e.clientX, y: e.clientY, timer: setTimeout(() => openWheel(r.left + r.width / 2, r.top + r.height / 2), LONG_PRESS_MS) };
    },
    onPointerMove: (e: ReactPointerEvent<HTMLButtonElement>) => {
      if (wheelRef.current) return wheelMove(e.clientX, e.clientY);
      const h = hold.current;
      if (h && Math.hypot(e.clientX - h.x, e.clientY - h.y) > LONG_PRESS_SLOP) clearHold();
    },
    onPointerUp: () => {
      clearHold();
      if (wheelRef.current) {
        swallow.current = true;
        wheelRelease();
      }
    },
    onPointerCancel: () => {
      clearHold();
      setWheel(null);
    },
    swallowClick: () => {
      const s = swallow.current;
      swallow.current = false;
      return s;
    },
  };

  // ---- pointer events on the paper ---------------------------------------------------------------------------------

  const toDoc = (clientX: number, clientY: number): Point => {
    const c = topC.current;
    if (!c || !doc) return { x: 0, y: 0 };
    const r = c.getBoundingClientRect();
    return { x: Math.min(doc.width, Math.max(0, ((clientX - r.left) / r.width) * doc.width)), y: Math.min(doc.height, Math.max(0, ((clientY - r.top) / r.height) * doc.height)) };
  };

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (busy || !doc || (e.pointerType === 'mouse' && e.button !== 0)) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* a pointer the browser already let go */
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setPanel(null);
    setSelected(null);
    if (!e.isPrimary) return;
    const p = toDoc(e.clientX, e.clientY);
    // A finger that stays still for LONG_PRESS_MS asks for the colour wheel; one that moves is drawing.
    clearHold();
    hold.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      timer: setTimeout(() => {
        const l = live.current;
        // The dot the press made is not kept (the eraser's is already on the paper and is kept as a step).
        if (l?.kind === 'erase') commit(l.step);
        live.current = null;
        styleTop(null);
        drawTop();
        openWheel(e.clientX, e.clientY);
      }, LONG_PRESS_MS),
    };
    if (placing) {
      live.current = { kind: 'label', at: p, word: placing };
      return;
    }
    if (isFreehand(tool)) {
      const builder = new StrokeBuilder(tool, size, doc.scale);
      builder.add(rawOf(e.nativeEvent, p));
      const step: InkStep = { k: 'ink', tool, colour, size, points: builder.points };
      if (tool === 'eraser') {
        live.current = { kind: 'erase', step, builder };
        const ctx = ctxOf(layerC.current);
        if (ctx) paintRibbon(ctx, 'eraser', colour, step.points, 1);
      } else {
        live.current = { kind: 'ink', step, builder };
        styleTop(tool);
      }
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
    if (wheelRef.current) return wheelMove(e.clientX, e.clientY);
    const h = hold.current;
    if (h && h.id === e.pointerId && Math.hypot(e.clientX - h.x, e.clientY - h.y) > LONG_PRESS_SLOP) clearHold();
    const l = live.current;
    if (!l || !e.isPrimary) return;
    // The finger's in-between points make the line smooth where the browser batches its events.
    const batch = typeof e.nativeEvent.getCoalescedEvents === 'function' ? e.nativeEvent.getCoalescedEvents() : [];
    const events = batch.length > 0 ? batch : [e.nativeEvent];
    if (l.kind === 'ink') {
      for (const ev of events) l.builder.add(rawOf(ev, toDoc(ev.clientX, ev.clientY)));
      scheduleTop();
    } else if (l.kind === 'erase') {
      const ctx = ctxOf(layerC.current);
      for (const ev of events) {
        const before = l.builder.points.length;
        if (l.builder.add(rawOf(ev, toDoc(ev.clientX, ev.clientY))) && ctx && before > 0) paintRibbon(ctx, 'eraser', colour, l.builder.points.slice(-2), 1);
      }
    } else if (l.kind === 'shape') {
      l.step.b = toDoc(e.clientX, e.clientY);
      scheduleTop();
    }
  };

  const up = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(e.pointerId);
    clearHold();
    if (wheelRef.current) {
      live.current = null;
      return wheelRelease();
    }
    const l = live.current;
    if (!l || !doc || !e.isPrimary) return;
    live.current = null;
    styleTop(null);
    const ctx = ctxOf(layerC.current);
    if (!ctx) return;
    if (engage && l.kind !== 'tap') {
      sfx('stroke');
      setDrew(true);
    }
    if (l.kind === 'ink') {
      l.builder.finish(rawOf(e.nativeEvent, toDoc(e.clientX, e.clientY)));
      paintStep(ctx, l.step, doc.width, doc.height);
      commit(l.step);
    } else if (l.kind === 'erase') {
      commit(l.step);
    } else if (l.kind === 'shape') {
      if (Math.hypot(l.step.b.x - l.step.a.x, l.step.b.y - l.step.a.y) >= 3 * doc.scale) {
        paintStep(ctx, l.step, doc.width, doc.height);
        commit(l.step);
      }
    } else if (l.kind === 'label') {
      const step: Step = { k: 'text', colour: lessonColors.ink, size: textSize(SKETCH_SIZES[2], doc.scale), text: l.word, at: l.at };
      paintStep(ctx, step, doc.width, doc.height);
      commit(step);
      setPlacing(null);
    } else if (l.kind === 'tap') {
      if (tool === 'fill') {
        const step: Step = { k: 'fill', colour, at: l.at };
        const whole = paintStep(ctx, step, doc.width, doc.height, edges);
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
    clearHold();
    setWheel(null);
    const l = live.current;
    live.current = null;
    styleTop(null);
    if (l?.kind === 'erase') commit(l.step);
    drawTop();
  };

  // ---- stickers: objects on their own layer until "Stick" ---------------------------------------------------------

  const pickSticker = (id: string) => {
    if (!doc) return;
    sfx('tap');
    say(w[`fam.sketch.sticker.${id}`] ?? '');
    setPanel(null);
    const key = newId();
    const px = Math.min(STICKER_START * doc.scale, Math.min(doc.width, doc.height) * 0.6);
    const n = stickersRef.current.length;
    setStickers([...stickersRef.current, { key, id, at: { x: doc.width / 2 + n * 12 * doc.scale, y: doc.height / 2 + n * 12 * doc.scale }, px, rot: 0 }]);
    setSelected(key);
    setNote({ text: w['fam.draw.stickerTip'], alert: false });
  };
  const changeSticker = (key: string | null, f: (s: StickerObject) => StickerObject) => {
    if (!key) return;
    setStickers(stickersRef.current.map((s) => (s.key === key ? f(s) : s)));
  };
  const stick = () => {
    const items = stickersRef.current;
    const ctx = ctxOf(layerC.current);
    if (!items.length || !ctx || !doc) return;
    const step: Step = { k: 'stickers', items: items.map((s) => ({ id: s.id, at: s.at, px: s.px, rot: s.rot })) };
    paintStep(ctx, step, doc.width, doc.height);
    setStickers([]);
    setSelected(null);
    commit(step);
  };
  const removeSticker = (key: string | null) => {
    if (!key) return;
    setStickers(stickersRef.current.filter((s) => s.key !== key));
    setSelected(null);
  };
  const grabStart = (key: string, mode: 'move' | 'twist') => (e: ReactPointerEvent<HTMLElement>) => {
    e.stopPropagation();
    const s = stickersRef.current.find((x) => x.key === key);
    if (!s || busy) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* a pointer the browser already let go */
    }
    setSelected(key);
    grab.current = { key, mode, start: toDoc(e.clientX, e.clientY), from: s };
  };
  const grabMove = (e: ReactPointerEvent<HTMLElement>) => {
    const g = grab.current;
    if (!g || !doc) return;
    const now = toDoc(e.clientX, e.clientY);
    if (g.mode === 'move') changeSticker(g.key, () => moveSticker(g.from, { x: now.x - g.start.x, y: now.y - g.start.y }, { w: doc.width, h: doc.height }));
    else changeSticker(g.key, (s) => twistSticker(s, g.start, now, { px: g.from.px, rot: g.from.rot }, doc.scale));
  };
  const grabEnd = () => {
    grab.current = null;
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
    const k = width / doc.width;
    for (const layer of exportLayers(!!(outlineImg.current && ob))) {
      if (layer === 'paper') ctx.drawImage(paperC.current, 0, 0, width, height);
      else if (layer === 'drawing') ctx.drawImage(layerC.current, 0, 0, width, height);
      else if (layer === 'outline' && outlineImg.current && ob) ctx.drawImage(outlineImg.current, ob.x * k, ob.y * k, ob.w * k, ob.h * k);
    }
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

  // One send at a time (C513): a double tap, or a tap while a retry waits, starts nothing (src/lib/family/draw-send.ts).
  const guard = useMemo(() => singleFlight((run: () => Promise<void>) => run()), []);
  const sendNow = () =>
    guard(async () => {
      if (!onSend) return;
      stick();
      if (blank()) return setSend({ state: 'failed', error: w['fam.sketch.blank'] });
      setSend({ state: 'sending' });
      const file = await pictureToSend();
      if (!file) return setSend({ state: 'failed', error: w['fam.tutor.err.file_too_large'] });
      let failed: string | null;
      try {
        failed = await onSend(file, template ? drawMarker(template.id) + question : question);
      } catch {
        failed = w['fam.err.network'];
      }
      if (failed) return setSend({ state: 'failed', error: failed });
      setSend({ state: 'sent' });
      sfx('success');
      onEvent?.({ t: 'sent', templateId: template?.id ?? null });
      setTimeout(() => closeRef.current(), 1800);
    });

  const [saveName, setSaveName] = useState('');
  const [full, setFull] = useState<SavedDrawing | null>(null);
  // Saves the drawing; `quiet` (closing the Draw tab's studio) says nothing on success. Resolves whether it was kept.
  const save = async (quiet = false): Promise<boolean> => {
    setFull(null);
    stick();
    const layer = layerC.current;
    if (!layer || !doc) return false;
    const list = await listDrawings();
    if (!list.ok) {
      setNote({ text: w['fam.sketch.noStore'], alert: true });
      return false;
    }
    const replacing = current.id !== null && list.value.some((d) => d.id === current.id);
    if (!canSave(list.value.length, replacing)) {
      setFull(oldestFirst(list.value)[0] ?? null);
      setNote({ text: fill(w['fam.sketch.full'], { max: list.value.length }), alert: true });
      return false;
    }
    const [layerBlob, thumb] = await Promise.all([canvasBlob(layer, 'image/png'), picture(240)]);
    if (!layerBlob || !thumb) {
      setNote({ text: w['fam.sketch.saveFailed'], alert: true });
      return false;
    }
    const id = replacing && current.id ? current.id : newId();
    const name = cleanName(saveName) || current.name || template?.title.slice(0, 40) || w['fam.sketch.untitled'];
    const put = await putDrawing({ id, name, updatedAt: Date.now(), paper, width: doc.width, height: doc.height, layer: layerBlob, thumb, templateId: template?.id ?? null, from: opened.from });
    if (!put.ok) {
      setNote({ text: put.reason === 'unavailable' ? w['fam.sketch.noStore'] : w['fam.sketch.saveFailed'], alert: true });
      return false;
    }
    setCurrent({ id, name });
    dirty.current = false;
    onEvent?.({ t: 'saved', drawingId: id, templateId: template?.id ?? null });
    if (!quiet) {
      setSheet(null);
      setNote({ text: w['fam.sketch.saved'], alert: false });
    }
    return true;
  };

  const close = async () => {
    if (keepOnClose && (dirty.current || stickersRef.current.length > 0) && !blank()) {
      const kept = await save(true);
      // Full or failed: the save sheet says why (and offers the oldest to delete) instead of losing the drawing.
      if (!kept) return setSheet('save');
    }
    onEvent?.({ t: 'closed' });
    onClose();
  };
  closeRef.current = () => void close();

  const download = async () => {
    stick();
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

  const openDrawing = async (d: SavedDrawing) => {
    const img = await imageOf(d.layer);
    if (!img) return setNote({ text: w['fam.sketch.saveFailed'], alert: true });
    const b = document.createElement('canvas');
    b.width = d.width;
    b.height = d.height;
    b.getContext('2d')?.drawImage(img, 0, 0);
    base.current = b;
    baseInk.current = true;
    history.current = emptyHistory();
    dirty.current = false;
    setPaper(d.paper);
    setCurrent({ id: d.id, name: d.name });
    setSaveName(d.name);
    setSheet(null);
    setStickers([]);
    setLimitHit(false);
    setDoc((now) => (now && now.width === d.width && now.height === d.height ? { ...now } : { width: d.width, height: d.height, scale: now?.scale ?? 1 }));
    bump();
  };
  // A new page: under the day's limit only (drawings already made still open).
  const fresh = async () => {
    if (daily) {
      const r = await readDayCount(dayKey(daily.child)).catch(() => null);
      if (!canStartNew(r && r.ok ? r.value : null, daily.limit)) {
        setSheet(null);
        return setLimitHit(true);
      }
    }
    const ctx = ctxOf(base.current);
    if (ctx && doc) ctx.clearRect(0, 0, doc.width, doc.height);
    baseInk.current = false;
    history.current = emptyHistory();
    counted.current = false;
    dirty.current = false;
    setCurrent({ id: null, name: '' });
    setSaveName('');
    setSheet(null);
    setStickers([]);
    redrawLayer();
    bump();
  };
  // The Draw tab's gallery: a drawing opens as soon as the paper has its size.
  const started = useRef(false);
  useEffect(() => {
    if (!doc || !startWith || started.current) return;
    started.current = true;
    void openDrawing(startWith);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, startWith]);

  // ---- the screen ------------------------------------------------------------------------------------------------

  const canUndo = history.current.done.length > 0 && !busy;
  const canRedo = history.current.undone.length > 0 && !busy;
  const chooseTool = (t: SketchTool) => {
    sfx('tap');
    say(w[`fam.sketch.tool.${t}`] ?? '');
    setTool(t);
    setPanel(null);
    setPlacing(null);
    setNote(t === 'text' ? { text: w['fam.sketch.textHint'], alert: false } : null);
  };
  const safe: CSSProperties = { paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)', paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)' };
  const sizes = isFreehand(tool) || isShape(tool) || tool === 'text';
  const chosen = stickers.find((s) => s.key === selected) ?? stickers[stickers.length - 1] ?? null;
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  const swatch = (hex: string, label: string, key: string) => (
    <button
      key={key}
      type="button"
      data-sketch-colour={key}
      aria-pressed={colour.toLowerCase() === hex.toLowerCase()}
      aria-label={label}
      title={label}
      onClick={() => {
        chooseColour(hex);
        setPanel(null);
      }}
      className={`${SWATCH} ${colour.toLowerCase() === hex.toLowerCase() ? 'ring-[3px] ring-ink' : 'ring-1 ring-ink/20'}`}
    >
      <span aria-hidden="true" className="h-9 w-9 rounded-full ring-1 ring-ink/10" style={{ backgroundColor: hex }} />
    </button>
  );

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={template?.title ?? w['fam.sketch.title']} data-sketch-pad data-draw-template={template?.id ?? undefined} style={safe} className="draw-table fixed inset-0 z-50 flex select-none flex-col">
      <div className="flex h-16 shrink-0 items-center gap-1 px-2">
        <button ref={closeBtn} type="button" data-sketch-close aria-label={w['fam.sketch.close']} title={w['fam.sketch.close']} onClick={() => void close()} className={BAR_BTN}>
          <svg aria-hidden="true" className="h-7 w-7" {...ICON} strokeWidth={2.5}>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <p className="hidden min-w-0 flex-1 truncate text-lg font-extrabold text-ink sm:block">{current.name || template?.title || w['fam.sketch.title']}</p>
        <span className="flex-1 sm:hidden" />
        <button type="button" data-sketch-undo aria-label={w['fam.sketch.undo']} title={w['fam.sketch.undo']} disabled={!canUndo} onClick={undo} className={BAR_BTN}>
          <svg aria-hidden="true" className="h-7 w-7" {...ICON}>
            <path d="M9 14L4 9l5-5M4 9h9a6 6 0 0 1 0 12h-3" />
          </svg>
        </button>
        <button type="button" data-sketch-redo aria-label={w['fam.sketch.redo']} title={w['fam.sketch.redo']} disabled={!canRedo} onClick={redo} className={BAR_BTN}>
          <svg aria-hidden="true" className="h-7 w-7" {...ICON}>
            <path d="M15 14l5-5-5-5M20 9h-9a6 6 0 0 0 0 12h3" />
          </svg>
        </button>
        <button type="button" data-sketch-save aria-label={w['fam.sketch.save']} title={w['fam.sketch.save']} disabled={busy} onClick={() => setSheet('save')} className={BAR_BTN}>
          <svg aria-hidden="true" className="h-7 w-7" {...ICON}>
            <path d="M5 3h11l3 3v15H5z" />
            <path d="M8 3v5h7V3M8 21v-7h8v7" />
          </svg>
        </button>
        {onSend && (
          <button type="button" data-sketch-send onClick={() => setSheet('send')} disabled={busy} className={`${PILL} fam-cta ml-1 whitespace-nowrap bg-saffron !px-3 text-sm text-ink shadow-md disabled:opacity-50`}>
            {w['fam.sketch.send']}
          </button>
        )}
      </div>

      {engage && (
        <div data-draw-guide className="draw-tray-in mx-2 mb-2 flex shrink-0 flex-col gap-2 rounded-2xl bg-art-butter px-3 py-2 text-ink">
          <div className="flex items-start gap-2">
          <button type="button" data-draw-guide-listen aria-label={w['fam.draw.g.listen']} title={w['fam.draw.g.listen']} onClick={() => speak(guide ? guide[stepAt]?.text ?? '' : w['fam.draw.g.hello'], lang, true)} className={`${TOOL_BTN} shrink-0 bg-white text-ink`}>
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 010 6M19 6a8 8 0 010 12" /></svg>
          </button>
          <div className="min-w-0 flex-1">
            {guide && template && <p className="truncate text-sm font-bold text-ink">{template.title}</p>}
            <p data-draw-guide-text aria-live="polite" className="text-lg font-extrabold leading-snug text-ink">{guide ? guide[stepAt]?.text : w['fam.draw.g.hello']}</p>
          </div>
          <button type="button" data-draw-sound aria-pressed={soundOn} aria-label={soundOn ? w['fam.draw.g.soundOff'] : w['fam.draw.g.soundOn']} title={soundOn ? w['fam.draw.g.soundOff'] : w['fam.draw.g.soundOn']} onClick={toggleSound} className={`${TOOL_BTN} shrink-0 bg-white text-ink`}>
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">{soundOn ? <path d="M9 18V6l10-2v12M9 18a3 3 0 11-3-3 3 3 0 013 3zM19 16a3 3 0 11-3-3 3 3 0 013 3z" /> : <path d="M9 18V6l10-2v12M9 18a3 3 0 11-3-3 3 3 0 013 3zM3 3l18 18" />}</svg>
          </button>
          </div>
          {guide && template && (
            <div className="flex items-center justify-between gap-2">
            {guide && (
              <div data-draw-guide-progress role="img" aria-label={fill(w['fam.draw.g.step'], { n: stepAt + 1, total: guide.length })} className="flex gap-1.5">
                {guide.map((_, i) => (
                  <span key={i} aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${i <= stepAt ? 'bg-art-coral' : 'bg-white ring-1 ring-ink/20'}`} />
                ))}
              </div>
            )}
          {guide && template && stepAt < guide.length - 1 && (
            <button type="button" data-draw-guide-next disabled={!drew} onClick={nextStep} className={`${PILL} fam-cta shrink-0 bg-ink text-white shadow-md disabled:opacity-40`}>
              {drew ? w['fam.draw.g.next'] : w['fam.draw.g.drawFirst']}
            </button>
          )}
          {guide && template && stepAt === guide.length - 1 && (
            <button
              type="button"
              data-draw-done
              onClick={() => {
                onEvent?.({ t: 'done', templateId: template.id });
                sfx('success');
                say(w['fam.draw.g.yay']);
                setNote({ text: w['fam.draw.doneSaid'], alert: false });
              }}
              className={`${PILL} fam-cta shrink-0 bg-ink text-white shadow-md`}
            >
              {w['fam.draw.done']}
            </button>
          )}
            </div>
          )}
        </div>
      )}
      {!engage && template && (
        <div data-draw-template-bar className="draw-tray-in mx-2 mb-2 flex shrink-0 items-center gap-3 rounded-2xl bg-art-mint px-3 py-2 text-ink">
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-extrabold text-ink">{template.title}</p>
            <p className="text-sm text-ink">{template.task}</p>
          </div>
          <button
            type="button"
            data-draw-done
            onClick={() => {
              onEvent?.({ t: 'done', templateId: template.id });
              setNote({ text: w['fam.draw.doneSaid'], alert: false });
            }}
            className={`${PILL} fam-cta shrink-0 bg-ink text-white shadow-md`}
          >
            {w['fam.draw.done']}
          </button>
        </div>
      )}
      {template && template.labels.length > 0 && (
        <div role="group" aria-label={w['fam.draw.labels']} data-draw-labels className="mx-2 mb-1 flex shrink-0 items-center gap-2 overflow-x-auto pb-1 pt-1.5 [scrollbar-width:none]">
          {template.labels.map((word) => (
            <button
              key={word}
              type="button"
              data-draw-label={word}
              aria-pressed={placing === word}
              onClick={() => {
                setPlacing(placing === word ? null : word);
                setNote(placing === word ? null : { text: fill(w['fam.draw.labelHint'], { word }), alert: false });
              }}
              className={`draw-tool fam-press shrink-0 px-4 text-base font-bold ${placing === word ? 'bg-art-butter text-ink' : 'bg-white text-ink'}`}
            >
              {word}
            </button>
          ))}
        </div>
      )}

      <div ref={area} data-sketch-area className="relative mx-3 flex min-h-0 flex-1 items-center justify-center">
        {/* C517: the template's background context, faint, behind the paper: never over the drawing, never touched. */}
        {template?.context && (
          <p data-draw-context aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 flex select-none items-start justify-center overflow-hidden p-2 text-center text-2xl font-extrabold leading-tight text-ink opacity-20">
            {template.context}
          </p>
        )}
        <div className="draw-sheet relative z-10 overflow-hidden rounded-[1.25rem] ring-1 ring-ink/10" style={box ? { width: box.w, height: box.h } : { width: '100%', height: '100%' }}>
          <canvas ref={paperC} aria-hidden="true" data-draw-paper className="absolute inset-0 h-full w-full" />
          <canvas ref={layerC} aria-hidden="true" data-sketch-canvas className="absolute inset-0 h-full w-full" />
          <canvas
            ref={topC}
            role="img"
            aria-label={template?.title ?? w['fam.sketch.title']}
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
          {doc &&
            stickers.map((s) => {
              const name = w[`fam.sketch.sticker.${s.id}`] ?? s.id;
              const on = chosen?.key === s.key;
              const art = stickerById(s.id);
              return (
                <div
                  key={s.key}
                  role="img"
                  aria-label={fill(w['fam.draw.sticker'], { name })}
                  data-draw-sticker={s.id}
                  data-draw-sticker-on={on || undefined}
                  onPointerDown={grabStart(s.key, 'move')}
                  onPointerMove={grabMove}
                  onPointerUp={grabEnd}
                  onPointerCancel={grabEnd}
                  className="draw-sticker draw-sticker-in absolute"
                  style={{ left: pct(s.at.x - s.px / 2, doc.width), top: pct(s.at.y - s.px / 2, doc.height), width: pct(s.px, doc.width), height: pct(s.px, doc.height), transform: `rotate(${s.rot}rad)`, touchAction: 'none' }}
                >
                  <svg aria-hidden="true" viewBox={`0 0 ${STICKER_BOX} ${STICKER_BOX}`} className="h-full w-full" strokeWidth={STICKER_LINE} strokeLinecap="round" strokeLinejoin="round">
                    {art?.parts.map((part, i) => (
                      <path key={i} d={part.d} fill={part.fill ?? 'none'} stroke="currentColor" className="text-ink" />
                    ))}
                  </svg>
                  {on && (
                    <>
                      <span aria-hidden="true" className="pointer-events-none absolute -inset-1 rounded-xl border-2 border-dashed border-ink/60" />
                      <span
                        role="button"
                        tabIndex={-1}
                        aria-label={w['fam.draw.handle']}
                        data-draw-sticker-handle
                        onPointerDown={grabStart(s.key, 'twist')}
                        onPointerMove={grabMove}
                        onPointerUp={grabEnd}
                        onPointerCancel={grabEnd}
                        className="absolute -bottom-6 -right-6 flex h-12 w-12 items-center justify-center rounded-full bg-art-butter text-ink shadow-md ring-2 ring-ink"
                      >
                        <ToolIcon name="rotate" className="h-6 w-6" />
                      </span>
                    </>
                  )}
                </div>
              );
            })}
          {outlineUrl && ob && doc && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={outlineUrl} alt="" aria-hidden="true" data-draw-outline draggable={false} className="pointer-events-none absolute" style={{ left: pct(ob.x, doc.width), top: pct(ob.y, doc.height), width: pct(ob.w, doc.width), height: pct(ob.h, doc.height) }} />
          )}
        </div>

        {panel && (
          <div data-studio-panel-open={panel} className="draw-tray-in draw-sheet absolute inset-x-0 bottom-2 z-10 mx-auto max-h-[24rem] w-full max-w-lg overflow-y-auto rounded-[1.5rem] bg-white p-3">
            {panel === 'colours' && (
              <div className="flex flex-col gap-2">
                {themed.length > 0 && (
                  <>
                    <p className="text-sm font-bold text-ink">{w['fam.draw.templateColours']}</p>
                    <div data-draw-themed className="flex flex-wrap gap-2">
                      {themed.map((hex, i) => swatch(hex, `${w['fam.draw.templateColours']} ${i + 1}`, `themed-${i}`))}
                    </div>
                  </>
                )}
                {recent.length > 0 && (
                  <>
                    <p className="text-sm font-bold text-ink">{w['fam.draw.recent']}</p>
                    <div className="flex flex-wrap gap-2">{recent.map((hex, i) => swatch(hex, `${w['fam.draw.recent']} ${i + 1}`, `recent-${i}`))}</div>
                  </>
                )}
                <p className="text-sm font-bold text-ink">{themed.length > 0 || recent.length > 0 ? w['fam.draw.allColours'] : w['fam.sketch.colours']}</p>
                <div className="grid grid-cols-6 gap-2">{SKETCH_PALETTE.map((c) => swatch(c.hex, w[`fam.sketch.colour.${c.id}`], c.id))}</div>
                <label className="flex min-h-[48px] items-center gap-3 text-sm font-bold text-ink">
                  <input type="color" data-sketch-custom value={isHexColour(colour) ? colour : '#000000'} onChange={(e) => chooseColour(e.target.value)} className="h-12 w-12 shrink-0 cursor-pointer rounded-full border-0 bg-transparent p-0" />
                  {w['fam.sketch.custom']}
                </label>
                <p className="text-sm text-ink">{w['fam.draw.wheelTip']}</p>
              </div>
            )}
            {panel === 'shapes' && (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-bold text-ink">{w['fam.sketch.shapes']}</p>
                <div className="flex flex-wrap gap-2">
                  {SHAPE_TOOLS.map((t) => (
                    <button key={t} type="button" data-studio-tool={t} aria-pressed={tool === t} aria-label={w[`fam.sketch.tool.${t}`]} title={w[`fam.sketch.tool.${t}`]} onClick={() => chooseTool(t)} className={`${TOOL_BTN} bg-art-butter text-ink`}>
                      <ToolIcon name={t} />
                    </button>
                  ))}
                </div>
              </div>
            )}
            {panel === 'stickers' && (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-bold text-ink">{w['fam.sketch.stickers']}</p>
                <div role="group" aria-label={w['fam.sketch.stickers']} data-sketch-sticker-groups className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
                  {STICKER_GROUPS.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      data-sketch-sticker-group={g.id}
                      aria-pressed={stickerGroup === g.id}
                      onClick={() => {
                        setStickerGroup(g.id);
                        sfx('tap');
                        say(w[`fam.sketch.group.${g.id}`] ?? '');
                      }}
                      className={`draw-tool fam-press shrink-0 whitespace-nowrap px-3 text-sm font-bold ${stickerGroup === g.id ? 'bg-art-butter text-ink' : 'bg-white text-ink ring-1 ring-ink/15'}`}
                    >
                      {w[`fam.sketch.group.${g.id}`]}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-5 gap-2 sm:grid-cols-8">
                  {(STICKER_GROUPS.find((g) => g.id === stickerGroup)?.stickers ?? []).map((id) => stickerById(id)!).filter(Boolean).map((s) => (
                    <button key={s.id} type="button" data-sketch-sticker={s.id} aria-label={w[`fam.sketch.sticker.${s.id}`]} title={w[`fam.sketch.sticker.${s.id}`]} onClick={() => pickSticker(s.id)} className="draw-tool fam-press h-14 w-full bg-art-lavender text-ink">
                      <svg aria-hidden="true" viewBox={`0 0 ${STICKER_BOX} ${STICKER_BOX}`} className="h-10 w-10" strokeWidth={STICKER_LINE} strokeLinecap="round" strokeLinejoin="round">
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
                    <button key={p} type="button" data-sketch-paper={p} aria-pressed={paper === p} onClick={() => (setPaper(p), setPanel(null))} className="draw-tool fam-press px-2 text-sm font-bold bg-art-table text-ink">
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
            <div role="dialog" aria-label={sheet === 'send' ? w['fam.sketch.send'] : sheet === 'save' ? w['fam.sketch.save'] : sheet === 'mine' ? w['fam.sketch.mine'] : w['fam.sketch.clear']} data-sketch-sheet={sheet} className="draw-tray-in flex max-h-full w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-[1.5rem] bg-white p-4 shadow-xl">
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
                    className="min-h-[48px] w-full resize-none rounded-xl bg-off-white px-3 py-2 text-base text-slate ring-1 ring-ink/15 placeholder:text-slate/80 focus:outline-none focus:ring-2 focus:ring-ink"
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
                      <button type="button" data-sketch-back onClick={() => closeRef.current()} className={`${PILL} flex-1 bg-ink text-white`}>
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
                  <input id="sketch-name" data-sketch-name value={saveName} maxLength={40} onChange={(e) => setSaveName(e.target.value)} className="min-h-[48px] w-full rounded-xl bg-off-white px-3 text-base text-slate ring-1 ring-ink/15 focus:outline-none focus:ring-2 focus:ring-ink" />
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
              {sheet === 'mine' && <MyDrawings w={w} onOpen={(d) => void openDrawing(d)} onFresh={() => void fresh()} />}
              {note && sheet !== 'send' && (
                <p role={note.alert ? 'alert' : 'status'} className="text-sm font-semibold text-slate">
                  {note.text}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex min-h-[56px] shrink-0 items-center gap-2 overflow-x-auto px-3 pt-2 [scrollbar-width:none]">
        {stickers.length > 0 ? (
          <>
            <button type="button" data-draw-turn-left aria-label={w['fam.draw.turnLeft']} title={w['fam.draw.turnLeft']} onClick={() => changeSticker(chosen?.key ?? null, (s) => turnSticker(s, -Math.PI / 12))} className={`${TOOL_BTN} bg-white text-ink`}>
              <ToolIcon name="rotate" className="h-6 w-6 -scale-x-100" />
            </button>
            <button type="button" data-draw-turn-right aria-label={w['fam.draw.turnRight']} title={w['fam.draw.turnRight']} onClick={() => changeSticker(chosen?.key ?? null, (s) => turnSticker(s, Math.PI / 12))} className={`${TOOL_BTN} bg-white text-ink`}>
              <ToolIcon name="rotate" className="h-6 w-6" />
            </button>
            <button type="button" data-sketch-smaller aria-label={w['fam.sketch.smaller']} title={w['fam.sketch.smaller']} onClick={() => changeSticker(chosen?.key ?? null, (s) => resizeSticker(s, 0.8, doc?.scale ?? 1))} className={`${TOOL_BTN} bg-white text-2xl font-bold text-ink`}>
              −
            </button>
            <button type="button" data-sketch-bigger aria-label={w['fam.sketch.bigger']} title={w['fam.sketch.bigger']} onClick={() => changeSticker(chosen?.key ?? null, (s) => resizeSticker(s, 1.25, doc?.scale ?? 1))} className={`${TOOL_BTN} bg-white text-2xl font-bold text-ink`}>
              +
            </button>
            <button type="button" data-draw-remove-sticker aria-label={w['fam.draw.removeSticker']} title={w['fam.draw.removeSticker']} onClick={() => removeSticker(chosen?.key ?? null)} className={`${TOOL_BTN} bg-white text-ink`}>
              <ToolIcon name="clear" className="h-6 w-6" />
            </button>
            <button type="button" data-draw-stick onClick={stick} className={`${PILL} fam-cta shrink-0 bg-saffron text-ink shadow-md`}>
              {w['fam.draw.stick']}
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
                  className={`${TOOL_BTN} bg-white`}
                >
                  <span aria-hidden="true" className="rounded-full" style={{ width: Math.min(30, 4 + s), height: Math.min(30, 4 + s), backgroundColor: tool === 'eraser' ? '#9CA3AF' : colour }} />
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
                className="min-h-[48px] min-w-[8rem] flex-1 rounded-xl bg-white px-3 text-base text-slate ring-1 ring-ink/15 placeholder:text-slate/80 focus:outline-none focus:ring-2 focus:ring-ink"
              />
            )}
          </>
        )}
      </div>
      {note && !sheet && (
        <p role={note.alert ? 'alert' : 'status'} data-sketch-note className="mx-3 mt-1 text-sm font-semibold text-ink">
          {note.text}
        </p>
      )}
      <StudioToolbar w={w} tool={tool} colour={colour} panel={panel} disabled={busy} onTool={chooseTool} onPanel={setPanel} onClear={() => setSheet('clear')} onMine={() => setSheet('mine')} colourHold={colourHold} />
      {wheel && <RadialPicker centre={wheel.centre} petals={petals} toneHue={wheel.toneHue} hover={wheel.hover} current={colour} />}
      {limitHit && <DrawLimit w={w} onOpenMine={() => (setLimitHit(false), setSheet('mine'))} onClose={() => setLimitHit(false)} />}
    </div>,
    document.body
  );
}

// A saved drawing's small picture (an object URL, let go when it leaves the screen).
export function Thumb({ blob, alt, className }: { blob: Blob; alt: string; className: string }) {
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
                <button type="button" aria-describedby={`sketch-saved-${d.id}`} onClick={() => void copy(d)} className="fam-press flex min-h-[48px] flex-1 items-center justify-center rounded-lg bg-white text-xs font-bold text-ink ring-1 ring-ink/15">
                  {w['fam.sketch.duplicate']}
                </button>
                <button
                  type="button"
                  aria-describedby={`sketch-saved-${d.id}`}
                  onClick={() => void remove(d)}
                  className={`fam-press flex min-h-[48px] flex-1 items-center justify-center rounded-lg text-xs font-bold ${sure === d.id ? 'bg-coral-deep text-white' : 'bg-white text-coral-deep ring-1 ring-ink/15'}`}
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
