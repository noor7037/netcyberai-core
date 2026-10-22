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
// worked steps. Shown when Control has switched the `homework` module on.
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
      <SubPageHeader back="/family/study" backLabel={t(lang, 'fam.study.title')} kicker={classText((k) => t(lang, k), child.classLevel)} title={t(lang, 'fam.homework.title')} tone="royal" />
      <main className="mx-auto -mt-4 flex w-full max-w-xl flex-1 flex-col gap-4 px-4 pb-24">
        {on ? (
          <HomeworkHelper w={familyWords(lang, HOMEWORK_KEYS)} />
        ) : (
          <p className="rounded-3xl bg-white p-5 text-base text-slate shadow-sm ring-1 ring-slate/10">{t(lang, 'fam.homework.err.off')}</p>
        )}
      </main>
    </div>
  );
}
