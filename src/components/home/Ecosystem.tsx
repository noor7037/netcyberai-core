'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Icon } from '@/components/visual/Icons';
import { ECO_CORE, ECO_MODULES, ECO_ROLES, type EcoRoleId } from '@/content/ecosystem';
import { usePrefersReducedMotion } from '@/lib/hooks';

// The founder's "NetCyberAI connects the entire school" artwork, rebuilt
// as live HTML and SVG: every word is real, selectable text. The core
// pulses, its ring turns, and a loop lights up each role in turn with
// data flowing along its connector; module tiles light up one by one.
// Hovering or focusing a role holds the loop on it. With reduced motion
// everything is still and complete.

// Clockwise around the core, so the highlight travels in a circle.
const LOOP: EcoRoleId[] = ['school', 'principal', 'teacher', 'parent', 'student'];

const COLORS: Record<EcoRoleId, { a: string; b: string; eco: string; bg: string }> = {
  school: { a: '#1D4ED8', b: '#2563EB', eco: '#1D4ED8', bg: 'bg-royal' },
  principal: { a: '#6D28D9', b: '#4400F0', eco: '#7C3AED', bg: 'bg-grape-deep' },
  teacher: { a: '#C2410C', b: '#9A3412', eco: '#EA580C', bg: 'bg-tangerine-deep' },
  student: { a: '#047857', b: '#0F766E', eco: '#16A34A', bg: 'bg-emerald' },
  parent: { a: '#C2410C', b: '#B42318', eco: '#F97316', bg: 'bg-coral-deep' },
};

const TILE_BG = ['bg-royal', 'bg-emerald', 'bg-tangerine-deep', 'bg-grape-deep', 'bg-coral-deep', 'bg-azure', 'bg-emerald', 'bg-gold-deep', 'bg-coral-deep', 'bg-sapphire', 'bg-royal-deep'];

const AREA: Record<EcoRoleId, string> = {
  school: 'md:[grid-area:school]',
  principal: 'md:[grid-area:principal]',
  teacher: 'md:[grid-area:teacher]',
  student: 'md:[grid-area:student]',
  parent: 'md:[grid-area:parent]',
};

interface Wire {
  id: EcoRoleId | 'modules';
  d: string;
  sx: number;
  sy: number;
  ax: number;
  ay: number;
}

function Brain() {
  return (
    <svg viewBox="0 0 100 92" className="h-full w-full" aria-hidden="true">
      <defs>
        <linearGradient id="eco-brain-l" x1="0" x2="1">
          <stop offset="0" stopColor="#22d3ee" />
          <stop offset="1" stopColor="#6366f1" />
        </linearGradient>
        <linearGradient id="eco-brain-r" x1="0" x2="1">
          <stop offset="0" stopColor="#a855f7" />
          <stop offset="1" stopColor="#ec4899" />
        </linearGradient>
      </defs>
      <path d="M49 18C38 9 22 15 22 28 11 30 8 45 17 52 9 60 15 75 28 75c4 10 17 12 21 4Z" fill="url(#eco-brain-l)" fillOpacity=".35" stroke="url(#eco-brain-l)" strokeWidth="3" strokeLinejoin="round" />
      <path d="M51 18c11-9 27-3 27 10 11 2 14 17 5 24 8 8 2 23-11 23-4 10-17 12-21 4Z" fill="url(#eco-brain-r)" fillOpacity=".35" stroke="url(#eco-brain-r)" strokeWidth="3" strokeLinejoin="round" />
      <path d="M30 34c6 0 9 4 9 9M24 54c6-3 12-1 14 4M37 66c0-5 4-8 8-8M70 34c-6 0-9 4-9 9M76 54c-6-3-12-1-14 4M63 66c0-5-4-8-8-8" fill="none" stroke="#fff" strokeOpacity=".85" strokeWidth="2.2" strokeLinecap="round" />
      {[
        [39, 43],
        [38, 58],
        [45, 58],
        [61, 43],
        [62, 58],
        [55, 58],
        [30, 34],
        [70, 34],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="2.4" fill="#fff" />
      ))}
    </svg>
  );
}

function Core({ coreRef }: { coreRef: React.RefObject<HTMLDivElement> }) {
  return (
    <div ref={coreRef} className="nca-eco-core relative mx-auto aspect-square w-full max-w-[21rem] md:max-w-[24rem]">
      <svg viewBox="0 0 400 400" className="absolute inset-0 h-full w-full overflow-visible">
        <defs>
          <radialGradient id="eco-disc" cx=".5" cy=".42" r=".6">
            <stop offset="0" stopColor="#3b1fb0" />
            <stop offset=".55" stopColor="#1e1370" />
            <stop offset="1" stopColor="#0b0b3d" />
          </radialGradient>
          <radialGradient id="eco-halo" cx=".5" cy=".5" r=".5">
            <stop offset=".6" stopColor="#8b3dff" stopOpacity=".28" />
            <stop offset="1" stopColor="#02cff9" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="eco-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#02cff9" />
            <stop offset=".5" stopColor="#8b3dff" />
            <stop offset="1" stopColor="#ec4899" />
          </linearGradient>
          <path id="eco-arc-top" d="M 58 200 A 142 142 0 0 1 342 200" />
          <path id="eco-arc-bottom" d="M 40 200 A 160 160 0 0 0 360 200" />
        </defs>
        <circle cx="200" cy="200" r="200" fill="url(#eco-halo)" />
        <circle cx="200" cy="200" r="188" fill="none" stroke="url(#eco-ring)" strokeWidth="4" />
        <g className="nca-eco-spin">
          <circle cx="200" cy="200" r="181" fill="none" stroke="#ffffff" strokeOpacity=".9" strokeWidth="2" strokeDasharray="2 12" strokeLinecap="round" />
          {[0, 72, 144, 216, 288].map((a, i) => (
            <circle key={a} cx={(200 + 188 * Math.cos((a * Math.PI) / 180)).toFixed(2)} cy={(200 + 188 * Math.sin((a * Math.PI) / 180)).toFixed(2)} r="6" fill={['#22c55e', '#f97316', '#ec4899', '#02cff9', '#8b3dff'][i]} stroke="#fff" strokeWidth="2" />
          ))}
        </g>
        <circle cx="200" cy="200" r="175" fill="#eef1ff" />
        <circle cx="200" cy="200" r="175" fill="none" stroke="#c7d2fe" strokeWidth="1.5" />
        <text className="nca-eco-ringtext" fill="#1e1b6b" fontSize="15" fontWeight="700">
          {ECO_CORE.ringTop.map((t, i) => (
            <textPath key={t} href="#eco-arc-top" startOffset={`${[18, 50, 82][i]}%`} textAnchor="middle">
              {t}
            </textPath>
          ))}
        </text>
        <text className="nca-eco-ringtext" fill="#1e1b6b" fontSize="13" fontWeight="700">
          {ECO_CORE.ringBottom.map((t, i) => (
            <textPath key={t} href="#eco-arc-bottom" startOffset={`${[20, 50, 80][i]}%`} textAnchor="middle">
              {t}
            </textPath>
          ))}
        </text>
        <circle cx="200" cy="200" r="122" fill="none" stroke="#02cff9" strokeOpacity=".7" strokeWidth="3" className="nca-eco-pulse" />
        <circle cx="200" cy="200" r="122" fill="url(#eco-disc)" stroke="#67e8f9" strokeWidth="3" />
        {[
          [132, 140],
          [268, 136],
          [150, 300],
        ].map(([x, y], i) => (
          <path key={i} d={`M${x} ${y - 7}l2 5 5 2-5 2-2 5-2-5-5-2 5-2z`} fill="#fff" className="nca-eco-twinkle" style={{ animationDelay: `${i * 0.7}s` }} />
        ))}
      </svg>
      <div className="absolute flex flex-col items-center justify-center gap-[1.5cqw] rounded-full text-center [container-type:inline-size]" style={{ color: '#ffffff', inset: '21%' }}>
        <span className="h-[26cqw] w-[30cqw]">
          <Brain />
        </span>
        <span className="text-[14cqw] font-extrabold leading-none tracking-tight">{ECO_CORE.name}</span>
        <span className="text-[6.3cqw] font-semibold tracking-[0.18em]" style={{ color: '#67e8f9' }}>
          {ECO_CORE.label}
        </span>
        <span className="mt-[1cqw] flex flex-col items-center text-[5.6cqw] leading-snug">
          <span className="whitespace-nowrap">
            {ECO_CORE.flow[0]} <span aria-hidden="true">→</span> {ECO_CORE.flow[1]} <span aria-hidden="true">→</span> {ECO_CORE.flow[2]}
          </span>
          <span className="whitespace-nowrap">
            <span aria-hidden="true">→</span> {ECO_CORE.flow[3]}
          </span>
        </span>
      </div>
    </div>
  );
}

export function Ecosystem() {
  const reduced = usePrefersReducedMotion();
  const [active, setActive] = useState(0);
  const [held, setHeld] = useState(false);
  const [tile, setTile] = useState(0);
  const [wires, setWires] = useState<Wire[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const wrap = useRef<HTMLDivElement>(null);
  const core = useRef<HTMLDivElement>(null);
  const mods = useRef<HTMLDivElement>(null);
  const cards = useRef<Partial<Record<EcoRoleId, HTMLElement | null>>>({});

  useEffect(() => {
    if (reduced || held) return;
    const t = window.setInterval(() => setActive((a) => (a + 1) % LOOP.length), 2600);
    return () => window.clearInterval(t);
  }, [reduced, held]);

  useEffect(() => {
    if (reduced) return;
    const t = window.setInterval(() => setTile((i) => (i + 1) % ECO_MODULES.length), 750);
    return () => window.clearInterval(t);
  }, [reduced]);

  // Connectors are measured from the real layout, so they always meet
  // the cards whatever the screen width or font size.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => {
      const W = el.getBoundingClientRect();
      setSize({ w: W.width, h: W.height });
      if (window.innerWidth < 768 || !core.current || !mods.current) return setWires([]);
      const c = core.current.getBoundingClientRect();
      const cx = c.left + c.width / 2 - W.left;
      const cy = c.top + c.height / 2 - W.top;
      const r = c.width * 0.47;
      const out: Wire[] = [];
      for (const id of LOOP) {
        const card = cards.current[id];
        if (!card) continue;
        const b = card.getBoundingClientRect();
        const bx = b.left - W.left;
        const by = b.top - W.top;
        let ax: number;
        let ay: number;
        if (id === 'principal') {
          ax = bx + b.width / 2;
          ay = by + b.height;
        } else if (bx + b.width / 2 < cx) {
          ax = bx + b.width;
          ay = by + b.height / 2;
        } else {
          ax = bx;
          ay = by + b.height / 2;
        }
        const ang = Math.atan2(ay - cy, ax - cx);
        const sx = cx + Math.cos(ang) * r;
        const sy = cy + Math.sin(ang) * r;
        const mx = (sx + ax) / 2;
        const d = id === 'principal' ? `M${sx} ${sy} L${ax} ${ay}` : `M${sx} ${sy} C${mx} ${sy} ${mx} ${ay} ${ax} ${ay}`;
        out.push({ id, d, sx, sy, ax, ay });
      }
      const m = mods.current.getBoundingClientRect();
      const my = m.top - W.top;
      out.push({ id: 'modules', d: `M${cx} ${cy + r} L${cx} ${my}`, sx: cx, sy: cy + r, ax: cx, ay: my });
      setWires(out);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  const activeId = LOOP[active];
  const hold = (id: EcoRoleId) => {
    setHeld(true);
    setActive(LOOP.indexOf(id));
  };

  return (
    <div className="contents md:flex md:flex-col md:gap-3 xl:col-start-1 xl:row-start-1">
      <div ref={wrap} className="contents md:relative md:block" aria-label="How NetCyberAI connects your whole school" role="group">
        {wires.length > 0 && (
          <svg className="pointer-events-none absolute inset-0 hidden md:block" width={size.w} height={size.h} viewBox={`0 0 ${size.w} ${size.h}`} aria-hidden="true">
            {wires.map((w) => {
              const color = w.id === 'modules' ? '#8b3dff' : COLORS[w.id].eco;
              const on = w.id === activeId || w.id === 'modules';
              return (
                <g key={w.id}>
                  <path d={w.d} fill="none" stroke={color} strokeOpacity=".25" strokeWidth="6" strokeLinecap="round" />
                  <path d={w.d} fill="none" stroke={color} strokeOpacity={on ? 1 : 0.55} strokeWidth={on ? 3 : 2} className="nca-flow-line" />
                  <circle cx={w.ax} cy={w.ay} r="6" fill="#fff" stroke={color} strokeWidth="3" />
                  <circle cx={w.sx} cy={w.sy} r="5" fill={color} stroke="#fff" strokeWidth="2" />
                  {on && !reduced && (
                    <>
                      <circle r="5.5" fill={color}>
                        <animateMotion dur="1.3s" repeatCount="indefinite" path={w.d} />
                      </circle>
                      <circle r="3.5" fill="#fff" stroke={color} strokeWidth="2">
                        <animateMotion dur="1.3s" repeatCount="indefinite" path={w.d} keyPoints="1;0" keyTimes="0;1" calcMode="linear" />
                      </circle>
                    </>
                  )}
                </g>
              );
            })}
          </svg>
        )}

        <div className="contents md:relative md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)] md:items-center md:gap-x-10 md:gap-y-6 md:[grid-template-areas:'school_principal_teacher''student_core_parent']">
          <div className="order-1 md:order-none md:[grid-area:core]">
            <Core coreRef={core} />
          </div>
          <div className="nca-eco-roles order-3 -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 py-2 md:contents" aria-label="Roles" role="list">
            {ECO_ROLES.map((r) => {
              const c = COLORS[r.id];
              const on = r.id === activeId;
              return (
                <article
                  key={r.id}
                  role="listitem"
                  ref={(el) => {
                    cards.current[r.id] = el;
                  }}
                  style={{ '--eco': c.eco, '--eco-a': c.a, '--eco-b': c.b } as CSSProperties}
                  onMouseEnter={() => hold(r.id)}
                  onMouseLeave={() => setHeld(false)}
                  onFocus={() => hold(r.id)}
                  onBlur={() => setHeld(false)}
                  className={`nca-eco-card relative z-10 w-4/5 shrink-0 snap-center rounded-3xl border border-slate/10 bg-white p-3 shadow-md sm:w-[calc(50%-0.4rem)] md:w-auto ${AREA[r.id]} ${on ? 'is-active' : ''}`}
                >
                  <Link
                    href={r.href}
                    style={{ color: '#ffffff' }}
                    className={`nca-eco-head flex items-center gap-3 rounded-2xl px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal ${c.bg}`}
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20 ring-2 ring-white/60">
                      <Icon name={r.icon} className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 leading-tight">
                      <b className="block text-base">{r.name}</b>
                      <span className="block text-xs opacity-95">{r.tagline}</span>
                    </span>
                  </Link>
                  <ul className={`mt-2 grid gap-x-3 gap-y-1 px-1 ${r.id === 'principal' ? 'md:grid-cols-2' : ''}`}>
                    {r.items.map((it) => (
                      <li key={it} className="flex items-center gap-2 text-[13px] leading-snug text-slate">
                        <span aria-hidden="true" className="nca-eco-dot flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px]">
                          <span className="h-1.5 w-1.5 rounded-full bg-white" />
                        </span>
                        {it}
                      </li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </div>
        </div>

        <div ref={mods} className="nca-eco-platform relative z-10 order-4 rounded-[2rem] px-3 pb-4 pt-5 md:order-none md:mt-8">
          <ul className="grid grid-cols-4 gap-x-1.5 gap-y-4 sm:grid-cols-6 md:grid-cols-11" aria-label="Platform modules">
            {ECO_MODULES.map((m, i) => (
              <li key={m.label} className="flex flex-col items-center gap-1.5 text-center">
                <span style={{ color: '#ffffff' }} className={`nca-eco-tile flex h-11 w-11 items-center justify-center rounded-2xl shadow-md md:h-12 md:w-12 ${TILE_BG[i]} ${tile === i && !reduced ? 'is-on' : ''}`}>
                  <Icon name={m.icon} className="h-5 w-5 md:h-6 md:w-6" />
                </span>
                <span className="text-[11px] font-bold leading-tight text-slate md:text-xs">{m.label}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="order-5 flex flex-wrap items-center justify-between gap-2 text-xs text-slate/70 md:order-none">
        <span>The complete NetCyberAI platform. Swipe the roles on mobile.</span>
        <Link href="/product-tour#modules" className="font-bold text-royal underline-offset-4 hover:underline">
          See which modules are live today →
        </Link>
      </div>
    </div>
  );
}
