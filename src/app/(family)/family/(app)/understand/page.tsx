import { redirect } from 'next/navigation';
import { SubPageHeader } from '@/components/family/SubPageHeader';
import { UnderstandView } from '@/components/family/UnderstandView';
import { syllabusLine } from '@/lib/family/resolver';
import { familyPageRead, firstStepsNext, requireFamilyPage } from '@/lib/family/server';
import { UNDERSTAND_KEYS } from '@/lib/family/understand-words';
import { familyWords } from '@/lib/family/words';
import { t } from '@/lib/i18n';

// Understand a chapter or a topic (M1-5, C251). The key is a catalog line's (never the child's words).
export default async function FamilyUnderstandPage({ searchParams }: { searchParams: { kind?: string; key?: string } }) {
  const page = await requireFamilyPage();
  if (!page) redirect('/family/sign-in');
  const next = firstStepsNext(page);
  if (next) redirect(next);
  const kind = searchParams.kind === 'topic' ? 'topic' : 'chapter';
  const key = searchParams.key ?? '';
  const child = page.child!;
  const line = await familyPageRead(page, (db) => syllabusLine(db, child, { kind, key }));
  if (!line) redirect('/family/study');
  const lang = page.childLang;
  return (
    <div lang={lang} className="flex min-h-screen flex-col">
      <SubPageHeader back={`/family/study?subject=${line.subject}`} backLabel={t(lang, `fam.subject.${line.subject}`)} kicker={t(lang, 'fam.understand.title')} title={line.title} tone={line.subject === 'science' ? 'emerald' : 'royal'} />
      <main className="mx-auto -mt-4 flex w-full max-w-xl flex-1 flex-col gap-3 px-4 pb-24">
        <UnderstandView w={familyWords(lang, UNDERSTAND_KEYS)} input={{ kind, key: line.key }} tone={line.subject} />
      </main>
    </div>
  );
}
