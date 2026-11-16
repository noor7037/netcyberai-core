import type { Words } from '@/lib/family/fill';
import type { ElabSim } from '@/lib/family/sim-hosts';

// A lab whose site refuses to be framed (OLabs): a card with the lab's title, the source credit and one "Open lab" link in a new
// tab. Nothing from the lab's site loads until the child taps the link.
export function LabLinkCard({ sim, from, w }: { sim: ElabSim; from: string; w: Words }) {
  return (
    <section data-elab-sim={sim.source} data-elab-lab-link aria-label={w['fam.elab.trySim']} className="flex flex-col gap-2 rounded-2xl bg-white p-3 ring-1 ring-ink/10">
      <h4 className="text-sm font-extrabold text-slate">{w['fam.elab.trySim']}</h4>
      <p className="text-base font-bold text-ink">{sim.title}</p>
      <a href={sim.embed} target="_blank" rel="noopener noreferrer" data-elab-lab-open className="fam-press inline-flex min-h-[44px] w-fit items-center justify-center rounded-full bg-grape-deep px-5 py-2 text-base font-extrabold text-white">
        {w['fam.elab.labOpen']}
      </a>
      <p className="text-xs text-slate/80">
        {w['fam.elab.labNote']} {w['fam.elab.simFrom']} {from}
        {sim.licence ? ` · ${sim.licence}` : ''}
      </p>
    </section>
  );
}
