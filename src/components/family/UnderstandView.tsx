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
import { isSimScene, placeBlock, unfilled } from '@/lib/family/blocks';
import { boardCursorFromSentence } from '@/lib/family/board';
import { spokenSentences } from '@/lib/family/call';

import { citationOf } from '@/lib/family/citation';
import { useTutorBoard } from './tutor/switches';
import { CitationChip } from './blocks/CitationChip';
import { SceneView } from './blocks/SceneView';
import { ChartView } from './blocks/ChartView';
import { StepsView } from './blocks/StepsView';
import { TimelineView } from './blocks/TimelineView';
import { ImageView } from './blocks/ImageView';
import { VideosView } from './blocks/VideosView';
import { StickyTutorFace } from './avatar/TutorFace';
import type { Reading } from './voice/AnswerSpeaker';
import { avatarState, setAvatarMood } from '@/lib/family/avatar-state';
// The speaker and Teach me load with the first answer drawn, off the Study page's first load (the family budget, W18).
const AnswerSpeaker = dynamic(() => import('./voice/AnswerSpeaker').then((m) => m.AnswerSpeaker));
const TeachMe = dynamic(() => import('./voice/AnswerSpeaker').then((m) => m.TeachMe));

// W9-C: the drawn figure comes as its own chunk, only when a response carries one.
const FigureView = dynamic(() => import('./blocks/FigureView').then((m) => m.FigureView));

// The interactive blocks (M2-8) come as their own chunk, only when a response carries one (09 §4: first-load budget).
const InteractiveView = dynamic(() => import('./blocks/InteractiveViews').then((m) => m.InteractiveView));
// W10-4: a 3D model, its own chunk too, only when an answer carries one.
const Model3DView = dynamic(() => import('./blocks/Model3DView').then((m) => m.Model3DView));
// W19-D: the model block's own small wrapper; the viewer and three.js are chunks it fetches when a model is shown.
// The tap layer (word menu, read from here) is loaded with the answer, not the page (W23 integration: the Study page's
// first-load budget).
const WordTapLayer = dynamic(() => import('./words/WordTapLayer').then((m) => m.WordTapLayer), { ssr: false });
const LabBlockView = dynamic(() => import('./blocks/LabBlockView').then((m) => m.LabBlockView));
const ModelBlockView = dynamic(() => import('./blocks/ModelBlockView').then((m) => m.ModelBlockView));
// W16-A2: the drawing board and the Class 8 Science simulations, each its own chunk, only when an answer carries one.
const BoardView = dynamic(() => import('./blocks/BoardView').then((m) => m.BoardView));
const SimView = dynamic(() => import('./blocks/SimView').then((m) => m.SimView));

// Understand (M1-5, C251): asks the server, and draws each checked block as it arrives. Follow-ups stay on the topic
// ("simpler", "another example", "explain differently", "practise more"); this is not an open chat. Every response
// says what it is: "AI-made" until the founder approves it, then "Checked by NetCyberAI". A response from the shared
// library may come with the page (`initial`, C255); then nothing is asked until a follow-up.
// Offline packs (M2-9, C283), when Control has them on (`offline`): with the data-saver on, only text and questions are
// drawn, text first; with no connection, live AI says "Needs internet" and an answer is kept to be checked later.

// A typed question carries no subject: the server decides it (F1-3). From the tutor window (S2, C375) it carries the
// window's subject, the reader's chapter and block, and the files sent with it; the server checks each and keeps the
// answered turn in the child's conversation.
export type TutorAsk = { subject: string; where?: { kind: string; key: string; topicId?: string; labId?: string }; chatId?: string; chapterKey?: string; blockId?: string; files?: string[]; mode?: 'check'; sketch?: true };
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

// W16-A4: one block of an answer, drawn. The lesson page (`draw`) and the call's board (call/CallBoard.tsx) draw their
// blocks with this one switch, so a figure, a chart or a worked example looks the same in both.
// `sentence` (W16-A2): the explanation's sentence being spoken (the call screen); the board draws up to the step that
// sentence reaches. Absent: the board starts at its first step and the child steps through it.
// `sentences` (W19-D): the answer's spoken sentences, so a model lights the part the sentence `sentence` names.
export function AnswerBlock({ b, w, tone, lead = false, onRetry, onOffline, sentence, sentences }: { b: PublicBlock; w: Words; tone: string; lead?: boolean; onRetry: (token: string, choice: number) => void; onOffline?: typeof queueAnswer; sentence?: number; sentences?: readonly string[] }) {
  // W16-B5: with the Tutor's board switched off in Control, the drawing board and the simulations are left out.
  const boardOn = useTutorBoard();
  switch (b.type) {
    case 'explanation':
      return <ExplanationView b={b} w={w} tone={tone} lead={lead} />;
    case 'worked_example':
      return <WorkedExampleView b={b} w={w} tone={tone} />;
    case 'key_points':
      return <KeyPointsView b={b} w={w} tone={tone} />;
    case 'diagram':
      return <DiagramView b={b} tone={tone} />;
    case 'mind_map':
      return <MindMapView b={b} w={w} tone={tone} />;
    case 'graph':
    case 'number_line':
    case 'fraction_model':
    case 'geometry':
    case 'simulation':
      return <InteractiveView b={b} w={w} tone={tone} />;
    case 'check':
    case 'practice':
      return <QuizView kind={b.type} items={b.items} w={w} tone={tone} onRetry={onRetry} onOffline={onOffline} />;
    case 'english_moment':
      return <EnglishMomentView b={b} w={w} tone={tone} />;
    case 'sources':
      // A chapter is the chip at the top; the card only for links.
      return b.links.length > 0 ? <SourcesView b={b} w={w} tone={tone} /> : null;
    case 'board':
      if (!boardOn) return null;
      return <BoardView b={b} w={w} tone={tone} cursor={sentence === undefined ? undefined : boardCursorFromSentence(b.steps.map((s) => s.say), sentence)} />;
    case 'figure':
      return <FigureView b={b} tone={tone} />;
    case 'model_3d':
      return <Model3DView b={b} w={w} tone={tone} />;
    case 'lab':
      return <LabBlockView b={b} w={w} tone={tone} />;
    case 'model':
      return <ModelBlockView b={b} w={w} tone={tone} sentence={sentence} sentences={sentences} />;
    case 'steps':
      return <StepsView b={b} w={w} tone={tone} />;
    case 'scene':
      if (isSimScene(b)) return boardOn ? <SimView b={b} w={w} tone={tone} /> : null;
      return <SceneView b={b} w={w} tone={tone} />;
    case 'chart':
      return <ChartView b={b} w={w} tone={tone} />;
    case 'timeline':
      return <TimelineView b={b} w={w} tone={tone} />;
    case 'image':
      return <ImageView b={b} w={w} tone={tone} />;
    case 'videos':
      return <VideosView b={b} w={w} />;
    default:
      return null;
  }
}

// `speak` (W18-P1, the tutor window): once the answer is kept (the done line names its message id), "Teach me" and the
// read-aloud button appear under it at once, without a reload, and its boards follow their voice.
export function UnderstandView({ w, input, tone, initial = null, offline = false, onDone, sentence, speak, tutorKey = null }: { w: Words; input: UnderstandInput; tone: string; initial?: ResolverEvent[] | null; offline?: boolean; onDone?: (chat?: { chatId: string; subject: string }) => void; sentence?: number; speak?: { serverVoice: boolean }; tutorKey?: string | null }) {
  const [messageId, setMessageId] = useState<string | null>(null);
  const [spokenAt, setSpokenAt] = useState<number | undefined>(undefined);
  // W22-S3: whether the answer is being read aloud, so the tutor's face stays on screen while it is.
  const [reading, setReading] = useState<Reading>({ speaking: false, percent: 0 });
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
  // W16-A2: where the answer comes from, first: its chapter as soon as the sources block names it, else, once complete,
  // general knowledge.
  const citation = citationOf(shown, state === 'done' || state === 'incomplete');
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
    setMessageId(null);
    setSpokenAt(undefined);
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
            if (typeof e.messageId === 'string') setMessageId(e.messageId);
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

  // W19-A: the tutor thinks while the answer is made and reads along once it is in; leaving a thinking answer, it rests.
  const was = useRef(state);
  useEffect(() => {
    const busy = (x: typeof state) => x === 'loading' || x === 'streaming';
    if (busy(state)) setAvatarMood('thinking');
    else if (busy(was.current)) setAvatarMood(state === 'refused' ? 'idle' : 'reading');
    was.current = state;
  }, [state]);
  useEffect(
    () => () => {
      if (avatarState().mood === 'thinking') setAvatarMood('idle');
    },
    [],
  );

  const again = (ask: Ask) => {
    top.current?.scrollIntoView({ block: 'start' });
    void run(ask);
  };

  // W18-P1: the kept answer's voice: the same words the server voice speaks for that message (call.ts spokenSentences),
  // only once the answer is complete and kept. An answer with nothing to say aloud has no buttons.
  const sentences = speak && messageId && (state === 'done' || state === 'incomplete') ? spokenSentences(shown, Infinity) : [];
  const voice = speak && messageId && sentences.length > 0 ? { messageId, sentences, serverVoice: speak.serverVoice, onSentence: setSpokenAt, onReading: setReading } : null;

  // Keyed by the block's place in the response, so turning the data-saver on or off keeps each block's state.
  const draw = (b: PublicBlock) => {
    const i = blocks.indexOf(b);
    return <AnswerBlock key={i} b={b} w={w} tone={tone} lead={b === lead} onRetry={(token, choice) => again({ input, retry: { token, choice } })} onOffline={offline ? queueAnswer : undefined} sentence={sentence ?? spokenAt} sentences={sentences} />;
  };

  return (
    <div ref={top} className="fam-lesson flex flex-col gap-3" aria-busy={state === 'loading' || state === 'streaming'}>
      {(state === 'loading' || state === 'streaming' || reading.speaking || reading.started) && (
        <StickyTutorFace
          tutorKey={tutorKey}
          label={reading.speaking ? w['fam.tutor.readingNow'] : reading.started ? w['fam.tutor.resume'] : w['fam.understand.loading']}
          percent={reading.speaking || reading.started ? reading.percent : undefined}
          speaking={reading.speaking}
          onToggle={reading.speaking || reading.started ? reading.toggle : undefined}
          toggleLabel={w[reading.speaking ? 'fam.tutor.pause' : 'fam.tutor.resume']}
        />
      )}
      <WordTapLayer root={top} w={w} sentences={sentences} onReadFrom={reading.from} />
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
      {citation && <CitationChip w={w} c={citation} />}
      {lead && <DirectAnswerCard w={w} b={lead} />}
      {voice && <TeachMe w={w} {...voice} root={top} />}
      {model && (
        <button type="button" data-show-model onClick={() => showModel(top.current)} className="fam-press fam-lesson-chip min-h-[44px] self-start rounded-full bg-white px-4 text-sm font-bold text-ink">
          {w['fam.understand.show3d']}
        </button>
      )}
      {drawn.filter((b) => b.type !== 'videos').map((b) => draw(b))}
      {voice && <AnswerSpeaker w={w} {...voice} root={top} />}
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
