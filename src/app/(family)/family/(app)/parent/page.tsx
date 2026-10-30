import { familyClaims } from '@/lib/family/db';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChapterRequestPanel } from '@/components/family/ChapterRequestPanel';
import { ChildSyllabusEditor } from '@/components/family/ChildSyllabusEditor';
import { listRequests, readSourceModes } from '@/lib/family/chapter-requests';
import { FamIcon } from '@/components/family/FamIcon';
import { GateFrame } from '@/components/family/GateFrame';
import { FocusSection } from '@/components/family/FocusSection';
import { ParentArea, type ParentNeed } from '@/components/family/ParentArea';
import { ChildPhoneSection } from '@/components/family/ChildPhoneSection';
import { HomePlanSection, type PlanSubject } from '@/components/family/HomePlanSection';
import { NotifySection } from '@/components/family/NotifySection';
import { vapidPublicKey } from '@/lib/family/web-push';
import { SchoolSection } from '@/components/family/SchoolSection';
import { activeLinks, linkedSchool, notifyOff } from '@/lib/family/school';
import { PinGate } from '@/components/family/PinGate';
import { classSubjects, readFamilyCatalog } from '@/lib/family/catalog';
import { listChildPhones } from '@/lib/family/child-phone';
import { homePlan, plusOpen } from '@/lib/family/home-plan';
import { subjectAccess } from '@/lib/family/modules';
import { CHILD_FORM_KEYS } from '@/lib/family/child-words';
import { listSyllabi } from '@/lib/family/child-syllabus';
import { isPrePrimary, listFamilyBoards, syllabusBoardOf } from '@/lib/family/children';
import { SUBJECT_IDS } from '@/lib/family/subjects';
import type { Subject } from '@/lib/contracts/subjects';
import { calmCard, openSubjects } from '@/lib/family/learning';
import { readFamilySwitches, switchOn } from '@/lib/family/flags';
import { focusTimeLabel, parentFocus } from '@/lib/family/focus';
import { parentHabit } from '@/lib/family/habit';
import { consentsToRenew } from '@/lib/family/consent';
import { familyPageRead, requireFamilyPage } from '@/lib/family/server';
import { indiaDate } from '@/lib/time/india';
import { familyStates } from '@/lib/family/states';
import { familyWords } from '@/lib/family/words';
import { t, type MessageKey } from '@/lib/i18n';

// The parent area (feature P2; docs/34 §9.1 rule 1; M1-2, C248): behind the parent PIN, always.
const GATE_KEYS: MessageKey[] = [
  'fam.app.name',
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
const PHONE_KEYS: MessageKey[] = [
  'fam.phone.title', 'fam.phone.lead', 'fam.phone.link', 'fam.phone.code', 'fam.phone.how', 'fam.phone.done', 'fam.phone.wrong', 'fam.phone.linked', 'fam.phone.lastSeen',
  'fam.phone.remove', 'fam.phone.tooMany', 'fam.school.saveError',
];
const NOTIFY_KEYS: MessageKey[] = [
  'fam.notify.title', 'fam.notify.lead', 'fam.notify.homework', 'fam.notify.notices', 'fam.notify.results', 'fam.notify.tonight', 'fam.notify.on', 'fam.notify.off', 'fam.school.saveError',
  'fam.push.title', 'fam.push.unsupported', 'fam.push.blocked', 'fam.push.isOn', 'fam.push.turnOn', 'fam.push.turnOff',
];
const AREA_KEYS: MessageKey[] = [
  'fam.parent.title', 'fam.parent.back', 'fam.parent.children', 'fam.parent.edit', 'fam.parent.childSaved', 'fam.parent.remove', 'fam.parent.removeConfirm', 'fam.parent.removeYes',
  'fam.parent.answersShow', 'fam.parent.answersNone', 'fam.parent.answerRight', 'fam.parent.answerWrong', 'fam.parent.delete', 'fam.parent.deleteAll',
  'fam.parent.privacy', 'fam.parent.privacyIntro',
  'fam.parent.tabs', 'fam.parent.tab.overview', 'fam.parent.tab.children', 'fam.parent.tab.school', 'fam.parent.tab.learning', 'fam.parent.tab.privacy', 'fam.parent.tab.account',
  'fam.parent.needs.title', 'fam.parent.needs.none', 'fam.parent.needs.open', 'fam.parent.needs.requestsDeclined', 'fam.parent.needs.requestsOpen', 'fam.parent.needs.renew', 'fam.parent.needs.consent', 'fam.parent.needs.meeting',
  'fam.parent.learningEmpty', 'fam.parent.goChildren',
  'fam.school.title', 'fam.school.lead', 'fam.school.code', 'fam.school.another', 'fam.school.codeHelp', 'fam.school.connect', 'fam.school.badCode', 'fam.school.tooMany', 'fam.school.connected', 'fam.school.noChildren', 'fam.school.today', 'fam.school.homework', 'fam.school.homeworkNone', 'fam.school.homeworkDue', 'fam.school.homeworkDone', 'fam.school.notices', 'fam.school.noticesNone', 'fam.school.noticeSent', 'fam.school.events', 'fam.school.eventsNone', 'fam.school.eventCancelled', 'fam.school.timetable', 'fam.school.timetableNone', 'fam.school.results', 'fam.school.resultsNone', 'fam.school.resultPublished', 'fam.school.resultOverall', 'fam.school.resultRemark', 'fam.school.resultNotComplete', 'fam.marks.open', 'fam.marks.openSubject', 'fam.schoolProgress.open', 'fam.marks.timetable', 'fam.marks.timetableNone', 'fam.marks.seat', 'fam.school.pulse', 'fam.school.pulseNone', 'fam.school.pulseFor', 'fam.school.pulseUnderstood', 'fam.school.pulseNeedsHelp', 'fam.school.pulseAnswered', 'fam.school.pulseHelpNote', 'fam.school.pulseReadOnly', 'fam.school.pulseClosed', 'fam.school.mark.present', 'fam.school.mark.absent', 'fam.school.mark.late', 'fam.school.mark.leave', 'fam.school.mark.none', 'fam.school.present', 'fam.school.due', 'fam.school.whichChild', 'fam.school.notLinked', 'fam.school.awaiting', 'fam.school.addChildFirst', 'fam.school.saveError', 'fam.school.saved', 'fam.school.save', 'fam.school.disconnect', 'fam.school.disconnectNote', 'fam.school.disconnectYes', 'fam.consent.more', 'fam.parent.withdrawNote',
  'fam.consent.short.study_core', 'fam.consent.short.english_programme', 'fam.consent.short.photo_input', 'fam.consent.short.voice_practice', 'fam.consent.short.offers',
  'fam.parent.language', 'fam.parent.signOutTitle', 'fam.parent.signOut', 'fam.parent.signOutAll', 'fam.parent.deleteAccount', 'fam.parent.deleteAccountLead',
  'fam.parent.deleteAccountWord', 'fam.parent.deleteAccountYes', 'fam.consent.purpose.study_core', 'fam.class.label', 'fam.class.nursery', 'fam.class.lkg', 'fam.class.ukg', 'fam.common.cancel', 'fam.lang.label',
  ...SUBJECT_IDS.map((id) => `fam.subject.${id}` as MessageKey), 'fam.err.confirm', 'fam.err.bad_request', 'fam.parent.freeSubject', 'fam.parent.freeSubjectTooSoon',
  'fam.calm.title', 'fam.calm.nothingYet', 'fam.calm.week', 'fam.calm.mastered', 'fam.calm.recent', 'fam.profile.title',
  'fam.consent.purpose.english_programme', 'fam.english.parent.section', 'fam.english.parent.open', 'fam.consent.purpose.photo_input', 'fam.consent.changed.photo_input', 'fam.consent.purpose.voice_practice', 'fam.consent.purpose.offers',
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

// S3 (C376): asking for a chapter and choosing the source (src/components/family/ChapterRequestPanel.tsx).
const REQUEST_KEYS: MessageKey[] = [
  'fam.request.title', 'fam.request.lead', 'fam.request.child', 'fam.request.subject', 'fam.request.chapterName', 'fam.request.pdf', 'fam.request.privacy',
  'fam.request.send', 'fam.request.sent', 'fam.request.yours', 'fam.request.none', 'fam.request.declined', 'fam.request.withdraw', 'fam.request.sourceTitle',
  'fam.request.sourceLead', 'fam.request.source.all', 'fam.request.source.catalog', 'fam.request.source.school', 'fam.request.source.parent',
  'fam.request.err.duplicate', 'fam.request.err.too_many', 'fam.request.err.not_a_pdf', 'fam.request.err.too_big', 'fam.request.err.encrypted', 'fam.request.err.too_long',
  'fam.request.err.personal_info', 'fam.request.err.storage_unavailable', 'fam.request.err.not_ready', 'fam.request.err.bad_request',
  'fam.status.received', 'fam.status.digitizing', 'fam.status.published', 'fam.err.network', 'fam.err.parent_pin_required', 'fam.err.not_found', 'fam.err.consent_required',
];

// One child after the other: each read holds a savepoint on the family's single connection.
async function modesOf(db: Parameters<typeof readSourceModes>[0], accountId: string, children: { childId: string }[]) {
  const out: Record<string, Awaited<ReturnType<typeof readSourceModes>>> = {};
  for (const c of children) out[c.childId] = await readSourceModes(db, accountId, c.childId);
  return out;
}

export default async function FamilyParentPage() {
  const page = await requireFamilyPage();
  if (!page) redirect('/family/sign-in');
  const lang = page.parentLang;
  // A child's own phone (C342): the parent area is on the parent's phone.
  if (page.session.device) {
    return (
      <div lang={lang} data-parent-on-parent-phone>
        <GateFrame app={t(lang, 'fam.app.name')} title={t(lang, 'fam.parent.title')}>
          <p className="text-base text-slate">{t(lang, 'fam.phone.parentHere')}</p>
        </GateFrame>
      </div>
    );
  }
  if (!page.parentMode) {
    return (
      <div lang={lang}>
        <PinGate w={familyWords(lang, GATE_KEYS)} />
      </div>
    );
  }
  const calm = await familyPageRead(page, async (db) => Promise.all(page.children.map((c) => calmCard(db, page.session.accountId, c.childId, indiaDate(), lang))));
  // Each child's class subjects (C264), for the free-subject choice; a subject open to every child (C298) is open
  // already, so it is not offered.
  const subjects = await familyPageRead(page, async (db) => {
    const openToAll = await openSubjects(db);
    return (await Promise.all(page.children.map((c) => classSubjects(db, { board: syllabusBoardOf(c), classLevel: c.classLevel, stream: c.stream })))).map((list) => list.filter((s) => !openToAll.includes(s)));
  });
  // The English course (C274): its consent and reports show when Control has the course switched on.
  const switches = await familyPageRead(page, (db) => readFamilySwitches(db, page.session.accountId));
  const english = switches && switchOn(switches, 'english_programme') ? { granted: page.consents.english_programme } : null;
  // Photo questions (M2-6, C280): asked when the homework helper or the tutor (whose Attach file needs it, S2) is on; a
  // yes already given stays withdrawable. A yes on the older notice is asked again, and the row says why (C230-AP).
  const renew = (await familyPageRead(page, (db) => consentsToRenew(db, page.session.accountId))).includes('photo_input');
  const photo = switches && (switchOn(switches, 'homework') || switchOn(switches, 'understand') || page.consents.photo_input || renew) ? { granted: page.consents.photo_input, renew } : null;
  // Voice input (M2-7, C281): its consent shows when Control has voice input switched on; a yes already given stays
  // withdrawable even when the module is off.
  const voice = switches && (switchOn(switches, 'voice_input') || page.consents.voice_practice) ? { granted: page.consents.voice_practice } : null;
  // The habit section (M2-3, C277) when Control has the habit module switched on.
  const habit = switches && switchOn(switches, 'habit') ? await familyPageRead(page, (db) => Promise.all(page.children.map((c) => parentHabit(db, page.session.accountId, c.childId, indiaDate(), lang)))) : null;
  // Your school (C230-AA): each active link read as the guardian; a link the school has closed meanwhile is not shown.
  const links = await familyPageRead(page, (db) => activeLinks(db, page.session.accountId));
  // Children's own phones (M2b-2, C342).
  const phones = await familyPageRead(page, (db) => listChildPhones(db, page.session.accountId));
  const phoneLinking = !!switches && switchOn(switches, 'focus_lock');
  // What the app tells the parent about (M3-8a, C338), once a school is connected or the home plan is open to them.
  const off = await familyPageRead(page, (db) => notifyOff(db, page.session.accountId));
  const claims = familyClaims(page.session);
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
            for (const s of await classSubjects(db, { board: syllabusBoardOf(c), classLevel: c.classLevel, stream: c.stream })) {
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
      page.children.filter((c) => !isPrePrimary(c.classLevel)).map(async (c) => ({ childId: c.childId, firstName: c.firstName, subjects: await classSubjects(db, { board: syllabusBoardOf(c), classLevel: c.classLevel, stream: c.stream }) }))
    ),
    syllabi: await listSyllabi(db, page.session.accountId),
    // S3 (C376): the chapters the parent asked for, and the source each child's subject reads.
    requests: await listRequests(db, page.session.accountId),
    modes: await modesOf(db, page.session.accountId, page.children),
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
  // What needs the parent now (W6-F): one line and one action each.
  const needs: ParentNeed[] = [];
  const declined = own.requests.filter((r) => r.status === 'declined').length;
  const preparing = own.requests.filter((r) => r.status === 'received' || r.status === 'digitizing').length;
  if (!page.consents.study_core) needs.push({ kind: 'consent' });
  if (renew) needs.push({ kind: 'renew' });
  if (declined > 0) needs.push({ kind: 'requests_declined', n: declined });
  if (preparing > 0) needs.push({ kind: 'requests_open', n: preparing });
  for (const c of plans ?? []) if (c.linked && c.plan && !c.plan.followupAsked) needs.push({ kind: 'meeting', name: c.firstName });
  return (
    <div lang={lang} className="flex min-h-screen flex-col">
      <ParentArea
        english={english}
        photo={photo}
        voice={voice}
        offers={{ granted: page.consents.offers }}
        habit={habit}
        calm={calm}
        w={familyWords(lang, [...AREA_KEYS, ...CHILD_FORM_KEYS])}
        lang={lang}
        children={page.children.map((c, i) => ({ subjects: subjects[i], childId: c.childId, firstName: c.firstName, classLevel: c.classLevel, board: c.board, language: c.language, style: c.style, stateCode: c.stateCode, stream: c.stream ?? undefined, freeSubject: c.freeSubject }))}
        states={familyStates(lang)}
        boards={await familyPageRead(page, (db) => listFamilyBoards(db, lang))}
        studyCore={page.consents.study_core}
        needs={needs}
        slots={{
          overview: (
            <>
            {/* S2 (C375): the Learning Vault, each child's questions to the tutor and their files, with a clear. */}
            {page.children.length > 0 && (
              <Link href="/family/parent/vault" data-vault-link className="fam-card fam-press flex min-h-[56px] items-center gap-3 bg-white p-4">
                <span aria-hidden="true" className="fam-chip-icon bg-royal-deep bg-gradient-to-br from-royal to-violet text-white">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="5" width="18" height="15" rx="2" />
                    <path d="M3 10h18M10 14h4" />
                  </svg>
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-base font-bold text-slate">{t(lang, 'fam.vault.open')}</span>
                  <span className="text-sm text-slate/80">{t(lang, 'fam.vault.openLead')}</span>
                </span>
                <FamIcon name="next" className="h-5 w-5 shrink-0 text-royal-deep" />
              </Link>
            )}
            </>
          ),
          children: (
            <>
            {/* Behind the Focus Lock's switch (C230-AF): with it off, only phones already linked are listed, to remove. */}
            {page.children.length > 0 && (phoneLinking || phones.length > 0) && (
              <ChildPhoneSection w={familyWords(lang, PHONE_KEYS)} lang={lang} children={page.children.map((c) => ({ childId: c.childId, firstName: c.firstName }))} phones={phones} canLink={phoneLinking} />
            )}
            {focus && <FocusSection w={familyWords(lang, FOCUS_KEYS)} devices={focus.devices} notices={focus.notices} />}
            </>
          ),
          school: (
            <>
            <SchoolSection w={familyWords(lang, [...AREA_KEYS, ...CHILD_FORM_KEYS])} lang={lang} links={schools} children={page.children.map((c) => ({ childId: c.childId, firstName: c.firstName }))} />
            {(schools.length > 0 || (plans && plans.length > 0)) && <NotifySection w={familyWords(lang, NOTIFY_KEYS)} off={off} publicKey={vapidPublicKey()} />}
            {plans && plans.length > 0 && <HomePlanSection w={familyWords(lang, PLAN_KEYS)} lang={lang} children={plans} />}
            </>
          ),
          learning:
            own.childList.length > 0 ? (
              <>
            {own.childList.length > 0 && page.consents.study_core && (
              <ChapterRequestPanel w={familyWords(lang, [...REQUEST_KEYS, ...SUBJECT_IDS.map((id) => `fam.subject.${id}` as MessageKey)])} childList={own.childList} requests={own.requests} modes={own.modes} />
            )}
            {own.childList.length > 0 && <ChildSyllabusEditor w={familyWords(lang, [...SYLLABUS_KEYS, ...SUBJECT_IDS.map((id) => `fam.subject.${id}` as MessageKey), 'fam.common.cancel'])} childList={own.childList} syllabi={own.syllabi} studyCore={page.consents.study_core} />}
              </>
            ) : null,
        }}
      />
    </div>
  );
}
