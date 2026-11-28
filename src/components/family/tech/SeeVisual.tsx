'use client';

import { useEffect, useRef, useState } from 'react';
import type { StrandInfo, TechDiagram } from '@/lib/family/tech/types';
import { pick, type TechLang } from '@/lib/family/tech/text';
import { tw } from '@/lib/family/tech/words';

// The See-step pictures from the prototype (tl.js visual): flow, cycle, stack, tokens, compare, bits, a Level 1 scene,
// and (C557) an emoji, a parts diagram that lights the part being explained, and honest stand-ins: a lab step shows a
// card that opens its lab, a code step shows the rule in code type, and an animation not drawn yet shows the step's own
// key idea and terms, marked so (src/lib/family/tech/validate.ts lists every kind).

function motionOn(): boolean {
  if (typeof window === 'undefined') return true;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  return document.querySelector('[data-fam-motion="off"]') == null;
}

function useMotion() {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const read = () => setOn(motionOn());
    read();
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    media.addEventListener('change', read);
    return () => media.removeEventListener('change', read);
  }, []);
  return on;
}

const splitNode = (value: string) => {
  const match = value.match(/^((?:\p{Regional_Indicator}{2})|\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*)\s*(.*)$/u);
  return match ? { emoji: match[1], label: match[2] } : { emoji: '•', label: value };
};

function wrapLabel(text: string): string[] {
  const lines: string[] = [];
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    if (lines.length && `${lines[lines.length - 1]} ${word}`.length <= 16) lines[lines.length - 1] += ` ${word}`;
    else lines.push(word);
  }
  return lines.length > 3 ? [...lines.slice(0, 2), lines.slice(2).join(' ')] : lines;
}

function Flow({ nodes, ring, level, motion, wide }: { nodes: string[]; ring: boolean; level: number; motion: boolean; wide: boolean }) {
  const count = Math.max(1, nodes.length);
  const row = wide && count <= 4;
  const width = row && !ring ? Math.max(340, 60 + (count - 1) * 170) : 340;
  const height = ring ? 330 : row ? 190 : Math.max(170, count * 78 + 70);
  let points: [number, number][];
  if (count === 1) points = [[width / 2, height / 2]];
  else if (ring) points = nodes.map((_, index) => {
    const angle = -Math.PI / 2 + (index / count) * Math.PI * 2;
    return [width / 2 + Math.cos(angle) * 100, height / 2 + Math.sin(angle) * 92];
  });
  else if (row) points = nodes.map((_, index) => [30 + (index * (width - 60)) / Math.max(1, count - 1), 70]);
  else points = nodes.map((_, index) => [index % 2 ? 230 : 110, 40 + index * 74]);
  const path = points.map((point, index) => `${index ? 'L' : 'M'}${point[0]} ${point[1]}`).join(' ') + (ring ? ' Z' : '');
  const colour = level === 3 ? '#A78BFA' : level === 2 ? '#14B8A6' : '#E8702A';
  const ink = level === 3 ? '#1E1B4B' : '#fff';
  return (
    <svg viewBox={'0 0 ' + width + ' ' + height} role="img" aria-label={nodes.join(' → ')} style={{ width: '100%', maxWidth: row && !ring ? 640 : 380 }}>
      <path d={path} fill="none" stroke={colour} strokeOpacity="0.28" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
      <path d={path} fill="none" stroke={colour} strokeWidth="3" strokeDasharray="6 10" strokeLinecap="round" />
      {points.map((point, index) => {
        const node = splitNode(nodes[index] ?? '');
        const lines = wrapLabel(node.label);
        return (
          <g key={`${node.label}-${index}`}>
            <circle cx={point[0]} cy={point[1]} r="25" fill={ink} stroke={colour} strokeWidth="3" />
            <text x={point[0]} y={point[1] + 8} textAnchor="middle" fontSize="22">{node.emoji}</text>
            <text x={point[0]} y={point[1] + 44} textAnchor="middle" fontSize="12.5" fontWeight="700" fill="currentColor">
              {lines.map((line, lineIndex) => (
                <tspan key={lineIndex} x={point[0]} dy={lineIndex ? 14 : 0}>{line}</tspan>
              ))}
            </text>
          </g>
        );
      })}
      {count > 1 && motion ? <circle r="7" fill={colour}><animateMotion dur={`${0.9 * count}s`} repeatCount="indefinite" path={path} /></circle> : null}
    </svg>
  );
}

const STACK_COLOURS = ['#8B3DFF', '#1D4ED8', '#14B8A6', '#FF7A1A', '#FFD23F', '#FF6B57'];
const STACK_INK = ['#fff', '#fff', '#1E293B', '#1E293B', '#1E293B', '#1E293B'];

function Concept({ emoji, level }: { emoji: string; level: number }) {
  const background = level === 3 ? 'linear-gradient(140deg,#8B3DFF,#1D4ED8)' : level === 2 ? 'linear-gradient(140deg,#2DD4BF,#0F766E)' : 'linear-gradient(140deg,#FFE27A,#F5B90A)';
  return (
    <div className="tl-concept" style={{ background }} aria-hidden="true">
      <span>{emoji}</span>
    </div>
  );
}

function useWideStage() {
  const ref = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setWide(el.clientWidth > 520);
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, wide };
}

// `focus` and `values` come from the beat being narrated (guided mode, or the beat the child stepped to).
export type SeeExtras = { caption?: string; narration?: string; terms?: string[]; diagram?: TechDiagram; focus?: string; values?: Record<string, string>; labName?: string; onLab?: () => void };

export function SeeVisual({ spec, level, strand, lang, extras = {} }: { spec: string; level: number; strand?: StrandInfo; lang: TechLang; extras?: SeeExtras }) {
  const motion = useMotion();
  const stage = useWideStage();
  const visual = String(spec || '');
  const colon = visual.indexOf(':');
  const kind = colon < 0 ? '' : visual.slice(0, colon);
  const body = colon < 0 ? '' : visual.slice(colon + 1);
  const dark = level === 3;
  if (extras.diagram) {
    return (
      <div ref={stage.ref} className={`tl-stage${dark ? ' dark' : ''}`}>
        <Diagram diagram={extras.diagram} lang={lang} focus={extras.focus} values={extras.values} motion={motion} />
      </div>
    );
  }
  if (kind === 'icon') {
    return (
      <div ref={stage.ref} className={`tl-stage${dark ? ' dark' : ''}`} data-visual="icon">
        <div className="tl-icon-card"><span aria-hidden="true">{body.trim() || '✨'}</span>{extras.caption && <p>{extras.caption}</p>}</div>
      </div>
    );
  }
  if (kind === 'lab') {
    return (
      <div ref={stage.ref} className={`tl-stage${dark ? ' dark' : ''}`} data-visual="lab">
        <div className="tl-standin">
          <span className="tl-pill tl-pill-lab">{`🧪 ${extras.labName || body.split('#')[0]}`}</span>
          {extras.caption && <p className="tl-standin-main">{extras.caption}</p>}
          {extras.onLab && <button type="button" className="tl-btn tl-btn-go" onClick={extras.onLab}>{tw(lang, 'openLab')}</button>}
        </div>
      </div>
    );
  }
  if (visual === 'code') {
    const lines = (extras.narration || extras.caption || '').split(/(?<=[.:;])\s+/).filter(Boolean);
    return (
      <div ref={stage.ref} className={`tl-stage${dark ? ' dark' : ''}`} data-visual="code">
        <pre className="tl-code" lang="en">{lines.join('\n')}</pre>
      </div>
    );
  }
  if (kind === 'anim' || !kind) {
    // An animation not drawn yet: the step's own process when its words give one (a → b → c), else its key idea and
    // the lesson's terms it uses. Never an unrelated picture.
    const words = `${extras.caption ?? ''} ${extras.narration ?? ''}`;
    const chain = words.match(/[^.:;!?]*?(?:\s*→\s*[^.;:!?→]+){2,}/)?.[0];
    const nodes = chain ? chain.split('→').map((part) => part.trim().split(/[,(]/)[0].trim()).filter((part) => part && part.length <= 40) : [];
    if (nodes.length >= 3 && nodes.length <= 7) {
      return (
        <div ref={stage.ref} className={`tl-stage${dark ? ' dark' : ''}`} data-visual="anim-flow">
          <Flow nodes={nodes} ring={false} level={level} motion={motion} wide={stage.wide} />
        </div>
      );
    }
    if (extras.caption) {
      const terms = (extras.terms ?? []).filter((term) => words.toLowerCase().includes(term.toLowerCase())).slice(0, 4);
      return (
        <div ref={stage.ref} className={`tl-stage${dark ? ' dark' : ''}`} data-visual="key-idea">
          <div className="tl-standin">
            <span className="tl-pill">{`${strand?.e ?? '💡'} ${tw(lang, 'keyIdea')}`}</span>
            <p className="tl-standin-main">{extras.caption}</p>
            {terms.length > 0 && <div className="tl-chips">{terms.map((term) => <span key={term} className="tl-chip">{term}</span>)}</div>}
          </div>
        </div>
      );
    }
  }
  if (kind === 'scene' && body.trim()) {
    const src = `/family/tech/labs/L1/scene.html?id=${encodeURIComponent(body.trim())}&lang=${encodeURIComponent(lang)}&cap=0&ui=0`;
    return (
      <div ref={stage.ref} className={`tl-stage${dark ? ' dark' : ''}`}>
        <iframe className="tl-scene" src={src} title={extras.caption || tw(lang, 'see')} loading="lazy" sandbox="allow-scripts allow-same-origin" />
      </div>
    );
  }
  if (kind === 'flow' || kind === 'cycle') {
    const nodes = body.split(body.includes('>') ? '>' : '|').map((part) => part.trim()).filter(Boolean);
    return (
      <div ref={stage.ref} className={`tl-stage${dark ? ' dark' : ''}`}>
        <Flow nodes={nodes.length ? nodes : [body || '•']} ring={kind === 'cycle'} level={level} motion={motion} wide={stage.wide} />
      </div>
    );
  }
  if (kind === 'stack') {
    const layers = body.split('|').map((part) => part.trim()).filter(Boolean);
    return (
      <div ref={stage.ref} className={`tl-stage${dark ? ' dark' : ''}`}>
        <div className="tl-stack">
          {layers.map((layer, index) => (
            <div key={`${layer}-${index}`} className="tl-layer" style={{ background: STACK_COLOURS[index % 6], color: STACK_INK[index % 6], animationDelay: motion ? `${index * 140}ms` : undefined }}>{layer}</div>
          ))}
        </div>
      </div>
    );
  }
  if (kind === 'tokens') {
    const parts = body.trim().match(/\s?[\p{L}\p{M}\p{N}]+|\s?[^\s\p{L}\p{M}\p{N}]/gu) ?? [];
    const colours = ['#FFE7A3', '#B8E6CF', '#A9D6F5', '#D9CCF6', '#FFB4A2'];
    return (
      <div ref={stage.ref} className={`tl-stage${dark ? ' dark' : ''}`}>
        <div className="tl-tokens">
          {parts.map((part, index) => {
            let hash = 0;
            for (const char of part) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % 50000;
            return (
              <span key={`${part}-${index}`} className="tl-token" style={{ background: colours[index % 5] }}>
                <span>{part.replace(/ /g, '·')}</span>
                <small>{hash}</small>
              </span>
            );
          })}
        </div>
      </div>
    );
  }
  if (kind === 'compare') {
    const [left, right] = body.split('|').map((part) => part.trim());
    return (
      <div ref={stage.ref} className={`tl-stage${dark ? ' dark' : ''}`}>
        <div className="tl-compare">
          <div style={{ background: '#A9D6F5' }}>{left}</div>
          <span>{tw(lang, 'versus')}</span>
          <div style={{ background: '#FFE7A3' }}>{right}</div>
        </div>
      </div>
    );
  }
  if (kind === 'bits') {
    const bits = (body.replace(/[^01]/g, '').slice(0, 16) || '01000001');
    const decimal = Number.parseInt(bits, 2);
    const character = decimal >= 32 && decimal <= 126 ? String.fromCharCode(decimal) : '';
    return (
      <div ref={stage.ref} className={`tl-stage${dark ? ' dark' : ''}`}>
        <div className="tl-bits">
          <div>
            {[...bits].map((bit, index) => (
              <span key={index} className={bit === '1' ? 'on' : ''}>{bit}</span>
            ))}
          </div>
          <p>{`= ${decimal}${character ? ` = "${character}"` : ''}`}</p>
        </div>
      </div>
    );
  }
  return (
    <div ref={stage.ref} className={`tl-stage${dark ? ' dark' : ''}`}>
      <Concept emoji={strand?.e || '✨'} level={level} />
    </div>
  );
}

// A parts diagram (C557): rows of parts joined left to right, extra links listed under it, the part being explained lit
// and the rest dimmed, with a value on a part when the beat gives one (a register, a memory cell). Plain HTML, so it
// reads at any width, stays still under reduced motion, and says the lit part in words for a screen reader.
function Diagram({ diagram, lang, focus, values = {}, motion }: { diagram: TechDiagram; lang: TechLang; focus?: string; values?: Record<string, string>; motion: boolean }) {
  const byId = new Map(diagram.parts.map((part) => [part.id, part]));
  const lit = focus ? byId.get(focus) : undefined;
  return (
    <figure className={`tl-diagram${focus ? ' focusing' : ''}${motion ? '' : ' still'}`} aria-label={diagram.parts.map((part) => pick(lang, part.label)).join(', ')}>
      {diagram.rows.map((row, r) => (
        <div key={r} className="tl-drow">
          {row.map((id, i) => {
            const part = byId.get(id);
            if (!part) return null;
            return (
              <span key={id} className="tl-dcell">
                {i > 0 && <span className="tl-darrow" aria-hidden="true">→</span>}
                <span className={`tl-dpart${focus === id ? ' on' : ''}`} data-part={id} aria-current={focus === id ? 'true' : undefined}>
                  {part.icon && <span className="tl-dicon" aria-hidden="true">{part.icon}</span>}
                  <b>{pick(lang, part.label)}</b>
                  {values[id] != null && <span className="tl-dval">{values[id]}</span>}
                </span>
              </span>
            );
          })}
        </div>
      ))}
      {(diagram.links ?? []).length > 0 && (
        <ul className="tl-dlinks">
          {(diagram.links ?? []).map((link, i) => (
            <li key={i} className={focus && (link.from === focus || link.to === focus) ? 'on' : ''}>{`${pick(lang, byId.get(link.from)?.label)} ↔ ${pick(lang, byId.get(link.to)?.label)}${link.label ? `: ${pick(lang, link.label)}` : ''}`}</li>
          ))}
        </ul>
      )}
      {lit?.note && <figcaption className="tl-dnote" aria-live="polite">{`${pick(lang, lit.label)}: ${pick(lang, lit.note)}`}</figcaption>}
    </figure>
  );
}
