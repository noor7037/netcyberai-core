import { redirect } from 'next/navigation';
import { SubPageHeader } from '@/components/family/SubPageHeader';
import { TUTOR_HALL_KEYS, TutorHall } from '@/components/family/TutorHall';
import { SUBJECT_IDS } from '@/lib/contracts/subjects';
import { isPrePrimary } from '@/lib/family/children';
import { familyClaims } from '@/lib/family/db';
import { offMessage, readFamilySwitches, switchOn } from '@/lib/family/flags';
import { familyPageRead, firstStepsNext, requireFamilyPage } from '@/lib/family/server';
import { loadHall } from '@/lib/family/tutors';
import { tutorParts } from '@/lib/family/tutor-parts';
import { familyWords } from '@/lib/family/words';
import { t, type MessageKey } from '@/lib/i18n';

// The Tutor Hall (W16-A3; Programme W16, decision 5): the tutors a child can chat with or call, by subject. NetCyberAI's
// tutors first, then one group for each linked school that has tutors of its own ("From <school>"), which a school adds in
// the school app and a family sees only after School Link pairing, with a consented child. Chat opens Study on the tutor's
// subject; Call opens the call screen (W16-A4). Behind the Family app's own switch for the Hall.
export const dynamic = 'force-dynamic';

export default async function FamilyTutorsPage() {
  const page = await requireFamilyPage();
  if (!page) redirect('/family/sign-in');
  const next = firstStepsNext(page);
  if (next) redirect(next);
  const child = page.child!;
  const lang = page.childLang;
  if (isPrePrimary(child.classLevel)) redirect('/family/study');
  const switches = await familyPageRead(page, (db) => readFamilySwitches(db, page.session.accountId));
  const on = switchOn(switches, 'tutor_hall');
  const groups = on ? await loadHall(familyClaims(page.session), (fn) => familyPageRead(page, fn), page.session.accountId, lang) : [];
  const w = familyWords(lang, [...TUTOR_HALL_KEYS, ...SUBJECT_IDS.map((s) => `fam.subject.${s}` as MessageKey)]);
  return (
    <div lang={lang} className="flex min-h-screen flex-col">
      <SubPageHeader back="/family/study" backLabel={t(lang, 'fam.tab.study')} title={t(lang, 'fam.tutors.title')} />
      <main className="relative mx-auto -mt-8 flex w-full max-w-xl flex-1 flex-col gap-5 px-4 pb-24" data-tutor-hall>
        {on ? (
          <>
            <p className="fam-note text-ink">{w['fam.tutors.lead']}</p>
            <TutorHall groups={groups} w={w} call={tutorParts(switches).call} />
          </>
        ) : (
          <p data-tutors-off className="fam-card bg-white p-4 text-base font-semibold text-slate">
            {offMessage(switches, 'tutor_hall', lang) ?? t(lang, 'fam.tutors.off')}
          </p>
        )}
      </main>
    </div>
  );
}
