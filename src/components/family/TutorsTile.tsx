import Link from 'next/link';
import type { LessonTint } from '@/lib/design-tokens';
import { FamIcon } from './FamIcon';

// The Tutors tile on the home screen (W16-B5): one card that opens the Tutor Hall, with the platform tutors' names as a
// calm list of chips on the lesson tints (the Family identity: no gradient, no dark blue). The names take a soft ring in
// turn (family.css `.fam-names`); under prefers-reduced-motion nothing moves and the list simply stands. The whole card
// is the target (56 px or more). Server-rendered, no script.
const TINT: Record<LessonTint, string> = {
  mint: 'bg-lesson-mint',
  butter: 'bg-lesson-butter',
  lilac: 'bg-lesson-lilac',
  blush: 'bg-lesson-blush',
  sky: 'bg-lesson-sky',
};

export type TutorsTileName = { key: string; name: string; tint: LessonTint };

export function TutorsTile({ title, lead, names }: { title: string; lead: string; names: readonly TutorsTileName[] }) {
  return (
    <Link href="/family/tutors" data-tutors-tile className="fam-card fam-section fam-rise fam-lift min-h-[56px] bg-white text-ink">
      <span className="flex items-center gap-3">
        <span aria-hidden="true" className="fam-chip-icon bg-lesson-lilac-deep text-white">
          <FamIcon name="sparkle" className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="fam-h2 block text-slate">{title}</span>
          <span className="fam-note block text-slate/80">{lead}</span>
        </span>
        <FamIcon name="next" className="h-5 w-5 shrink-0" />
      </span>
      {names.length > 0 && (
        <ul data-tutor-names className="fam-names m-0 flex list-none flex-wrap gap-2 p-0">
          {names.map((n, i) => (
            <li key={n.key} style={{ ['--i' as string]: i } as React.CSSProperties} className={`flex min-h-[32px] items-center rounded-full px-3 text-sm font-bold text-ink ${TINT[n.tint]}`}>
              {n.name}
            </li>
          ))}
        </ul>
      )}
    </Link>
  );
}
