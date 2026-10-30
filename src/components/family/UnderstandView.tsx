'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PublicBlock, ResolverEvent } from '@/lib/family/resolver';
import type { BlockType, Explanation } from '@/lib/family/blocks';
import { fill, type Words } from '@/lib/family/fill';
import { SUBJECTS } from '@/lib/family/modules';
import { dataSaverBlocks, droppedCount } from '@/lib/family/data-saver';
import { queueAnswer } from './offline/store';
import { useDataSaver } from './useDataSaver';
import { AiNotice } from './AiNotice';
import { DiagramView, DirectAnswer, EnglishMomentView, ExplanationView, KeyPointsView, SourcesView, WorkedExampleView } from './blocks/BlockViews';
import dynamic from 'next/dynamic';
import { QuizView } from './blocks/QuizView';
import { MindMapView } from './blocks/MindMapView';
import { VideoPicks } from './VideoPicks';
import { placeBlock, unfilled } from '@/lib/family/blocks';
import { SceneView } from './blocks/SceneView';
import { ChartView } from './blocks/ChartView';
import { StepsView } from './blocks/StepsView';
import { TimelineView } from './blocks/TimelineView';
import { ImageView } from './blocks/ImageView';
import { VideosView } from './blocks/VideosView';

// W9-C: the drawn figure comes as its own chunk, only when a response carries one.
const FigureView = dynamic(() => import('./blocks/FigureView').then((m) => m.FigureView));

// The interactive blocks (M2-8) come as their own chunk, only when a response carries one (09 §4: first-load budget).
const InteractiveView = dynamic(() => import('./blocks/InteractiveViews').then((m) => m.InteractiveView));
// W10-4: a 3D model, its own chunk too, only when an answer carries one.
const Model3DView = dynamic(() => import('./blocks/Model3DView').then((m) => m.Model3DView));

// Understand (M1-5, C251): asks the server, and draws each checked block as it arrives. Follow-ups stay on the topic
// ("simpler", "another example", "explain differently", "practise more"); this is not an open chat. Every response
// says what it is: "AI-made" until the founder approves it, then "Checked by NetCyberAI". A response from the shared
// library may come with the page (`initial`, C255); then nothing is asked until a follow-up.
// Offline packs (M2-9, C283), when Control has them on (`offline`): with the data-saver on, only text and questions are
// drawn, text first; with no connection, live AI says "Needs internet" and an answer is kept to be checked later.

// A typed question carries no subject: the server decides it (F1-3). From the tutor window (S2, C375) it carries the
// window's subject, the reader's chapter and block, and the files sent with it; the server checks each and keeps the
// answered turn in the child's conversation.
export type TutorAsk = { subject: string; chatId?: string; chapterKey?: string; blockId?: string; files?: string[] };
export type UnderstandInput = { kind: 'topic' | 'chapter'; key: string } | { kind: 'question'; text: string; tutor?: TutorAsk };
type Meta = Extract<ResolverEvent, { t: 'meta' }>;
type GoTo = NonNullable<Extract<ResolverEvent, { t: 'refused' }>['goTo']>;
type Ask = { input: UnderstandInput; followUp?: string; retry?: { token: string; choice: number } };

const FOLLOW_UPS = ['simpler', 'another_example', 'differently', 'practise_more'] as const;
type ExplanationBlock = Extract<PublicBlock, { type: 'explanation' }>;
// W10 (C411): the blocks the completeness notice may name (the server's coreBlocks), in plain words.
const GAP_PARTS: readonly BlockType[] = ['explanation', 'check', 'practice'];

// "check questions and practice questions"; "explanation, check questions and practice questions".
export function gapNotice(w: Words, gap: { missing: readonly BlockType[]; cut: boolean }): string[] {
  const parts = gap.missing.filter((b) => GAP_PARTS.includes(b)).map((b) => w[`fam.understand.part.${b}`] ?? b);
  const and = w['fam.understand.and'] ?? 'and';
  const named = parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} ${and} ${parts[parts.length - 1]}`;
  return [...(parts.length > 0 ? [fill(w['fam.understand.missing'], { parts: named })] : []), ...(gap.cut ? [w['fam.understand.cut']] : [])];
}

// W10-4 (C413): the direct answer under its heading, the first card of every answer (the lesson page, a typed question,
// a kept answer in the tutor's feed).
export function DirectAnswerCard({ w, b }: { w: Words; b: Explanation }) {
  return (
    <div data-direct-answer-card className="flex flex-col gap-1">
      <p className="fam-lesson-eyebrow">{w['fam.understand.directAnswer']}</p>
      <DirectAnswer b={b} />
    </div>
  );
}

// W10-4: "Show 3D model" brings the answer's model into view (and moves focus to it), when the answer carries one.
function showModel(root: HTMLElement | null) {
  const model = root?.querySelector<HTMLElement>('[data-block="model_3d"]');
  if (!model) return;
  model.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  model.setAttribute('tabindex', '-1');
  model.focus({ preventScroll: true });
}

export function UnderstandView({ w, input, tone, initial = null, offline = false, onDone }: { w: Words; input: UnderstandInput; tone: string; initial?: ResolverEvent[] | null; offline?: boolean; onDone?: (chat?: { chatId: string; subject: string }) => void }) {
  const [meta, setMeta] = useState<Meta | null>(() => initial?.find((e): e is Meta => e.t === 'meta') ?? null);
  const [blocks, setBlocks] = useState<PublicBlock[]>(() => (initial ?? []).flatMap((e) => (e.t === 'block' ? [e.block] : [])));
  const [state, setState] = useState<'loading' | 'streaming' | 'done' | 'incomplete' | 'refused'>(initial ? 'done' : 'loading');
  const [refusal, setRefusal] = useState('');
  // W4-1 (C385): what became of the files sent with a tutor question.
  const [filesNote, setFilesNote] = useState('');
  const [goTo, setGoTo] = useState<GoTo | null>(null);
  const [gap, setGap] = useState<{ missing: BlockType[]; cut: boolean }>({ missing: [], cut: false });
  const [noInternet, setNoInternet] = useState(false);
  const saver = useDataSaver();
  const saving = offline && saver.state.on;
  // A photograph or video list the server has not filled yet is never drawn, nor counted as left out (W9-C).
  const shown = blocks.filter((b) => !unfilled(b));
  const top = useRef<HTMLDivElement>(null);
  // W10-3 (C412), W10-4 (C413): every answer wears the lesson identity (`.fam-lesson`, family.css), a typed question too:
  // a direct-answer card first, the numbered sections, the follow-ups, then the videos.
  const drawn = dataSaverBlocks(shown, saving);
  const lead = drawn.find((b): b is ExplanationBlock => b.type === 'explanation');
  const model = drawn.some((b) => b.type === 'model_3d');
  // Only the latest request may draw: an earlier one (a follow-up tapped twice, React's double run in development) is
  // aborted and anything it still sends is ignored.
  const current = useRef<AbortController | null>(null);
  // Told when an answer is complete (the tutor window refreshes its conversation); a ref, so a new callback never asks
  // again.
  const answered = useRef(onDone);
  answered.current = onDone;

  const run = useCallback(async (ask: Ask) => {
    current.current?.abort();
    const mine = new AbortController();
    current.current = mine;
    setState('loading');
    setBlocks([]);
    setFilesNote('');
    setGap({ missing: [], cut: false });
    setRefusal('');
    setGoTo(null);
    setNoInternet(false);
    if (offline && navigator.onLine === false) {
      setNoInternet(true);
      return setState('refused');
    }
    try {
      const res = await fetch('/api/family/understand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...ask.input, followUp: ask.followUp, retry: ask.retry }),
        signal: mine.signal,
      });
      // W9-A (C406): the chat filled up before this question; the tutor window reads its chats again.
      if (res.status === 409 && ask.input.kind === 'question' && ask.input.tutor) {
        const subject = ask.input.tutor.subject;
        setRefusal(w['fam.chat.full'] ? fill(w['fam.chat.full'], { subject: w[`fam.subject.${subject}`] ?? subject }) : w['fam.err.network']);
        answered.current?.();
        return setState('refused');
      }
      if (!res.ok || !res.body) {
        setRefusal(w['fam.err.network']);
        return setState('refused');
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done || current.current !== mine) break;
        buf += decoder.decode(value, { stream: true });
        let nl = buf.indexOf('\n');
        while (nl >= 0) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          nl = buf.indexOf('\n');
          if (!line.trim() || current.current !== mine) continue;
          const e = JSON.parse(line) as ResolverEvent;
          if (e.t === 'meta') {
            setMeta(e);
            setState('streaming');
          } else if (e.t === 'block') setBlocks((b) => placeBlock(b, e.block));
          else if (e.t === 'files') setFilesNote(e.message);
          else if (e.t === 'done') {
            // W10 (C411): the notice only when a block the plan asked for never came or the answer was cut, naming it.
            const missing = Array.isArray(e.missing) ? e.missing.filter((b) => GAP_PARTS.includes(b)) : [];
            setGap({ missing, cut: e.cut === true });
            setState(missing.length > 0 || e.cut === true ? 'incomplete' : 'done');
            answered.current?.(e.chat);
          }
          else if (e.t === 'refused') {
            setRefusal(e.message);
            setGoTo(e.goTo && (SUBJECTS as readonly string[]).includes(e.goTo.subject) ? e.goTo : null);
            setState('refused');
          }
        }
      }
    } catch {
      if (current.current !== mine) return;
      setRefusal(w['fam.err.network']);
      setNoInternet(offline && navigator.onLine === false);
      setState('refused');
    }
  }, [w, offline]);

  useEffect(() => {
    if (!initial) void run({ input });
    return () => current.current?.abort();
  }, [input, run, initial]);

  const again = (ask: Ask) => {
    top.current?.scrollIntoView({ block: 'start' });
    void run(ask);
  };

  const draw = (b: PublicBlock) => {
    // Keyed by the block's place in the response, so turning the data-saver on or off keeps each block's state.
    const i = blocks.indexOf(b);
    switch (b.type) {
      case 'explanation':
        return <ExplanationView key={i} b={b} w={w} tone={tone} lead={b === lead} />;
      case 'worked_example':
        return <WorkedExampleView key={i} b={b} w={w} tone={tone} />;
      case 'key_points':
        return <KeyPointsView key={i} b={b} w={w} tone={tone} />;
      case 'diagram':
        return <DiagramView key={i} b={b} tone={tone} />;
      case 'mind_map':
        return <MindMapView key={i} b={b} w={w} tone={tone} />;
      case 'graph':
      case 'number_line':
      case 'fraction_model':
      case 'geometry':
      case 'simulation':
        return <InteractiveView key={i} b={b} w={w} tone={tone} />;
      case 'check':
      case 'practice':
        return <QuizView key={i} kind={b.type} items={b.items} w={w} tone={tone} onRetry={(token, choice) => again({ input, retry: { token, choice } })} onOffline={offline ? queueAnswer : undefined} />;
      case 'english_moment':
        return <EnglishMomentView key={i} b={b} w={w} tone={tone} />;
      case 'sources':
        return <SourcesView key={i} b={b} w={w} tone={tone} />;
      case 'figure':
        return <FigureView key={i} b={b} tone={tone} />;
      case 'model_3d':
        return <Model3DView key={i} b={b} w={w} tone={tone} />;
      case 'steps':
        return <StepsView key={i} b={b} w={w} tone={tone} />;
      case 'scene':
        return <SceneView key={i} b={b} w={w} tone={tone} />;
      case 'chart':
        return <ChartView key={i} b={b} w={w} tone={tone} />;
      case 'timeline':
        return <TimelineView key={i} b={b} tone={tone} />;
      case 'image':
        return <ImageView key={i} b={b} w={w} tone={tone} />;
      case 'videos':
        return <VideosView key={i} b={b} w={w} />;
      default:
        return null;
    }
  };

  return (
    <div ref={top} className="fam-lesson flex flex-col gap-3" aria-busy={state === 'loading' || state === 'streaming'}>
      {filesNote && (
        <p role="status" data-files-note className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate ring-1 ring-slate/10">
          {filesNote}
        </p>
      )}
      {meta && (
        <div className="flex flex-wrap items-center gap-2">
          <span data-label={meta.label} className={`rounded-full px-3 py-1 text-xs font-bold ${meta.label === 'checked' ? 'bg-emerald text-white' : 'bg-grape-deep text-white'}`}>
            {meta.label === 'checked' ? w['fam.label.checked'] : w['fam.label.aiMade']}
          </span>
          <AiNotice w={w} made={meta.label} />
        </div>
      )}
      {state === 'refused' && noInternet && (
        <section role="status" data-needs-internet className="fam-card flex flex-col gap-2 bg-white p-5 text-base text-slate">
          <p className="font-bold">{w['fam.offline.pack.needsInternet']}</p>
          <p>{w['fam.offline.pack.needsInternetLead']}</p>
          <a href="/family/offline" className="inline-flex min-h-[44px] items-center self-start rounded-2xl px-1 font-bold text-ink underline decoration-saffron decoration-2 underline-offset-4">
            {w['fam.offline.pack.allChapters']} <span aria-hidden="true">→</span>
          </a>
        </section>
      )}
      {state === 'refused' && !noInternet && (
        <section role="status" className="fam-card flex flex-col gap-3 bg-white p-5 text-base text-slate">
          <p>{refusal}</p>
          {goTo && (
            <Link href={`/family/study?subject=${goTo.subject}`} prefetch={saving ? false : undefined} className="inline-flex min-h-[44px] items-center self-start rounded-2xl px-1 font-bold text-ink underline decoration-saffron decoration-2 underline-offset-4">
              {goTo.label} <span aria-hidden="true">→</span>
            </Link>
          )}
        </section>
      )}
      {saving && droppedCount(shown, true) > 0 && (
        <p data-saver-note className="rounded-2xl bg-white px-4 py-3 text-sm text-slate ring-1 ring-slate/10">
          {fill(w['fam.dataSaver.skipped'], { n: droppedCount(shown, true) })}
        </p>
      )}
      {lead && <DirectAnswerCard w={w} b={lead} />}
      {model && (
        <button type="button" data-show-model onClick={() => showModel(top.current)} className="fam-press fam-lesson-chip min-h-[44px] self-start rounded-full bg-white px-4 text-sm font-bold text-ink">
          {w['fam.understand.show3d']}
        </button>
      )}
      {drawn.filter((b) => b.type !== 'videos').map((b) => draw(b))}
      {(state === 'loading' || state === 'streaming') && (
        <div className="flex flex-col gap-3" aria-hidden="true">
          <div className="h-32 animate-pulse rounded-3xl bg-white motion-reduce:animate-none" />
          <div className="h-20 animate-pulse rounded-3xl bg-white motion-reduce:animate-none" />
        </div>
      )}
      {(state === 'loading' || state === 'streaming') && <p className="sr-only">{w['fam.understand.loading']}</p>}
      {state === 'incomplete' && gapNotice(w, gap).length > 0 && <p data-answer-gap className="rounded-2xl bg-white p-4 text-sm text-slate ring-1 ring-slate/10">{gapNotice(w, gap).join(' ')}</p>}
      {(state === 'done' || state === 'incomplete') && (
        <nav aria-label={w['fam.understand.followUps']} data-follow-ups className="grid grid-cols-2 gap-2">
          <p aria-hidden="true" className="fam-lesson-eyebrow col-span-2">
            {w['fam.understand.followUps']}
          </p>
          {FOLLOW_UPS.map((f) => (
            <button key={f} type="button" onClick={() => again({ input, followUp: f })} className="fam-press fam-lesson-chip min-h-[48px] rounded-2xl bg-white px-3 py-2 text-sm font-bold text-ink">
              {w[`fam.followUp.${f}`]}
            </button>
          ))}
        </nav>
      )}
      {/* W10-3: the videos come last, after the follow-ups. */}
      {drawn.filter((b) => b.type === 'videos').map((b) => draw(b))}
      {/* M2-5: a topic's video, when the finder has one; the response never depends on it. */}
      {input.kind === 'topic' && (state === 'done' || state === 'incomplete') && !shown.some((b) => b.type === 'videos') && <VideoPicks w={w} topicKey={input.key} />}
    </div>
  );
}
