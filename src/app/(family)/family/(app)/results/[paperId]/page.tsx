import { redirect } from 'next/navigation';
import { CheckedPaperView } from '@/components/family/CheckedPaperView';
import { SubPageHeader } from '@/components/family/SubPageHeader';
import { fill } from '@/lib/family/fill';
import { CHECKED_PAPER_KEYS } from '@/lib/family/marks-words';
import { activeLinks, appSubjectFor, schoolPaperFor } from '@/lib/family/school';
import { familyPageRead, firstStepsNext, requireFamilyPage } from '@/lib/family/server';
import { familyWords } from '@/lib/family/words';
import { t, type MessageKey } from '@/lib/i18n';

// One checked paper in the child's own view (C351): the child using the app now, matched to a school student, while
// the school lets children see their own results and families see the checked answer sheets (both held by School
// Link, read as the guardian). The same paper as the parent's, in the child's language and a warmer register.
export const dynamic = 'force-dynamic';

const day = (iso: string, lang: 'en' | 'hi') => new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));

export default async function FamilyMyCheckedPaperPage({ params }: { params: { paperId: string } }) {
  const page = await requireFamilyPage();
  if (!page) redirect('/family/sign-in');
  const next = firstStepsNext(page);
  if (next) redirect(next);
  const child = page.child!;
  const lang = page.childLang;
  const w = familyWords(lang, CHECKED_PAPER_KEYS);
  const links = await familyPageRead(page, (db) => activeLinks(db, page.session.accountId));
  const paper = await schoolPaperFor({ accountId: page.session.accountId, tokenVersion: page.session.tokenVersion }, links, child.childId, params.paperId, { childView: true });
  const subject = paper ? appSubjectFor(paper.subject) : null;
  return (
    <div lang={lang} className="flex min-h-screen flex-col">
      <SubPageHeader
        back="/family/results"
        backLabel={w['fam.marks.backResults']}
        kicker={paper ? fill(w['fam.school.resultPublished'], { date: day(paper.publishedOn, lang) }) : undefined}
        title={paper ? fill(w['fam.marks.title'], { subject: subject ? t(lang, `fam.subject.${subject}` as MessageKey) : paper.subject }) : w['fam.marks.paperTitle']}
        subject={subject ?? undefined}
        tone="emerald"
      />
      <main className="relative mx-auto -mt-8 flex w-full max-w-xl flex-1 flex-col gap-3 px-4 pb-24">
        {paper ? <CheckedPaperView paper={paper} w={w} childView /> : <p className="fam-card bg-white p-4 text-base text-slate" data-paper-gone>{w['fam.marks.gone']}</p>}
      </main>
    </div>
  );
}
