import { redirect } from 'next/navigation';
import { EnglishCourse } from '@/components/family/english/EnglishCourse';
import { SubPageHeader } from '@/components/family/SubPageHeader';
import { ENGLISH_KEYS } from '@/lib/family/english/words';
import { familyPageRead, firstStepsNext, requireFamilyPage } from '@/lib/family/server';
import { familyWords } from '@/lib/family/words';
import { readFamilySwitches, switchOn } from '@/lib/family/flags';
import { t } from '@/lib/i18n';

// The English tab (docs/family-app/12, C274): the child's course map. Control's switch hides it; the parent's consent
// and the published course are checked by the course API, which the map calls.
export default async function FamilyEnglishPage() {
  const page = await requireFamilyPage();
  if (!page) redirect('/family/sign-in');
  const next = firstStepsNext(page);
  if (next) redirect(next);
  const lang = page.childLang;
  const switches = await familyPageRead(page, (db) => readFamilySwitches(db, page.session.accountId));
  if (!switches || !switchOn(switches, 'english_programme')) redirect('/family');
  return (
    <div lang={lang} className="flex min-h-screen flex-col">
      <SubPageHeader back="/family" backLabel={t(lang, 'fam.nav.home')} kicker={t(lang, 'fam.english.course')} title={t(lang, 'fam.english.title')} />
      <main className="mx-auto -mt-4 flex w-full max-w-xl flex-1 flex-col gap-4 px-4 pb-24">
        <EnglishCourse w={familyWords(lang, ENGLISH_KEYS)} lang={lang} />
      </main>
    </div>
  );
}
