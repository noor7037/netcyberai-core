'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { InfoTip } from '@/components/app-ui/InfoTip';
import { numberWords } from '@/components/exams/exam-format';
import { PRIMARY, SECTION, TAP } from '@/components/exams/SchemeParts';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/visual/Icons';
import { sheetLayout } from '@/lib/bubbles/layout';
import type { BubbleScreen } from '@/lib/contracts/marking';
import { isMessageKey, type MessageKey } from '@/lib/i18n';
import type { Quad } from '@/lib/marking/scan-image';
import { SteadyWatch } from '@/lib/marking/scan-steady';
import { BubbleSender, httpBubbleApi, type BubbleItem } from '@/lib/marking/scan-flow';
import { ask, childLine, scriptsHref } from '../marking/parts';
import { liveFrame, openCamera, takePhoto, type Camera, type CameraProblem } from '../marking/scan-camera';
import { BubbleWorker } from './bubble-worker';

// The scan screen's bubble-sheet mode (C364): the teacher holds the phone over one printed sheet after another. Each is
// taken (by hand, or by itself once held still), read on the phone by rules in the scan worker, and sent at once with
// what was read; its own printed number names the child, so nothing is chosen and nothing waits on the phone. A sheet
// lives only in this screen's memory until the school confirms it (src/lib/marking/scan-flow.ts, BubbleSender), and
// nothing of it is written to the phone's storage. Who may do what is the server's check and the database's.

const DETECT_MS = 250;
const SYNC_MS = 3000;
const CAMERA_WORDS: Record<CameraProblem, MessageKey> = { no_camera: 'mk.scan.cam.no_camera', denied: 'mk.scan.cam.denied', busy: 'mk.scan.cam.busy' };
const WHY_KEYS: Record<string, MessageKey> = {
  no_corners: 'bub.scan.why.no_corners',
  no_orientation: 'bub.scan.why.no_orientation',
  misaligned: 'bub.scan.why.misaligned',
  failed: 'bub.scan.why.failed',
};
const OUTCOME_KEYS = { script: 'bub.outcome.script', filled: 'bub.outcome.filled', kept: 'bub.outcome.kept', waiting: 'bub.outcome.waiting', duplicate: 'bub.outcome.duplicate' } as const;
const pad4 = (n: number) => String(n).padStart(4, '0');

export function BubbleScanScreen({ paperId }: { paperId: string }) {
  const { t, lang } = useT();
  const [screen, setScreen] = useState<BubbleScreen | null>(null);
  const [failed, setFailed] = useState(false);
  const [camState, setCamState] = useState<'starting' | 'on' | CameraProblem>('starting');
  const [quad, setQuad] = useState<Quad | null>(null);
  const [hold, setHold] = useState(0);
  const [auto, setAuto] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [items, setItems] = useState<BubbleItem[]>([]);
  const [finished, setFinished] = useState<'no' | 'finishing' | 'yes'>('no');

  const video = useRef<HTMLVideoElement | null>(null);
  const small = useRef<HTMLCanvasElement | null>(null);
  const camera = useRef<Camera | null>(null);
  const worker = useRef<BubbleWorker | null>(null);
  const sender = useRef<BubbleSender | null>(null);
  const watch = useRef(new SteadyWatch());
  const busyRef = useRef(false);
  const autoRef = useRef(true);
  const quadRef = useRef<Quad | null>(null);
  const captureRef = useRef<() => Promise<void>>(async () => undefined);

  const load = useCallback(async () => {
    const r = await ask('GET', `/api/app/marking/papers/${paperId}/bubbles`);
    if (r.ok) setScreen(r.body as unknown as BubbleScreen);
    else setFailed(true);
  }, [paperId]);
  useEffect(() => {
    void load();
  }, [load]);
  const layout = useMemo(() => (screen && !screen.problem ? sheetLayout(screen.questions) : null), [screen]);
  const ready = !!screen && screen.sitting === 'bubble' && screen.mayChange && !!layout;

  // The worker, and the sender with its own clock: what waits is tried again every few seconds while the screen is open.
  useEffect(() => {
    worker.current = new BubbleWorker();
    sender.current = new BubbleSender(httpBubbleApi(), paperId);
    const tick = window.setInterval(() => {
      void sender.current?.sync().then(() => setItems([...(sender.current?.items ?? [])]));
    }, SYNC_MS);
    return () => {
      window.clearInterval(tick);
      worker.current?.terminate();
      worker.current = null;
      // Whatever was not sent is let go with the screen (the teacher was asked to keep it open).
      sender.current = null;
    };
  }, [paperId]);
  const waiting = items.filter((i) => !i.result && !i.refused).length;
  useEffect(() => {
    if (!waiting) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [waiting]);

  // ---- the camera ----------------------------------------------------------------------------------------------------------
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
    if (!ready) return;
    let gone = false;
    void (async () => {
      const r = await openCamera();
      if (gone) return r.ok ? r.camera.stop() : undefined;
      if (!r.ok) return setCamState(r.problem);
      camera.current = r.camera;
      showOn(video.current);
      setCamState('on');
    })();
    return () => {
      gone = true;
      camera.current?.stop();
      camera.current = null;
    };
  }, [ready]);
  useEffect(() => {
    autoRef.current = auto;
  }, [auto]);
  // The sheet's edges, live, and taking it once held still.
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
          const r = await worker.current.detect(frame);
          if (r && !stop) {
            const q = r.quad as Quad | null;
            quadRef.current = q;
            setQuad(q);
            const now = performance.now();
            const take = watch.current.see(q, now);
            setHold(autoRef.current ? watch.current.progress(now) : 0);
            if (take && autoRef.current) void captureRef.current();
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
  }, [camState]);

  // ---- taking and reading a sheet ------------------------------------------------------------------------------------------
  const capture = useCallback(async () => {
    if (busyRef.current || !camera.current || !video.current || !worker.current || !sender.current || !layout || finished !== 'no') return;
    busyRef.current = true;
    setBusy(true);
    setNote({ ok: true, text: t('bub.scan.reading') });
    try {
      let bitmap = await takePhoto(camera.current, video.current);
      if (bitmap.width > bitmap.height !== video.current.videoWidth > video.current.videoHeight) {
        bitmap.close();
        bitmap = await createImageBitmap(video.current);
      }
      watch.current.taken(quadRef.current);
      const read = await worker.current.read(bitmap, layout);
      if (!read.ok) return setNote({ ok: false, text: t(WHY_KEYS[read.why] ?? 'bub.scan.why.failed') });
      const item = sender.current.add(await read.jpeg.arrayBuffer(), read.reading);
      if (!item) return setNote({ ok: false, text: t('bub.scan.twice', { n: pad4(read.reading.sheetNo ?? 0) }) });
      setItems([...sender.current.items]);
      setNote(null);
      void sender.current.sync().then(() => setItems([...(sender.current?.items ?? [])]));
    } catch {
      setNote({ ok: false, text: t('bub.scan.why.failed') });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, finished, lang]);
  useEffect(() => {
    captureRef.current = capture;
  }, [capture]);

  const finish = async () => {
    if (!sender.current) return;
    setFinished('finishing');
    const all = await sender.current.finish();
    setItems([...sender.current.items]);
    setFinished(all ? 'yes' : 'no');
    if (!all) setNote({ ok: false, text: t('bub.scan.keepOpen') });
  };
  const remove = (id: number) => {
    sender.current?.remove(id);
    setItems([...(sender.current?.items ?? [])]);
  };

  // ---- the screen ----------------------------------------------------------------------------------------------------------
  if (failed) return <p role="alert" className="rounded-md bg-off-white px-3 py-2 text-sm text-slate">{t('mk.hub.failed')}</p>;
  if (!screen) return null;
  if (!ready) {
    return (
      <div data-bubble-scan-off className="flex flex-col gap-3 text-sm text-slate">
        <p role="status" className="rounded-md bg-off-white px-3 py-2 font-semibold">
          {screen.sitting !== 'bubble' ? t('bub.scan.notBubble') : !screen.mayChange ? t('mk.q.readOnly') : t('bub.problem.questions')}
        </p>
        <a href={scriptsHref(paperId)} className={`${TAP} self-start`}>{t('mk.scan.back')}</a>
      </div>
    );
  }
  const childOf = (sheetNo: number | null) => {
    const id = sheetNo === null ? null : screen.sheets.find((s) => s.sheetNo === sheetNo)?.studentId ?? null;
    return id ? screen.candidates.find((c) => c.studentId === id) ?? null : null;
  };
  const sent = items.filter((i) => i.result).length;
  const refusedWords = (code: string) => {
    const key = `mk.err.${code}`;
    return isMessageKey(key) ? t(key) : t('mk.err.other');
  };

  return (
    <div lang={lang} data-bubble-scan={paperId} className="flex flex-col gap-4 text-sm text-slate">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className={SECTION} aria-labelledby="bub-camera-title">
          <div className="flex flex-wrap items-center gap-x-1">
            <h2 id="bub-camera-title" className="text-base font-bold">{t('bub.scan.title')}</h2>
            <InfoTip>{t('bub.scan.how')}</InfoTip>
          </div>
          <div className="relative mx-auto aspect-[3/4] w-full max-w-md overflow-hidden rounded-lg bg-midnight lg:max-w-lg">
            <video ref={videoRef} data-scan-video playsInline muted autoPlay className="h-full w-full object-cover" aria-hidden="true" />
            {quad && camState === 'on' && (
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
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
          <p className="text-center text-slate/80" aria-live="polite">{camState === 'on' ? (busy ? t('bub.scan.reading') : quad ? t('bub.scan.found') : t('bub.scan.looking')) : ''}</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              data-bubble-take
              className="relative inline-flex h-16 w-16 items-center justify-center rounded-full border-4 border-sapphire bg-white text-sapphire disabled:opacity-60"
              disabled={busy || camState !== 'on' || finished !== 'no'}
              onClick={() => void capture()}
              aria-label={t('mk.scan.take')}
            >
              <span aria-hidden="true" className="h-10 w-10 rounded-full bg-sapphire" />
            </button>
            <label className={`${TAP} cursor-pointer`}>
              <input type="checkbox" className="h-5 w-5 accent-sapphire" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
              {t('mk.scan.auto')}
            </label>
          </div>
          {note && (
            <p role="status" data-bubble-note={note.ok ? 'ok' : 'error'} className={`rounded-md px-3 py-2 font-semibold ${note.ok ? 'bg-off-white text-slate' : 'border border-red-800/30 text-red-800'}`}>{note.text}</p>
          )}
        </section>

        <section className={SECTION} aria-labelledby="bub-list-title" aria-live="polite">
          <h2 id="bub-list-title" className="text-base font-bold">{t('bub.scan.list')}</h2>
          <p data-bubble-counts>{t('bub.scan.counts', { sent: numberWords(sent, lang), waiting: numberWords(waiting, lang) })}</p>
          {waiting > 0 && <p className="font-semibold text-amber-text">{t('bub.scan.keepOpen')}</p>}
          {items.length === 0 ? (
            <p className="text-slate/80">{t('bub.scan.none')}</p>
          ) : (
            <ol className="flex max-h-[28rem] flex-col gap-2 overflow-y-auto">
              {[...items].reverse().map((i) => {
                const child = i.result?.child ?? childOf(i.reading.sheetNo);
                const flags = i.reading.unclear.length + i.reading.multiple.length;
                return (
                  <li key={i.id} data-bubble-item={i.id} data-state={i.result ? 'sent' : i.refused ? 'refused' : 'waiting'} className="flex flex-col gap-1 rounded-md border border-slate/10 p-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold">{i.reading.sheetNo !== null ? t('bub.scan.read', { n: pad4(i.reading.sheetNo) }) : t('bub.scan.readNoNo')}</span>
                      {i.result ? (
                        <Badge variant={i.result.flagged ? 'warning' : 'success'}>{t(OUTCOME_KEYS[i.result.outcome])}</Badge>
                      ) : i.refused ? (
                        <Badge variant="danger">{t('bub.scan.refused', { why: refusedWords(i.refused) })}</Badge>
                      ) : (
                        <Badge>{t('bub.scan.sending')}</Badge>
                      )}
                    </div>
                    {child && <span className="break-words">{childLine(child)}</span>}
                    {!child && i.reading.roll && <span>{t('bub.scan.readRoll', { roll: i.reading.roll })}</span>}
                    <span className={flags ? 'text-amber-text' : 'text-slate/80'}>{flags ? t('bub.scan.flagged', { n: numberWords(flags, lang) }) : t('bub.scan.all')}</span>
                    {i.refused && (
                      <button type="button" className={`${TAP} self-start`} onClick={() => remove(i.id)}>{t('bub.scan.remove')}</button>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
          {finished === 'yes' ? (
            <div className="flex flex-col gap-2">
              <p className="flex items-start gap-2 font-semibold"><Icon name="check" className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />{t('bub.scan.finished')}</p>
              <a href={scriptsHref(paperId)} className={`${PRIMARY} self-start`}>{t('mk.scan.back')}</a>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button type="button" data-bubble-finish className={PRIMARY} disabled={busy || finished === 'finishing' || items.length === 0} onClick={() => void finish()}>
                {finished === 'finishing' ? t('bub.scan.finishing') : t('bub.scan.finish')}
              </button>
              <a href={scriptsHref(paperId)} className={TAP}>{t('mk.scan.back')}</a>
            </div>
          )}
          <p className="flex items-start gap-2 text-slate/80"><Icon name="lock" className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{t('bub.scan.privacy')}</p>
        </section>
      </div>
    </div>
  );
}
