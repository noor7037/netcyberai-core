import Link from 'next/link';
import { redirect } from 'next/navigation';
import { FamilyHeader } from '@/components/family/FamilyHeader';
import { firstStepsNext, requireFamilyPage } from '@/lib/family/server';
import { familyWords } from '@/lib/family/words';
import { t, type MessageKey } from '@/lib/i18n';

// The Family app's home, in child mode (M1-2, C248): the app opens here, because most pilot children use a parent's
// phone. A family that has not finished the parent's first steps is taken to the next one.
const KEYS: MessageKey[] = ['fam.app.name', 'fam.home.hello', 'fam.class.label', 'fam.home.parent', 'fam.home.whoIsLearning'];

export default async function FamilyHomePage() {
  const page = await requireFamilyPage();
  if (!page) redirect('/family/sign-in');
  const next = firstStepsNext(page);
  if (next) redirect(next);
  const lang = page.childLang;
  return (
    <div lang={lang} className="flex min-h-screen flex-col">
      <FamilyHeader w={familyWords(lang, KEYS)} child={page.child} children={page.children} />
      <main className="mx-auto -mt-4 flex w-full max-w-xl flex-1 flex-col gap-3 px-4 pb-10">
        <section data-family-start className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate/10">
          <h2 className="text-xl font-extrabold text-slate">{t(lang, 'fam.home.startTitle')}</h2>
          <p className="mt-1 text-base text-slate/80">{t(lang, 'fam.home.startLead')}</p>
          <Link href="/family/study" className="mt-4 flex min-h-[44px] items-center justify-center rounded-2xl bg-royal px-4 text-base font-bold text-white hover:bg-royal-deep">
            {t(lang, 'fam.home.study')}
          </Link>
        </section>
      </main>
    </div>
  );
}
