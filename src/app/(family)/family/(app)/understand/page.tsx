import { redirect } from 'next/navigation';
import { SubPageHeader } from '@/components/family/SubPageHeader';
import { UnderstandView } from '@/components/family/UnderstandView';
import { DataSaverSwitch } from '@/components/family/offline/DataSaverSwitch';
import { ownSyllabusLine } from '@/lib/family/child-syllabus';
import { fill } from '@/lib/family/fill';
import { familyModuleOn } from '@/lib/family/flags';
import { libraryResponse, syllabusLine } from '@/lib/family/resolver';
import { familyPageRead, firstStepsNext, requireFamilyPage } from '@/lib/family/server';
import { OFFLINE_KEYS } from '@/lib/family/offline-words';
import { UNDERSTAND_KEYS } from '@/lib/family/understand-words';
import { familyWords } from '@/lib/family/words';
import { t } from '@/lib/i18n';

// Understand a chapter or a topic (M1-5, C251). The key is a catalog line's (never the child's words). A response
// already in the shared library comes with the page (C255); otherwise the phone asks for it. With Control's offline
// module on (M2-9, C283), the data-saver switch shows here and the response follows it.
// A line of the syllabus a parent saved for the child (kind=own, C230-AB; the key is the line's id) is asked as a typed
// question about that topic and its chapter, on the typed question's own path: the server decides its subject, it is
// checked like any typed question, and it is never kept in the shared library.
export default async function FamilyUnderstandPage({ searchParams }: { searchParams: { kind?: string; key?: string } }) {
  const page = await requireFamilyPage();
  if (!page) redirect('/family/sign-in');
  const next = firstStepsNext(page);
  if (next) redirect(next);
  if (searchParams.kind === 'own') {
    const own = await familyPageRead(page, (db) => ownSyllabusLine(db, page.session.accountId, page.child!.childId, searchParams.key ?? ''));
    if (!own) redirect('/family/study');
    const lang = page.childLang;
    const text =
      own.chapterTitle === null ? fill(t(lang, 'fam.syllabus.askChapter'), { chapter: own.title }) : fill(t(lang, 'fam.syllabus.askTopic'), { topic: own.title, chapter: own.chapterTitle });
    return (
      <div lang={lang} className="flex min-h-screen flex-col">
        <SubPageHeader back={`/family/study?subject=${own.subject}`} backLabel={t(lang, `fam.subject.${own.subject}`)} kicker={t(lang, 'fam.understand.title')} title={own.title} subject={own.subject} />
        <main className="relative mx-auto -mt-8 flex w-full max-w-xl flex-1 flex-col gap-3 px-4 pb-24">
          <UnderstandView key={`own:${own.itemId}`} w={familyWords(lang, UNDERSTAND_KEYS)} input={{ kind: 'question', text: text.slice(0, 500) }} tone={own.subject} />
        </main>
      </div>
    );
  }
  const kind = searchParams.kind === 'topic' ? 'topic' : 'chapter';
  const key = searchParams.key ?? '';
  const child = page.child!;
  const found = await familyPageRead(page, async (db) => {
    const line = await syllabusLine(db, child, { kind, key });
    if (!line) return null;
    const on = await familyModuleOn(db, 'understand', page.session.accountId);
    const offline = await familyModuleOn(db, 'offline', page.session.accountId);
    return { line, offline, initial: on ? await libraryResponse(db, { accountId: page.session.accountId, child }, line) : null };
  });
  if (!found) redirect('/family/study');
  const { line, initial, offline } = found;
  const lang = page.childLang;
  const w = familyWords(lang, offline ? [...UNDERSTAND_KEYS, ...OFFLINE_KEYS] : UNDERSTAND_KEYS);
  return (
    <div lang={lang} className="flex min-h-screen flex-col">
      <SubPageHeader back={`/family/study?subject=${line.subject}`} backLabel={t(lang, `fam.subject.${line.subject}`)} kicker={t(lang, 'fam.understand.title')} title={line.title} subject={line.subject} />
      <main className="relative mx-auto -mt-8 flex w-full max-w-xl flex-1 flex-col gap-3 px-4 pb-24">
        {offline && <DataSaverSwitch w={w} />}
        <UnderstandView key={`${kind}:${line.key}`} w={w} input={{ kind, key: line.key }} tone={line.subject} initial={initial} offline={offline} />
      </main>
    </div>
  );
}
