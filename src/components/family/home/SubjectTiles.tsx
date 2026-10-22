import Link from 'next/link';
import { fill, type Words } from '@/lib/family/fill';
import type { HomeStage, SubjectTile } from '@/lib/family/home';
import { Picture } from '../Picture';
import { ProgressBar } from '../ui/ProgressBar';
import { ENTER, LIFT, PRESS } from '../ui/motion';

// The subject tiles on the home (D1-2, C294): one per subject of the child's class, in its colour with its picture, the
// topics checked and mastered (checked answers only), opening Study for that subject. The free subject is marked; a
// closed subject says calmly that it opens with Family Plus later, without a price (05 §4). Classes 1–5 get larger
// tiles and pictures (09 §2).
export function SubjectTiles({ w, tiles, stage }: { w: Words; tiles: SubjectTile[]; stage: HomeStage }) {
  const young = stage === 'young';
  return (
    <section data-family-subjects aria-labelledby="fam-subjects" className={ENTER}>
      <h2 id="fam-subjects" className="px-1 text-lg font-extrabold text-slate">
        {w['fam.home.subjectsTitle']}
      </h2>
      <ul className={`mt-2 grid gap-3 ${young ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'}`}>
        {tiles.map((s) => {
          const name = w[`fam.subject.${s.subject}`];
          return (
            <li key={s.subject} data-subject-tile={s.subject} data-subject-open={s.open ? 'true' : 'false'}>
              <Link
                href={s.href}
                className={`flex h-full flex-col gap-2 overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate/10 ${young ? 'min-h-[156px]' : 'min-h-[132px]'} ${s.open ? '' : 'opacity-90'} ${PRESS} ${LIFT}`}
              >
                <span aria-hidden="true" className={`h-1.5 w-full ${s.colour.bar}`} />
                <span className="flex flex-1 flex-col gap-2 px-3 pb-3">
                  <span className="flex items-start justify-between gap-2">
                    <span aria-hidden="true" className={`flex shrink-0 items-center justify-center rounded-2xl ${s.colour.soft} ${young ? 'h-14 w-14' : 'h-11 w-11'}`}>
                      <Picture e={s.picture} size={young ? 36 : 26} />
                    </span>
                    {s.isFree && <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${s.colour.chip}`}>{w['fam.home.tileFree']}</span>}
                  </span>
                  <span className={`font-extrabold leading-snug text-slate ${young ? 'text-lg' : 'text-base'}`}>{name}</span>
                  {s.open ? (
                    <>
                      <span className="text-xs font-semibold text-slate/80">
                        {s.checked > 0 ? fill(w['fam.home.tileProgress'], { checked: s.checked, mastered: s.mastered }) : w['fam.home.tileStart']}
                      </span>
                      <ProgressBar value={s.mastered} max={s.checked} bar={s.colour.bar} label={fill(w['fam.home.tileBar'], { subject: name, mastered: s.mastered, checked: s.checked })} className="mt-auto h-2" />
                    </>
                  ) : (
                    <span className="mt-auto text-xs font-semibold text-slate/80">{w['fam.home.tileClosed']}</span>
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
