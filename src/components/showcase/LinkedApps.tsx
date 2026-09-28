'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/visual/Icons';
import { usePrefersReducedMotion } from '@/lib/hooks';
import { TeacherApp } from './TeacherApp';
import { ParentApp } from './ParentApp';
import { CHANNELS, EMPTY_LINK, LOOP_STEPS, type Channel, type LinkCommand, type LinkEvent, type LinkState, type ParentAction, type Side, type TeacherAction } from './link';

// The homepage's teacher app and parent app side by side, from 1024px
// (founder, 2026-09-29, Decision Log C84). Between them a sync panel lists
// every shared feature; each action on one phone travels to the other at
// once, shown as a dot moving along that feature's line. A loop plays one
// school day (12 steps: each teacher action and the parent's response)
// and repeats; touching either phone pauses it so the visitor can drive
// both apps by hand, and their own taps sync the same way. The loop runs
// only while the section is on screen, and never starts by itself under
// reduced motion.

const STEP_MS = 3400;
const END_HOLD_MS = 3000;

type Flash = { channel: Channel; from: Side; id: number };

export function LinkedApps() {
  const reduced = usePrefersReducedMotion();
  const [state, setState] = useState<LinkState>(EMPTY_LINK);
  const [last, setLast] = useState<(LinkEvent & { id: number }) | null>(null);
  const [log, setLog] = useState<Partial<Record<Channel, { teacher?: string; parent?: string; from: Side }>>>({});
  const [flash, setFlash] = useState<Flash | null>(null);
  const [tCmd, setTCmd] = useState<LinkCommand<TeacherAction> | null>(null);
  const [pCmd, setPCmd] = useState<LinkCommand<ParentAction> | null>(null);
  const [step, setStep] = useState(0);
  const [cycle, setCycle] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [visible, setVisible] = useState(false);
  const ids = useRef(0);
  const root = useRef<HTMLDivElement>(null);

  const emit = useCallback((e: LinkEvent) => {
    const id = ++ids.current;
    setState((s) => ({ ...s, ...e.patch }));
    setLast({ ...e, id });
    setFlash({ channel: e.channel, from: e.from, id });
    setLog((l) => ({ ...l, [e.channel]: { ...l[e.channel], [e.from]: e.text, from: e.from } }));
  }, []);

  const restart = () => {
    setState(EMPTY_LINK);
    setLast(null);
    setLog({});
    setFlash(null);
    setTCmd(null);
    setPCmd(null);
    setStep(0);
    setCycle((c) => c + 1);
  };

  // Play only while the section is on screen (display: none below 1024px
  // never intersects, so phones never run it).
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (reduced) setPlaying(false);
  }, [reduced]);

  // The loop: one step at a time; the acting phone performs the action and
  // the other phone opens the screen where it arrives.
  useEffect(() => {
    if (!playing || !visible) return;
    if (step >= LOOP_STEPS.length) {
      const t = window.setTimeout(restart, END_HOLD_MS);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(() => {
      const s = LOOP_STEPS[step];
      const id = ++ids.current;
      if (s.side === 'teacher') {
        setTCmd({ id, view: s.channel, act: s.act });
        setPCmd({ id, view: s.channel });
      } else {
        setPCmd({ id, view: s.channel, act: s.act });
        setTCmd({ id, view: s.channel });
      }
      setStep((n) => n + 1);
    }, step === 0 ? 900 : STEP_MS);
    return () => window.clearTimeout(t);
  }, [playing, visible, step]);

  // Any touch or key inside a phone hands control to the visitor.
  const takeOver = () => {
    if (playing) setPlaying(false);
  };

  const current = step > 0 ? LOOP_STEPS[step - 1] : null;

  return (
    <div ref={root} className="grid grid-cols-[20rem_minmax(0,34rem)_20rem] items-start justify-center gap-6 xl:gap-10">
      <div className="flex flex-col gap-3" onPointerDown={takeOver} onKeyDown={takeOver}>
        <TeacherApp key={`t-${cycle}`} link={{ state, emit, command: tCmd, last }} />
        <p className="flex items-center justify-center gap-2 text-sm font-extrabold text-slate">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-emerald" />
          Teacher staff app
        </p>
      </div>

      <section aria-label="Live sync between the teacher app and the parent app" className="flex flex-col gap-3 self-center rounded-3xl border border-slate/10 bg-white p-4 shadow-lg shadow-slate/10">
        <div className="flex items-center justify-between gap-2 text-[11px] font-extrabold uppercase tracking-wider">
          <span className="text-emerald">Teacher</span>
          <span className="flex items-center gap-1.5 text-slate">
            <span aria-hidden="true" className={`h-2 w-2 rounded-full ${playing && visible ? 'nca-link-live bg-emerald' : 'bg-slate/40'}`} />
            Live sync
          </span>
          <span className="text-royal">Parent</span>
        </div>

        <ul className="flex flex-col gap-2">
          {CHANNELS.map((c) => {
            const entry = log[c.id];
            const on = flash?.channel === c.id;
            const active = current?.channel === c.id;
            return (
              <li key={c.id} className={`rounded-xl border p-2.5 transition-colors ${active || on ? 'border-royal/30 bg-royal/5' : 'border-slate/10'}`}>
                <p className="flex items-center gap-2 text-xs font-extrabold text-slate">
                  <Icon name={c.icon} className="h-4 w-4 text-slate/70" />
                  {c.label}
                  {entry?.teacher && entry?.parent && <span className="ml-auto rounded-full bg-leaf/30 px-1.5 text-[10px] font-bold text-slate">Both ways ✓</span>}
                </p>
                <span aria-hidden="true" className="relative mt-2 block h-1.5 rounded-full bg-slate/10">
                  <span className="absolute -top-1 left-0 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald" />
                  <span className="absolute -top-1 right-0 h-3.5 w-3.5 rounded-full border-2 border-white bg-royal" />
                  {on && !reduced && flash && (
                    <span key={flash.id} className={`absolute -top-1 h-3.5 w-3.5 rounded-full shadow ${flash.from === 'teacher' ? 'nca-link-ltr bg-emerald' : 'nca-link-rtl bg-royal'}`} />
                  )}
                </span>
                <span className="mt-1.5 grid grid-cols-2 gap-2 text-[10px] leading-snug text-slate/70">
                  <span className={entry?.from === 'teacher' && on ? 'font-bold text-slate' : ''}>{entry?.teacher ?? '—'}</span>
                  <span className={`text-right ${entry?.from === 'parent' && on ? 'font-bold text-slate' : ''}`}>{entry?.parent ?? '—'}</span>
                </span>
              </li>
            );
          })}
        </ul>

        <div className="flex flex-col gap-2 border-t border-slate/10 pt-3">
          <span aria-hidden="true" className="block h-1 overflow-hidden rounded-full bg-slate/10">
            <span className="block h-full rounded-full bg-grape transition-all duration-500" style={{ width: `${(step / LOOP_STEPS.length) * 100}%` }} />
          </span>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-slate/70" aria-live="polite">
              {playing ? `Playing a school day · step ${Math.min(step + 1, LOOP_STEPS.length)} of ${LOOP_STEPS.length}` : 'Paused. Tap either phone: it syncs the same way.'}
            </p>
            <span className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setPlaying((p) => !p)}
                className="nca-lift flex items-center gap-1 rounded-lg border border-slate/15 px-2.5 py-1.5 text-xs font-bold text-slate focus-visible:outline focus-visible:outline-2 focus-visible:outline-royal"
              >
                <Icon name={playing ? 'pause' : 'play'} className="h-3.5 w-3.5" />
                {playing ? 'Pause' : 'Play'}
              </button>
              <button
                type="button"
                onClick={restart}
                className="nca-lift rounded-lg border border-slate/15 px-2.5 py-1.5 text-xs font-bold text-slate focus-visible:outline focus-visible:outline-2 focus-visible:outline-royal"
              >
                Restart
              </button>
            </span>
          </div>
          <p className="text-[10px] text-slate/70">Example data; a day compressed into under a minute. Nothing is sent.</p>
        </div>
      </section>

      <div className="flex flex-col gap-3" onPointerDown={takeOver} onKeyDown={takeOver}>
        <ParentApp key={`p-${cycle}`} link={{ state, emit, command: pCmd, last }} />
        <p className="flex items-center justify-center gap-2 text-sm font-extrabold text-slate">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-royal" />
          Parent app · optional
        </p>
        <p className="text-center text-[11px] text-slate/70">
          Coming soon, for families who want deeper insights. WhatsApp stays the main channel: no parent ever has to install anything.
        </p>
      </div>
    </div>
  );
}
