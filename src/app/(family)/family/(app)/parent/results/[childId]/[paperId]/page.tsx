import { redirect } from 'next/navigation';
import { familyClaims } from '@/lib/family/db';
import { CheckedPaperView } from '@/components/family/CheckedPaperView';
import { SubPageHeader } from '@/components/family/SubPageHeader';
import { fill } from '@/lib/family/fill';
import { CHECKED_PAPER_KEYS } from '@/lib/family/marks-words';
import { activeLinks, appSubjectFor, schoolPaperFor } from '@/lib/family/school';
import { familyPageRead, firstStepsNext, requireFamilyPage } from '@/lib/family/server';
import { familyWords } from '@/lib/family/words';
import { t, type MessageKey } from '@/lib/i18n';
import { sameInkOnBothSides } from '@/lib/family/day-text';

// A child's checked paper, in the parent area (C351): behind the parent PIN, for a child of this account matched to a
// school student, read as the guardian (the school's row rules decide: the child's own approved script of a
// publication in force, while the school lets families see the checked answer sheets). Anything else says only that
// the paper is not available.
export const dynamic = 'force-dynamic';

const day = (iso: string, lang: 'en' | 'hi') => sameInkOnBothSides(new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`)));

export default async function FamilyParentCheckedPaperPage({ params }: { params: { childId: string; paperId: string } }) {
  const page = await requireFamilyPage();
  if (!page) redirect('/family/sign-in');
  const next = firstStepsNext(page);
  if (next) redirect(next);
  if (!page.parentMode) redirect('/family/parent');
  const lang = page.parentLang;
  const w = familyWords(lang, CHECKED_PAPER_KEYS);
  const child = page.children.find((c) => c.childId === params.childId);
  const links = await familyPageRead(page, (db) => activeLinks(db, page.session.accountId));
  const paper = child ? await schoolPaperFor(familyClaims(page.session), links, child.childId, params.paperId, { childView: false }) : null;
  const subject = paper ? appSubjectFor(paper.subject) : null;
  const subjectName = paper ? (subject ? t(lang, `fam.subject.${subject}` as MessageKey) : paper.subject) : '';
  return (
    <div lang={lang} className="flex min-h-screen flex-col">
      <SubPageHeader
        back="/family/parent"
        backLabel={w['fam.marks.backParent']}
        kicker={paper ? fill(w['fam.school.resultPublished'], { date: day(paper.publishedOn, lang) }) : undefined}
        title={paper ? fill(w['fam.marks.title'], { subject: subjectName }) : w['fam.marks.paperTitle']}
        tone="ink"
      />
      <main className="fam-page">
        {paper ? <CheckedPaperView paper={paper} w={w} childView={false} /> : <p className="fam-card bg-white p-4 text-base font-semibold text-slate" data-paper-gone>{w['fam.marks.gone']}</p>}
      </main>
    </div>
  );
}
