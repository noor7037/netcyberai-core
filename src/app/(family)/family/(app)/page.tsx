import { redirect } from 'next/navigation';
import { AskBox } from '@/components/family/home/AskBox';
import { HomeHeader } from '@/components/family/home/HomeHeader';
import { SubjectTiles } from '@/components/family/home/SubjectTiles';
import { TalkCard } from '@/components/family/home/TalkCard';
import { HabitCard } from '@/components/family/HabitCard';
import { PlanCard } from '@/components/family/PlanCard';
import { EmptyState } from '@/components/family/ui/EmptyState';
import { classSubjects } from '@/lib/family/catalog';
import { isPrePrimary, syllabusBoardOf } from '@/lib/family/children';
import { readFamilySwitches, switchOn } from '@/lib/family/flags';
import { childHabit, talkQuestion } from '@/lib/family/habit';
import { greetingOf, homeParts, indiaHour, stageOf, subjectTiles } from '@/lib/family/home';
import { childProgress } from '@/lib/family/learning';
import { dayPlan } from '@/lib/family/plan';
import { familyPageRead, firstStepsNext, requireFamilyPage } from '@/lib/family/server';
import { UNDERSTAND_KEYS } from '@/lib/family/understand-words';
import { voiceDay } from '@/lib/family/voice';
import { VOICE_KEYS } from '@/lib/family/voice-words';
import { familyWords } from '@/lib/family/words';
import { indiaDate } from '@/lib/time/india';
import { t, type MessageKey } from '@/lib/i18n';

// The Family app's home, in child mode (M1-2, C248; M1-6, C252; D1-2, C294 as in the overview board): the app opens
// here, because most pilot children use a parent's phone. Top to bottom: the greeting band, the ask box, today's plan,
// the subject tiles, tonight's talk question, then the week, the badges and the jar. Each part only when its module is
// on and its data exists (src/lib/family/home.ts); a first-time child gets a designed welcome. Progress is made only of
// checked answers. A family that has not finished the parent's first steps is taken to the next one. Server-rendered;
// only the ask box runs in the browser.
const HEADER_KEYS: MessageKey[] = [
  'fam.app.name', 'fam.home.brandLine', 'fam.home.greet.morning', 'fam.home.greet.afternoon', 'fam.home.greet.evening', 'fam.class.label', 'fam.class.nursery',
  'fam.class.lkg', 'fam.class.ukg', 'fam.home.parent', 'fam.home.whoIsLearning',
];
const TILE_KEYS: MessageKey[] = ['fam.home.subjectsTitle', 'fam.home.tileProgress', 'fam.home.tileStart', 'fam.home.tileFree', 'fam.home.tileClosed', 'fam.home.tileBar'];
const TALK_KEYS: MessageKey[] = ['fam.home.talkTitle', 'fam.home.talkLead', 'fam.home.talk.0', 'fam.home.talk.1', 'fam.home.talk.2', 'fam.home.talk.3'];
const ASK_KEYS: MessageKey[] = ['fam.home.askLabel', 'fam.home.askPlaceholder', 'fam.home.askPlaceholderType', 'fam.study.askButton', 'fam.homework.studyLink', ...UNDERSTAND_KEYS];

export default async function FamilyHomePage() {
  const page = await requireFamilyPage();
  if (!page) redirect('/family/sign-in');
  const next = firstStepsNext(page);
  if (next) redirect(next);
  const child = page.child!;
  const lang = page.childLang;
  const today = indiaDate();
  const { switches, progress, subjects } = await familyPageRead(page, async (db) => ({
    switches: await readFamilySwitches(db, page.session.accountId),
    progress: await childProgress(db, page.session.accountId, child.childId, lang),
    subjects: isPrePrimary(child.classLevel) ? [] : await classSubjects(db, { board: syllabusBoardOf(child), classLevel: child.classLevel }),
  }));
  const on = { plan: switchOn(switches, 'plan'), habit: switchOn(switches, 'habit'), homework: switchOn(switches, 'homework'), voiceInput: switchOn(switches, 'voice_input') };
  const { plan, habit, talk, voiceLeft } = await familyPageRead(page, async (db) => ({
    plan: on.plan ? await dayPlan(db, page.session.accountId, child, today, lang) : null,
    habit: on.habit ? await childHabit(db, page.session.accountId, child, today, lang) : null,
    talk: on.habit ? await talkQuestion(db, page.session.accountId, child.childId, today, lang) : null,
    voiceLeft: on.voiceInput && page.consents.voice_practice ? (await voiceDay(db, page.session.accountId, child.childId, today)).left : null,
  }));
  const parts = homeParts({
    modules: on,
    consents: { voicePractice: !!page.consents.voice_practice },
    hasPlan: !!plan && plan.items.length > 0,
    hasHabit: !!habit,
    hasTalk: !!talk,
    subjects: subjects.length,
    progress: progress.length,
  });
  const stage = stageOf(child.classLevel);
  const tiles = subjectTiles(subjects, progress, child.freeSubject);
  const w = familyWords(lang, [...HEADER_KEYS, ...TILE_KEYS, ...TALK_KEYS, ...subjects.map((s) => `fam.subject.${s}` as MessageKey)]);
  const askWords = familyWords(lang, [...ASK_KEYS, ...(parts.microphone ? VOICE_KEYS : [])]);
  return (
    <div lang={lang} className="flex min-h-screen flex-col bg-off-white">
      <HomeHeader w={w} child={child} children={page.children} greeting={greetingOf(indiaHour())} stage={stage} />
      <main className="relative mx-auto -mt-10 flex w-full max-w-xl flex-1 flex-col gap-5 px-4 pb-10">
        <AskBox w={askWords} camera={parts.camera} voice={parts.microphone && voiceLeft !== null ? { secondsLeft: voiceLeft } : null} tone={child.freeSubject ?? subjects[0] ?? 'mathematics'} />
        {parts.welcome && (
          <EmptyState
            e="👋"
            title={t(lang, 'fam.home.welcomeTitle', { name: child.firstName })}
            body={t(lang, isPrePrimary(child.classLevel) ? 'fam.study.prePrimary' : 'fam.home.welcomeBody')}
            action={isPrePrimary(child.classLevel) ? undefined : { href: '/family/study', label: t(lang, 'fam.home.welcomeAction') }}
          />
        )}
        {parts.plan && plan && <PlanCard plan={plan} lang={lang} />}
        {parts.tiles && <SubjectTiles w={w} tiles={tiles} stage={stage} />}
        {parts.talk && talk && <TalkCard w={w} talk={talk} />}
        {parts.week && habit && <HabitCard habit={habit} lang={lang} />}
      </main>
    </div>
  );
}
