import { redirect } from 'next/navigation';
import { HomeworkHelper } from '@/components/family/HomeworkHelper';
import { SubPageHeader } from '@/components/family/SubPageHeader';
import { classText } from '@/lib/family/fill';
import { familyModuleOn } from '@/lib/family/flags';
import { HOMEWORK_KEYS } from '@/lib/family/homework-words';
import { familyPageRead, firstStepsNext, requireFamilyPage } from '@/lib/family/server';
import { familyWords } from '@/lib/family/words';
import { t } from '@/lib/i18n';

// The homework helper (M2-6, C280): a photo of one question, then hints, the child's own answers and, when stuck, the
// worked steps. Shown when Control has switched the `homework` module on and the parent has allowed photo questions.
// F2 on D1 (C230-Q): D1 cards, pulled up under the band (`relative`, so the band never paints over them).
export default async function FamilyHomeworkPage() {
  const page = await requireFamilyPage();
  if (!page) redirect('/family/sign-in');
  const next = firstStepsNext(page);
  if (next) redirect(next);
  const child = page.child!;
  const lang = page.childLang;
  const on = await familyPageRead(page, (db) => familyModuleOn(db, 'homework', page.session.accountId));
  return (
    <div lang={lang} className="flex min-h-screen flex-col">
      <SubPageHeader back="/family/study" backLabel={t(lang, 'fam.study.title')} kicker={classText((k) => t(lang, k), child.classLevel)} title={t(lang, 'fam.homework.title')} tone="ink" />
      <main className="relative mx-auto -mt-8 flex w-full max-w-xl flex-1 flex-col gap-4 px-4 pb-24">
        {on && !page.consents.photo_input ? (
          <p data-homework-consent className="fam-card fam-rise bg-white p-5 text-base text-slate">
            {t(lang, 'fam.homework.err.photo_consent')}
          </p>
        ) : on ? (
          <HomeworkHelper w={familyWords(lang, HOMEWORK_KEYS)} />
        ) : (
          <p className="fam-card fam-rise bg-white p-5 text-base text-slate">{t(lang, 'fam.homework.err.off')}</p>
        )}
      </main>
    </div>
  );
}
