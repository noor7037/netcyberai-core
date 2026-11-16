'use client';

import { useState } from 'react';
import type { Words } from '@/lib/family/fill';
import { simMode, type ElabSim } from '@/lib/family/sim-hosts';
import { LabLinkCard } from './LabLinkCard';

// "Try it yourself" (Noor, 16 Nov 2026): a curated simulation in step 4 of an answer, beside the photos and never instead of them.
// The card is drawn here first (a small picture of our own, or a drawn card); nothing from the simulation's site loads, not even a
// picture, until the child taps. Then the site's own page runs in a sandboxed frame. The frame's host is one the Family app's
// Content-Security-Policy allows (next.config.js, from src/lib/family/sim-hosts.ts).
const NAMES: Record<string, string> = {
  phet: 'PhET', vlabs: 'Virtual Labs', olabs: 'OLabs', nasa_eyes: 'NASA Eyes', hhmi: 'HHMI BioInteractive', labxchange: 'LabXchange', concord: 'Concord Consortium',
  desmos: 'Desmos', smithsonian3d: 'Smithsonian 3D', googlearts: 'Google Arts and Culture', wolfram: 'Wolfram Demonstrations',
};

export function SimCard({ sim, w }: { sim: ElabSim; w: Words }) {
  const [open, setOpen] = useState(false);
  const from = NAMES[sim.source] ?? sim.source;
  if (simMode(sim) === 'link') return <LabLinkCard sim={sim} from={from} w={w} />;
  return (
    <section data-elab-sim={sim.source} aria-label={w['fam.elab.trySim']} className="flex flex-col gap-2 rounded-2xl bg-white p-2 ring-1 ring-ink/10">
      <h4 className="px-1 text-sm font-extrabold text-slate">{w['fam.elab.trySim']}</h4>
      {open ? (
        <iframe
          data-elab-sim-frame
          title={sim.title}
          src={sim.embed}
          loading="lazy"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          referrerPolicy="no-referrer"
          allow="fullscreen"
          className="h-[360px] w-full rounded-xl border-0 bg-paper sm:h-[440px]"
        />
      ) : (
        <button type="button" data-elab-sim-open onClick={() => setOpen(true)} className="fam-press relative flex min-h-[180px] w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-br from-grape-deep to-ink p-3 text-center text-white">
          {sim.preview && (
            // eslint-disable-next-line @next/next/no-img-element -- our own small picture, kept in /public/sims
            <img src={sim.preview} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-70" />
          )}
          <span className="relative rounded-full bg-white px-4 py-2 text-base font-extrabold text-ink">{w['fam.elab.simOpen']}</span>
          <span className="relative text-sm font-bold [text-shadow:0_1px_3px_rgba(0,0,0,0.7)]">{sim.title}</span>
        </button>
      )}
      <p className="px-1 text-xs text-slate/80">
        {w['fam.elab.simFrom']}{' '}
        <a href={sim.page} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center px-1 underline">
          {from}
        </a>
        {sim.licence ? ` · ${sim.licence}` : ''}
      </p>
    </section>
  );
}
