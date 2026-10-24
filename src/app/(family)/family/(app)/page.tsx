import Link from 'next/link';
import { redirect } from 'next/navigation';
import { FamilyHeader } from '@/components/family/FamilyHeader';
import { HabitCard } from '@/components/family/HabitCard';
import { PlanCard } from '@/components/family/PlanCard';
import { HomeAsk } from '@/components/family/ui/HomeAsk';
import { ProgressRing } from '@/components/family/ui/ProgressRing';
import { SubjectGrid } from '@/components/family/ui/SubjectGrid';
import { classSubjects } from '@/lib/family/catalog';
import { isPrePrimary, syllabusBoardOf } from '@/lib/family/children';
import { familyModuleOn } from '@/lib/family/flags';
import { childHabit } from '@/lib/family/habit';
import { childProgress, openSubjects } from '@/lib/family/learning';
import { subjectAccess } from '@/lib/family/modules';
import { dayPlan } from '@/lib/family/plan';
import { fill } from '@/lib/family/fill';
import { familyPageRead, firstStepsNext, requireFamilyPage } from '@/lib/family/server';
import { activeLinks, schoolSubjectIs, schoolTodayFor } from '@/lib/family/school';
import { familyWords } from '@/lib/family/words';
import { t, type MessageKey } from '@/lib/i18n';
import { indiaDate } from '@/lib/time/india';

// The Family app's home, in child mode (M1-2, C248; M1-6, C252): the app opens here, because most pilot children use a
// parent's phone. It shows where the child is: the topics they have checked, which are mastered (right on two days a
// week apart), and the way to study. Progress is made only of checked answers. A family that has not finished the
// parent's first steps is taken to the next one.
// D1 (C230-Q), the overview board's home: the ask card first, the child's subjects as tiles in their own colours
// (checked and mastered per subject, "free", a lock), and progress as a ring. Learning first: no streaks, no ranks.
// M2-2 (C276): with the plan module on, today's plan follows the ask card (the learning-first routine).
// M2-3 (C277): with the habit module on, the week, the badges and the jar follow the plan.
const KEYS: MessageKey[] = ['fam.app.name', 'fam.home.hello', 'fam.class.label', 'fam.class.nursery', 'fam.class.lkg', 'fam.class.ukg', 'fam.home.parent', 'fam.home.whoIsLearning'];

export default async function FamilyHomePage() {
  const page = await requireFamilyPage();
  if (!page) redirect('/family/sign-in');
  const next = firstStepsNext(page);
  if (next) redirect(next);
  const child = page.child!;
  const lang = page.childLang;
  const { progress, subjects, plan, habit, openToAll, links } = await familyPageRead(page, async (db) => ({
    progress: await childProgress(db, page.session.accountId, child.childId, lang),
    subjects: isPrePrimary(child.classLevel) ? [] : await classSubjects(db, { board: syllabusBoardOf(child), classLevel: child.classLevel }),
    plan: (await familyModuleOn(db, 'plan', page.session.accountId)) ? await dayPlan(db, page.session.accountId, child, indiaDate(), lang) : null,
    habit: (await familyModuleOn(db, 'habit', page.session.accountId)) ? await childHabit(db, page.session.accountId, child, indiaDate(), lang) : null,
    openToAll: await openSubjects(db),
    links: await activeLinks(db, page.session.accountId),
  }));
  // At school today (C230-AA): for a child matched to a connected school's student, today's mark as the school has it.
  const atSchool = await schoolTodayFor({ accountId: page.session.accountId, tokenVersion: page.session.tokenVersion }, links, child.childId);
  // Tonight's practice (C335, L10): the app's subjects in which the class covered something today, each opening Study.
  const tonight = atSchool ? subjects.filter((s) => atSchool.tonight.some((t) => schoolSubjectIs(t.subject, s))) : [];
  const mastered = progress.filter((p) => p.mastered).length;
  const tiles = subjects.map((s) => {
    const mine = progress.filter((p) => p.subject === s);
    return { subject: s, name: t(lang, `fam.subject.${s}` as MessageKey), open: subjectAccess(child, s, openToAll).open, free: child.freeSubject === s, checked: mine.length, mastered: mine.filter((p) => p.mastered).length };
  });
  return (
    <div lang={lang} className="flex min-h-screen flex-col">
      <FamilyHeader w={familyWords(lang, KEYS)} child={child} children={page.children} />
      <main className="relative mx-auto -mt-8 flex w-full max-w-xl flex-1 flex-col gap-5 px-4 pb-10">
        <HomeAsk title={t(lang, 'fam.home.askTitle')} lead={progress.length ? t(lang, 'fam.home.continueLead') : t(lang, 'fam.home.askLead')} cta={t(lang, 'fam.home.study')} />
        {atSchool && (
          <section data-school-today className="fam-card flex flex-col gap-1 bg-white p-4">
            <p className="text-base font-bold text-slate">{fill(t(lang, 'fam.school.homeToday'), { mark: t(lang, `fam.school.mark.${atSchool.today ?? 'none'}` as MessageKey) })}</p>
            <p className="text-sm text-slate">{atSchool.schoolName}</p>
            {tonight.length > 0 && (
              <div data-school-tonight-home className="mt-2 flex flex-col gap-2">
                <p className="text-sm font-semibold text-slate">
                  {t(lang, 'fam.school.tonightTitle')}: {t(lang, 'fam.school.tonightHome')}
                </p>
                <div className="flex flex-wrap gap-2">
                  {tonight.map((s) => (
                    <Link key={s} href={`/family/study?subject=${s}`} className="fam-press inline-flex min-h-[44px] items-center rounded-xl bg-off-white px-3 text-sm font-semibold text-royal">
                      {t(lang, `fam.subject.${s}` as MessageKey)}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}
        {plan && <PlanCard plan={plan} lang={lang} />}
        {habit && <HabitCard habit={habit} lang={lang} />}
        <SubjectGrid
          title={t(lang, 'fam.home.subjectsTitle')}
          tiles={tiles}
          delay={120}
          words={{
            free: t(lang, 'fam.home.subjectFree'),
            locked: t(lang, 'fam.subject.locked'),
            start: t(lang, 'fam.home.subjectStart'),
            meter: (checked, done) => t(lang, 'fam.home.subjectMeter', { checked, mastered: done }),
          }}
        />
        {progress.length > 0 && (
          <section data-family-progress aria-labelledby="fam-progress" className="fam-card fam-rise bg-white p-5" style={{ ['--d' as string]: '240ms' } as React.CSSProperties}>
            <div className="flex items-center gap-4">
              <ProgressRing value={mastered} max={progress.length} size={72} stroke={8} track="text-leaf/20" arc="text-emerald">
                <span className="text-lg font-black text-slate">{mastered}</span>
              </ProgressRing>
              <div className="min-w-0">
                <h2 id="fam-progress" className="text-lg font-extrabold text-slate">
                  {t(lang, 'fam.progress.title')}
                </h2>
                <p className="mt-0.5 text-sm text-slate/80">{t(lang, 'fam.progress.summary', { topics: progress.length, mastered })}</p>
              </div>
            </div>
            <ul className="mt-4 flex flex-col gap-2">
              {progress.slice(0, 6).map((p) => (
                <li key={p.topicKey}>
                  <Link href={`/family/understand?kind=${/\.t\d+$/.test(p.topicKey) ? 'topic' : 'chapter'}&key=${encodeURIComponent(p.topicKey)}`} className="fam-press flex min-h-[48px] items-center justify-between gap-3 rounded-2xl bg-off-white px-3 py-2">
                    <span className="min-w-0 text-sm font-semibold text-slate">{p.title}</span>
                    <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${p.mastered ? 'bg-emerald-text text-white' : 'bg-white text-slate ring-1 ring-slate/15'}`}>
                      {p.mastered ? t(lang, 'fam.progress.mastered') : t(lang, 'fam.progress.rightOf', { right: p.correct, all: p.answered })}
                    </span>
                  </Link>
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
