import { redirect } from 'next/navigation';
import { TestSitting } from '@/components/family/school-test/TestSitting';
import { SubPageHeader } from '@/components/family/SubPageHeader';
import { familyClaims } from '@/lib/family/db';
import { classText } from '@/lib/family/fill';
import { childOnlineTests } from '@/lib/family/online-tests';
import { activeLinks } from '@/lib/family/school';
import { familyPageRead, firstStepsNext, requireFamilyPage } from '@/lib/family/server';
import { familyWords } from '@/lib/family/words';
import { t, type MessageKey } from '@/lib/i18n';

// A school's online test, sat in child mode (AQ-4, C365): the start screen, the test, and the done screen, for the
// child using the app now (on the parent's phone, or the child's own phone). The test is read as the guardian through
// School Link; a test that is not this child's class's, or no longer open, says so. Never a mark here.
export const dynamic = 'force-dynamic';

const KEYS = [
  'fam.test.title',
  'fam.test.startTitle',
  'fam.test.minutes',
  'fam.test.questions',
  'fam.test.rule.once',
  'fam.test.rule.time',
  'fam.test.rule.saved',
  'fam.test.rule.leave',
  'fam.test.rule.alone',
  'fam.test.notYet',
  'fam.test.closedNow',
  'fam.test.gone',
  'fam.test.start',
  'fam.test.continue',
  'fam.test.tryAgain',
  'fam.test.timeLeft',
  'fam.test.question',
  'fam.test.marks',
  'fam.test.markOne',
  'fam.test.section',
  'fam.test.group',
  'fam.test.chooseOne',
  'fam.test.chooseAll',
  'fam.test.number',
  'fam.test.text',
  'fam.test.textLeft',
  'fam.test.review',
  'fam.test.clear',
  'fam.test.prev',
  'fam.test.next',
  'fam.test.palette',
  'fam.test.go',
  'fam.test.legend.answered',
  'fam.test.legend.notAnswered',
  'fam.test.legend.review',
  'fam.test.saving',
  'fam.test.saved',
  'fam.test.offline',
  'fam.test.notSaved',
  'fam.test.fullscreen',
  'fam.test.leftNote',
  'fam.test.submit',
  'fam.test.submitSure',
  'fam.test.submitCount',
  'fam.test.submitWait',
  'fam.test.submitYes',
  'fam.test.keepGoing',
  'fam.test.timeUp',
  'fam.test.doneTitle',
  'fam.test.doneLead',
  'fam.test.backToStudy',
] as const satisfies readonly MessageKey[];

export default async function FamilySchoolTestPage({ params }: { params: { testId: string } }) {
  const page = await requireFamilyPage();
  if (!page) redirect('/family/sign-in');
  const next = firstStepsNext(page);
  if (next) redirect(next);
  const child = page.child!;
  const lang = page.childLang;
  const links = await familyPageRead(page, (db) => activeLinks(db, page.session.accountId));
  const test = (await childOnlineTests(familyClaims(page.session), links, child.childId)).find((x) => x.testId === params.testId) ?? null;
  return (
    <div lang={lang} className="flex min-h-screen flex-col">
      <SubPageHeader
        back="/family/study"
        backLabel={t(lang, 'fam.study.title')}
        kicker={classText((k) => t(lang, k), child.classLevel)}
        title={t(lang, 'fam.test.title')}
        tone="ink"
      />
      <main className="relative mx-auto -mt-8 flex w-full max-w-xl flex-1 flex-col gap-4 px-4 pb-24" data-school-test-page>
        <TestSitting w={familyWords(lang, KEYS)} lang={lang} test={test} testId={params.testId} />
      </main>
    </div>
  );
}
