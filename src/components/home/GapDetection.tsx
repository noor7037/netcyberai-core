'use client';

import { useEffect, useState } from 'react';
import { Container } from '@/components/ui/Container';
import { SectionHeading } from '@/components/visual/Primitives';
import { Icon, type IconName } from '@/components/visual/Icons';
import { tones, type Tone } from '@/lib/semantic';
import { useInView, usePrefersReducedMotion } from '@/lib/hooks';

const STAGES: { label: string; tone: Tone; icon: IconName }[] = [
  { label: 'Normal state', tone: 'success', icon: 'check' },
  { label: 'Gap appears', tone: 'alert', icon: 'alert' },
  { label: 'System detects it', tone: 'intelligence', icon: 'sparkle' },
  { label: 'Owner alerted', tone: 'communication', icon: 'bell' },
  { label: 'Action / task', tone: 'action', icon: 'operations' },
  { label: 'Resolution', tone: 'product', icon: 'check' },
  { label: 'Verification', tone: 'trust', icon: 'shield' },
  { label: 'Healthy state', tone: 'success', icon: 'trophy' },
];

const EXAMPLES: { name: string; gap: string; owner: string; action: string; verify: string }[] = [
  { name: 'Attendance exception', gap: 'Riya absent three days with no reason recorded.', owner: 'Class teacher', action: 'Call the guardian; record the reason.', verify: 'Leave recorded; principal sees it closed.' },
  { name: 'Homework not updated', gap: '7B Science has no homework entry by 4 pm.', owner: 'Subject teacher', action: 'Add homework or mark “none today”.', verify: 'Entry appears in tonight’s Pulse.' },
  { name: 'Fee follow-up', gap: 'Twelve families cross their due date.', owner: 'Accounts', action: 'Reminder with UPI link; call where needed.', verify: 'Payments matched to receipts.' },
  { name: 'Learning gap', gap: 'Fractions scores drop for a group in 7A.', owner: 'Maths teacher', action: 'Plan a revision period.', verify: 'Next unit test shows the change.' },
  { name: 'Parent reply pending', gap: 'Three parents chose “Samajh nahi aaya”.', owner: 'Class teacher', action: 'Short call or note home.', verify: 'Reply logged against the Pulse.' },
  { name: 'Operational task', gap: 'Transport form not collected for Class 2.', owner: 'Office', action: 'Collect and upload forms.', verify: 'Checklist complete, audited.' },
];

export function GapDetection() {
  const [stage, setStage] = useState(0);
  const [example, setExample] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.3, once: false });
  const playing = !paused && !reduced && inView;

  useEffect(() => {
    if (!playing) return;
    const t = window.setTimeout(() => setStage((s) => (s + 1) % STAGES.length), 1900);
    return () => window.clearTimeout(t);
  }, [playing, stage]);

  const ex = EXAMPLES[example];
  const detail = [
    'Records are complete; nothing needs attention.',
    ex.gap,
    'A rule on the validated record spots the gap. It proposes; it does not act on its own.',
    `${ex.owner} is notified, inside their permissions.`,
    ex.action,
    'The owner completes the task in the portal, with validation.',
    ex.verify,
    'School health returns to green; the audit trail keeps every step.',
  ][stage];

  const R = 150;
  const C = 190;

  return (
    <section aria-labelledby="gap-title" className="nca-mesh-warm bg-off-white">
      <Container wide className="flex flex-col gap-10 py-20">
        <SectionHeading
          id="gap-title"
          eyebrow="Gap detection"
          tone="alert"
          title="Detect. Act. Verify."
          lead="Small gaps become big problems when nobody owns them. NetCyberAI notices, routes each gap to the right person, and checks that it was actually closed."
        />
        <div ref={ref} className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2">
          <div className="hidden sm:block">
            <svg viewBox="0 0 380 380" className="mx-auto h-auto w-full max-w-md" role="img" aria-label={`Stage ${stage + 1} of ${STAGES.length}: ${STAGES[stage].label}`}>
              <circle cx={C} cy={C} r={R} fill="none" stroke="#E2E8F0" strokeWidth={10} />
              <circle
                cx={C}
                cy={C}
                r={R}
                fill="none"
                stroke={tones[STAGES[stage].tone].fill}
                strokeWidth={10}
                strokeLinecap="round"
                transform={`rotate(-90 ${C} ${C})`}
                strokeDasharray={2 * Math.PI * R}
                style={{ strokeDashoffset: 2 * Math.PI * R * (1 - (stage + 1) / STAGES.length), transition: 'stroke-dashoffset 600ms ease, stroke 300ms' }}
              />
              {STAGES.map((s, i) => {
                const a = (i / STAGES.length) * Math.PI * 2 - Math.PI / 2;
                const x = C + R * Math.cos(a);
                const y = C + R * Math.sin(a);
                const on = i === stage;
                return (
                  <g key={s.label}>
                    <circle cx={x} cy={y} r={on ? 22 : 16} fill={i <= stage ? tones[s.tone].fill : '#FFFFFF'} stroke={tones[s.tone].fill} strokeWidth={3} style={{ transition: 'r 300ms' }} />
                    <text x={x} y={y + 5} textAnchor="middle" fontSize={13} fontWeight={800} fill={i <= stage && (s.tone === 'intelligence' || s.tone === 'product' || s.tone === 'trust') ? '#FFFFFF' : '#1E293B'}>
                      {i + 1}
                    </text>
                  </g>
                );
              })}
              <text x={C} y={C - 8} textAnchor="middle" fontSize={13} fontWeight={700} fill="#475569">
                {`Stage ${stage + 1}`}
              </text>
              <text x={C} y={C + 18} textAnchor="middle" fontSize={20} fontWeight={800} fill="#1E293B">
                {STAGES[stage].label}
              </text>
            </svg>
          </div>

          <div className="flex flex-col gap-5">
            <div role="group" aria-label="Choose an example" className="flex flex-wrap gap-2">
              {EXAMPLES.map((e, i) => (
                <button
                  key={e.name}
                  type="button"
                  onClick={() => {
                    setExample(i);
                    setStage(1);
                  }}
                  aria-pressed={i === example}
                  className={`min-h-[40px] rounded-full px-3 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal ${
                    i === example ? 'bg-coral text-slate' : 'border border-slate/15 bg-white text-slate hover:bg-off-white'
                  }`}
                >
                  {e.name}
                </button>
              ))}
            </div>

            <ol className="flex flex-col gap-2" aria-label="Stages">
              {STAGES.map((s, i) => {
                const on = i === stage;
                return (
                  <li key={s.label}>
                    <button
                      type="button"
                      onClick={() => {
                        setStage(i);
                        setPaused(true);
                      }}
                      aria-current={on ? 'step' : undefined}
                      className={`flex w-full items-start gap-3 rounded-xl p-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal ${
                        on ? 'bg-white shadow-lg' : 'bg-white/60'
                      }`}
                    >
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${tones[s.tone].solid}`}>
                        <Icon name={s.icon} className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-bold text-slate">{s.label}</span>
                        {on && <span className="nca-pop block text-sm text-slate/70">{detail}</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setPaused((p) => !p)}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-slate px-4 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal"
              >
                <Icon name={paused || reduced ? 'play' : 'pause'} className="h-4 w-4" />
                {paused || reduced ? 'Play the loop' : 'Pause'}
              </button>
              <p className="flex-1 text-sm text-slate/70">
                Nothing acts on its own. Every step respects permissions, validation, consent and the audit trail.
              </p>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
