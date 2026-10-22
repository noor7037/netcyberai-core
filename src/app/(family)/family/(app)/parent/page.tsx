import { redirect } from 'next/navigation';
import { ParentArea } from '@/components/family/ParentArea';
import { PinGate } from '@/components/family/PinGate';
import { classSubjects } from '@/lib/family/catalog';
import { CHILD_FORM_KEYS } from '@/lib/family/child-words';
import { syllabusBoardOf } from '@/lib/family/children';
import { SUBJECT_IDS } from '@/lib/family/subjects';
import { calmCard } from '@/lib/family/learning';
import { readFamilySwitches, switchOn } from '@/lib/family/flags';
import { parentHabit } from '@/lib/family/habit';
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
  'fam.parent.deleteAccountWord', 'fam.parent.deleteAccountYes', 'fam.consent.purpose.study_core', 'fam.class.label', 'fam.class.nursery', 'fam.class.lkg', 'fam.class.ukg', 'fam.common.cancel', 'fam.lang.label',
  ...SUBJECT_IDS.map((id) => `fam.subject.${id}` as MessageKey), 'fam.err.confirm', 'fam.err.bad_request', 'fam.parent.freeSubject', 'fam.parent.freeSubjectTooSoon',
  'fam.calm.title', 'fam.calm.nothingYet', 'fam.calm.week', 'fam.calm.mastered', 'fam.calm.recent', 'fam.calm.note',
  'fam.consent.purpose.english_programme', 'fam.english.parent.section', 'fam.english.parent.open', 'fam.consent.purpose.voice_practice',
  // m2-3: the habit section.
  'fam.habit.parent.title', 'fam.habit.parent.goal', 'fam.habit.parent.goalHelp', 'fam.habit.parent.goalOption', 'fam.habit.parent.jarTitle', 'fam.habit.parent.jarNone',
  'fam.habit.parent.reward', 'fam.habit.parent.target', 'fam.habit.parent.jarSet', 'fam.habit.parent.jarProgress', 'fam.habit.parent.jarFullNote', 'fam.habit.parent.given',
  'fam.habit.parent.jarRemove', 'fam.habit.parent.noMoney', 'fam.habit.parent.summaryTitle', 'fam.habit.parent.sumDays', 'fam.habit.parent.sumMastered',
  'fam.habit.parent.sumMasteredNone', 'fam.habit.parent.sumSupport', 'fam.habit.parent.sumSupportNone', 'fam.habit.parent.talkTitle', 'fam.habit.parent.talk.0',
  'fam.habit.parent.talk.1', 'fam.habit.parent.talk.2', 'fam.habit.parent.talk.3', 'fam.habit.parent.talkNone', 'fam.err.goal_bad', 'fam.err.reward_bad',
  'fam.err.target_bad', 'fam.err.jar_exists', 'fam.err.jar_not_full', 'fam.err.jar_full', 'fam.err.not_found', 'fam.err.consent_required',
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
  // Each child's class subjects (C264), for the free-subject choice.
  const subjects = await familyPageRead(page, async (db) => Promise.all(page.children.map((c) => classSubjects(db, { board: syllabusBoardOf(c), classLevel: c.classLevel }))));
  // The English course (C274): its consent and reports show when Control has the course switched on.
  const switches = await familyPageRead(page, (db) => readFamilySwitches(db, page.session.accountId));
  const english = switches && switchOn(switches, 'english_programme') ? { granted: page.consents.english_programme } : null;
  // Voice input (M2-7, C281): its consent shows when Control has voice input switched on; a yes already given stays
  // withdrawable even when the module is off.
  const voice = switches && (switchOn(switches, 'voice_input') || page.consents.voice_practice) ? { granted: page.consents.voice_practice } : null;
  // The habit section (M2-3, C277) when Control has the habit module switched on.
  const habit = switches && switchOn(switches, 'habit') ? await familyPageRead(page, (db) => Promise.all(page.children.map((c) => parentHabit(db, page.session.accountId, c.childId, indiaDate(), lang)))) : null;
  return (
    <main lang={lang} className="mx-auto w-full max-w-xl px-4 py-6">
      <ParentArea
        english={english}
        voice={voice}
        habit={habit}
        calm={calm}
        w={familyWords(lang, [...AREA_KEYS, ...CHILD_FORM_KEYS])}
        lang={lang}
        children={page.children.map((c, i) => ({ subjects: subjects[i], childId: c.childId, firstName: c.firstName, classLevel: c.classLevel, board: c.board, language: c.language, style: c.style, stateCode: c.stateCode, freeSubject: c.freeSubject }))}
        states={familyStates(lang)}
        studyCore={page.consents.study_core}
      />
    </main>
  );
}
