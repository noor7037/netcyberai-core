'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PublicBlock, ResolverEvent } from '@/lib/family/resolver';
import { fill, type Words } from '@/lib/family/fill';
import { SUBJECTS } from '@/lib/family/modules';
import { dataSaverBlocks, droppedCount } from '@/lib/family/data-saver';
import { queueAnswer } from './offline/store';
import { useDataSaver } from './useDataSaver';
import { AiNotice } from './AiNotice';
import { DiagramView, EnglishMomentView, ExplanationView, KeyPointsView, SourcesView, WorkedExampleView } from './blocks/BlockViews';
import dynamic from 'next/dynamic';
import { QuizView } from './blocks/QuizView';
import { VideoPicks } from './VideoPicks';

// The interactive blocks (M2-8) come as their own chunk, only when a response carries one (09 §4: first-load budget).
const InteractiveView = dynamic(() => import('./blocks/InteractiveViews').then((m) => m.InteractiveView));

// Understand (M1-5, C251): asks the server, and draws each checked block as it arrives. Follow-ups stay on the topic
// ("simpler", "another example", "explain differently", "practise more"); this is not an open chat. Every response
// says what it is: "AI-made" until the founder approves it, then "Checked by NetCyberAI". A response from the shared
// library may come with the page (`initial`, C255); then nothing is asked until a follow-up.
// Offline packs (M2-9, C283), when Control has them on (`offline`): with the data-saver on, only text and questions are
// drawn, text first; with no connection, live AI says "Needs internet" and an answer is kept to be checked later.

// A typed question carries no subject: the server decides it (F1-3). From the tutor window (S2, C375) it carries the
// window's subject, the reader's chapter and block, and the files sent with it; the server checks each and keeps the
// answered turn in the child's conversation.
export type TutorAsk = { subject: string; chapterKey?: string; blockId?: string; files?: string[] };
export type UnderstandInput = { kind: 'topic' | 'chapter'; key: string } | { kind: 'question'; text: string; tutor?: TutorAsk };
type Meta = Extract<ResolverEvent, { t: 'meta' }>;
type GoTo = NonNullable<Extract<ResolverEvent, { t: 'refused' }>['goTo']>;
type Ask = { input: UnderstandInput; followUp?: string; retry?: { token: string; choice: number } };

const FOLLOW_UPS = ['simpler', 'another_example', 'differently', 'practise_more'] as const;

export function UnderstandView({ w, input, tone, initial = null, offline = false, onDone }: { w: Words; input: UnderstandInput; tone: string; initial?: ResolverEvent[] | null; offline?: boolean; onDone?: () => void }) {
  const [meta, setMeta] = useState<Meta | null>(() => initial?.find((e): e is Meta => e.t === 'meta') ?? null);
  const [blocks, setBlocks] = useState<PublicBlock[]>(() => (initial ?? []).flatMap((e) => (e.t === 'block' ? [e.block] : [])));
  const [state, setState] = useState<'loading' | 'streaming' | 'done' | 'incomplete' | 'refused'>(initial ? 'done' : 'loading');
  const [refusal, setRefusal] = useState('');
  const [goTo, setGoTo] = useState<GoTo | null>(null);
  const [noInternet, setNoInternet] = useState(false);
  const saver = useDataSaver();
  const saving = offline && saver.state.on;
  const top = useRef<HTMLDivElement>(null);
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
          } else if (e.t === 'block') setBlocks((b) => [...b, e.block]);
          else if (e.t === 'done') {
            setState(e.complete ? 'done' : 'incomplete');
            answered.current?.();
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

  return (
    <div ref={top} className="flex flex-col gap-3" aria-busy={state === 'loading' || state === 'streaming'}>
      {meta && (
        <div className="flex flex-wrap items-center gap-2">
          <span data-label={meta.label} className={`rounded-full px-3 py-1 text-xs font-bold ${meta.label === 'checked' ? 'bg-white text-emerald-text ring-1 ring-emerald-text/40' : 'bg-white text-slate ring-1 ring-slate/20'}`}>
            {meta.label === 'checked' ? w['fam.label.checked'] : w['fam.label.aiMade']}
          </span>
          <AiNotice w={w} made={meta.label} />
        </div>
      )}
      {state === 'refused' && noInternet && (
        <section role="status" data-needs-internet className="fam-card flex flex-col gap-2 bg-white p-5 text-base text-slate">
          <p className="font-bold">{w['fam.offline.pack.needsInternet']}</p>
          <p>{w['fam.offline.pack.needsInternetLead']}</p>
          <a href="/family/offline" className="inline-flex min-h-[44px] items-center self-start rounded-2xl px-1 font-bold text-royal-deep underline-offset-4 hover:underline">
            {w['fam.offline.pack.allChapters']} <span aria-hidden="true">→</span>
          </a>
        </section>
      )}
      {state === 'refused' && !noInternet && (
        <section role="status" className="fam-card flex flex-col gap-3 bg-white p-5 text-base text-slate">
          <p>{refusal}</p>
          {goTo && (
            <Link href={`/family/study?subject=${goTo.subject}`} prefetch={saving ? false : undefined} className="inline-flex min-h-[44px] items-center self-start rounded-2xl px-1 font-bold text-royal-deep underline-offset-4 hover:underline">
              {goTo.label} <span aria-hidden="true">→</span>
            </Link>
          )}
        </section>
      )}
      {saving && droppedCount(blocks, true) > 0 && (
        <p data-saver-note className="rounded-2xl bg-white px-4 py-3 text-sm text-slate ring-1 ring-slate/10">
          {fill(w['fam.dataSaver.skipped'], { n: droppedCount(blocks, true) })}
        </p>
      )}
      {dataSaverBlocks(blocks, saving).map((b) => {
        // Keyed by the block's place in the response, so turning the data-saver on or off keeps each block's state.
        const i = blocks.indexOf(b);
        switch (b.type) {
          case 'explanation':
            return <ExplanationView key={i} b={b} w={w} tone={tone} />;
          case 'worked_example':
            return <WorkedExampleView key={i} b={b} w={w} tone={tone} />;
          case 'key_points':
            return <KeyPointsView key={i} b={b} w={w} tone={tone} />;
          case 'diagram':
            return <DiagramView key={i} b={b} tone={tone} />;
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
          default:
            return null;
        }
      })}
      {(state === 'loading' || state === 'streaming') && (
        <div className="flex flex-col gap-3" aria-hidden="true">
          <div className="h-32 animate-pulse rounded-3xl bg-white motion-reduce:animate-none" />
          <div className="h-20 animate-pulse rounded-3xl bg-white motion-reduce:animate-none" />
        </div>
      )}
      {(state === 'loading' || state === 'streaming') && <p className="sr-only">{w['fam.understand.loading']}</p>}
      {state === 'incomplete' && <p className="rounded-2xl bg-white p-4 text-sm text-slate ring-1 ring-slate/10">{w['fam.understand.incomplete']}</p>}
      {/* M2-5: a topic's video, when the finder has one; the response never depends on it. */}
      {input.kind === 'topic' && (state === 'done' || state === 'incomplete') && <VideoPicks w={w} topicKey={input.key} />}
      {(state === 'done' || state === 'incomplete') && (
        <nav aria-label={w['fam.understand.followUps']} className="grid grid-cols-2 gap-2">
          {FOLLOW_UPS.map((f) => (
            <button key={f} type="button" onClick={() => again({ input, followUp: f })} className="fam-press min-h-[48px] rounded-2xl bg-white px-3 py-2 text-sm font-bold text-royal-deep shadow-md ring-1 ring-royal/15 hover:bg-off-white">
              {w[`fam.followUp.${f}`]}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
