'use client';

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import type { Words } from '@/lib/family/fill';
import { TutorAvatar } from '../TutorAvatar';
import type { CallLine, CallPhase, CallStatus } from './useCall';

// The call screen (C511), drawn to the founder's reference: a small header chip with the tutor's face, name and what it
// is doing (Listening…, Thinking…, Speaking…) and the call's clock; the board and the captions in the middle (captions
// on by default); an animated voice indicator that follows the child's voice while listening and the tutor's while it
// speaks (still under reduced motion); and a rounded bottom bar of round 56 px buttons: Mute, Speaker, Captions, Type
// instead, and the red End call at the right. No Talk button: the microphone is open for the whole call (useCall.ts);
// only a phone that gives no loudness to listen with gets a Talk button above the bar. The logic is useCall.ts; this
// file only draws, so it is rendered on its own in tests and pictures.

const ICON = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const MIC = <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>;
const PATHS = {
  mic: MIC,
  micOff: <>{MIC}<path d="M4 4l16 16" /></>,
  loud: <><path d="M4 10v4h4l5 4V6L8 10z" /><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" /></>,
  quiet: <><path d="M4 10v4h4l5 4V6L8 10z" /><path d="M16 10a2.5 2.5 0 0 1 0 4" /></>,
  cc: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M10.5 10a2 2 0 1 0 0 4M16.5 10a2 2 0 1 0 0 4" /></>,
  ccOff: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M10.5 10a2 2 0 1 0 0 4M16.5 10a2 2 0 1 0 0 4M4 4l16 16" /></>,
  keys: <><rect x="2.5" y="6" width="19" height="12" rx="2.5" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" /></>,
  end: <path d="M3.5 13.5c4.7-4 12.3-4 17 0l-1.8 2.6-3.4-1.3v-2.3a10 10 0 0 0-6.6 0v2.3l-3.4 1.3z" fill="currentColor" />,
};

const BUTTON = 'fam-press flex h-14 w-14 shrink-0 touch-manipulation items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-60';

const clock = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

// The voice indicator: five bars that follow `levelOf` (0 to 1) every frame, without a render. Still bars under
// reduced motion (the phone's setting, or the child's own motion switch in Settings).
function VoiceBars({ levelOf, tone, active }: { levelOf: () => number; tone: 'listen' | 'speak' | 'rest'; active: boolean }) {
  const box = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el || !active || typeof requestAnimationFrame !== 'function') return;
    const still = (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) || el.closest('[data-fam-motion="off"]') !== null;
    if (still) return;
    const bars = Array.from(el.children) as HTMLElement[];
    const weights = [0.55, 0.8, 1, 0.8, 0.55];
    let smooth = 0;
    let id = 0;
    const step = () => {
      smooth = smooth * 0.6 + levelOf() * 0.4;
      const t = Date.now() / 140;
      bars.forEach((b, i) => {
        const wobble = 0.75 + 0.25 * Math.sin(t + i * 1.3);
        b.style.transform = `scaleY(${Math.max(0.18, Math.min(1, smooth * weights[i] * wobble * 1.6))})`;
      });
      id = requestAnimationFrame(step);
    };
    id = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(id);
      bars.forEach((b) => (b.style.transform = ''));
    };
  }, [levelOf, active]);
  const colour = tone === 'speak' ? 'bg-grape' : tone === 'listen' ? 'bg-emerald' : 'bg-ink/25';
  return (
    <span ref={box} aria-hidden="true" data-call-indicator={tone} className="flex h-10 items-center gap-1.5">
      {[0.45, 0.7, 1, 0.7, 0.45].map((h, i) => (
        <span key={i} className={`block h-10 w-2 origin-center rounded-full transition-colors ${colour}`} style={{ transform: `scaleY(${h * 0.5})` }} />
      ))}
    </span>
  );
}

export type CallScreenProps = {
  w: Words;
  lang: 'en' | 'hi';
  tutorName: string;
  status: CallStatus;
  phase: CallPhase;
  elapsed: number;
  heard: string;
  ack: string;
  lines: CallLine[];
  current: number;
  board: ReactNode;
  boardFull: boolean;
  problem: string;
  refusal: string;
  muted: boolean;
  loud: boolean;
  // Hidden where the button could not do what it says (the Android app: no earpiece/speaker switch in this build).
  showSpeaker: boolean;
  recording: boolean;
  stopped: boolean;
  // Which voice spoke (C386): said once a sentence has been spoken.
  voice?: 'server' | 'phone' | null;
  levelOf: () => number;
  endHref: string;
  onEnd: () => void;
  onMute: () => void;
  onSpeaker: () => void;
  onTalk: () => void;
  onWake: () => void;
  onAgain: () => void;
  onType: (text: string) => void;
  // Pictures and tests: open with the typing box shown.
  typingOpen?: boolean;
};

export function CallScreen(p: CallScreenProps) {
  const { w, phase, status } = p;
  const [captions, setCaptions] = useState(true);
  const [typing, setTyping] = useState(p.typingOpen ?? false);
  const [draft, setDraft] = useState('');
  const ended = status === 'ended';

  const state =
    phase === 'connecting'
      ? w['fam.call.connecting']
      : phase === 'listening'
        ? w['fam.call.listening']
        : phase === 'hearing'
          ? w['fam.call.hearing']
          : phase === 'thinking'
            ? w['fam.call.mic.thinking']
            : phase === 'speaking'
              ? w['fam.call.speaking']
              : phase === 'muted'
                ? w['fam.call.muted']
                : phase === 'ended'
                  ? w['fam.call.ended']
                  : status === 'manual'
                    ? w['fam.call.mic.talk']
                    : '';
  const tone = phase === 'speaking' ? 'speak' : phase === 'listening' ? 'listen' : 'rest';
  const send = (e: FormEvent) => {
    e.preventDefault();
    const s = draft.trim();
    if (!s) return;
    p.onType(s);
    setDraft('');
  };
  const notice = p.problem || p.refusal;

  return (
    <div data-call data-call-phase={phase} data-call-status={status} lang={p.lang} className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-paper text-ink">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
        <div data-call-chip className="flex min-w-0 items-center gap-2 rounded-full bg-white py-1.5 pl-1.5 pr-4 shadow-sm ring-1 ring-ink/10">
          <TutorAvatar className="h-10 w-10 shrink-0" />
          <div className="min-w-0">
            <h1 className="fam-display truncate text-base font-extrabold leading-tight text-ink">{p.tutorName}</h1>
            <p role="status" data-call-state className="flex items-center gap-1.5 text-sm font-semibold text-slate">
              <span aria-hidden="true" className={`inline-block h-2 w-2 shrink-0 rounded-full ${tone === 'speak' ? 'bg-grape' : tone === 'listen' ? 'bg-emerald' : 'bg-saffron'}`} />
              <span className="truncate">{state}</span>
            </p>
          </div>
        </div>
        <p role="timer" aria-label={w['fam.call.timer']} data-call-timer className="shrink-0 rounded-full bg-white px-3 py-2 text-sm font-bold tabular-nums text-ink ring-1 ring-ink/10">
          {clock(p.elapsed)}
        </p>
      </header>

      <section aria-label={w['fam.call.board']} data-call-board-area className={`mx-auto min-h-0 w-full max-w-3xl flex-1 overflow-y-auto overscroll-contain px-4 py-2 ${p.boardFull ? '' : 'flex flex-col justify-center'}`}>
        {p.board}
      </section>

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 pb-[calc(var(--fam-bottom,0px)+1rem)] pt-2">
        {captions && (
          <section aria-label={w['fam.call.captions']} data-call-captions aria-live="polite" className="fam-surface flex max-h-[28vh] flex-col gap-2 overflow-y-auto overscroll-contain bg-white p-4">
            {p.heard ? (
              <p data-call-heard className="text-base text-slate">
                <span className="mr-2 text-xs font-extrabold uppercase tracking-[0.12em] text-slate">{w['fam.call.you']}</span>
                {p.heard}
              </p>
            ) : (
              <p data-call-empty className="text-base text-slate">
                {w['fam.call.empty']}
              </p>
            )}
            {p.ack && (
              <p data-call-ack className="text-lg font-semibold leading-snug text-ink">
                {p.ack}
              </p>
            )}
            {p.lines.length > 0 && (
              <p data-call-caption className="text-lg leading-snug text-ink">
                {p.lines.map((l, i) => (
                  <span key={i} data-spoken={i === p.current ? 'now' : i < p.current || p.current < 0 ? 'done' : 'next'} className={i === p.current ? 'rounded bg-lesson-butter px-1 font-bold text-ink' : ''}>
                    {l.text}{' '}
                  </span>
                ))}
              </p>
            )}
            {p.voice && (
              <p data-voice-in-use={p.voice} className="text-xs font-semibold text-slate">
                {w[p.voice === 'server' ? 'fam.voiceOut.server' : 'fam.voiceOut.phone']}
              </p>
            )}
          </section>
        )}

        {notice && (
          <p role="alert" data-call-problem className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate ring-1 ring-ink/10">
            {notice}
          </p>
        )}

        {typing && !ended && (
          <form onSubmit={send} data-call-typing className="flex items-center gap-2">
            <label className="sr-only" htmlFor="fam-call-type">
              {w['fam.call.typeLabel']}
            </label>
            <input
              id="fam-call-type"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={500}
              autoComplete="off"
              placeholder={w['fam.call.typeLabel']}
              className="min-h-[44px] min-w-0 flex-1 rounded-2xl bg-white px-4 text-base text-ink ring-1 ring-ink/15 placeholder:text-slate focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
            />
            <button type="submit" className="fam-press min-h-[44px] min-w-[44px] rounded-2xl bg-saffron px-4 text-base font-bold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
              {w['fam.call.send']}
            </button>
          </form>
        )}

        <div className="flex flex-col items-center gap-2">
          <VoiceBars levelOf={p.levelOf} tone={tone} active={!ended && phase !== 'connecting'} />
          {status === 'manual' && !p.stopped && (
            <button type="button" data-call-talk onClick={p.onTalk} disabled={p.muted} aria-pressed={p.recording} className="fam-press min-h-[44px] rounded-full bg-saffron px-6 text-base font-bold text-ink shadow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60">
              {w[p.recording ? 'fam.call.mic.done' : 'fam.call.mic.talk']}
            </button>
          )}
          {status === 'asleep' && (
            <button type="button" data-call-wake onClick={p.onWake} className="fam-press min-h-[44px] rounded-full bg-saffron px-6 text-base font-bold text-ink shadow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
              {w['fam.call.wake']}
            </button>
          )}
          {ended && (
            <button type="button" data-call-again onClick={p.onAgain} className="fam-press min-h-[44px] rounded-full bg-saffron px-6 text-base font-bold text-ink shadow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
              {w['fam.call.again']}
            </button>
          )}
        </div>

        <nav aria-label={w['fam.call.controls']} data-call-bar className="flex items-center justify-between gap-1.5 rounded-full bg-ink px-2 py-2 shadow-lg sm:gap-3 sm:px-3">
          <button type="button" data-call-mute onClick={p.onMute} disabled={ended || status === 'failed'} aria-label={w[p.muted ? 'fam.call.unmute' : 'fam.call.mute']} className={`${BUTTON} ${p.muted ? 'bg-saffron text-ink' : 'bg-paper text-ink'}`}>
            <svg aria-hidden="true" {...ICON} className="h-6 w-6">
              {p.muted ? PATHS.micOff : PATHS.mic}
            </svg>
          </button>
          {p.showSpeaker && (
            <button type="button" data-call-speaker onClick={p.onSpeaker} disabled={ended} aria-label={w[p.loud ? 'fam.call.speakerLoud' : 'fam.call.speakerQuiet']} className={`${BUTTON} bg-paper text-ink`}>
              <svg aria-hidden="true" {...ICON} className="h-6 w-6">
                {p.loud ? PATHS.loud : PATHS.quiet}
              </svg>
            </button>
          )}
          <button type="button" data-call-captions-toggle onClick={() => setCaptions((c) => !c)} aria-pressed={captions} aria-label={w['fam.call.captions']} className={`${BUTTON} bg-paper text-ink`}>
            <svg aria-hidden="true" {...ICON} className="h-6 w-6">
              {captions ? PATHS.cc : PATHS.ccOff}
            </svg>
          </button>
          <button type="button" data-call-type onClick={() => setTyping((t) => !t)} disabled={ended} aria-pressed={typing} aria-label={w['fam.call.type']} className={`${BUTTON} ${typing ? 'bg-saffron text-ink' : 'bg-paper text-ink'}`}>
            <svg aria-hidden="true" {...ICON} className="h-6 w-6">
              {PATHS.keys}
            </svg>
          </button>
          <Link href={p.endHref} data-call-end onClick={p.onEnd} aria-label={w['fam.call.end']} className={`${BUTTON} bg-coral-deep text-white`}>
            <svg aria-hidden="true" {...ICON} className="h-7 w-7">
              {PATHS.end}
            </svg>
          </Link>
        </nav>
      </div>
    </div>
  );
}
