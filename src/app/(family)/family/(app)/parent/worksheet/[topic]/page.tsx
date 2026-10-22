import { redirect } from 'next/navigation';
import { ParentWorksheet } from '@/components/family/WorksheetScreen';
import { PinGate } from '@/components/family/PinGate';
import { SubPageHeader } from '@/components/family/SubPageHeader';
import { familyPageRead, firstStepsNext, requireFamilyPage } from '@/lib/family/server';
import { answerKey, loadWorksheet, printItems } from '@/lib/family/worksheet';
import { WORKSHEET_KEYS } from '@/lib/family/worksheet-words';
import { familyWords } from '@/lib/family/words';
import { t, type MessageKey } from '@/lib/i18n';

// The parent's worksheet print (M2-4, C278): the child's worksheet with the answer key as its last page. Behind the
// parent PIN, always: without parent mode only the PIN door is drawn and no answer is read.
const GATE_KEYS: MessageKey[] = [
  'fam.pin.enterTitle', 'fam.pin.enterLead', 'fam.pin.enter', 'fam.pin.open', 'fam.pin.forgot', 'fam.pin.resetLead', 'fam.pin.resetSend', 'fam.pin.resetSent',
  'fam.pin.resetSave', 'fam.pin.new', 'fam.pin.again', 'fam.pin.mismatch', 'fam.signIn.code', 'fam.common.cancel', 'fam.err.pinWrong', 'fam.err.wait',
  'fam.err.format', 'fam.err.too_simple', 'fam.err.wrong', 'fam.err.locked', 'fam.err.expired', 'fam.err.none', 'fam.err.rate_limited',
  'fam.err.email_unavailable', 'fam.err.network', 'fam.err.no_pin', 'fam.err.not_signed_in',
];

export default async function FamilyParentWorksheetPage({ params }: { params: { topic: string } }) {
  const page = await requireFamilyPage();
  if (!page) redirect('/family/sign-in');
  const next = firstStepsNext(page);
  if (next) redirect(next);
  const lang = page.parentLang;
  if (!page.parentMode) {
    return (
      <main lang={lang} className="mx-auto w-full max-w-md px-4 py-8">
        <PinGate w={familyWords(lang, GATE_KEYS)} />
      </main>
    );
  }
  const child = page.child!;
  const key = (() => { try { return decodeURIComponent(params.topic); } catch { return ''; } })();
  const w = await familyPageRead(page, (db) => loadWorksheet(db, { accountId: page.session.accountId, child }, key));
  if (w.state !== 'ok') redirect(w.line ? `/family/study/worksheet/${encodeURIComponent(w.line.key)}` : '/family/study');
  return (
    <div lang={lang} className="flex min-h-screen flex-col">
      <SubPageHeader back={`/family/study/worksheet/${encodeURIComponent(w.line.key)}`} backLabel={t(lang, 'fam.worksheet.title')} kicker={t(lang, 'fam.worksheet.keyTitle')} title={w.line.title} tone="royal" />
      {/* F2 on D1 (C230-Q): pulled up under the band, and `relative` so the band never paints over it. */}
      <main className="relative mx-auto -mt-8 flex w-full max-w-xl flex-1 flex-col gap-3 px-4 pb-24">
        <ParentWorksheet w={familyWords(lang, WORKSHEET_KEYS)} sheetW={familyWords(page.childLang, WORKSHEET_KEYS)} name={child.firstName} title={w.line.title} items={printItems(w)} keyRows={answerKey(w)} />
      </main>
    </div>
  );
}
