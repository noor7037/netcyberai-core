'use client';

// The parent's view of a child's drawings (C514): how many drawing templates the child completed this week and in all
// (a count only: no drawing is shown, scored or compared), and the "Allow all drawing activities" switch that unlocks the
// templates which need a parent (parent mode; /api/family/draw/allow).
import { useState } from 'react';
import { fill, type Words } from '@/lib/family/fill';
import { familyApi } from '../../client';

export function ParentDrawPanel({ w, childId, draw, className = '' }: { w: Words; childId: string; draw: { week: number; all: number; allowed: boolean }; className?: string }) {
  const [allowed, setAllowed] = useState(draw.allowed);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const toggle = async () => {
    setBusy(true);
    setFailed(false);
    const r = await familyApi<{ allowed: boolean }>('/api/family/draw/allow', 'POST', { childId, allowed: !allowed });
    if (r.ok) setAllowed(r.data.allowed === true);
    else setFailed(true);
    setBusy(false);
  };
  return (
    <section data-parent-draw={childId} aria-labelledby={`draw-${childId}`} className={className}>
      <h2 id={`draw-${childId}`} className="text-lg font-bold text-slate">
        {w['fam.draw.p.title']}
      </h2>
      <p data-draw-week className="mt-1 text-base font-semibold text-ink">
        {fill(w['fam.draw.p.week'], { n: draw.week })}
      </p>
      <p data-draw-all className="text-sm text-slate">
        {fill(w['fam.draw.p.all'], { n: draw.all })}
      </p>
      <p className="mt-1 text-xs text-slate">{w['fam.draw.p.countOnly']}</p>
      <button
        type="button"
        role="switch"
        aria-checked={allowed}
        data-draw-allow
        disabled={busy}
        onClick={() => void toggle()}
        className="fam-press mt-3 flex min-h-[44px] w-full items-center justify-between gap-3 rounded-xl bg-paper px-3 text-left text-base font-bold text-ink"
      >
        <span>{w['fam.draw.p.allow']}</span>
        <span aria-hidden="true" className={`relative h-7 w-12 shrink-0 rounded-full ${allowed ? 'bg-emerald' : 'bg-slate'}`}>
          <span className={`absolute top-1 h-5 w-5 rounded-full bg-white ${allowed ? 'left-6' : 'left-1'}`} />
        </span>
      </button>
      <p className="mt-1 text-xs text-slate">{w['fam.draw.p.allowNote']}</p>
      {failed && (
        <p role="alert" className="mt-1 text-sm font-semibold text-ink">
          {w['fam.school.saveError']}
        </p>
      )}
    </section>
  );
}
