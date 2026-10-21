import { redirect } from 'next/navigation';
import { ParentArea } from '@/components/family/ParentArea';
import { PinGate } from '@/components/family/PinGate';
import { CHILD_FORM_KEYS } from '@/lib/family/child-words';
import { calmCard } from '@/lib/family/learning';
import { familyPageRead, requireFamilyPage } from '@/lib/family/server';
import { indiaDate } from '@/lib/time/india';
import { familyStates } from '@/lib/family/states';
import { familyWords } from '@/lib/family/words';
import type { MessageKey } from '@/lib/i18n';

// The parent area (feature P2; docs/34 §9.1 rule 1; M1-2, C248): behind the parent PIN, always.
const GATE_KEYS: MessageKey[] = [
  'fam.pin.enterTitle', 'fam.pin.enterLead', 'fam.pin.enter', 'fam.pin.open', 'fam.pin.forgot', 'fam.pin.resetLead', 'fam.pin.resetSend', 'fam.pin.resetSent',
  'fam.pin.resetSave', 'fam.pin.new', 'fam.pin.again', 'fam.pin.mismatch', 'fam.signIn.code', 'fam.common.cancel', 'fam.err.pinWrong', 'fam.err.wait',
  'fam.err.format', 'fam.err.too_simple', 'fam.err.wrong', 'fam.err.locked', 'fam.err.expired', 'fam.err.none', 'fam.err.rate_limited',
  'fam.err.email_unavailable', 'fam.err.network', 'fam.err.no_pin', 'fam.err.not_signed_in',
];
const AREA_KEYS: MessageKey[] = [
  'fam.parent.title', 'fam.parent.back', 'fam.parent.children', 'fam.parent.edit', 'fam.parent.remove', 'fam.parent.removeConfirm', 'fam.parent.removeYes',
  'fam.parent.answersShow', 'fam.parent.answersNone', 'fam.parent.answerRight', 'fam.parent.answerWrong', 'fam.parent.delete', 'fam.parent.deleteAll',
  'fam.parent.privacy', 'fam.parent.granted', 'fam.parent.notGranted', 'fam.parent.withdraw', 'fam.parent.grant', 'fam.parent.withdrawNote',
  'fam.parent.language', 'fam.parent.signOutTitle', 'fam.parent.signOut', 'fam.parent.signOutAll', 'fam.parent.deleteAccount', 'fam.parent.deleteAccountLead',
  'fam.parent.deleteAccountWord', 'fam.parent.deleteAccountYes', 'fam.consent.purpose.study_core', 'fam.class.label', 'fam.common.cancel', 'fam.lang.label',
  'fam.subject.mathematics', 'fam.subject.science', 'fam.err.confirm', 'fam.err.bad_request', 'fam.parent.freeSubject', 'fam.parent.freeSubjectTooSoon',
  'fam.calm.title', 'fam.calm.nothingYet', 'fam.calm.week', 'fam.calm.mastered', 'fam.calm.recent', 'fam.calm.note',
];

export default async function FamilyParentPage() {
  const page = await requireFamilyPage();
  if (!page) redirect('/family/sign-in');
  const lang = page.parentLang;
  if (!page.parentMode) {
    return (
      <main lang={lang} className="mx-auto w-full max-w-md px-4 py-8">
        <PinGate w={familyWords(lang, GATE_KEYS)} />
      </main>
    );
  }
  const calm = await familyPageRead(page, async (db) => Promise.all(page.children.map((c) => calmCard(db, page.session.accountId, c.childId, indiaDate(), lang))));
  return (
    <main lang={lang} className="mx-auto w-full max-w-xl px-4 py-6">
      <ParentArea
        calm={calm}
        w={familyWords(lang, [...AREA_KEYS, ...CHILD_FORM_KEYS])}
        lang={lang}
        children={page.children.map((c) => ({ childId: c.childId, firstName: c.firstName, classLevel: c.classLevel, language: c.language, style: c.style, stateCode: c.stateCode, freeSubject: c.freeSubject }))}
        states={familyStates(lang)}
        studyCore={page.consents.study_core}
      />
    </main>
  );
}
