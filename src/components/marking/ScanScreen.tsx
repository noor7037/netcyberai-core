'use client';

import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { BubbleScanScreen } from '@/components/bubbles/BubbleScanScreen';
import { InfoTip } from '@/components/app-ui/InfoTip';
import { numberWords } from '@/components/exams/exam-format';
import { PRIMARY, SECTION, TAP } from '@/components/exams/SchemeParts';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/visual/Icons';
import { SCAN_MAX_EDGE, SCAN_QUALITY, type MarkingOverview, type RosterChild } from '@/lib/contracts/marking';
import type { MessageKey } from '@/lib/i18n';
import { ScanOutbox, type OutboxCounts } from '@/lib/marking/outbox';
import { openScanOutbox } from '@/lib/marking/outbox-idb';
import type { Quad } from '@/lib/marking/scan-image';
import { SteadyWatch } from '@/lib/marking/scan-steady';
import { childStatus, firstChild, httpOutboxApi, nextChild, progressStrip, scanState, type ChildStatus } from '@/lib/marking/scan-flow';
import { ask, childLine, errorWords, scriptsHref } from './parts';
import { liveFrame, openCamera, takePhoto, type Camera, type CameraProblem } from './scan-camera';

// The phone's scan screen (C230-AJ): the teacher scans the class child by child, in roll order, and never waits.
//   - The exam's candidates are offered in roll order (C348). Take the child's pages, tap Next child: no typing.
//     Absent, Skip and another child are one tap each.
//   - The rear camera shows the page's edges as it finds them, and takes the page by hand or by itself once it is held
//     still. The worker (./scan.worker.ts, loaded only here) cuts the page out, straightens and evens it.
//   - Each page goes into the phone's outbox the moment it is taken (src/lib/marking/outbox.ts) and is sent in the
//     background: a child's pages wait until the teacher moves on (so a page can be taken again), then go a few at a
//     time, tried again after longer waits, waiting while offline, and carried on next time the app opens. A page is
//     removed from the phone once the school has it; signing out removes the rest.
//   - The strip at the bottom shows how the class is going (pages on this phone, uploaded, read, marked, needing a look)
//     and never stops the camera.
// Who may do what is the server's check and the database's: this screen only shows it.

const DETECT_MS = 220;
const SYNC_MS = 4000;
const OVERVIEW_MS = 5000;

const CAMERA_WORDS: Record<CameraProblem, MessageKey> = { no_camera: 'mk.scan.cam.no_camera', denied: 'mk.scan.cam.denied', busy: 'mk.scan.cam.busy' };
const STATUS_WORDS: Record<ChildStatus, MessageKey> = { done: 'mk.scan.status.done', absent: 'mk.scan.status.absent', scanning: 'mk.scan.status.scanning', skipped: 'mk.scan.status.skipped', todo: 'mk.scan.status.todo' };
const STATUS_TONE: Record<ChildStatus, 'success' | 'neutral' | 'warning'> = { done: 'success', absent: 'neutral', scanning: 'neutral', skipped: 'warning', todo: 'neutral' };
const AI_OFF: Record<'no_limit' | 'switched_off' | 'no_provider', MessageKey> = { no_limit: 'mk.ai.no_limit', no_provider: 'mk.ai.no_provider', switched_off: 'mk.ai.switched_off' };

type WorkerReply =
  | { type: 'detected'; id: number; quad: Quad | null; score: number }
  | { type: 'page'; id: number; jpeg?: Blob; gray?: ArrayBuffer; width: number; height: number }
  | { type: 'failed'; id: number };

// A grey page from the worker made a JPEG here, where the worker could not (no OffscreenCanvas).
async function encodeGray(gray: ArrayBuffer, width: number, height: number): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const g = new Uint8ClampedArray(gray);
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) (rgba[j] = rgba[j + 1] = rgba[j + 2] = g[i]), (rgba[j + 3] = 255);
  ctx.putImageData(new ImageData(rgba, width, height), 0, 0);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', SCAN_QUALITY));
  canvas.width = 0;
  canvas.height = 0;
  return blob;
}

// The scan screen's two modes: answer books child by child (C230-AJ), or bubble sheets one after another (C364), chosen
// by the address (`?sheets=bubble`, the bubble panel's link).
export function ScanScreen({ paperId, owner }: { paperId: string; owner: string }) {
  const bubble = useSearchParams()?.get('sheets') === 'bubble';
  return bubble ? <BubbleScanScreen paperId={paperId} /> : <BookScanScreen paperId={paperId} owner={owner} />;
}

function BookScanScreen({ paperId, owner }: { paperId: string; owner: string }) {
  const { t, lang } = useT();
  const [overview, setOverview] = useState<MarkingOverview | null>(null);
  const [failed, setFailed] = useState(false);
  const [counts, setCounts] = useState<OutboxCounts>({ waiting: 0, refused: 0, byChild: {} });
  const [onPhone, setOnPhone] = useState(true);
  const [online, setOnline] = useState(true);
  const [current, setCurrent] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [camState, setCamState] = useState<'starting' | 'on' | CameraProblem>('starting');
  const [torch, setTorch] = useState<{ has: boolean; on: boolean }>({ has: false, on: false });
  const [auto, setAuto] = useState(true);
  const [quad, setQuad] = useState<Quad | null>(null);
  const [hold, setHold] = useState(0);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<{ id: string; url: string; childId: string } | null>(null);
  const [picking, setPicking] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [finished, setFinished] = useState(false);

  const video = useRef<HTMLVideoElement | null>(null);
  const small = useRef<HTMLCanvasElement | null>(null);
  const camera = useRef<Camera | null>(null);
  const worker = useRef<Worker | null>(null);
  const outbox = useRef<ScanOutbox | null>(null);
  const watch = useRef(new SteadyWatch());
  const pending = useRef(new Map<number, (r: WorkerReply) => void>());
  const seq = useRef(0);
  const busyRef = useRef(false);
  const autoRef = useRef(true);
  const currentRef = useRef<string | null>(null);
  const quadRef = useRef<Quad | null>(null);
  const captureRef = useRef<() => Promise<void>>(async () => undefined);

  // ---- the server's view of the paper ---------------------------------------------------------------------------------
  const loadOverview = useCallback(async () => {
    const r = await ask('GET', `/api/app/marking/papers/${paperId}`);
    if (r.ok) {
      setOverview(r.body as unknown as MarkingOverview);
      setFailed(false);
    } else setFailed((was) => was || r.status !== 0);
  }, [paperId]);
  useEffect(() => {
    void loadOverview();
    const id = window.setInterval(() => {
      if (!document.hidden) void loadOverview();
    }, OVERVIEW_MS);
    return () => window.clearInterval(id);
  }, [loadOverview]);

  // ---- the outbox ---------------------------------------------------------------------------------------------------------
  const refreshCounts = useCallback(async () => {
    if (outbox.current) setCounts(await outbox.current.counts(paperId));
  }, [paperId]);
  const syncNow = useCallback(async () => {
    if (!outbox.current) return;
    await outbox.current.sync();
    await refreshCounts();
  }, [refreshCounts]);
  useEffect(() => {
    let gone = false;
    let close = () => undefined as void;
    void (async () => {
      const opened = await openScanOutbox(owner);
      if (gone) return opened.close();
      close = opened.close;
      setOnPhone(opened.onPhone);
      const box = new ScanOutbox(opened.store, owner, httpOutboxApi(), { online: () => navigator.onLine });
      // Another person's pages left on this phone (their session ended without signing out) are removed, unseen.
      await box.forgetOthers();
      outbox.current = box;
      await refreshCounts();
      void syncNow();
    })();
    const tick = window.setInterval(() => void syncNow(), SYNC_MS);
    const net = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) void syncNow();
    };
    net();
    window.addEventListener('online', net);
    window.addEventListener('offline', net);
    return () => {
      gone = true;
      window.clearInterval(tick);
      window.removeEventListener('online', net);
      window.removeEventListener('offline', net);
      outbox.current = null;
      close();
    };
  }, [owner, refreshCounts, syncNow]);
  // Background Sync, where the browser offers it: the service worker sends what waits even after this screen is closed.
  const askBackgroundSync = () => {
    if (!('serviceWorker' in navigator)) return;
    void navigator.serviceWorker.ready
      .then((r) => (r as ServiceWorkerRegistration & { sync?: { register: (tag: string) => Promise<void> } }).sync?.register('nca-scan-outbox'))
      .catch(() => undefined);
  };

  // ---- the worker -----------------------------------------------------------------------------------------------------------
  useEffect(() => {
    const w = new Worker(new URL('./scan.worker.ts', import.meta.url));
    w.onmessage = (e: MessageEvent<WorkerReply>) => {
      const done = pending.current.get(e.data.id);
      pending.current.delete(e.data.id);
      done?.(e.data);
    };
    // A worker that could not start, or failed: nothing waits on it.
    w.onerror = () => {
      for (const [id, done] of pending.current) done({ type: 'failed', id });
      pending.current.clear();
    };
    worker.current = w;
    return () => {
      w.terminate();
      worker.current = null;
      pending.current.clear();
    };
  }, []);
  // An answer from the worker, or 'failed' after `ms` (a phone that is very slow, or a worker that never answers).
  const toWorker = (msg: Record<string, unknown>, transfer: Transferable[] = [], ms = 20_000) =>
    new Promise<WorkerReply>((resolve) => {
      const id = ++seq.current;
      if (!worker.current) return resolve({ type: 'failed', id });
      const timer = window.setTimeout(() => {
        pending.current.delete(id);
        resolve({ type: 'failed', id });
      }, ms);
      pending.current.set(id, (r) => {
        window.clearTimeout(timer);
        resolve(r);
      });
      worker.current.postMessage({ ...msg, id }, transfer);
    });

  // ---- the camera -----------------------------------------------------------------------------------------------------------
  // The live view shows the camera's stream once both are there (the camera may open before the screen has drawn it).
  const showOn = (el: HTMLVideoElement | null) => {
    if (!el || !camera.current || el.srcObject === camera.current.stream) return;
    el.srcObject = camera.current.stream;
    void el.play().catch(() => undefined);
  };
  const videoRef = useCallback((el: HTMLVideoElement | null) => {
    video.current = el;
    showOn(el);
  }, []);
  useEffect(() => {
    let gone = false;
    void (async () => {
      const r = await openCamera();
      if (gone) return r.ok ? r.camera.stop() : undefined;
      if (!r.ok) return setCamState(r.problem);
      camera.current = r.camera;
      setTorch({ has: r.camera.torch, on: false });
      showOn(video.current);
      setCamState('on');
    })();
    return () => {
      gone = true;
      camera.current?.stop();
      camera.current = null;
    };
  }, []);

  // The page's edges, live, and taking it once held still.
  useEffect(() => {
    if (camState !== 'on') return;
    let stop = false;
    let timer = 0;
    const loop = async () => {
      if (stop) return;
      if (!document.hidden && !busyRef.current && video.current && worker.current) {
        small.current ??= document.createElement('canvas');
        const frame = liveFrame(video.current, small.current);
        if (frame) {
          const r = await toWorker({ type: 'detect', width: frame.width, height: frame.height, rgba: frame.rgba }, [frame.rgba], 3000);
          if (r.type === 'detected' && !stop) {
            quadRef.current = r.quad;
            setQuad(r.quad);
            const now = performance.now();
            const take = watch.current.see(r.quad, now);
            setHold(autoRef.current ? watch.current.progress(now) : 0);
            if (take && autoRef.current && currentRef.current) void captureRef.current();
          }
        }
      }
      timer = window.setTimeout(() => void loop(), DETECT_MS);
    };
    void loop();
    return () => {
      stop = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camState]);

  // ---- who is being scanned ------------------------------------------------------------------------------------------------
  const roster: RosterChild[] = useMemo(() => overview?.candidates ?? [], [overview]);
  const state = useMemo(() => (overview ? scanState(overview, counts.byChild, skipped) : null), [overview, counts.byChild, skipped]);
  useEffect(() => {
    if (!state || current || finished) return;
    const first = firstChild(roster, state);
    setCurrent(first?.studentId ?? null);
  }, [state, roster, current, finished]);
  useEffect(() => {
    currentRef.current = current;
  }, [current]);
  useEffect(() => {
    autoRef.current = auto;
  }, [auto]);
  const child = roster.find((c) => c.studentId === current) ?? null;
  const status = child && state ? childStatus(child.studentId, state) : null;
  const pagesHere = child ? counts.byChild[child.studentId] ?? 0 : 0;
  const mayChange = !!overview && overview.paper.mayMark && !overview.paper.published && overview.ai.on && overview.ready;

  // ---- taking a page ----------------------------------------------------------------------------------------------------------
  const capture = useCallback(async () => {
    const childId = currentRef.current;
    if (busyRef.current || !camera.current || !video.current || !childId || !outbox.current || !mayChange) return;
    busyRef.current = true;
    setBusy(true);
    setNote(null);
    try {
      let bitmap = await takePhoto(camera.current, video.current);
      // A still the other way round from the live view (some phones): the live view's own frame instead.
      if (bitmap.width > bitmap.height !== video.current.videoWidth > video.current.videoHeight) {
        bitmap.close();
        bitmap = await createImageBitmap(video.current);
      }
      watch.current.taken(quadRef.current);
      const r = await toWorker({ type: 'process', bitmap, width: bitmap.width, height: bitmap.height, hint: quadRef.current, maxEdge: SCAN_MAX_EDGE, quality: SCAN_QUALITY }, [bitmap]);
      const jpeg = r.type === 'page' ? r.jpeg ?? (r.gray ? await encodeGray(r.gray, r.width, r.height) : null) : null;
      if (!jpeg) {
        setNote({ ok: false, text: t('mk.scan.notTaken') });
        return;
      }
      const page = await outbox.current.capture(paperId, childId, await jpeg.arrayBuffer());
      setLast((was) => {
        if (was) URL.revokeObjectURL(was.url);
        return { id: page.id, url: URL.createObjectURL(jpeg), childId };
      });
      await refreshCounts();
      const name = roster.find((c) => c.studentId === childId)?.name ?? '';
      setNote({ ok: true, text: t('mk.scan.taken', { n: numberWords(page.seq, lang), name }) });
      askBackgroundSync();
    } catch {
      setNote({ ok: false, text: t('mk.scan.notTaken') });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paperId, mayChange, roster, lang, refreshCounts]);
  useEffect(() => {
    captureRef.current = capture;
  }, [capture]);
  // The last page's thumbnail is let go when the screen closes.
  const lastUrl = useRef<string | null>(null);
  useEffect(() => {
    lastUrl.current = last?.url ?? null;
  }, [last]);
  useEffect(() => () => {
    if (lastUrl.current) URL.revokeObjectURL(lastUrl.current);
  }, []);

  const retake = async () => {
    if (!last || !outbox.current) return;
    await outbox.current.removePage(last.id);
    URL.revokeObjectURL(last.url);
    setLast(null);
    await refreshCounts();
    setNote({ ok: true, text: t('mk.scan.retaken') });
  };

  // ---- moving on --------------------------------------------------------------------------------------------------------------
  const moveTo = async (next: RosterChild | null, opts: { skip?: boolean } = {}) => {
    const box = outbox.current;
    const from = currentRef.current;
    if (box && from) await box.moveOn(paperId, from);
    if (opts.skip && from) setSkipped((s) => new Set([...s, from]));
    setPicking(false);
    if (last) URL.revokeObjectURL(last.url);
    setLast(null);
    watch.current.see(null, performance.now());
    if (!next) {
      // The end of the roll: everything goes, and every upload closes once its pages are in.
      if (box) await box.finish(paperId);
      setFinished(true);
      setCurrent(null);
    } else setCurrent(next.studentId);
    await refreshCounts();
    void syncNow();
  };
  const goNext = () => (state && child ? moveTo(nextChild(roster, child.studentId, state)) : undefined);
  const skip = () => {
    if (!state || !child) return;
    const after = nextChild(roster, child.studentId, { ...state, skipped: new Set([...state.skipped, child.studentId]) });
    return moveTo(after, { skip: true });
  };
  const markAbsent = async () => {
    if (!child) return;
    setBusy(true);
    const r = await ask('POST', `/api/app/marking/papers/${paperId}/absent`, { studentIds: [child.studentId] });
    setBusy(false);
    if (!r.ok) return setNote({ ok: false, text: errorWords(t, r) });
    setNote({ ok: true, text: t('mk.scan.absentDone', { name: child.name }) });
    const after = state ? nextChild(roster, child.studentId, { ...state, absent: new Set([...state.absent, child.studentId]) }) : null;
    await loadOverview();
    await moveTo(after);
  };
  const finishNow = () => moveTo(null);
  const removeRefused = async () => {
    if (!outbox.current) return;
    for (const p of await outbox.current.pages(paperId)) if (p.refused) await outbox.current.removePage(p.id);
    await refreshCounts();
  };

  // ---- the screen ---------------------------------------------------------------------------------------------------------------
  if (failed) return <p role="alert" className="rounded-md bg-off-white px-3 py-2 text-sm text-slate">{t('mk.hub.failed')}</p>;
  if (!overview || !state) return null;
  const strip = progressStrip(overview, counts.waiting + counts.refused);
  const whyNot: MessageKey | null = overview.paper.published ? 'mk.q.published' : !overview.paper.mayMark ? 'mk.q.readOnly' : !overview.ai.on && overview.ai.why ? AI_OFF[overview.ai.why] : !overview.ready ? 'mk.up.needQuestions' : null;
  const tile = 'flex min-w-[5.5rem] flex-1 flex-col rounded-lg border-l-4 bg-off-white px-3 py-2';

  return (
    <div lang={lang} data-scan-screen={paperId} className="flex flex-col gap-4 text-sm text-slate">
      {whyNot && <p data-scan-off role="status" className="rounded-md bg-off-white px-3 py-2 font-semibold">{t(whyNot)}</p>}
      {!online && <p data-scan-offline role="status" className="rounded-md border border-amber/40 bg-amber/10 px-3 py-2 font-semibold text-amber-text">{t('mk.scan.offline')}</p>}
      {!onPhone && <p data-scan-memory role="status" className="rounded-md border border-amber/40 bg-amber/10 px-3 py-2 font-semibold text-amber-text">{t('mk.scan.memory')}</p>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className={SECTION} aria-labelledby="scan-camera-title">
          <h2 id="scan-camera-title" className="sr-only">{t('mk.scan.camera')}</h2>
          <div className="relative mx-auto aspect-[3/4] w-full max-w-md overflow-hidden rounded-lg bg-midnight lg:max-w-lg">
            <video ref={videoRef} data-scan-video playsInline muted autoPlay className="h-full w-full object-cover" aria-hidden="true" />
            {quad && camState === 'on' && (
              <svg data-scan-edges viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
                <polygon points={quad.map((p) => `${(p.x * 100).toFixed(2)},${(p.y * 100).toFixed(2)}`).join(' ')} className="fill-emerald/15 stroke-emerald" strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
              </svg>
            )}
            {camState !== 'on' && (
              <div className="absolute inset-0 flex items-center justify-center p-4 text-center">
                <p data-scan-camera={camState} className="rounded-md bg-white px-3 py-2 font-semibold text-slate">{camState === 'starting' ? t('mk.scan.cam.starting') : t(CAMERA_WORDS[camState])}</p>
              </div>
            )}
          </div>
          {auto && hold > 0 && (
            <div role="progressbar" aria-label={t('mk.scan.holding')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(hold * 100)} className="mx-auto h-2 w-full max-w-md overflow-hidden rounded-full bg-slate/10">
              <div className="h-full bg-emerald" style={{ width: `${Math.round(hold * 100)}%` }} />
            </div>
          )}
          <p data-scan-found className="text-center text-slate/80" aria-live="polite">
            {camState === 'on' ? (busy ? t('mk.scan.taking') : quad ? t('mk.scan.found') : t('mk.scan.looking')) : ''}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              data-scan-take
              className="relative inline-flex h-16 w-16 items-center justify-center rounded-full border-4 border-sapphire bg-white text-sapphire disabled:opacity-60"
              disabled={busy || camState !== 'on' || !child || !mayChange || finished}
              onClick={() => void capture()}
              aria-label={t('mk.scan.take')}
            >
              <span aria-hidden="true" className="h-10 w-10 rounded-full bg-sapphire" />
            </button>
            <label className={`${TAP} cursor-pointer`}>
              <input type="checkbox" data-scan-auto className="h-5 w-5 accent-sapphire" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
              {t('mk.scan.auto')}
            </label>
            {torch.has && (
              <button
                type="button"
                data-scan-torch
                className={TAP}
                aria-pressed={torch.on}
                onClick={async () => {
                  const ok = await camera.current?.setTorch(!torch.on);
                  if (ok) setTorch({ has: true, on: !torch.on });
                }}
              >
                {t('mk.scan.torch')}
              </button>
            )}
          </div>
          {camState !== 'on' && camState !== 'starting' && (
            <a href={scriptsHref(paperId)} className={`${TAP} self-center`}>{t('mk.scan.instead')}</a>
          )}
        </section>

        <div className="flex flex-col gap-4">
          <section data-scan-child className={SECTION} aria-labelledby="scan-child-title">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h2 id="scan-child-title" className="text-base font-bold">{t('mk.scan.now')}</h2>
              <InfoTip>{t('mk.scan.nowHow')}</InfoTip>
            </div>
            {finished || !child ? (
              <div data-scan-all-done className="flex flex-col gap-2">
                <p className="flex items-start gap-2 font-semibold"><Icon name="check" className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />{roster.length ? t('mk.scan.allDone') : t('mk.scan.noCandidates')}</p>
                <a href={scriptsHref(paperId)} className={`${PRIMARY} self-start`}>{t('mk.scan.back')}</a>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p data-scan-current={child.studentId} className="min-w-0 break-words text-xl font-bold">{childLine(child)}</p>
                  {status && <Badge variant={STATUS_TONE[status]}>{t(STATUS_WORDS[status], { n: numberWords(pagesHere, lang) })}</Badge>}
                </div>
                {state.withScript.has(child.studentId) && <p data-scan-has-script className="text-amber-text">{t('mk.scan.hasScript', { name: child.name })}</p>}
                <div className="flex flex-wrap gap-2">
                  <button type="button" data-scan-absent className={TAP} disabled={busy || pagesHere > 0 || state.withScript.has(child.studentId) || !mayChange} onClick={() => void markAbsent()}>
                    {t('mk.scan.absent')}
                  </button>
                  <button type="button" data-scan-skip className={TAP} disabled={busy} onClick={() => void skip()}>
                    {t('mk.scan.skip')}
                  </button>
                  <button type="button" data-scan-pick className={TAP} aria-expanded={picking} onClick={() => setPicking(!picking)}>
                    {t('mk.scan.pick')}
                  </button>
                </div>
                {picking && (
                  <ul data-scan-picker aria-label={t('mk.scan.pickTitle')} className="flex max-h-72 flex-col gap-1 overflow-y-auto rounded-md bg-off-white p-2">
                    {roster.map((c) => {
                      const s = childStatus(c.studentId, state);
                      return (
                        <li key={c.studentId}>
                          <button
                            type="button"
                            data-scan-choose={c.studentId}
                            className="flex min-h-[44px] w-full flex-wrap items-center justify-between gap-2 rounded-md bg-white px-3 py-1 text-left font-semibold disabled:opacity-60"
                            aria-current={c.studentId === child.studentId ? 'true' : undefined}
                            disabled={s === 'absent'}
                            onClick={() => void moveTo(c)}
                          >
                            <span className="min-w-0 break-words">{childLine(c)}</span>
                            <Badge variant={STATUS_TONE[s]}>{t(STATUS_WORDS[s], { n: numberWords(counts.byChild[c.studentId] ?? 0, lang) })}</Badge>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <div className="flex flex-wrap items-center gap-3 border-t border-slate/10 pt-3">
                  {last && last.childId === child.studentId && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={last.url} alt={t('mk.scan.lastAlt', { name: child.name })} className="h-20 w-auto rounded border border-slate/20" />
                  )}
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <p data-scan-pages>{t('mk.scan.pages', { name: child.name, n: numberWords(pagesHere, lang) })}</p>
                    {last && last.childId === child.studentId && (
                      <button type="button" data-scan-retake className={`${TAP} self-start`} disabled={busy} onClick={() => void retake()}>
                        {t('mk.scan.retake')}
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" data-scan-next className={PRIMARY} disabled={busy} onClick={() => void goNext()}>
                    {t('mk.scan.next')}
                    <Icon name="chevronRight" className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button type="button" data-scan-finish className={TAP} disabled={busy} onClick={() => void finishNow()}>
                    {t('mk.scan.finish')}
                  </button>
                </div>
              </>
            )}
            {note && (
              <p role="status" data-scan-note={note.ok ? 'ok' : 'error'} className={`rounded-md px-3 py-2 font-semibold ${note.ok ? 'bg-off-white text-slate' : 'border border-red-800/30 text-red-800'}`}>
                {note.text}
              </p>
            )}
          </section>

          <section data-scan-strip className={SECTION} aria-labelledby="scan-strip-title" aria-live="polite">
            <h2 id="scan-strip-title" className="text-base font-bold">{t('mk.scan.strip')}</h2>
            <ul className="flex flex-wrap gap-2">
              <li className={`${tile} border-royal`} data-strip="on-phone"><span className="text-xl font-bold">{numberWords(strip.onPhone, lang)}</span><span>{t('mk.scan.strip.onPhone')}</span></li>
              <li className={`${tile} border-sapphire`} data-strip="uploaded"><span className="text-xl font-bold">{numberWords(strip.uploaded, lang)}</span><span>{t('mk.scan.strip.uploaded')}</span></li>
              <li className={`${tile} border-emerald`} data-strip="read"><span className="text-xl font-bold">{numberWords(strip.read, lang)}</span><span>{t('mk.scan.strip.read')}</span></li>
              <li className={`${tile} border-emerald`} data-strip="marked"><span className="text-xl font-bold">{numberWords(strip.marked, lang)}</span><span>{t('mk.scan.strip.marked')}</span></li>
              <li className={`${tile} border-amber`} data-strip="needs"><span className="text-xl font-bold">{numberWords(strip.needsLook, lang)}</span><span>{t('mk.scan.strip.needs')}</span></li>
            </ul>
            {counts.refused > 0 && (
              <div data-scan-refused className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-red-800">{t('mk.scan.refused', { n: numberWords(counts.refused, lang) })}</p>
                <button type="button" className={TAP} onClick={() => void removeRefused()}>{t('mk.scan.removeRefused')}</button>
              </div>
            )}
            <p className="flex items-start gap-2 text-slate/80"><Icon name="lock" className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{t('mk.scan.privacy')}</p>
            <a href={scriptsHref(paperId)} className={`${TAP} self-start`}>{t('mk.scan.back')}</a>
          </section>
        </div>
      </div>
    </div>
  );
}
