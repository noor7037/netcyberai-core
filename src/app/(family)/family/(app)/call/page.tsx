import { redirect } from 'next/navigation';
import Link from 'next/link';
import { SubPageHeader } from '@/components/family/SubPageHeader';
import { CallView } from '@/components/family/call/CallView';
import { callTutorName, CALL_KEYS } from '@/lib/family/call-words';
import { familyClaims } from '@/lib/family/db';
import { findTutor, isTutorKey, loadHall } from '@/lib/family/tutors';
import { classSubjects } from '@/lib/family/catalog';
import { isPrePrimary, syllabusBoardOf } from '@/lib/family/children';
import { offMessage, readFamilySwitches, switchOn } from '@/lib/family/flags';
import { familyPageRead, firstStepsNext, requireFamilyPage } from '@/lib/family/server';
import { voiceDay } from '@/lib/family/voice';
import { realtimeReady } from '@/lib/family/voice-out';
import { familyWords } from '@/lib/family/words';
import { indiaDate } from '@/lib/time/india';
import { t, type MessageKey } from '@/lib/i18n';

// The call (W16-A4): a child talks to a tutor by voice and hears the answer, with captions. The same gate as the
// microphone in Study: Class 1 or above, the parent's yes to learning and to speaking, the voice module on; the day's
// speaking seconds are the microphone's own. `?tutor=` names the tutor (its name, or "Your tutor"), `?subject=` the
// subject the questions are asked in (the child's own subjects; otherwise the free one, else the first). Without the
// gate the page says why in the microphone's own words and goes back to Study; nothing is recorded.
export const dynamic = 'force-dynamic';

export default async function FamilyCallPage({ searchParams }: { searchParams: { tutor?: string; subject?: string } }) {
  const page = await requireFamilyPage();
  if (!page) redirect('/family/sign-in');
  const next = firstStepsNext(page);
  if (next) redirect(next);
  const child = page.child!;
  const lang = page.childLang;
  const refuse = (key: MessageKey, custom: string | null = null) => (
    <div lang={lang} className="flex min-h-screen flex-col">
      <SubPageHeader back="/family/study" backLabel={t(lang, 'fam.tab.study')} title={t(lang, 'fam.call.title')} tone="ink" />
      <main className="relative mx-auto -mt-8 flex w-full max-w-xl flex-1 flex-col gap-4 px-4 pb-24">
        <p data-call-refused role="status" className="fam-card bg-white p-5 text-base text-slate">
          {custom ?? t(lang, key)}
        </p>
        <Link href="/family/study" className="fam-press inline-flex min-h-[44px] items-center self-start rounded-2xl px-1 font-bold text-ink underline decoration-saffron decoration-2 underline-offset-4">
          {t(lang, 'fam.tab.study')}
        </Link>
      </main>
    </div>
  );
  if (isPrePrimary(child.classLevel)) return refuse('fam.voice.err.not_for_class');
  const [switches, subjects] = await familyPageRead(page, async (db) =>
    Promise.all([readFamilySwitches(db, page.session.accountId), classSubjects(db, { board: syllabusBoardOf(child), classLevel: child.classLevel, stream: child.stream })])
  );
  // W16-B5: the call has its own switch in Control → Apps (tutor_call): off, the route says so in Control's words if it set
  // some, else in ours, and nothing is recorded.
  if (!switchOn(switches, 'tutor_call')) return refuse('fam.call.off', offMessage(switches, 'tutor_call', lang));
  if (!page.consents.voice_practice) return refuse('fam.voice.err.consent_required');
  if (!switchOn(switches, 'voice_input') || !switchOn(switches, 'understand')) return refuse('fam.voice.err.off');
  // The tutor the call is with (W16-B5): its name from the Tutor Hall, while the Hall is on; a tutor that is gone, or a Hall
  // that is off, leaves "Your tutor" and no persona. A subject tutor opens its own subject unless the link names one.
  const tutor =
    isTutorKey(searchParams.tutor) && switchOn(switches, 'tutor_hall')
      ? findTutor(await loadHall(familyClaims(page.session), (fn) => familyPageRead(page, fn), page.session.accountId, lang), searchParams.tutor)
      : null;
  const subject = subjects.find((s) => s === searchParams.subject) ?? subjects.find((s) => s === tutor?.subject) ?? (child.freeSubject && subjects.includes(child.freeSubject) ? child.freeSubject : subjects[0]);
  if (!subject) return refuse('fam.understand.off');
  const [day, realtime] = await familyPageRead(page, async (db) => [await voiceDay(db, page.session.accountId, child.childId, indiaDate()), await realtimeReady(db, page.session.accountId)] as const);
  const w = familyWords(lang, [...CALL_KEYS, `fam.subject.${subject}` as MessageKey]);
  return (
    <CallView
      w={w}
      lang={lang === 'hi' ? 'hi' : 'en'}
      subject={subject}
      tutorName={tutor?.name ?? t(lang, callTutorName(searchParams.tutor))}
      tutorKey={tutor?.key ?? null}
      secondsLeft={day.left}
      endHref={`/family/study?subject=${encodeURIComponent(subject)}${tutor ? `&tutor=${encodeURIComponent(tutor.key)}` : ''}`}
      realtime={realtime}
    />
  );
}
