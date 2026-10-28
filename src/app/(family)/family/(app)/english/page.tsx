import Link from 'next/link';
import { redirect } from 'next/navigation';
import { EnglishCourse } from '@/components/family/english/EnglishCourse';
import { Picture } from '@/components/family/Picture';
import { SubPageHeader } from '@/components/family/SubPageHeader';
import { ENGLISH_KEYS } from '@/lib/family/english/words';
import { familyPageRead, firstStepsNext, requireFamilyPage } from '@/lib/family/server';
import { familyWords } from '@/lib/family/words';
import { readFamilySwitches, switchOn } from '@/lib/family/flags';
import { isPrePrimary } from '@/lib/family/children';
import { t } from '@/lib/i18n';

// The English tab (docs/family-app/12, C274): the child's course map. Control's switch hides it; the parent's consent
// and the published course are checked by the course API, which the map calls. Live practice (E1, C382) has its entry
// here only when the parent said yes to the course and to voice practice, from Class 1.
export default async function FamilyEnglishPage() {
  const page = await requireFamilyPage();
  if (!page) redirect('/family/sign-in');
  const next = firstStepsNext(page);
  if (next) redirect(next);
  const lang = page.childLang;
  const switches = await familyPageRead(page, (db) => readFamilySwitches(db, page.session.accountId));
  if (!switches || !switchOn(switches, 'english_programme')) redirect('/family');
  const live = switchOn(switches, 'voice_input') && page.consents.english_programme && page.consents.voice_practice && !!page.child && !isPrePrimary(page.child.classLevel);
  return (
    <div lang={lang} className="flex min-h-screen flex-col">
      <SubPageHeader back="/family" backLabel={t(lang, 'fam.nav.home')} kicker={t(lang, 'fam.english.course')} title={t(lang, 'fam.english.title')} />
      <main className="fam-page">
        {live && (
          <Link href="/family/english/live" data-live-entry className="fam-card fam-press fam-rise flex min-h-[64px] items-center gap-3 bg-white p-4 text-slate">
            <Picture e="🗣️" size={36} />
            <span className="flex flex-1 flex-col">
              <span className="text-lg font-extrabold text-slate">{t(lang, 'fam.english.live.entry')}</span>
              <span className="text-sm text-slate">{t(lang, 'fam.english.live.entryBody')}</span>
            </span>
          </Link>
        )}
        <EnglishCourse w={familyWords(lang, ENGLISH_KEYS)} lang={lang} />
      </main>
    </div>
  );
}
