import { Button } from './ui/Button';
import { SubjectGlyph } from './ui/SubjectGlyph';
import type { LessonTint } from '@/lib/design-tokens';
import { fill, type Words } from '@/lib/family/fill';
import type { TutorCard, TutorGroup } from '@/lib/family/tutors';

// The Tutor Hall (W16-A3): a card for each tutor on its lesson tint (the Family identity: tints and their deep accents, no
// gradient, no dark blue), with its name, subject, how it teaches and the language it speaks, and two actions: Chat (opens
// Study on the tutor's subject, which keeps the tutor) and Call (W16-A4). Server-rendered: no script. Calm: no ranking, no
// claim about any tutor; the words come from the tutor's own row. Every target is 44 px or more.
const TINT: Record<LessonTint, { card: string; chip: string }> = {
  mint: { card: 'bg-lesson-mint', chip: 'bg-lesson-mint-deep text-white' },
  butter: { card: 'bg-lesson-butter', chip: 'bg-lesson-butter-deep text-white' },
  lilac: { card: 'bg-lesson-lilac', chip: 'bg-lesson-lilac-deep text-white' },
  blush: { card: 'bg-lesson-blush', chip: 'bg-lesson-blush-deep text-white' },
  sky: { card: 'bg-lesson-sky', chip: 'bg-lesson-sky-deep text-white' },
};

export const TUTOR_HALL_KEYS = ['fam.tutors.title', 'fam.tutors.lead', 'fam.tutors.platform', 'fam.tutors.fromSchool', 'fam.tutors.chat', 'fam.tutors.call', 'fam.tutors.chatWith', 'fam.tutors.callWith', 'fam.tutors.allSubjects', 'fam.tutors.lang.en', 'fam.tutors.lang.hi', 'fam.tutors.lang.both', 'fam.tutors.none'] as const;

export const chatHref = (t: Pick<TutorCard, 'key' | 'subject'>) => `/family/study?${t.subject ? `subject=${encodeURIComponent(t.subject)}&` : ''}tutor=${encodeURIComponent(t.key)}`;
export const callHref = (t: Pick<TutorCard, 'key'>) => `/family/call?tutor=${encodeURIComponent(t.key)}`;

const SPARK = 'M12 2l2 6 6 2-6 2-2 6-2-6-6-2 6-2z';

function Face({ tutor }: { tutor: TutorCard }) {
  return (
    <span aria-hidden="true" className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${TINT[tutor.tint].chip}`}>
      {tutor.subject ? (
        <SubjectGlyph subject={tutor.subject} className="h-6 w-6" />
      ) : (
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
          <path d={SPARK} />
        </svg>
      )}
    </span>
  );
}

function Card({ tutor, w }: { tutor: TutorCard; w: Words }) {
  return (
    <li data-tutor={tutor.key} className={`fam-surface flex min-w-0 flex-col gap-3 p-4 text-ink ${TINT[tutor.tint].card}`}>
      <div className="flex items-start gap-3">
        <Face tutor={tutor} />
        <div className="min-w-0">
          <h3 className="break-words text-lg font-extrabold leading-snug">{tutor.name}</h3>
          <p className="text-sm font-semibold">
            {tutor.subject ? w[`fam.subject.${tutor.subject}`] : w['fam.tutors.allSubjects']} · {w[`fam.tutors.lang.${tutor.language}`]}
          </p>
        </div>
      </div>
      <p className="break-words text-base">{tutor.style}</p>
      <div className="flex flex-wrap gap-2">
        <Button href={chatHref(tutor)} data-tutor-chat aria-label={fill(w['fam.tutors.chatWith'], { name: tutor.name })} className="min-w-[120px] flex-1">
          {w['fam.tutors.chat']}
        </Button>
        <Button href={callHref(tutor)} variant="outline" data-tutor-call aria-label={fill(w['fam.tutors.callWith'], { name: tutor.name })} className="min-w-[120px] flex-1">
          {w['fam.tutors.call']}
        </Button>
      </div>
    </li>
  );
}

export function TutorHall({ groups, w }: { groups: readonly TutorGroup[]; w: Words }) {
  if (groups.length === 0) {
    return (
      <p data-tutors-none className="fam-card bg-white p-4 text-base font-semibold text-slate">
        {w['fam.tutors.none']}
      </p>
    );
  }
  return (
    <>
      {groups.map((g) => (
        <section key={g.school ?? 'platform'} data-tutor-group={g.school === null ? 'platform' : 'school'} className="flex flex-col gap-3">
          <h2 className="fam-h2 text-ink">{g.school === null ? w['fam.tutors.platform'] : fill(w['fam.tutors.fromSchool'], { school: g.school })}</h2>
          <ul className="flex list-none flex-col gap-3 p-0">
            {g.tutors.map((t) => (
              <Card key={t.key} tutor={t} w={w} />
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
