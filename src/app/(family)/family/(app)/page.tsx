import Link from 'next/link';
import { redirect } from 'next/navigation';
import { FamilyHeader } from '@/components/family/FamilyHeader';
import { PlanCard } from '@/components/family/PlanCard';
import { familyModuleOn } from '@/lib/family/flags';
import { dayPlan } from '@/lib/family/plan';
import { indiaDate } from '@/lib/time/india';
import { childProgress } from '@/lib/family/learning';
import { familyPageRead, firstStepsNext, requireFamilyPage } from '@/lib/family/server';
import { familyWords } from '@/lib/family/words';
import { t, type MessageKey } from '@/lib/i18n';

// The Family app's home, in child mode (M1-2, C248; M1-6, C252): the app opens here, because most pilot children use a
// parent's phone. It shows where the child is: the topics they have checked, which are mastered (right on two days a
// week apart), and the way to study. Progress is made only of checked answers. A family that has not finished the
// parent's first steps is taken to the next one. With the plan module on, today's plan comes first (M2-2, C276).
const KEYS: MessageKey[] = ['fam.app.name', 'fam.home.hello', 'fam.class.label', 'fam.class.nursery', 'fam.class.lkg', 'fam.class.ukg', 'fam.home.parent', 'fam.home.whoIsLearning'];

export default async function FamilyHomePage() {
  const page = await requireFamilyPage();
  if (!page) redirect('/family/sign-in');
  const next = firstStepsNext(page);
  if (next) redirect(next);
  const child = page.child!;
  const lang = page.childLang;
  const { progress, plan } = await familyPageRead(page, async (db) => ({
    progress: await childProgress(db, page.session.accountId, child.childId, lang),
    plan: (await familyModuleOn(db, 'plan', page.session.accountId)) ? await dayPlan(db, page.session.accountId, child, indiaDate(), lang) : null,
  }));
  const mastered = progress.filter((p) => p.mastered).length;
  return (
    <div lang={lang} className="flex min-h-screen flex-col">
      <FamilyHeader w={familyWords(lang, KEYS)} child={child} children={page.children} />
      <main className="mx-auto -mt-4 flex w-full max-w-xl flex-1 flex-col gap-3 px-4 pb-10">
        {plan && <PlanCard plan={plan} lang={lang} />}
        <section data-family-start className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate/10">
          <h2 className="text-xl font-extrabold text-slate">{progress.length ? t(lang, 'fam.home.continueTitle') : t(lang, 'fam.home.startTitle')}</h2>
          <p className="mt-1 text-base text-slate/80">{progress.length ? t(lang, 'fam.home.continueLead') : t(lang, 'fam.home.startLead')}</p>
          <Link href="/family/study" className="mt-4 flex min-h-[44px] items-center justify-center rounded-2xl bg-royal px-4 text-base font-bold text-white hover:bg-royal-deep">
            {t(lang, 'fam.home.study')}
          </Link>
        </section>
        {progress.length > 0 && (
          <section data-family-progress aria-labelledby="fam-progress" className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate/10">
            <h2 id="fam-progress" className="text-lg font-extrabold text-slate">
              {t(lang, 'fam.progress.title')}
            </h2>
            <p className="mt-1 text-sm text-slate/80">{t(lang, 'fam.progress.summary', { topics: progress.length, mastered })}</p>
            <ul className="mt-3 flex flex-col gap-2">
              {progress.slice(0, 6).map((p) => (
                <li key={p.topicKey} className="flex items-center justify-between gap-3 rounded-2xl bg-off-white px-3 py-2">
                  <span className="min-w-0 text-sm font-semibold text-slate">{p.title}</span>
                  <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${p.mastered ? 'bg-emerald-text text-white' : 'bg-white text-slate ring-1 ring-slate/15'}`}>
                    {p.mastered ? t(lang, 'fam.progress.mastered') : t(lang, 'fam.progress.rightOf', { right: p.correct, all: p.answered })}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-slate/80">{t(lang, 'fam.progress.how')}</p>
          </section>
        )}
      </main>
    </div>
  );
}
