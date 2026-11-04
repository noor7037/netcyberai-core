import { familyClaims } from '@/lib/family/db';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { FamilyHeader } from '@/components/family/FamilyHeader';
import { HabitCard } from '@/components/family/HabitCard';
import { QuizCards } from '@/components/family/QuizCards';
import { ActivityTiles, type ActivityTile } from '@/components/family/home/ActivityTiles';
import { MissionCard } from '@/components/family/home/MissionCard';
import { TutorsTile } from '@/components/family/TutorsTile';
import { FamIcon } from '@/components/family/FamIcon';
import { Button } from '@/components/family/ui/Button';
import { HomeAsk } from '@/components/family/ui/HomeAsk';
import { LinkRow } from '@/components/family/ui/LinkRow';
import { SubjectGrid } from '@/components/family/ui/SubjectGrid';
import { classSubjects } from '@/lib/family/catalog';
import { loadChildSettings } from '@/lib/family/child-settings';
import { isPrePrimary, syllabusBoardOf } from '@/lib/family/children';
import { familyModuleOn } from '@/lib/family/flags';
import { readPlatformTutors } from '@/lib/family/tutors';
import { childHabit } from '@/lib/family/habit';
import { homePlan, plusOpen } from '@/lib/family/home-plan';
import { childProgress, openSubjects } from '@/lib/family/learning';
import { subjectAccess } from '@/lib/family/modules';
import { dayPlan } from '@/lib/family/plan';
import { quizCards } from '@/lib/family/quiz';
import { fill } from '@/lib/family/fill';
import { familyPageRead, firstStepsNext, requireFamilyPage } from '@/lib/family/server';
import { activeLinks, notifyOff, readSeen, schoolNewsFor, schoolSubjectIs, schoolTodayFor } from '@/lib/family/school';
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
// W19-C (the founder's two reference pictures): today's plan as the hero "Today's mission" with a drawn picture and a
// Start button (the ask card leads when the plan module is off, and follows the subjects otherwise), "Your activity"
// tiles with the numbers the page already reads, each opening /family/progress (which now holds the topic list), and
// the child's own Movement switch (/family/settings) honoured on this page.
const KEYS: MessageKey[] = ['fam.app.name', 'fam.home.hello', 'fam.class.label', 'fam.class.nursery', 'fam.class.lkg', 'fam.class.ukg', 'fam.hub.entry', 'fam.notify.center.title', 'fam.profile.title', 'fam.home.whoIsLearning', 'fam.progress.title'];

export default async function FamilyHomePage() {
  const page = await requireFamilyPage();
  if (!page) redirect('/family/sign-in');
  const next = firstStepsNext(page);
  if (next) redirect(next);
  const child = page.child!;
  const lang = page.childLang;
  const { progress, subjects, plan, habit, openToAll, links, schoolOn, meeting, seen, off, tutors, quizzes, settings } = await familyPageRead(page, async (db) => ({
    progress: await childProgress(db, page.session.accountId, child.childId, lang),
    subjects: isPrePrimary(child.classLevel) ? [] : await classSubjects(db, { board: syllabusBoardOf(child), classLevel: child.classLevel, stream: child.stream }),
    plan: (await familyModuleOn(db, 'plan', page.session.accountId)) ? await dayPlan(db, page.session.accountId, child, indiaDate(), lang) : null,
    habit: (await familyModuleOn(db, 'habit', page.session.accountId)) ? await childHabit(db, page.session.accountId, child, indiaDate(), lang) : null,
    openToAll: await openSubjects(db),
    // W16-B5: the Tutors tile, while the Tutor Hall is on: the platform tutors' names (the Hall itself adds a linked school's).
    tutors: !isPrePrimary(child.classLevel) && (await familyModuleOn(db, 'tutor_hall', page.session.accountId)) ? (await readPlatformTutors(db, lang)).slice(0, 6) : [],
    links: await activeLinks(db, page.session.accountId),
    schoolOn: await familyModuleOn(db, 'school_today', page.session.accountId),
    // M3-7 (C337): tonight's night of the home plan after a parent-teacher meeting, with the module on and Plus open.
    // W16-B1: the Quick quiz from a finished tutor session, or a review due.
    quizzes: isPrePrimary(child.classLevel) ? [] : await quizCards(db, { accountId: page.session.accountId, childId: child.childId }, indiaDate(), { limit: 2 }),
    seen: await readSeen(db, page.session.accountId),
    settings: await loadChildSettings(db, page.session.accountId, child.childId),
    off: await notifyOff(db, page.session.accountId),
    meeting: (await familyModuleOn(db, 'home_plan', page.session.accountId)) && (await plusOpen(db, page.session.accountId)) ? (await homePlan(db, page.session.accountId, child, indiaDate(), lang))?.tonight ?? null : null,
  }));
  // At school today (C230-AA): for a child matched to a connected school's student, today's mark as the school has it.
  const atSchool = !schoolOn ? null : await schoolTodayFor(familyClaims(page.session), links, child.childId, { withResults: true });
  // Tonight's practice (C335, L10): the app's subjects in which the class covered something today, each opening Study.
  const tonight = atSchool ? subjects.filter((s) => atSchool.tonight.some((t) => schoolSubjectIs(t.subject, s))) : [];
  // What is new from the connected schools since the parent last looked (M3-8a, C338), without the kinds turned off:
  // this child's own school news only, so on a shared phone one child never sees a brother's or sister's.
  const mine = links.map((l) => ({ ...l, children: l.children.filter((c) => c.childId === child.childId) })).filter((l) => l.children.length > 0);
  const news = mine.length ? await schoolNewsFor(familyClaims(page.session), mine, seen, off) : null;
  const mastered = progress.filter((p) => p.mastered).length;
  const tiles = subjects.map((s) => {
    const mine = progress.filter((p) => p.subject === s);
    return { subject: s, name: t(lang, `fam.subject.${s}` as MessageKey), open: subjectAccess(child, s, openToAll).open, free: child.freeSubject === s, checked: mine.length, mastered: mine.filter((p) => p.mastered).length };
  });
  const activity: ActivityTile[] = [
    { key: 'checked', title: t(lang, 'fam.w19.activity.checkedTitle'), value: progress.length, label: t(lang, 'fam.w19.activity.checked') },
    habit
      ? { key: 'days', title: t(lang, 'fam.w19.activity.daysTitle'), value: habit.doneDays, label: t(lang, 'fam.w19.activity.days') }
      : { key: 'mastered', title: t(lang, 'fam.w19.activity.masteredTitle'), value: mastered, label: t(lang, 'fam.w19.activity.mastered') },
  ];
  const ask = <HomeAsk title={t(lang, 'fam.home.askTitle')} lead={progress.length ? t(lang, 'fam.home.continueLead') : t(lang, 'fam.home.askLead')} cta={t(lang, 'fam.home.study')} />;
  const planDone = plan ? plan.items.filter((i) => i.done).length : 0;
  return (
    <div lang={lang} data-fam-motion={settings.motion ? undefined : 'off'} className="flex min-h-screen flex-col">
      <FamilyHeader w={familyWords(lang, KEYS)} child={child} children={page.children} news={news?.total ?? 0} />
      <main className="fam-page">
        {plan ? (
          <MissionCard
            plan={plan}
            words={{
              title: t(lang, 'fam.w19.mission.title'),
              start: t(lang, 'fam.w19.mission.start'),
              next: (topic) => t(lang, 'fam.w19.mission.next', { topic }),
              progress: t(lang, 'fam.plan.progress', { done: planDone, total: plan.items.length }),
              minutes: t(lang, 'fam.plan.minutes', { minutes: plan.minutes }),
              complete: t(lang, 'fam.plan.complete'),
              emptyLead: t(lang, 'fam.w19.mission.emptyLead'),
              study: t(lang, 'fam.home.study'),
              done: t(lang, 'fam.plan.done'),
              todo: t(lang, 'fam.plan.todo'),
            }}
          />
        ) : (
          ask
        )}
        <QuizCards cards={quizzes} lang={lang} today={indiaDate()} />
        {atSchool && (
          <section data-school-today className="fam-card fam-section fam-rise bg-white">
            <div className="flex items-center gap-3">
              <span aria-hidden="true" className="fam-chip-icon bg-emerald text-white">
                <FamIcon name="calendar" className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-base font-extrabold text-slate">{fill(t(lang, 'fam.school.homeToday'), { mark: t(lang, `fam.school.mark.${atSchool.today ?? 'none'}` as MessageKey) })}</p>
                <p className="fam-note text-slate/80">{atSchool.schoolName}</p>
              </div>
            </div>
            {tonight.length > 0 && (
              <div data-school-tonight-home className="flex flex-col gap-2">
                <p className="text-sm font-semibold text-slate">
                  {t(lang, 'fam.school.tonightTitle')}: {t(lang, 'fam.school.tonightHome')}
                </p>
                <div className="flex flex-wrap gap-2">
                  {tonight.map((s) => (
                    <Link key={s} href={`/family/study?subject=${s}`} className="fam-lift inline-flex min-h-[44px] items-center rounded-full bg-off-white px-4 text-sm font-bold text-ink ring-1 ring-ink/20">
                      {t(lang, `fam.subject.${s}` as MessageKey)}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}
        {/* C351: the child's own results, when the school lets children see them. */}
        {atSchool?.myResults && (
          <section data-my-results-home className="fam-card fam-section fam-rise bg-white">
            <h2 className="fam-h2 text-slate">{t(lang, 'fam.marks.homeCard')}</h2>
            <LinkRow href="/family/results" icon="chart">
              {t(lang, 'fam.marks.homeOpen')}
            </LinkRow>
          </section>
        )}
        {news && news.total > 0 && (
          <section data-school-news className="fam-card fam-section fam-rise bg-white">
            <h2 className="fam-h2 text-slate">{t(lang, 'fam.news.title')}</h2>
            <p className="text-sm text-slate">
              {(['homework', 'notices', 'results'] as const)
                .filter((k) => news[k] > 0)
                .map((k) => t(lang, `fam.news.${k}` as MessageKey, { n: news[k] }))
                .join(' · ')}
            </p>
            <LinkRow href="/family/parent" icon="bell">
              {t(lang, 'fam.news.open')}
            </LinkRow>
          </section>
        )}
        {meeting && (
          <section data-home-plan-tonight className="fam-card fam-section fam-rise bg-white">
            <h2 className="fam-h2 text-slate">{t(lang, 'fam.homePlan.childHome')}</h2>
            <LinkRow href={`/family/understand?kind=topic&key=${encodeURIComponent(meeting.topicKey)}`} icon="bulb">
              {meeting.title}
            </LinkRow>
          </section>
        )}
        <ActivityTiles title={t(lang, 'fam.w19.activity.title')} seeAll={t(lang, 'fam.w19.activity.seeAll')} open={t(lang, 'fam.w19.activity.open')} tiles={activity} />
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
        {tutors.length > 0 && <TutorsTile title={t(lang, 'fam.tutors.nav')} lead={t(lang, 'fam.tutors.homeLead')} names={tutors.map((x) => ({ key: x.key, name: x.name, tint: x.tint }))} />}
        {plan && ask}
        {habit && <HabitCard habit={habit} lang={lang} />}
        {/* W14-G: a plain way out of child mode (H1 keeps the header free of it). The parent area asks for the PIN, and
            signing out stays behind it. */}
        <div className="flex justify-center pb-2">
          <Button href="/family/parent" variant="outline" data-parent-entry className="!px-4 !py-2 text-sm">
            {t(lang, 'fam.header.switchParent')}
          </Button>
        </div>
      </main>
    </div>
  );
}
