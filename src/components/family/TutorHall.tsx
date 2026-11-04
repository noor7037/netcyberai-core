import { Button } from './ui/Button';
import { TutorFace } from './avatar/TutorFace';
import type { LessonTint } from '@/lib/design-tokens';
import { fill, type Words } from '@/lib/family/fill';
import type { TutorCard, TutorGroup } from '@/lib/family/tutors';

// The Tutor Hall (W16-A3): a card for each tutor on its lesson tint (the Family identity: tints and their deep accents, no
// gradient, no dark blue), with its name, subject, how it teaches and the language it speaks, and two actions: Chat (opens
// Study on the tutor's subject, which keeps the tutor) and Call (W16-A4). Server-rendered; only the face (W19-A TutorFace) is a client island. Calm: no ranking, no
// claim about any tutor; the words come from the tutor's own row. Every target is 44 px or more.
const TINT: Record<LessonTint, { card: string }> = {
  mint: { card: 'bg-lesson-mint' },
  butter: { card: 'bg-lesson-butter' },
  lilac: { card: 'bg-lesson-lilac' },
  blush: { card: 'bg-lesson-blush' },
  sky: { card: 'bg-lesson-sky' },
};

export const TUTOR_HALL_KEYS = ['fam.tutors.title', 'fam.tutors.lead', 'fam.tutors.platform', 'fam.tutors.fromSchool', 'fam.tutors.chat', 'fam.tutors.call', 'fam.tutors.chatWith', 'fam.tutors.callWith', 'fam.tutors.allSubjects', 'fam.tutors.lang.en', 'fam.tutors.lang.hi', 'fam.tutors.lang.both', 'fam.tutors.none'] as const;

export const chatHref = (t: Pick<TutorCard, 'key' | 'subject'>) => `/family/study?${t.subject ? `subject=${encodeURIComponent(t.subject)}&` : ''}tutor=${encodeURIComponent(t.key)}`;
export const callHref = (t: Pick<TutorCard, 'key' | 'subject'>) => `/family/call?tutor=${encodeURIComponent(t.key)}${t.subject ? `&subject=${encodeURIComponent(t.subject)}` : ''}`;

function Card({ tutor, w, call }: { tutor: TutorCard; w: Words; call: boolean }) {
  return (
    <li data-tutor={tutor.key} className={`fam-surface flex min-w-0 flex-col gap-3 p-4 text-ink ${TINT[tutor.tint].card}`}>
      <div className="flex items-start gap-3">
        <TutorFace size="sm" tutorKey={tutor.key} subject={tutor.subject} className="mt-1" />
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
        {call && (
          <Button href={callHref(tutor)} variant="outline" data-tutor-call aria-label={fill(w['fam.tutors.callWith'], { name: tutor.name })} className="min-w-[120px] flex-1">
            {w['fam.tutors.call']}
          </Button>
        )}
      </div>
    </li>
  );
}

// `call`: false while Control has the call switched off (W16-B5): the Hall then offers Chat alone.
export function TutorHall({ groups, w, call = true }: { groups: readonly TutorGroup[]; w: Words; call?: boolean }) {
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
              <Card key={t.key} tutor={t} w={w} call={call} />
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
