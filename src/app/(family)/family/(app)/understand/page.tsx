import { redirect } from 'next/navigation';
import { SubPageHeader } from '@/components/family/SubPageHeader';
import { UnderstandView } from '@/components/family/UnderstandView';
import { DataSaverSwitch } from '@/components/family/offline/DataSaverSwitch';
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
export default async function FamilyUnderstandPage({ searchParams }: { searchParams: { kind?: string; key?: string } }) {
  const page = await requireFamilyPage();
  if (!page) redirect('/family/sign-in');
  const next = firstStepsNext(page);
  if (next) redirect(next);
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
      <main className="mx-auto -mt-4 flex w-full max-w-xl flex-1 flex-col gap-3 px-4 pb-24">
        {offline && <DataSaverSwitch w={w} />}
        <UnderstandView key={`${kind}:${line.key}`} w={w} input={{ kind, key: line.key }} tone={line.subject} initial={initial} offline={offline} />
      </main>
    </div>
  );
}
