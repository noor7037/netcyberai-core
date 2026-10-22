import type { Words } from '@/lib/family/fill';
import type { TalkQuestion } from '@/lib/family/habit';
import { Picture } from '../Picture';
import { ENTER } from '../ui/motion';

// Tonight's talk question for the child (D1-2, C294; the habit library, M2-3): a warm card with one question to take to
// the dinner table, from a topic answered this week. No AI call; picked by the day.
const titleLang = (title: string) => (/[ऀ-ॿ]/.test(title) ? 'hi' : 'en');

export function TalkCard({ w, talk }: { w: Words; talk: NonNullable<TalkQuestion> }) {
  const [before, after] = w[`fam.home.talk.${talk.template}`].split('{topic}');
  return (
    <section data-family-talk aria-labelledby="fam-talk" className={`flex gap-3 rounded-3xl bg-sunshine/25 p-4 ring-1 ring-gold/40 ${ENTER}`}>
      <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm">
        <Picture e="🍽️" size={30} />
      </span>
      <div className="min-w-0">
        <h2 id="fam-talk" className="text-base font-extrabold text-slate">
          {w['fam.home.talkTitle']}
        </h2>
        <p className="mt-1 text-base text-slate">
          {before}
          <strong lang={titleLang(talk.topic)}>{talk.topic}</strong>
          {after}
        </p>
        <p className="mt-1 text-xs font-semibold text-slate/80">{w['fam.home.talkLead']}</p>
      </div>
    </section>
  );
}
