import { redirect } from 'next/navigation';
import { ChildSyllabusEditor } from '@/components/family/ChildSyllabusEditor';
import { FocusSection } from '@/components/family/FocusSection';
import { ParentArea } from '@/components/family/ParentArea';
import { HomePlanSection, type PlanSubject } from '@/components/family/HomePlanSection';
import { NotifySection } from '@/components/family/NotifySection';
import { vapidPublicKey } from '@/lib/family/web-push';
import { SchoolSection } from '@/components/family/SchoolSection';
import { activeLinks, linkedSchool, notifyOff } from '@/lib/family/school';
import { PinGate } from '@/components/family/PinGate';
import { classSubjects, readFamilyCatalog } from '@/lib/family/catalog';
import { homePlan, plusOpen } from '@/lib/family/home-plan';
import { subjectAccess } from '@/lib/family/modules';
import { CHILD_FORM_KEYS } from '@/lib/family/child-words';
import { listSyllabi } from '@/lib/family/child-syllabus';
import { isPrePrimary, syllabusBoardOf } from '@/lib/family/children';
import { SUBJECT_IDS } from '@/lib/family/subjects';
import type { Subject } from '@/lib/contracts/subjects';
import { calmCard, openSubjects } from '@/lib/family/learning';
import { readFamilySwitches, switchOn } from '@/lib/family/flags';
import { focusTimeLabel, parentFocus } from '@/lib/family/focus';
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
const PLAN_KEYS: MessageKey[] = [
  'fam.homePlan.title', 'fam.homePlan.lead', 'fam.homePlan.notes', 'fam.homePlan.notesHelp', 'fam.homePlan.subject', 'fam.homePlan.chosen', 'fam.homePlan.make',
  'fam.homePlan.noTopics', 'fam.homePlan.errTopics', 'fam.homePlan.errNote', 'fam.homePlan.night', 'fam.homePlan.done', 'fam.homePlan.tonight',
  'fam.homePlan.yourNotes', 'fam.homePlan.stop', 'fam.homePlan.stopNote', 'fam.homePlan.stopYes', 'fam.homePlan.ask', 'fam.homePlan.asked',
  'fam.homePlan.askNoConsent', 'fam.school.saveError', 'fam.common.cancel',
];
const NOTIFY_KEYS: MessageKey[] = [
  'fam.notify.title', 'fam.notify.lead', 'fam.notify.homework', 'fam.notify.notices', 'fam.notify.results', 'fam.notify.tonight', 'fam.notify.on', 'fam.notify.off', 'fam.school.saveError',
  'fam.push.title', 'fam.push.unsupported', 'fam.push.blocked', 'fam.push.isOn', 'fam.push.turnOn', 'fam.push.turnOff',
];
const AREA_KEYS: MessageKey[] = [
  'fam.parent.title', 'fam.parent.back', 'fam.parent.children', 'fam.parent.edit', 'fam.parent.remove', 'fam.parent.removeConfirm', 'fam.parent.removeYes',
  'fam.parent.answersShow', 'fam.parent.answersNone', 'fam.parent.answerRight', 'fam.parent.answerWrong', 'fam.parent.delete', 'fam.parent.deleteAll',
  'fam.parent.privacy', 'fam.parent.privacyIntro',
  'fam.school.title', 'fam.school.lead', 'fam.school.code', 'fam.school.another', 'fam.school.codeHelp', 'fam.school.connect', 'fam.school.badCode', 'fam.school.tooMany', 'fam.school.connected', 'fam.school.noChildren', 'fam.school.today', 'fam.school.homework', 'fam.school.homeworkNone', 'fam.school.homeworkDue', 'fam.school.homeworkDone', 'fam.school.notices', 'fam.school.noticesNone', 'fam.school.noticeSent', 'fam.school.events', 'fam.school.eventsNone', 'fam.school.eventCancelled', 'fam.school.timetable', 'fam.school.timetableNone', 'fam.school.results', 'fam.school.resultsNone', 'fam.school.resultPublished', 'fam.school.resultOverall', 'fam.school.resultRemark', 'fam.school.resultNotComplete', 'fam.marks.open', 'fam.marks.openSubject', 'fam.marks.timetable', 'fam.marks.timetableNone', 'fam.marks.seat', 'fam.school.pulse', 'fam.school.pulseNone', 'fam.school.pulseFor', 'fam.school.pulseUnderstood', 'fam.school.pulseNeedsHelp', 'fam.school.pulseAnswered', 'fam.school.pulseHelpNote', 'fam.school.pulseReadOnly', 'fam.school.pulseClosed', 'fam.school.mark.present', 'fam.school.mark.absent', 'fam.school.mark.late', 'fam.school.mark.leave', 'fam.school.mark.none', 'fam.school.present', 'fam.school.due', 'fam.school.whichChild', 'fam.school.notLinked', 'fam.school.awaiting', 'fam.school.addChildFirst', 'fam.school.saveError', 'fam.school.saved', 'fam.school.save', 'fam.school.disconnect', 'fam.school.disconnectNote', 'fam.school.disconnectYes', 'fam.consent.more', 'fam.parent.withdrawNote',
  'fam.consent.short.study_core', 'fam.consent.short.english_programme', 'fam.consent.short.photo_input', 'fam.consent.short.voice_practice', 'fam.consent.short.offers',
  'fam.parent.language', 'fam.parent.signOutTitle', 'fam.parent.signOut', 'fam.parent.signOutAll', 'fam.parent.deleteAccount', 'fam.parent.deleteAccountLead',
  'fam.parent.deleteAccountWord', 'fam.parent.deleteAccountYes', 'fam.consent.purpose.study_core', 'fam.class.label', 'fam.class.nursery', 'fam.class.lkg', 'fam.class.ukg', 'fam.common.cancel', 'fam.lang.label',
  ...SUBJECT_IDS.map((id) => `fam.subject.${id}` as MessageKey), 'fam.err.confirm', 'fam.err.bad_request', 'fam.parent.freeSubject', 'fam.parent.freeSubjectTooSoon',
  'fam.calm.title', 'fam.calm.nothingYet', 'fam.calm.week', 'fam.calm.mastered', 'fam.calm.recent', 'fam.calm.note',
  'fam.consent.purpose.english_programme', 'fam.english.parent.section', 'fam.english.parent.open', 'fam.consent.purpose.photo_input', 'fam.consent.purpose.voice_practice', 'fam.consent.purpose.offers',
  // m2-3: the habit section.
  'fam.habit.parent.title', 'fam.habit.parent.goal', 'fam.habit.parent.goalHelp', 'fam.habit.parent.goalOption', 'fam.habit.parent.jarTitle', 'fam.habit.parent.jarNone',
  'fam.habit.parent.reward', 'fam.habit.parent.target', 'fam.habit.parent.jarSet', 'fam.habit.parent.jarProgress', 'fam.habit.parent.jarFullNote', 'fam.habit.parent.given',
  'fam.habit.parent.jarRemove', 'fam.habit.parent.noMoney', 'fam.habit.parent.summaryTitle', 'fam.habit.parent.sumDays', 'fam.habit.parent.sumMastered',
  'fam.habit.parent.sumMasteredNone', 'fam.habit.parent.sumSupport', 'fam.habit.parent.sumSupportNone', 'fam.habit.parent.talkTitle', 'fam.habit.parent.talk.0',
  'fam.habit.parent.talk.1', 'fam.habit.parent.talk.2', 'fam.habit.parent.talk.3', 'fam.habit.parent.talkNone', 'fam.err.goal_bad', 'fam.err.reward_bad',
  'fam.err.target_bad', 'fam.err.jar_exists', 'fam.err.jar_not_full', 'fam.err.jar_full', 'fam.err.not_found', 'fam.err.consent_required',
];

// M2b-1 (C305): the Focus Lock's phones and notices (src/components/family/FocusSection.tsx).
const FOCUS_KEYS: MessageKey[] = [
  'fam.focus.title', 'fam.focus.lead', 'fam.focus.none', 'fam.focus.phoneFor', 'fam.focus.phoneForNone', 'fam.focus.lastReport', 'fam.focus.noReport',
  'fam.focus.state.on', 'fam.focus.state.off', 'fam.focus.state.permissions', 'fam.focus.notices', 'fam.focus.notice.stopped', 'fam.focus.notice.permissions',
  'fam.focus.notice.clock', 'fam.focus.seen', 'fam.focus.remove', 'fam.focus.removeConfirm', 'fam.focus.removeYes', 'fam.common.cancel', 'fam.err.network',
  'fam.err.not_found', 'fam.err.bad_request', 'fam.err.parent_pin_required',
];

// C230-AB: a parent's own syllabus for a child (src/components/family/ChildSyllabusEditor.tsx).
const SYLLABUS_KEYS: MessageKey[] = [
  'fam.syllabus.title', 'fam.syllabus.lead', 'fam.syllabus.child', 'fam.syllabus.subject', 'fam.syllabus.none', 'fam.syllabus.add', 'fam.syllabus.replace',
  'fam.syllabus.fromPhotos', 'fam.syllabus.fromPdf', 'fam.syllabus.err.not_a_pdf', 'fam.syllabus.err.no_text', 'fam.syllabus.err.encrypted', 'fam.syllabus.err.too_long', 'fam.syllabus.typeIt', 'fam.syllabus.privacy', 'fam.syllabus.reading', 'fam.syllabus.saving', 'fam.syllabus.draftWaiting',
  'fam.syllabus.check', 'fam.syllabus.discard', 'fam.syllabus.draftNote', 'fam.syllabus.chapter', 'fam.syllabus.topic', 'fam.syllabus.topicOf',
  'fam.syllabus.addChapter', 'fam.syllabus.addTopic', 'fam.syllabus.moveUp', 'fam.syllabus.moveDown', 'fam.syllabus.removeItem', 'fam.syllabus.morePhotos',
  'fam.syllabus.fillAll', 'fam.syllabus.save', 'fam.syllabus.savedNote', 'fam.syllabus.count', 'fam.syllabus.edit', 'fam.syllabus.delete',
  'fam.syllabus.deleteConfirm', 'fam.syllabus.deleteYes', 'fam.syllabus.consent', 'fam.syllabus.err.not_a_photo', 'fam.syllabus.err.too_big',
  'fam.syllabus.err.personal_info', 'fam.syllabus.err.unreadable', 'fam.syllabus.err.nothing_found', 'fam.syllabus.err.too_many_photos',
  'fam.syllabus.err.too_many', 'fam.syllabus.err.title_bad', 'fam.syllabus.err.empty', 'fam.syllabus.err.subject_bad', 'fam.syllabus.err.not_for_class',
  'fam.syllabus.err.ai_not_switched_on', 'fam.syllabus.err.ai_cap_reached', 'fam.syllabus.err.ai_failed', 'fam.err.network', 'fam.err.parent_pin_required',
  'fam.err.not_found', 'fam.err.consent_required', 'fam.err.bad_request',
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
  // Each child's class subjects (C264), for the free-subject choice; a subject open to every child (C298) is open
  // already, so it is not offered.
  const subjects = await familyPageRead(page, async (db) => {
    const openToAll = await openSubjects(db);
    return (await Promise.all(page.children.map((c) => classSubjects(db, { board: syllabusBoardOf(c), classLevel: c.classLevel })))).map((list) => list.filter((s) => !openToAll.includes(s)));
  });
  // The English course (C274): its consent and reports show when Control has the course switched on.
  const switches = await familyPageRead(page, (db) => readFamilySwitches(db, page.session.accountId));
  const english = switches && switchOn(switches, 'english_programme') ? { granted: page.consents.english_programme } : null;
  // Photo questions (M2-6, C280): asked when the homework helper is on; a yes already given stays withdrawable.
  const photo = switches && (switchOn(switches, 'homework') || page.consents.photo_input) ? { granted: page.consents.photo_input } : null;
  // Voice input (M2-7, C281): its consent shows when Control has voice input switched on; a yes already given stays
  // withdrawable even when the module is off.
  const voice = switches && (switchOn(switches, 'voice_input') || page.consents.voice_practice) ? { granted: page.consents.voice_practice } : null;
  // The habit section (M2-3, C277) when Control has the habit module switched on.
  const habit = switches && switchOn(switches, 'habit') ? await familyPageRead(page, (db) => Promise.all(page.children.map((c) => parentHabit(db, page.session.accountId, c.childId, indiaDate(), lang)))) : null;
  // Your school (C230-AA): each active link read as the guardian; a link the school has closed meanwhile is not shown.
  const links = await familyPageRead(page, (db) => activeLinks(db, page.session.accountId));
  // What the app tells the parent about (M3-8a, C338), once a school is connected or the home plan is open to them.
  const off = await familyPageRead(page, (db) => notifyOff(db, page.session.accountId));
  const claims = { accountId: page.session.accountId, tokenVersion: page.session.tokenVersion };
  const schools = (await Promise.all(links.map(async (l) => ({ l, school: await linkedSchool(claims, l.linkId, l.children.map((c) => c.studentId)) })))).flatMap(({ l, school }) => (school ? [{ linkId: l.linkId, school, pairs: l.children }] : []));
  // The home plan after a parent-teacher meeting (M3-7, C337; Plus): with the module on and Control's Family Plus open
  // for the pilot. Each child's open plan; with none, the catalog of each subject the child can open, to choose from.
  const plans = await familyPageRead(page, async (db) => {
    if (!switches || !switchOn(switches, 'home_plan') || !(await plusOpen(db, page.session.accountId))) return null;
    const openToAll = await openSubjects(db);
    return Promise.all(
      page.children
        .filter((c) => !isPrePrimary(c.classLevel))
        .map(async (c) => {
          const plan = await homePlan(db, page.session.accountId, c, indiaDate(), lang);
          const subjects: PlanSubject[] = [];
          if (!plan) {
            for (const s of await classSubjects(db, { board: syllabusBoardOf(c), classLevel: c.classLevel })) {
              if (!subjectAccess(c, s as Subject, openToAll).open) continue;
              const cat = await readFamilyCatalog(db, { board: syllabusBoardOf(c), classLevel: c.classLevel, subject: s, lang });
              if (cat) subjects.push({ subject: s, name: familyWords(lang, [`fam.subject.${s}` as MessageKey])[`fam.subject.${s}`], chapters: cat.chapters.map((ch) => ({ title: ch.title, topics: ch.topics })) });
            }
          }
          return { childId: c.childId, firstName: c.firstName, plan, linked: links.some((l) => l.children.some((k) => k.childId === c.childId)), subjects };
        })
    );
  });
  // C230-AB: each child's class subjects (all of them: an own syllabus can be given for any), and the syllabi saved or
  // waiting to be checked. Nursery, LKG and UKG have no subjects yet, so they are not offered.
  const own = await familyPageRead(page, async (db) => ({
    childList: await Promise.all(
      page.children.filter((c) => !isPrePrimary(c.classLevel)).map(async (c) => ({ childId: c.childId, firstName: c.firstName, subjects: await classSubjects(db, { board: syllabusBoardOf(c), classLevel: c.classLevel }) }))
    ),
    syllabi: await listSyllabi(db, page.session.accountId),
  }));
  // The Focus Lock (M2b-1, C305): shown when Control has it switched on for this family, or a phone is still set up.
  const focusRead = await familyPageRead(page, (db) => parentFocus(db, page.session.accountId));
  const focus =
    (switches && switchOn(switches, 'focus_lock')) || focusRead.devices.length > 0
      ? {
          devices: focusRead.devices.map((d) => ({ deviceId: d.deviceId, names: d.childNames, lastReport: d.lastReportAt ? focusTimeLabel(d.lastReportAt, lang) : null, lockOn: d.lockOn, permissionsOk: d.permissionsOk })),
          notices: focusRead.notices.map((n) => ({ noticeId: n.noticeId, deviceId: n.deviceId, kind: n.kind, time: focusTimeLabel(n.at, lang) })),
        }
      : null;
  return (
    <main lang={lang} className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-6">
      <ParentArea
        english={english}
        photo={photo}
        voice={voice}
        offers={{ granted: page.consents.offers }}
        habit={habit}
        calm={calm}
        w={familyWords(lang, [...AREA_KEYS, ...CHILD_FORM_KEYS])}
        lang={lang}
        children={page.children.map((c, i) => ({ subjects: subjects[i], childId: c.childId, firstName: c.firstName, classLevel: c.classLevel, board: c.board, language: c.language, style: c.style, stateCode: c.stateCode, freeSubject: c.freeSubject }))}
        states={familyStates(lang)}
        studyCore={page.consents.study_core}
        afterChildren={
          <>
            <SchoolSection w={familyWords(lang, [...AREA_KEYS, ...CHILD_FORM_KEYS])} lang={lang} links={schools} children={page.children.map((c) => ({ childId: c.childId, firstName: c.firstName }))} />
            {(schools.length > 0 || (plans && plans.length > 0)) && <NotifySection w={familyWords(lang, NOTIFY_KEYS)} off={off} publicKey={vapidPublicKey()} />}
            {plans && plans.length > 0 && <HomePlanSection w={familyWords(lang, PLAN_KEYS)} lang={lang} children={plans} />}
            {focus && <FocusSection w={familyWords(lang, FOCUS_KEYS)} devices={focus.devices} notices={focus.notices} />}
            {own.childList.length > 0 && <ChildSyllabusEditor w={familyWords(lang, [...SYLLABUS_KEYS, ...SUBJECT_IDS.map((id) => `fam.subject.${id}` as MessageKey), 'fam.common.cancel'])} childList={own.childList} syllabi={own.syllabi} studyCore={page.consents.study_core} />}
          </>
        }
      />
    </main>
  );
}
