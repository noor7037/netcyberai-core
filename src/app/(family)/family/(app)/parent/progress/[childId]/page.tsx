import { redirect } from 'next/navigation';
import { SchoolProgressView } from '@/components/family/SchoolProgress';
import { SubPageHeader } from '@/components/family/SubPageHeader';
import { WeeklyReports } from '@/components/family/WeeklyReports';
import { familyClaims } from '@/lib/family/db';
import { PROGRESS_KEYS } from '@/lib/family/marks-words';
import { listReports } from '@/lib/family/parent-report';
import { REPORT_KEYS } from '@/lib/family/report-words';
import { activeLinks, schoolProgressFor } from '@/lib/family/school';
import { familyPageRead, firstStepsNext, requireFamilyPage } from '@/lib/family/server';
import { familyWords } from '@/lib/family/words';

// A child's progress report in the parent area (C230-AJ part 5): behind the parent PIN, for a child of this account matched
// to a school student, read as the guardian (the school's row rules decide: the child's own marks in classes the school
// published and shared). Anything else shows only that there is no progress report yet. No rank, no comparison.
export const dynamic = 'force-dynamic';

export default async function FamilyParentProgressPage({ params }: { params: { childId: string } }) {
  const page = await requireFamilyPage();
  if (!page) redirect('/family/sign-in');
  const next = firstStepsNext(page);
  if (next) redirect(next);
  if (!page.parentMode) redirect('/family/parent');
  const lang = page.parentLang;
  const w = familyWords(lang, [...PROGRESS_KEYS, ...REPORT_KEYS]);
  const child = page.children.find((c) => c.childId === params.childId);
  const links = await familyPageRead(page, (db) => activeLinks(db, page.session.accountId));
  // W16-B3: the child's weekly reports, the family's own rows.
  const reports = child ? await familyPageRead(page, (db) => listReports(db, page.session.accountId, child.childId)) : [];
  const progress = child ? await schoolProgressFor(familyClaims(page.session), links, child.childId, { childView: false }) : null;
  return (
    <div lang={lang} className="flex min-h-screen flex-col">
      <SubPageHeader back="/family/parent" backLabel={w['fam.marks.backParent']} kicker={child?.firstName} title={w['fam.schoolProgress.title']} tone="ink" />
      <main className="fam-page" data-parent-progress>
        {child && <WeeklyReports reports={reports} w={w} lang={lang} />}
        <SchoolProgressView progress={progress ?? { session: null, groups: [] }} w={w} lang={lang} childId={child?.childId} />
      </main>
    </div>
  );
}
