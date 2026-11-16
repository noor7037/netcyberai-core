"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import {
  ELAB_KEYS,
  LEVELS,
  stepAtSentence,
  type ElabCheck,
  type ElabKey,
  type ElabPic,
  type Elaboration,
  type Level,
} from "@/lib/family/elaboration";
import { type Words } from "@/lib/family/fill";
import { useReducedMotion } from "./InteractiveViews";
import { showcaseSrc } from "./ShowcaseView";
import { Model3dPic } from "./Model3dPic";
import { WIDE_MEDIA, photoSizes } from "@/lib/family/visuals/photo-size";

// The NetCyberAI Elaboration Framework's answer (founder, 16 Nov 2026): five steps in order. Every step has a picture to
// see, the text to read and a voice line to listen to. On a phone each step is a card with its picture on top; from 1024 px
// the conversation (the five steps) sits beside a whiteboard that shows the picture of the step being read, heard or
// tapped. The answer's own read-aloud and Teach me speak the same lines in the same order (`sentence` names the one being
// spoken, so the board follows the voice). v21: no Listen button on each step; the answer's one button at the top reads it.

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
  void n;
  // A 3D model (a still picture stays on Data saver and weak phones).
  if (pic.kind === "model3d") return <Model3dPic pic={pic} w={w} className={className} />;
  // A licensed photograph: just the picture. Never a label on it.
  if (pic.kind === "photo" && pic.url) {
    const sizes = photoSizes(pic.url);
    return (
      <picture>
        {sizes.wide ? <source media={WIDE_MEDIA} srcSet={sizes.wide} /> : null}
        {/* eslint-disable-next-line @next/next/no-img-element -- a licensed photograph the server checked, in a fixed box */}
        <img data-elab-img="photo" src={sizes.src} alt={pic.caption} loading="lazy" decoding="async" referrerPolicy="no-referrer" className={className ?? "mx-auto block h-auto max-h-[34vh] w-full object-contain"} />
      </picture>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- our own drawn SVG as a data URL
    <img
      data-elab-img={pic.kind}
      src={showcaseSrc(pic.svg, reduced)}
      alt={pic.caption}
      className={className ?? "mx-auto block h-auto max-h-[34vh] w-full object-contain"}
    />
  );
}

// Loaded only when an answer carries a simulation, so a first visit does not download it.
const SimCard = dynamic(() => import("./SimCard").then((m) => m.SimCard));

// Step 4: an open task. The child thinks; a hint and the answer are one tap each. No choices here.
function TryIt({ b, w }: { b: Elaboration; w: Words }) {
  const [hint, setHint] = useState(false);
  const [answer, setAnswer] = useState(false);
  return (
    <div data-elab-try className="flex flex-col gap-2">
      <p className="text-base font-bold text-slate">{b.try_it.question}</p>
      <div className="flex flex-wrap gap-2">
        {!hint && !answer && (
          <button type="button" data-elab-hint onClick={() => setHint(true)} className="fam-press min-h-[44px] rounded-full bg-white px-4 text-sm font-bold text-ink ring-1 ring-ink/20">
            {w["fam.elab.hint"]}
          </button>
        )}
        {!answer && (
          <button type="button" data-elab-reveal onClick={() => setAnswer(true)} className="fam-press min-h-[44px] rounded-full bg-grape-deep px-4 text-sm font-bold text-white">
            {w["fam.elab.showAnswer"]}
          </button>
        )}
      </div>
      {hint && !answer && (
        <p role="status" data-elab-hint-text className="text-base font-semibold text-slate">
          {b.try_it.hint}
        </p>
      )}
      {answer && (
        <p role="status" data-elab-answer className="text-base font-semibold text-slate">
          {b.try_it.right}
        </p>
      )}
      {b.sim && <SimCard sim={b.sim} w={w} />}
    </div>
  );
}

// One multiple-choice question, after step 5 only.
function Check({ c, i, w }: { c: ElabCheck; i: number; w: Words }) {
  const [picked, setPicked] = useState<number | null>(null);
  const right = picked === c.answer;
  return (
    <li data-elab-check={i + 1} className="flex flex-col gap-2 rounded-3xl bg-off-white p-3 ring-1 ring-slate/10">
      <p className="text-base font-bold text-slate">{c.question}</p>
      <ul className="flex flex-col gap-2" aria-label={w["fam.elab.pick"]}>
        {c.options.map((o, j) => {
          const on = picked === j;
          return (
            <li key={j}>
              <button
                type="button"
                data-elab-option={j}
                aria-pressed={on}
                disabled={right}
                onClick={() => setPicked(j)}
                className={`fam-press flex min-h-[48px] w-full items-center rounded-2xl px-4 py-2 text-start text-base font-semibold ring-1 ${on ? (j === c.answer ? "bg-emerald text-white ring-emerald" : "bg-lesson-blush text-slate ring-coral-deep") : "bg-white text-slate ring-slate/20"} disabled:opacity-100`}
              >
                {o}
              </button>
            </li>
          );
        })}
      </ul>
      <p role="status" aria-live="polite" data-elab-feedback={picked === null ? undefined : right ? "right" : "wrong"} className="min-h-[1.5rem] text-base font-semibold text-slate">
        {picked === null ? "" : right ? `${w["fam.elab.right"]} ${c.right}` : `${w["fam.elab.wrong"]} ${c.hint}`}
      </p>
      {picked !== null && !right && (
        <button type="button" data-elab-again onClick={() => setPicked(null)} className="fam-press min-h-[44px] self-start rounded-full bg-white px-4 text-sm font-bold text-ink ring-1 ring-ink/20">
          {w["fam.elab.again"]}
        </button>
      )}
    </li>
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
              return (
                <li
                  key={l}
                  data-elab-level={l}
                  data-lead={b.lead === l || undefined}
                  className="rounded-2xl bg-white ring-1 ring-slate/15"
                >
                  <h4 className="flex min-h-[44px] w-full items-center gap-2 px-3 text-start text-base font-bold text-slate">
                    {w[`fam.elab.level.${l}`]}
                    {b.lead === l && (
                      <span className="rounded-full bg-grape-deep px-2 py-0.5 text-xs font-bold text-white">
                        {w["fam.elab.yourLevel"]}
                      </span>
                    )}
                  </h4>
                  <p
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
        return <TryIt b={b} w={w} />;
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
            className="flex flex-col gap-3 lg:pb-24"
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
                </div>
                <div className="overflow-hidden rounded-2xl bg-white lg:hidden">
                  <Pic pic={b.pics[i] ?? null} n={i + 1} w={w} />
                </div>
                {body(k)}
              </li>
            ))}
          </ol>
        </div>
        {b.checks.length > 0 && (
          <div data-elab-checks className="flex flex-col gap-2">
            <h3 className="text-base font-extrabold text-slate">{w["fam.elab.checks"]}</h3>
            <ul className="flex flex-col gap-3">
              {b.checks.map((c, i) => (
                <Check key={i} c={c} i={i} w={w} />
              ))}
            </ul>
          </div>
        )}
      </div>
      <span hidden data-tone={tone} />
    </section>
  );
}
