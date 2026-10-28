import { redirect } from 'next/navigation';
import { SchoolProgressView } from '@/components/family/SchoolProgress';
import { SubPageHeader } from '@/components/family/SubPageHeader';
import { familyClaims } from '@/lib/family/db';
import { PROGRESS_KEYS } from '@/lib/family/marks-words';
import { activeLinks, schoolProgressFor } from '@/lib/family/school';
import { familyPageRead, firstStepsNext, requireFamilyPage } from '@/lib/family/server';
import { familyWords } from '@/lib/family/words';

// "My progress report" (C230-AJ part 5), the child's own view: for the child using the app now, matched to a school student,
// their published exams of this session the school shared, by kind of exam, only while the school lets children see their
// own results. Calm, and about nobody else: no rank, no comparison. Without the school's leave there is nothing here.
export const dynamic = 'force-dynamic';

export default async function FamilyMyProgressPage() {
  const page = await requireFamilyPage();
  if (!page) redirect('/family/sign-in');
  const next = firstStepsNext(page);
  if (next) redirect(next);
  const child = page.child!;
  const lang = page.childLang;
  const w = familyWords(lang, PROGRESS_KEYS);
  const links = await familyPageRead(page, (db) => activeLinks(db, page.session.accountId));
  const progress = await schoolProgressFor(familyClaims(page.session), links, child.childId, { childView: true });
  if (!progress) redirect('/family');
  return (
    <div lang={lang} className="flex min-h-screen flex-col">
      <SubPageHeader back="/family/results" backLabel={w['fam.marks.myResults']} title={w['fam.schoolProgress.title']} tone="emerald" />
      <main className="fam-page" data-my-progress>
        <SchoolProgressView progress={progress} w={w} lang={lang} />
      </main>
    </div>
  );
}
