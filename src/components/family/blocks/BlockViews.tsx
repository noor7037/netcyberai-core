'use client';

import { useState } from 'react';
import type { Diagram, EnglishMoment, Explanation, KeyPoints, Sources, WorkedExample } from '@/lib/family/blocks';
import { fill, type Words } from '@/lib/family/fill';

// One component per block type (M1-5, C251): the model's output is data, and only these draw it, as plain text. No
// block is ever rendered as markup. Each card carries its subject's colour (docs/family-app/09 §2).

export const SUBJECT_TONE: Record<string, { bar: string; chip: string; soft: string }> = {
  mathematics: { bar: 'bg-royal', chip: 'bg-royal text-white', soft: 'bg-royal/10' },
  science: { bar: 'bg-emerald-text', chip: 'bg-emerald-text text-white', soft: 'bg-emerald/10' },
};

export function Card({ title, tone, children, tag }: { title: string; tone: string; children: React.ReactNode; tag?: string }) {
  return (
    <section data-block={tag} className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate/10">
      <div className={`h-1.5 ${SUBJECT_TONE[tone]?.bar ?? 'bg-royal'}`} aria-hidden="true" />
      <div className="flex flex-col gap-3 p-4 sm:p-5">
        <h2 className="text-lg font-extrabold text-slate">{title}</h2>
        {children}
      </div>
    </section>
  );
}

export function ExplanationView({ b, w, tone }: { b: Explanation; w: Words; tone: string }) {
  return (
    <Card title={b.title} tone={tone} tag="explanation">
      <p className="text-lg font-semibold leading-relaxed text-slate">{b.idea}</p>
      <div className={`rounded-2xl p-3 ${SUBJECT_TONE[tone]?.soft ?? 'bg-royal/10'}`}>
        <p className="text-sm font-bold text-slate">{w['fam.block.example']}</p>
        <p className="text-base leading-relaxed text-slate">{b.example}</p>
      </div>
      <ol className="flex flex-col gap-2">
        {b.steps.map((s, i) => (
          <li key={i} className="flex gap-3 text-base leading-relaxed text-slate">
            <span aria-hidden="true" className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${SUBJECT_TONE[tone]?.chip ?? 'bg-royal text-white'}`}>
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
            <span aria-hidden="true" className={`mt-2 h-2 w-2 shrink-0 rounded-full ${SUBJECT_TONE[tone]?.bar ?? 'bg-royal'}`} />
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
              <span className="w-full rounded-2xl border-2 bg-white px-4 py-3 text-center text-base font-bold text-slate" style={{ borderColor: color }}>
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
  const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const say = () => {
    if (!canSpeak) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(b.sentence);
    u.lang = 'en-IN';
    u.rate = 0.9;
    u.onend = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(u);
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
