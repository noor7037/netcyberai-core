import type { ReactNode } from 'react';
import { tones } from '@/lib/semantic';
import { statusTone, type BadgeTone, type VTone } from '@/demo-fixture/principal-dashboard';

// Small shared pieces of the demo principal dashboard. Colours come only
// from the semantic tone sets (contrast-verified in design-tokens.ts).

const BADGE: Record<BadgeTone, string> = {
  neutral: 'bg-slate/5 text-slate',
  success: tones.success.soft,
  alert: tones.alert.soft,
  action: tones.action.soft,
  intelligence: tones.intelligence.soft,
};

export function Chip({ children, tone }: { children: ReactNode; tone?: BadgeTone }) {
  const t = tone ?? (typeof children === 'string' ? statusTone(children) : 'neutral');
  return <span className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ${BADGE[t]}`}>{children}</span>;
}

export const fillOf = (t: VTone) => tones[t].dot;
export const hexOf = (t: VTone) => tones[t].fill;

export function Card({ title, sub, aside, children, className = '' }: { title: string; sub?: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`nca-lift flex min-w-0 flex-col gap-3 rounded-xl border border-slate/10 bg-white p-4 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-extrabold text-slate">{title}</h3>
          {sub && <p className="mt-0.5 text-[11px] text-slate/70">{sub}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Progress({ value, tone = 'success' }: { value: number; tone?: VTone }) {
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-slate/10" aria-hidden="true">
      <span className={`block h-full rounded-full ${fillOf(tone)}`} style={{ width: `${Math.min(100, value)}%` }} />
    </span>
  );
}

// A segmented ring drawn with SVG strokes (no chart library). Segments
// are shares of 100; a 1-unit surface gap separates them.
export function Ring({ segments, size = 112, stroke = 12, children, label }: { segments: [number, VTone][]; size?: number; stroke?: number; children?: ReactNode; label: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={label} title={segments.map(([share]) => `${share}%`).join(' · ')}>
      <svg viewBox={`0 0 ${size} ${size}`} className="-rotate-90" width={size} height={size} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(30 41 59 / 0.1)" strokeWidth={stroke} />
        {segments.map(([share, tone], i) => {
          const len = Math.max(0, (share / 100) * c - 1.5);
          const el = (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={hexOf(tone)}
              strokeWidth={stroke}
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
            />
          );
          offset += (share / 100) * c;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

// "1,240 Students" -> value "1,240", label "Students"; anything that does
// not start with a figure is shown whole.
export function splitKpi(k: string): { value: string; label: string } {
  const m = k.match(/^([₹<]?[\d.,/]+(?:[%LkK]|\s?sec)?)\s+(.*)$/);
  return m ? { value: m[1], label: m[2] } : { value: k, label: '' };
}
