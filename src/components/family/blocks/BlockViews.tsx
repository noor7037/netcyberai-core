'use client';

import { useEffect, useState } from 'react';
import type { Diagram, EnglishMoment, Explanation, KeyPoints, Sources, WorkedExample } from '@/lib/family/blocks';
import { fill, type Words } from '@/lib/family/fill';
import { SUBJECT_THEME } from '@/lib/family/subject-theme';
import { speak } from '@/components/family/english/speech';
import { LESSON_TINT_OF } from '@/lib/design-tokens';
import { TutorAvatar } from '../TutorAvatar';

// One component per block type (M1-5, C251): the model's output is data, and only these draw it, as plain text. No
// block is ever rendered as markup. Each card carries its subject's colour (docs/family-app/09 §2).

// D1 (C230-Q): every subject's colour comes from src/lib/family/subject-theme.ts, so a card in English, Hindi or Social
// Science wears its own colour, not Mathematics' blue. `bar` keeps a solid royal-deep under the gradient for the
// contrast check; `chip` is solid and carries white text at AA.
export const SUBJECT_TONE: Record<string, { bar: string; chip: string; soft: string }> = Object.fromEntries(
  Object.entries(SUBJECT_THEME).map(([k, v]) => [k, { bar: `bg-royal-deep ${v.tile}`, chip: `${v.chip} text-white`, soft: v.soft }])
);

// W8-AI: each block type wears its own colour as well, so a child sees at a glance what kind of block it is: a solid
// left bar and a tinted heading (slate text on a light tint, AA), from the logo tokens. Explanation teal, worked example
// blue, diagram and mind map violet, key points amber, check and practice green, the interactive blocks coral. The
// class strings are literal so Tailwind keeps them; no gradients. A type not listed keeps the subject's colour only.
const INTERACTIVE_TONE = { bar: 'border-l-coral', head: 'bg-coral/15', dot: 'bg-coral' };
const VIOLET_TONE = { bar: 'border-l-violet', head: 'bg-violet/10', dot: 'bg-violet' };
const GREEN_TONE = { bar: 'border-l-leaf', head: 'bg-leaf/15', dot: 'bg-leaf' };
export const BLOCK_TONE: Record<string, { bar: string; head: string; dot: string }> = {
  explanation: { bar: 'border-l-turquoise', head: 'bg-turquoise/15', dot: 'bg-turquoise' },
  worked_example: { bar: 'border-l-royal', head: 'bg-royal/10', dot: 'bg-royal' },
  diagram: VIOLET_TONE,
  mind_map: VIOLET_TONE,
  key_points: { bar: 'border-l-amber', head: 'bg-amber/15', dot: 'bg-amber' },
  check: GREEN_TONE,
  practice: GREEN_TONE,
  graph: INTERACTIVE_TONE,
  number_line: INTERACTIVE_TONE,
  fraction_model: INTERACTIVE_TONE,
  geometry: INTERACTIVE_TONE,
  simulation: INTERACTIVE_TONE,
  slider: INTERACTIVE_TONE,
  model_3d: INTERACTIVE_TONE,
  // W9-C: the figure with the diagrams (violet), steps and the timeline blue, the photograph teal, the videos coral.
  figure: VIOLET_TONE,
  steps: { bar: 'border-l-azure', head: 'bg-azure/10', dot: 'bg-azure' },
  timeline: { bar: 'border-l-azure', head: 'bg-azure/10', dot: 'bg-azure' },
  image: { bar: 'border-l-emerald', head: 'bg-emerald/10', dot: 'bg-emerald' },
  videos: { bar: 'border-l-coral', head: 'bg-coral/15', dot: 'bg-coral' },
};

export function Card({ title, tone, children, tag }: { title: string; tone: string; children: React.ReactNode; tag?: string }) {
  const kind = tag ? BLOCK_TONE[tag] : undefined;
  return (
    <section data-block={tag} data-tint={tag ? (LESSON_TINT_OF[tag] ?? 'mint') : undefined} className={`fam-card fam-rise overflow-hidden bg-white ${kind ? `border-l-[6px] ${kind.bar}` : ''}`}>
      <div data-card-bar className={`h-2 ${SUBJECT_TONE[tone]?.bar ?? 'bg-royal'}`} aria-hidden="true" />
      <div className="flex flex-col gap-3 p-4 sm:p-5">
        <h2 data-block-head className={`flex items-center gap-2 text-lg font-extrabold text-slate ${kind ? `rounded-xl px-3 py-1.5 ${kind.head}` : ''}`}>
          <span aria-hidden="true" data-badge className={`h-2.5 w-2.5 shrink-0 rounded-full ${kind ? kind.dot : (SUBJECT_TONE[tone]?.chip ?? 'bg-royal')}`} />
          {title}
        </h2>
        {children}
      </div>
    </section>
  );
}

// W10-3 (C412): the answer page's first card, the explanation's one-line idea in the tutor's voice, before the numbered
// sections. That explanation then draws without its idea (`lead`), so nothing is said twice.
export function DirectAnswer({ b }: { b: Explanation }) {
  return (
    <section data-direct-answer className="fam-lesson-answer fam-rise">
      <TutorAvatar className="h-12 w-12 shrink-0 sm:h-14 sm:w-14" />
      <p className="fam-lesson-answer-text">{b.idea}</p>
    </section>
  );
}

export function ExplanationView({ b, w, tone, lead = false }: { b: Explanation; w: Words; tone: string; lead?: boolean }) {
  return (
    <Card title={b.title} tone={tone} tag="explanation">
      {!lead && <p data-idea className="text-lg font-semibold leading-relaxed text-slate">{b.idea}</p>}
      {b.paragraphs?.map((para, i) => (
        <p key={i} data-paragraph className="text-base leading-relaxed text-slate">
          {para}
        </p>
      ))}
      <div data-example className={`rounded-2xl p-3 ${SUBJECT_TONE[tone]?.soft ?? 'bg-royal/10'}`}>
        <p className="text-sm font-bold text-slate">{w['fam.block.example']}</p>
        <p className="text-base leading-relaxed text-slate">{b.example}</p>
      </div>
      <ol className="flex flex-col gap-2">
        {b.steps.map((s, i) => (
          <li key={i} className="flex gap-3 text-base leading-relaxed text-slate">
            <span aria-hidden="true" data-num className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${SUBJECT_TONE[tone]?.chip ?? 'bg-royal text-white'}`}>
              {i + 1}
            </span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
      {b.terms.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label={w['fam.block.terms']}>
          {b.terms.map((t, i) => (
            <li key={i} className="rounded-full bg-slate/5 px-3 py-1 text-sm text-slate">
              <span lang="en" className="font-semibold">
                {t.en}
              </span>{' '}
              — {t.local}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function WorkedExampleView({ b, w, tone }: { b: WorkedExample; w: Words; tone: string }) {
  return (
    <Card title={w['fam.block.worked']} tone={tone} tag="worked_example">
      <p className="text-base font-semibold text-slate">{b.problem}</p>
      <ol className="flex flex-col gap-2">
        {b.steps.map((s, i) => (
          <li key={i} className="rounded-2xl bg-off-white p-3 text-base text-slate">
            <p>{s.text}</p>
            {s.expression && (
              <p className="mt-1 font-mono text-sm text-slate/80" lang="en">
                {s.expression} = {s.result}
              </p>
            )}
          </li>
        ))}
      </ol>
      <p className="text-base font-bold text-slate">{fill(w['fam.block.answer'], { answer: b.answer })}</p>
    </Card>
  );
}

export function KeyPointsView({ b, w, tone }: { b: KeyPoints; w: Words; tone: string }) {
  return (
    <Card title={w['fam.block.keyPoints']} tone={tone} tag="key_points">
      <ul className="flex flex-col gap-2">
        {b.points.map((p, i) => (
          <li key={i} className="flex gap-2 text-base text-slate">
            <span aria-hidden="true" data-dot className={`mt-2 h-2 w-2 shrink-0 rounded-full ${SUBJECT_TONE[tone]?.bar ?? 'bg-royal'}`} />
            <span>{p}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// A flow (steps in order, by the edges) or a cycle (nodes round a circle), drawn from the structured description.
export function DiagramView({ b, tone }: { b: Diagram; tone: string }) {
  const color = tone === 'science' ? '#0f766e' : '#1d4ed8';
  if (b.kind === 'cycle') {
    const n = b.nodes.length;
    const r = 110;
    const pos = b.nodes.map((_, i) => ({ x: 160 + r * Math.cos((2 * Math.PI * i) / n - Math.PI / 2), y: 150 + r * Math.sin((2 * Math.PI * i) / n - Math.PI / 2) }));
    return (
      <Card title={b.title} tone={tone} tag="diagram">
        <svg viewBox="0 0 320 300" className="mx-auto w-full max-w-sm" role="img" aria-label={b.title}>
          <defs>
            <marker id="cyc-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" fill={color} />
            </marker>
          </defs>
          <circle cx="160" cy="150" r={r} fill="none" stroke={color} strokeOpacity="0.25" strokeWidth="2" strokeDasharray="4 6" />
          {b.edges.map((e, i) => {
            const a = pos[b.nodes.findIndex((x) => x.id === e.from)];
            const z = pos[b.nodes.findIndex((x) => x.id === e.to)];
            const mx = (a.x + z.x) / 2;
            const my = (a.y + z.y) / 2;
            return <line key={i} x1={a.x + (mx - a.x) * 0.35} y1={a.y + (my - a.y) * 0.35} x2={z.x - (z.x - mx) * 0.35} y2={z.y - (z.y - my) * 0.35} stroke={color} strokeWidth="2" markerEnd="url(#cyc-arrow)" />;
          })}
          {b.nodes.map((node, i) => (
            <g key={node.id}>
              <rect x={pos[i].x - 58} y={pos[i].y - 18} width="116" height="36" rx="12" fill="white" stroke={color} strokeWidth="2" />
              <text x={pos[i].x} y={pos[i].y + 5} textAnchor="middle" fontSize="12" fontWeight="700" fill="#1e293b">
                {node.label.length > 18 ? `${node.label.slice(0, 17)}…` : node.label}
              </text>
            </g>
          ))}
        </svg>
        <ul className="sr-only">
          {b.edges.map((e, i) => (
            <li key={i}>{`${b.nodes.find((n) => n.id === e.from)?.label} → ${b.nodes.find((n) => n.id === e.to)?.label}`}</li>
          ))}
        </ul>
      </Card>
    );
  }
  // A flow: follow the edges from a node nothing points at; any node not reached comes after.
  const order: string[] = [];
  const pointed = new Set(b.edges.map((e) => e.to));
  let at: string | undefined = b.nodes.find((n) => !pointed.has(n.id))?.id ?? b.nodes[0].id;
  while (at && !order.includes(at)) {
    order.push(at);
    at = b.edges.find((e) => e.from === at && !order.includes(e.to))?.to;
  }
  for (const n of b.nodes) if (!order.includes(n.id)) order.push(n.id);
  return (
    <Card title={b.title} tone={tone} tag="diagram">
      <ol className="flex flex-col items-stretch">
        {order.map((id, i) => {
          const node = b.nodes.find((n) => n.id === id)!;
          const next = order[i + 1];
          const edge = next ? b.edges.find((e) => e.from === id && e.to === next) : undefined;
          return (
            <li key={id} className="flex flex-col items-center">
              <span data-flow-node className="w-full rounded-2xl border-2 bg-white px-4 py-3 text-center text-base font-bold text-slate" style={{ borderColor: color }}>
                {node.label}
              </span>
              {next && (
                <span className="flex flex-col items-center py-1 text-sm text-slate/80" aria-hidden={!edge?.label}>
                  <svg viewBox="0 0 20 24" className="h-6 w-5" aria-hidden="true">
                    <path d="M10 0 V18 M3 12 L10 22 L17 12" fill="none" stroke={color} strokeWidth="2.5" />
                  </svg>
                  {edge?.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

export function EnglishMomentView({ b, w, tone }: { b: EnglishMoment; w: Words; tone: string }) {
  const [speaking, setSpeaking] = useState(false);
  // Known only in the browser, after the first paint, so a block drawn with the page matches on both sides. The phone's
  // own speech engine in the Android app, the browser's elsewhere (speech.ts, C230-Y); without either, speak() says so.
  const [canSpeak, setCanSpeak] = useState(false);
  useEffect(() => setCanSpeak(true), []);
  const say = () => {
    if (!canSpeak) return;
    setSpeaking(true);
    void speak(b.sentence, 'en', 0.9).finally(() => setSpeaking(false));
  };
  return (
    <Card title={w['fam.block.english']} tone={tone} tag="english_moment">
      <ul className="flex flex-wrap gap-2">
        {b.words.map((x, i) => (
          <li key={i} className="rounded-2xl bg-grape-deep/10 px-3 py-2 text-sm text-slate">
            <span lang="en" className="font-bold">
              {x.en}
            </span>{' '}
            — {x.meaning}
          </li>
        ))}
      </ul>
      <p lang="en" className="text-lg font-semibold text-slate">
        “{b.sentence}”
      </p>
      <p className="text-sm text-slate/80">
        {w['fam.block.pattern']} <span lang="en">{b.pattern}</span>
      </p>
      <p className="text-sm text-slate/80">
        {w['fam.block.sayIt']} <span lang="en">{b.sayIt}</span>
      </p>
      {canSpeak && (
        <button type="button" onClick={say} disabled={speaking} className="flex min-h-[44px] items-center gap-2 self-start rounded-full bg-grape-deep px-4 text-sm font-bold text-white">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 9v6h4l5 4V5L8 9H4z" />
            <path d="M16 9a3 3 0 0 1 0 6" />
          </svg>
          {w['fam.block.readAloud']}
        </button>
      )}
      {canSpeak && <p className="text-xs text-slate/70">{w['fam.block.deviceVoice']}</p>}
    </Card>
  );
}

export function SourcesView({ b, w, tone }: { b: Sources; w: Words; tone: string }) {
  return (
    <Card title={w['fam.block.sources']} tone={tone} tag="sources">
      <ul className="flex flex-col gap-2">
        {b.links.map((l, i) => (
          <li key={i}>
            <a href={l.url} target="_blank" rel="noopener noreferrer" className="flex min-h-[44px] items-center justify-between gap-2 rounded-2xl bg-off-white px-4 text-sm font-semibold text-royal-deep hover:bg-slate/10">
              <span>{l.label}</span>
              <span aria-hidden="true">↗</span>
            </a>
          </li>
        ))}
      </ul>
    </Card>
  );
}
