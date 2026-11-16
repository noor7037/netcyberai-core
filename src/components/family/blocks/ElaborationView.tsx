"use client";

import { useEffect, useRef, useState } from "react";
import { stopSpeaking, speak } from "@/components/family/english/speech";
import {
  ELAB_KEYS,
  LEVELS,
  stepAtSentence,
  stepSay,
  type ElabKey,
  type ElabPic,
  type Elaboration,
  type Level,
} from "@/lib/family/elaboration";
import { fill, type Words } from "@/lib/family/fill";
import { useReducedMotion } from "./InteractiveViews";
import { showcaseSrc } from "./ShowcaseView";

// The NetCyberAI Elaboration Framework's answer (founder, 16 Nov 2026): five steps in order. Every step has a picture to
// see, the text to read and a voice line to listen to. On a phone each step is a card with its picture on top; from 1024 px
// the conversation (the five steps) sits beside a whiteboard that shows the picture of the step being read, heard or
// tapped. The answer's own read-aloud and Teach me speak the same lines in the same order (`sentence` names the one being
// spoken, so the board follows the voice); each step's Listen button speaks that step alone.

const isHindi = (s: string) => /[ऀ-ॿ]/.test(s);

function Pic({
  pic,
  n,
  w,
  className,
}: {
  pic: ElabPic | null;
  n: number;
  w: Words;
  className?: string;
}) {
  const reduced = useReducedMotion();
  if (!pic) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- our own drawn SVG as a data URL
    <img
      data-elab-img={pic.kind}
      src={showcaseSrc(pic.svg, reduced)}
      alt={`${fill(w["fam.elab.picture"], { n })}: ${pic.caption}`}
      className={
        className ?? "mx-auto block h-auto max-h-[34vh] w-full object-contain"
      }
    />
  );
}

function TryIt({
  b,
  w,
  onDone,
}: {
  b: Elaboration;
  w: Words;
  onDone: () => void;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const right = picked === b.try_it.answer;
  return (
    <div data-elab-try className="flex flex-col gap-2">
      <p className="text-base font-bold text-slate">{b.try_it.question}</p>
      <ul className="flex flex-col gap-2" aria-label={w["fam.elab.pick"]}>
        {b.try_it.options.map((o, i) => {
          const on = picked === i;
          return (
            <li key={i}>
              <button
                type="button"
                data-elab-option={i}
                aria-pressed={on}
                disabled={right}
                onClick={() => {
                  setPicked(i);
                  if (i === b.try_it.answer) onDone();
                }}
                className={`fam-press flex min-h-[48px] w-full items-center rounded-2xl px-4 py-2 text-start text-base font-semibold ring-1 ${on ? (i === b.try_it.answer ? "bg-emerald text-white ring-emerald" : "bg-lesson-blush text-slate ring-coral-deep") : "bg-white text-slate ring-slate/20"} disabled:opacity-100`}
              >
                {o}
              </button>
            </li>
          );
        })}
      </ul>
      <p
        role="status"
        aria-live="polite"
        data-elab-feedback={
          picked === null ? undefined : right ? "right" : "wrong"
        }
        className="min-h-[1.5rem] text-base font-semibold text-slate"
      >
        {picked === null
          ? ""
          : right
            ? `${w["fam.elab.right"]} ${b.try_it.right}`
            : `${w["fam.elab.wrong"]} ${b.try_it.hint}`}
      </p>
      {picked !== null && !right && (
        <button
          type="button"
          data-elab-again
          onClick={() => setPicked(null)}
          className="fam-press min-h-[44px] self-start rounded-full bg-white px-4 text-sm font-bold text-ink ring-1 ring-ink/20"
        >
          {w["fam.elab.again"]}
        </button>
      )}
    </div>
  );
}

export function ElaborationView({
  b,
  w,
  tone,
  sentence,
  sentences,
}: {
  b: Elaboration;
  w: Words;
  tone: string;
  sentence?: number;
  sentences?: readonly string[];
}) {
  const [tapped, setTapped] = useState(0);
  const [listening, setListening] = useState<number | null>(null);
  const [level, setLevel] = useState<Level>(b.lead);
  const says = stepSay(b);
  const spoken =
    sentence !== undefined
      ? stepAtSentence(b, sentences ?? [], sentence)
      : null;
  const shown = spoken ?? tapped;
  const root = useRef<HTMLElement>(null);
  // From 1024 px the whiteboard follows the step the child scrolls to.
  useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const seen = new IntersectionObserver(
      (es) =>
        es.forEach(
          (e) =>
            e.isIntersecting &&
            setTapped(Number((e.target as HTMLElement).dataset.elabStep) - 1),
        ),
      { rootMargin: `-${Math.round(window.innerHeight * 0.35)}px 0px -${Math.round(window.innerHeight * 0.55)}px 0px` },
    );
    el.querySelectorAll("[data-elab-step]").forEach((s) => seen.observe(s));
    return () => seen.disconnect();
  }, []);
  useEffect(() => () => stopSpeaking(), []);
  const listen = (i: number) => {
    setTapped(i);
    if (listening === i) {
      stopSpeaking();
      setListening(null);
      return;
    }
    stopSpeaking();
    setListening(i);
    void speak(says[i], isHindi(says[i]) ? "hi" : "en", 0.9).finally(() =>
      setListening((now) => (now === i ? null : now)),
    );
  };
  const label = (k: ElabKey) => w[`fam.elab.step.${k}`];
  const body = (k: ElabKey): React.ReactNode => {
    switch (k) {
      case "definition":
        return (
          <p
            data-elab-text
            className="text-lg font-extrabold leading-snug text-ink"
          >
            {b.definition.text}
          </p>
        );
      case "levels":
        return (
          <ul data-elab-levels className="flex flex-col gap-2">
            {LEVELS.map((l) => {
              const open = level === l;
              return (
                <li
                  key={l}
                  data-elab-level={l}
                  data-lead={b.lead === l || undefined}
                  className="rounded-2xl bg-white ring-1 ring-slate/15"
                >
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setLevel(l)}
                    className="fam-press flex min-h-[48px] w-full items-center gap-2 rounded-2xl px-3 text-start text-base font-bold text-slate"
                  >
                    {w[`fam.elab.level.${l}`]}
                    {b.lead === l && (
                      <span className="rounded-full bg-grape-deep px-2 py-0.5 text-xs font-bold text-white">
                        {w["fam.elab.yourLevel"]}
                      </span>
                    )}
                  </button>
                  <p
                    hidden={!open}
                    data-elab-text
                    className="px-3 pb-3 text-base text-slate"
                  >
                    {b.levels[l]}
                  </p>
                </li>
              );
            })}
          </ul>
        );
      case "real_life":
        return (
          <p data-elab-text className="text-base text-slate">
            {b.real_life.text}
          </p>
        );
      case "try_it":
        return <TryIt b={b} w={w} onDone={() => undefined} />;
      case "future":
        return (
          <p data-elab-text className="text-base text-slate">
            {b.future.text}
          </p>
        );
    }
  };
  return (
    <section
      ref={root}
      data-block="elaboration"
      data-elab
      data-lead={b.lead}
      aria-label={b.term}
      className="fam-card fam-rise overflow-hidden bg-white"
    >
      <div className="flex flex-col gap-4 p-4 sm:p-5">
        <h2
          data-elab-term
          className="flex items-center gap-2 text-xl font-extrabold text-ink"
        >
          {b.icon && <span aria-hidden="true">{b.icon}</span>}
          {b.term}
        </h2>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-6">
          <figure
            data-whiteboard
            data-whiteboard-step={shown + 1}
            aria-label={w["fam.elab.board"]}
            className="hidden self-start rounded-3xl bg-off-white p-3 ring-1 ring-slate/10 lg:sticky lg:top-4 lg:flex lg:flex-col lg:gap-2"
          >
            <div className="overflow-hidden rounded-2xl bg-white">
              <Pic
                pic={b.pics[shown] ?? null}
                n={shown + 1}
                w={w}
                className="mx-auto block h-auto max-h-[56vh] w-full object-contain"
              />
            </div>
            <figcaption className="text-base font-semibold text-slate">
              {b.pics[shown]?.caption}
            </figcaption>
            <div className="flex gap-1.5" aria-hidden="true">
              {ELAB_KEYS.map((k, i) => (
                <span
                  key={k}
                  className={`h-1.5 flex-1 rounded-full ${i === shown ? "bg-grape-deep" : "bg-slate/15"}`}
                />
              ))}
            </div>
          </figure>
          <ol
            data-elab-steps
            aria-label={w["fam.elab.steps"]}
            className="flex flex-col gap-3"
          >
            {ELAB_KEYS.map((k, i) => (
              <li
                key={k}
                data-elab-step={i + 1}
                data-elab-key={k}
                data-active={shown === i || undefined}
                className={`flex flex-col gap-2 rounded-3xl p-3 ring-1 transition-colors ${shown === i ? "bg-lesson-lilac ring-grape/40" : "bg-off-white ring-slate/10"}`}
                onClick={() => setTapped(i)}
              >
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-grape-deep text-base font-black text-white"
                  >
                    {i + 1}
                  </span>
                  <h3 className="min-w-0 flex-1 break-words text-base font-extrabold text-slate">
                    {label(k)}
                  </h3>
                  {
                    <button
                      type="button"
                      data-elab-listen={i + 1}
                      aria-pressed={listening === i}
                      onClick={() => listen(i)}
                      className="fam-press flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full bg-grape-deep px-3 text-sm font-bold text-white"
                    >
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M4 9v6h4l5 4V5L8 9H4z" />
                        <path d="M16 9a3 3 0 0 1 0 6" />
                      </svg>
                      {listening === i
                        ? w["fam.elab.stop"]
                        : w["fam.elab.listen"]}
                      <span className="sr-only"> {label(k)}</span>
                    </button>
                  }
                </div>
                <div className="overflow-hidden rounded-2xl bg-white lg:hidden">
                  <Pic pic={b.pics[i] ?? null} n={i + 1} w={w} />
                </div>
                {body(k)}
              </li>
            ))}
          </ol>
        </div>
      </div>
      <span hidden data-tone={tone} />
    </section>
  );
}
