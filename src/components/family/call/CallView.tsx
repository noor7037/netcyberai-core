'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, type PointerEvent } from 'react';
import { fill, type Words } from '@/lib/family/fill';
import { Button } from '../ui/Button';
import { TutorAvatar } from '../TutorAvatar';
import { openRealtimeLeg } from './RealtimeLeg';
import { useCall } from './useCall';

// The call (W16-A4): a full-screen, calm screen where a child talks to a tutor and hears the answer, with captions of
// both. The big button listens (tap to start and tap to finish, or press and hold while talking); a tap while the tutor
// speaks stops the voice at once and listens again. The answer's blocks gather on the board as they arrive, drawn by the
// lesson page's own renderer, loaded only when the first one comes. The voice is the server's when Control has set one up,
// else the phone's own; the screen says which, once a sentence has been spoken. The logic is useCall.ts.

// The board is its own chunk: the figures, charts and models come only when an answer carries them.
const CallBoard = dynamic(() => import('./CallBoard'), { ssr: false });

const HOLD_MS = 700;
const ICON = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

export type CallViewProps = {
  w: Words;
  lang: 'en' | 'hi';
  subject: string;
  tutorName: string;
  // What the server says is left of today's speaking time, as for the composer's microphone.
  secondsLeft: number;
  // Where End goes: the subject's Study page.
  endHref: string;
  // Whether a realtime provider is set up (the server reads it without taking anything); false today.
  realtime: boolean;
};

export function CallView({ w, lang, subject, tutorName, secondsLeft, endHref, realtime }: CallViewProps) {
  const call = useCall({ w, subject, lang, secondsLeft });
  const { phase, recorder } = call;

  // The realtime leg: only asked for when a provider is set up; "not available" leaves the chain in charge.
  useEffect(() => {
    if (realtime) void openRealtimeLeg();
  }, [realtime]);

  // Hold to talk, or tap once to start and tap again to finish. A press starts at once; letting go after a hold finishes;
  // a short press leaves the microphone open. `swallow` keeps the click that follows a press from acting twice; a
  // keyboard's Enter or Space has no press, so its click does the work.
  const press = useRef<{ at: number; began: boolean } | null>(null);
  const swallow = useRef(false);
  const onDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    swallow.current = true;
    press.current = { at: Date.now(), began: phase !== 'listening' };
    call.talk();
  };
  const onUp = () => {
    const p = press.current;
    press.current = null;
    if (p?.began && Date.now() - p.at > HOLD_MS) call.talk();
  };
  const onClick = () => {
    if (swallow.current) {
      swallow.current = false;
      return;
    }
    call.talk();
  };

  const label =
    phase === 'listening' ? fill(w['fam.voice.recording'], { s: recorder.elapsed, max: recorder.max }) : phase === 'hearing' ? w['fam.voice.sending'] : phase === 'thinking' ? w['fam.call.mic.thinking'] : phase === 'speaking' ? w['fam.call.mic.speaking'] : w['fam.call.mic.talk'];
  const action = phase === 'listening' ? w['fam.call.mic.done'] : phase === 'speaking' ? w['fam.call.mic.speaking'] : w['fam.call.mic.talk'];
  const capped = recorder.limit < 1 && phase === 'idle';
  const problem = recorder.error ?? (capped ? recorder.say('voice_cap') : call.refusal || null);

  return (
    <div data-call data-call-phase={phase} lang={lang} className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-paper text-ink lg:grid lg:grid-cols-[minmax(22rem,26rem)_1fr] lg:grid-rows-[auto_1fr_auto]">
      <header className="flex items-center gap-3 px-4 pb-2 pt-4 lg:col-start-1 lg:row-start-1 lg:px-8 lg:pt-8">
        <TutorAvatar className="h-12 w-12 shrink-0" />
        <div className="min-w-0 flex-1">
          <h1 className="fam-display text-xl font-extrabold leading-tight tracking-tight">{fill(w['fam.call.with'], { tutor: tutorName })}</h1>
          {call.voice && (
            <p data-voice-in-use={call.voice} className="text-sm font-semibold text-slate">
              {w[call.voice === 'server' ? 'fam.voiceOut.server' : 'fam.voiceOut.phone']}
            </p>
          )}
        </div>
        <Button href={endHref} variant="outline" onClick={() => call.end()} data-call-end>
          {w['fam.call.end']}
        </Button>
      </header>

      <section aria-label={w['fam.call.board']} data-call-board-area className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-2 lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:px-8 lg:py-8 ${call.blocks.length > 0 ? '' : 'flex flex-col justify-center'}`}>
        {call.blocks.length > 0 ? (
          <CallBoard w={w} blocks={call.blocks} tone={subject} />
        ) : (
          <p data-call-board-empty className="fam-surface mx-auto max-w-md bg-white p-5 text-center text-base text-slate">
            {w['fam.call.boardEmpty']}
          </p>
        )}
      </section>

      <div className="flex flex-col gap-3 px-4 pb-[calc(var(--fam-bottom,0px)+1rem)] pt-2 lg:col-start-1 lg:row-span-2 lg:row-start-2 lg:justify-end lg:px-8 lg:pb-8">
        <section aria-label={w['fam.call.captions']} data-call-captions className="fam-surface flex max-h-[32vh] flex-col gap-2 overflow-y-auto overscroll-contain bg-white p-4 lg:max-h-[55vh]">
          {call.heard ? (
            <p data-call-heard className="text-base text-slate">
              <span className="mr-2 text-xs font-extrabold uppercase tracking-[0.12em] text-slate">{w['fam.call.you']}</span>
              {call.heard}
            </p>
          ) : (
            <p data-call-empty className="text-base text-slate">
              {w['fam.call.empty']}
            </p>
          )}
          {call.lines.length > 0 && (
            <p data-call-caption className="text-lg leading-snug">
              {call.lines.map((l, i) => (
                <span key={i} data-spoken={i === call.current ? 'now' : i < call.current || call.current < 0 ? 'done' : 'next'} className={i === call.current ? 'rounded bg-lesson-butter px-1 font-bold' : ''}>
                  {l.text}{' '}
                </span>
              ))}
            </p>
          )}
        </section>

        {problem && (
          <p role="alert" data-call-problem className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate ring-1 ring-ink/10">
            {problem}
          </p>
        )}

        <div className="flex flex-col items-center gap-2" data-voice-input data-voice-state={recorder.state}>
          <button
            type="button"
            data-call-mic
            aria-label={action}
            aria-pressed={phase === 'listening'}
            disabled={capped || phase === 'hearing'}
            onPointerDown={onDown}
            onPointerUp={onUp}
            onPointerCancel={() => (press.current = null)}
            onContextMenu={(e) => e.preventDefault()}
            onClick={onClick}
            className={`fam-press relative flex h-24 w-24 touch-manipulation select-none items-center justify-center rounded-full shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-60 ${phase === 'listening' ? 'bg-ink text-white' : 'bg-saffron text-ink'}`}
          >
            {phase === 'listening' && <span aria-hidden="true" className="absolute inset-0 animate-ping rounded-full bg-ink/20 motion-reduce:animate-none" />}
            <svg aria-hidden="true" {...ICON} className="relative h-10 w-10">
              {phase === 'speaking' ? <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" /> : <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>}
            </svg>
          </button>
          <p role="status" data-call-status className="min-h-[1.5rem] text-center text-base font-bold">
            {label}
          </p>
          {phase === 'idle' && !call.heard && <p className="text-center text-sm text-slate">{w['fam.call.hold']}</p>}
        </div>
      </div>
    </div>
  );
}
