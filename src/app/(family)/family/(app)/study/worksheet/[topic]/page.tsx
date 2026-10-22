import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SubPageHeader } from '@/components/family/SubPageHeader';
import { WorksheetScreen } from '@/components/family/WorksheetScreen';
import { classText } from '@/lib/family/fill';
import { familyPageRead, firstStepsNext, requireFamilyPage } from '@/lib/family/server';
import { UNDERSTAND_KEYS } from '@/lib/family/understand-words';
import { WORKSHEET_KEYS } from '@/lib/family/worksheet-words';
import { loadWorksheet, screenItems } from '@/lib/family/worksheet';
import { familyWords } from '@/lib/family/words';
import { t } from '@/lib/i18n';

// A worksheet for a topic (M2-4, C278): the practice already in the shared library, on screen. No AI call is made
// here; a topic with none points to Understand, which makes it.
export default async function FamilyWorksheetPage({ params }: { params: { topic: string } }) {
  const page = await requireFamilyPage();
  if (!page) redirect('/family/sign-in');
  const next = firstStepsNext(page);
  if (next) redirect(next);
  const child = page.child!;
  const lang = page.childLang;
  const key = (() => { try { return decodeURIComponent(params.topic); } catch { return ''; } })();
  const w = await familyPageRead(page, (db) => loadWorksheet(db, { accountId: page.session.accountId, child }, key));
  if (w.state === 'not_found') redirect('/family/study');
  const line = w.line!;
  const words = familyWords(lang, [...UNDERSTAND_KEYS, ...WORKSHEET_KEYS]);
  const empty = (text: string, understand: boolean) => (
    <p data-worksheet-empty={w.state} className="flex flex-col gap-3 rounded-3xl bg-white p-5 text-base text-slate shadow-sm ring-1 ring-slate/10">
      <span>{text}</span>
      {understand && (
        <Link href={`/family/understand?kind=${line.topicEn ? 'topic' : 'chapter'}&key=${encodeURIComponent(line.key)}`} className="inline-flex min-h-[44px] items-center self-start rounded-2xl bg-royal px-5 py-2 font-bold text-white">
          {t(lang, 'fam.worksheet.openUnderstand')}
        </Link>
      )}
    </p>
  );
  return (
    <div lang={lang} className="flex min-h-screen flex-col">
      <SubPageHeader back={`/family/study?subject=${line.subject}`} backLabel={t(lang, `fam.subject.${line.subject}`)} kicker={`${t(lang, 'fam.worksheet.title')} · ${classText((k) => t(lang, k), child.classLevel)}`} title={line.title} tone={line.subject === 'science' ? 'emerald' : 'royal'} />
      <main className="mx-auto -mt-4 flex w-full max-w-xl flex-1 flex-col gap-3 px-4 pb-24">
        {w.state === 'ok' ? (
          <WorksheetScreen w={words} ws={screenItems(w, { accountId: page.session.accountId, childId: child.childId })} name={child.firstName} tone={line.subject} />
        ) : w.state === 'off' ? (
          empty(t(lang, 'fam.worksheet.off'), false)
        ) : w.state === 'not_open' ? (
          empty(t(lang, 'fam.subject.notOpen'), false)
        ) : (
          empty(t(lang, 'fam.worksheet.none'), true)
        )}
      </main>
    </div>
  );
}
