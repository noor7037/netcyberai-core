'use client';

import { useEffect, useState } from 'react';
import { Container } from '@/components/ui/Container';
import { SectionHeading, DemoLabel } from '@/components/visual/Primitives';
import { Icon, type IconName } from '@/components/visual/Icons';
import { tones } from '@/lib/semantic';
import { useInView, usePrefersReducedMotion } from '@/lib/hooks';
import { ecosystemScript, type EcoNode } from '@/demo-fixture/website-demo';

const NODES: Record<EcoNode, { x: number; y: number; label: string; icon: IconName; fill: string; ring: string }> = {
  principal: { x: 360, y: 58, label: 'Principal', icon: 'principal', fill: '#0B2E6B', ring: '#60A5FA' },
  admin: { x: 128, y: 118, label: 'School Admin', icon: 'admin', fill: '#16407F', ring: '#93C5FD' },
  finance: { x: 592, y: 118, label: 'Finance', icon: 'fees', fill: '#FF7A1A', ring: '#FFD23F' },
  teacher: { x: 112, y: 318, label: 'Teacher', icon: 'teacher', fill: '#1D4ED8', ring: '#02CFF9' },
  student: { x: 360, y: 392, label: 'Student', icon: 'student', fill: '#14B8A6', ring: '#FFD23F' },
  parent: { x: 608, y: 318, label: 'Parent', icon: 'parent', fill: '#0891B2', ring: '#02CFF9' },
  core: { x: 360, y: 225, label: 'NetCyberAI', icon: 'sparkle', fill: '#4400F0', ring: '#8B3DFF' },
};

const OUTER: EcoNode[] = ['principal', 'admin', 'finance', 'teacher', 'student', 'parent'];

function edgePath(a: EcoNode, b: EcoNode) {
  const p = NODES[a];
  const q = NODES[b];
  const mx = (p.x + q.x) / 2;
  const my = (p.y + q.y) / 2;
  // bow each edge slightly so particles travel a visible curve
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const cx = mx - dy * 0.12;
  const cy = my + dx * 0.12;
  return `M${p.x},${p.y} Q${cx},${cy} ${q.x},${q.y}`;
}

const STEP_MS = 2800;

export function LiveEcosystem() {
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.3, once: false });
  const playing = !paused && !reduced && inView;
  const n = ecosystemScript.length;
  const current = ecosystemScript[step];

  useEffect(() => {
    if (!playing) return;
    const t = window.setTimeout(() => setStep((s) => (s + 1) % n), STEP_MS);
    return () => window.clearTimeout(t);
  }, [playing, step, n]);

  const activeEdge = current.from !== current.to ? edgePath(current.from, current.to) : null;
  const history = ecosystemScript.slice(0, step + 1).reverse().slice(0, 4);
  const kpis = [
    { label: 'Class 6A present', value: current.kpis.present, tone: 'product' as const },
    { label: 'Parents notified', value: current.kpis.notified, tone: 'communication' as const },
    { label: 'School health', value: current.kpis.health, tone: 'success' as const },
    { label: 'Open exceptions', value: current.kpis.openExceptions, tone: current.kpis.openExceptions === '0' ? ('success' as const) : ('alert' as const) },
  ];

  return (
    <section id="live-ecosystem" aria-labelledby="eco-title" className="relative overflow-hidden bg-midnight text-white">
      <div aria-hidden="true" className="nca-grid-dark absolute inset-0" />
      <div aria-hidden="true" className="nca-mesh-dark absolute inset-0" />
      <Container wide className="relative flex flex-col gap-10 py-20">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <SectionHeading
            dark
            id="eco-title"
            eyebrow="Live ecosystem"
            tone="communication"
            title="See how the entire school connects"
            lead="One attendance mark moves through the whole school: record, student, parent, principal, and back as a resolved task. Watch it happen."
          />
          <DemoLabel onDark />
        </div>

        <div ref={ref} className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          {/* Desktop/tablet: the live network */}
          <div className="nca-glass hidden rounded-3xl p-3 md:block lg:col-span-3">
            <svg viewBox="0 0 720 450" className="h-auto w-full" role="img" aria-label={`Step ${step + 1} of ${n}: ${current.title}. ${current.detail}`}>
              <defs>
                <radialGradient id="eco-core-glow">
                  <stop offset="0" stopColor="#8B3DFF" stopOpacity="0.55" />
                  <stop offset="1" stopColor="#8B3DFF" stopOpacity="0" />
                </radialGradient>
              </defs>
              <circle cx={NODES.core.x} cy={NODES.core.y} r={120} fill="url(#eco-core-glow)" />
              {OUTER.map((node) => (
                <path key={node} d={edgePath(node, 'core')} fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth={2} />
              ))}
              {activeEdge && (
                <g key={`edge-${step}`}>
                  <path d={activeEdge} fill="none" stroke={tones[current.tone].fill} strokeWidth={3.5} className="nca-flow-line" />
                  {!reduced && (
                    <circle r={7} fill="#FFFFFF" stroke={tones[current.tone].fill} strokeWidth={3}>
                      <animateMotion dur="1.4s" repeatCount="indefinite" path={activeEdge} />
                    </circle>
                  )}
                </g>
              )}
              {(Object.keys(NODES) as EcoNode[]).map((key) => {
                const node = NODES[key];
                const isActive = key === current.from || key === current.to;
                const r = key === 'core' ? 44 : 32;
                return (
                  <g key={key}>
                    {isActive && !reduced && (
                      <circle cx={node.x} cy={node.y} r={r} fill="none" stroke={node.ring} strokeWidth={3} className="nca-pulse-ring" />
                    )}
                    <circle cx={node.x} cy={node.y} r={r} fill={node.fill} stroke={isActive ? '#FFFFFF' : node.ring} strokeWidth={isActive ? 4 : 2} />
                    <g color="#FFFFFF">
                      <Icon name={node.icon} className="" x={node.x - 12} y={node.y - 12} width={24} height={24} />
                    </g>
                    <text x={node.x} y={node.y + r + 18} textAnchor="middle" fontSize={14} fontWeight={700} fill="#FFFFFF">
                      {node.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Mobile: the same run as a vertical timeline */}
          <ol className="flex flex-col gap-2 md:hidden" aria-label="Ecosystem steps">
            {ecosystemScript.map((s, i) => (
              <li key={s.title}>
                <button
                  type="button"
                  onClick={() => {
                    setStep(i);
                    setPaused(true);
                  }}
                  aria-current={i === step ? 'step' : undefined}
                  className={`nca-glass flex w-full items-start gap-3 rounded-xl p-3 text-left ${i === step ? 'ring-2 ring-cyan' : ''}`}
                >
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${i <= step ? tones[s.tone].solid : 'bg-white/10'}`}>
                    {i < step ? <Icon name="check" className="h-3.5 w-3.5" /> : i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold">{s.title}</span>
                    {i === step && <span className="mt-0.5 block text-xs opacity-80">{s.detail}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ol>

          {/* Activity + KPIs */}
          <div className="flex flex-col gap-4 lg:col-span-2">
            <div className="grid grid-cols-2 gap-2">
              {kpis.map((k) => (
                <div key={k.label} className="nca-glass rounded-xl p-3">
                  <p className="text-xs opacity-80">{k.label}</p>
                  <p key={k.value} className="nca-pop mt-1 flex items-center gap-2 text-2xl font-extrabold">
                    <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${tones[k.tone].dot}`} />
                    {k.value}
                  </p>
                </div>
              ))}
            </div>
            <div className="nca-glass-strong rounded-2xl p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-xs font-bold uppercase tracking-wider opacity-80">Live activity</p>
                <p className="text-xs opacity-80">{`Step ${step + 1} of ${n}`}</p>
              </div>
              <ul className="flex flex-col gap-2" aria-live="polite">
                {history.map((h, i) => (
                  <li key={h.title} className={`flex items-start gap-3 rounded-lg p-2 ${i === 0 ? 'nca-pop nca-glass' : 'opacity-70'}`}>
                    <span aria-hidden="true" className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${tones[h.tone].dot}`} />
                    <span className="min-w-0">
                      <span className="block text-sm font-bold">{h.title}</span>
                      <span className="block text-xs opacity-80">{h.detail}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setPaused((p) => !p)}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-slate focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan"
              >
                <Icon name={paused || reduced ? 'play' : 'pause'} className="h-4 w-4" />
                {paused || reduced ? 'Play' : 'Pause'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPaused(true);
                  setStep((s) => (s - 1 + n) % n);
                }}
                className="inline-flex min-h-[44px] items-center gap-1 rounded-full bg-white px-4 text-sm font-semibold text-slate focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan"
              >
                <Icon name="chevronLeft" className="h-4 w-4" /> Back
              </button>
              <button
                type="button"
                onClick={() => {
                  setPaused(true);
                  setStep((s) => (s + 1) % n);
                }}
                className="inline-flex min-h-[44px] items-center gap-1 rounded-full bg-white px-4 text-sm font-semibold text-slate focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan"
              >
                Next step <Icon name="chevronRight" className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs opacity-80">
              Every automated message passes the same consent and quiet-hours gate. NetCyberAI proposes and routes;
              people with the right permissions act, and every change is audited.
            </p>
          </div>
        </div>
      </Container>
    </section>
  );
}
