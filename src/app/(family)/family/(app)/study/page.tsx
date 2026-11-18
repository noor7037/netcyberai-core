import { familyClaims } from '@/lib/family/db';
import { findTutor, isTutorKey, loadHall } from '@/lib/family/tutors';
import Link from 'next/link';
import { TUTOR_READS_FILES } from '@/lib/family/tutor-shape';
import { redirect } from 'next/navigation';
import { TutorWindowLazy as TutorWindow } from '@/components/family/tutor/TutorWindowLazy';
import { TUTOR_KEYS } from '@/lib/family/tutor-words';
import { DataSaverSwitch } from '@/components/family/offline/DataSaverSwitch';
import { PackButton } from '@/components/family/offline/PackButton';
import { SubPageHeader } from '@/components/family/SubPageHeader';
import { SyllabusList, type SyllabusListChapter } from '@/components/family/SyllabusList';
import { StatusBadge } from '@/components/family/StatusBadge';
import { SubjectGlyph } from '@/components/family/ui/SubjectGlyph';
import { classSubjects, readFamilyCatalog } from '@/lib/family/catalog';
import { chapterFitsClass, readableChapters } from '@/lib/family/chapter-store';
import { listRequests, readSourceModes, requestStudyStatus, sourceShown } from '@/lib/family/chapter-requests';
import { readOwnSyllabus } from '@/lib/family/child-syllabus';
import { isPrePrimary, syllabusBoardOf } from '@/lib/family/children';
import { classText, fill } from '@/lib/family/fill';
import { openSubjects } from '@/lib/family/learning';
import { subjectAccess } from '@/lib/family/modules';
import { familyModuleOn, readFamilySwitches, switchOn } from '@/lib/family/flags';
import { photoGate } from '@/lib/family/photo-gate';
import { voiceDay } from '@/lib/family/voice';
import { serverVoiceReady } from '@/lib/family/voice-out';
import { VOICE_KEYS } from '@/lib/family/voice-words';
import { indiaDate } from '@/lib/time/india';
import { OFFLINE_KEYS } from '@/lib/family/offline-words';
import { chapterPacks } from '@/lib/family/pack';
import { subjectTheme } from '@/lib/family/subject-theme';
import { STUDY_STATUS_KEY } from '@/lib/family/study-status';
import { SchoolSyllabus } from '@/components/family/SchoolSyllabus';
import { QuizBadge } from '@/components/family/QuizBadge';
import { StudySearch } from '@/components/family/StudySearch';
import { SEARCH_KEYS } from '@/lib/family/search-words';
import { quizCards, waitingBySubject } from '@/lib/family/quiz';
import { TonightPractice } from '@/components/family/TonightPractice';
import { TEST_LIST_KEYS, TestList } from '@/components/family/school-test/TestList';
import { childOnlineTests } from '@/lib/family/online-tests';
import { activeLinks, schoolStudyFor } from '@/lib/family/school';
import { familyPageRead, firstStepsNext, requireFamilyPage } from '@/lib/family/server';
import { UNDERSTAND_KEYS } from '@/lib/family/understand-words';
import { tutorParts } from '@/lib/family/tutor-parts';
import { bookFor, bookHref } from '@/lib/family/books';
import { familyWords } from '@/lib/family/words';
import { t, type MessageKey } from '@/lib/i18n';

// Study (M1-5, C251): the child's subject, its chapters and topics from the catalog released to everyone for the
// child's class, each opening Understand; and a typed question, in the shared tutor window (S2, C375). Without a catalog for the class (classes 6–8 for
// 2026-27, C250) only the question is offered. Nursery, LKG and UKG (C263) see a plain note: their module comes later.
// W6-A (C395): three things: the subject strip, the chapters as one accordion (a row per chapter; inside it the
// topics, the worksheets, the published chapter to read and hear, the offline pack), and the tutor's one composer,
// pinned above the tab dock. A chapter the parent asked for is a row of the same list with its badge; the photo of a
// question (the homework helper) sits in the composer's Attach menu.

// The subject tabs are the subjects of the child's class (C264): the stage's school subjects and whatever the catalog
// holds for the class, the free one first once claimed.

export default async function FamilyStudyPage({ searchParams }: { searchParams: { subject?: string; tutor?: string; chapter?: string } }) {
  const page = await requireFamilyPage();
  if (!page) redirect('/family/sign-in');
  const next = firstStepsNext(page);
  if (next) redirect(next);
  const child = page.child!;
  const lang = page.childLang;
  const kicker = classText((k) => t(lang, k), child.classLevel);
  if (isPrePrimary(child.classLevel)) {
    return (
      <div lang={lang} className="flex min-h-screen flex-col">
        <SubPageHeader back="/family" backLabel={t(lang, 'fam.nav.home')} kicker={kicker} title={t(lang, 'fam.study.title')} tone="ink" />
        <main className="relative mx-auto -mt-8 flex w-full max-w-xl flex-1 flex-col gap-4 px-4 pb-24">
          <p data-pre-primary className="fam-card bg-white p-5 text-base text-slate">
            {t(lang, 'fam.study.prePrimary')}
          </p>
        </main>
      </div>
    );
  }
  const board = syllabusBoardOf(child);
  // C298: subjects Control opens to every child (the pilot's EVS) stay open whatever the free subject is.
  const [subjects, openToAll] = await familyPageRead(page, (db) => Promise.all([classSubjects(db, { board, classLevel: child.classLevel, stream: child.stream }), openSubjects(db)]));
  // W16-A3: the tutor chosen in the Tutor Hall (?tutor=), while its module is on; a subject tutor opens its own subject.
  const tutorParam = isTutorKey(searchParams.tutor) ? searchParams.tutor : null;
  const chosenTutor =
    tutorParam && (await familyPageRead(page, (db) => familyModuleOn(db, 'tutor_hall', page.session.accountId)))
      ? findTutor(await loadHall(familyClaims(page.session), (fn) => familyPageRead(page, fn), page.session.accountId, lang), tutorParam)
      : null;
  const requested = subjects.find((s) => s === searchParams.subject) ?? subjects.find((s) => s === chosenTutor?.subject);
  const subject = requested ?? (child.freeSubject && subjects.includes(child.freeSubject) ? child.freeSubject : subjects[0]);
  const access = subjectAccess(child, subject, openToAll);
  // S3 (C376): the parent's choice of source for this subject (none: every source shown), the child's chapter requests
  // (the missing-chapter queue behind the Received and Digitizing badges), and the chapters that can be opened.
  // One after the other: each read holds a savepoint on the family's single connection.
  const [modes, requests] = await familyPageRead(page, async (db) => {
    const m = await readSourceModes(db, page.session.accountId, child.childId);
    return [m, await listRequests(db, page.session.accountId, child.childId)] as const;
  });
  const mode = modes[subject];
  const readable = access.open ? await familyPageRead(page, (db) => readableChapters(db, { board, classLevel: child.classLevel, subject, childId: child.childId })) : [];
  const subjectRequests = requests.filter((r) => r.subject === subject);
  const catalog = access.open && sourceShown(mode, 'catalog') ? await familyPageRead(page, (db) => readFamilyCatalog(db, { board, classLevel: child.classLevel, subject, lang })) : null;
  // C230-AB: the syllabus the parent saved for this child and subject, below the board's catalog when there is one.
  // Each line opens Understand as a typed question about it.
  const own = access.open && sourceShown(mode, 'parent') ? await familyPageRead(page, (db) => readOwnSyllabus(db, page.session.accountId, child.childId, subject)) : null;
  const ownHref = (itemId: string) => `/family/understand?kind=own&key=${encodeURIComponent(itemId)}`;
  // The school's own syllabus for this subject (C230-AA), for a child matched to a connected school's student.
  const [switches, links] = await familyPageRead(page, (db) => Promise.all([readFamilySwitches(db, page.session.accountId), access.open ? activeLinks(db, page.session.accountId) : Promise.resolve([])]));
  const school = links.length && sourceShown(mode, 'school') ? await schoolStudyFor(familyClaims(page.session), links, child.childId, subject) : { chapters: null, tonight: [] };
  // AQ-4 (C365): the school's online tests for the child's class, coming up or open now, whatever the subject chosen.
  const testLinks = access.open ? links : await familyPageRead(page, (db) => activeLinks(db, page.session.accountId));
  const tests = testLinks.length ? await childOnlineTests(familyClaims(page.session), testLinks, child.childId) : [];
  const schoolChapters = school.chapters;
  // M2-6 (C280): the homework helper's link, while its module is on.
  const homeworkOn = switchOn(switches, 'homework');
  // W6-A (C395): Attach (and the homework helper in its menu) shows only when the photo gate, the same rules the server
  // applies to every photo, lets a photo through.
  const files = access.open && TUTOR_READS_FILES && (await familyPageRead(page, (db) => photoGate(db, page.session.accountId, child))) === null;
  // Voice input (M2-7, C281): the microphone shows only with the parent's voice consent and the module on, with the
  // seconds left of the child's day.
  // W17-B2: whether a tutor answer's speaker button uses the server voice (one read, only where the tutor shows).
  const serverVoice = access.open && (await familyPageRead(page, (db) => serverVoiceReady(db, page.session.accountId)));
  const voice =
    page.consents.voice_practice && switchOn(switches, 'voice_input') ? { secondsLeft: (await familyPageRead(page, (db) => voiceDay(db, page.session.accountId, child.childId, indiaDate()))).left } : null;
  // M2-9 (C283): a pack downloads only for the child's free subject, with the parent's consent (the pack route checks
  // both too).
  const offline = switchOn(switches, 'offline') && switchOn(switches, 'understand');
  const packs = offline && catalog && page.consents.study_core && (child.freeSubject === subject || openToAll.includes(subject)) ? new Map((await familyPageRead(page, (db) => chapterPacks(db, { accountId: page.session.accountId, child }, subject))).map((p) => [p.chapter.key, p])) : null;
  const ow = offline ? familyWords(lang, OFFLINE_KEYS) : {};
  // M2-4 (C278): a Worksheet action per topic while the module is switched on.
  const worksheets = access.open && switchOn(switches, 'worksheets');
  const tone = subject;
  // W22-S1: the quizzes waiting in each subject (never taken, or a review due), shown as a badge on the subject's chip.
  const waiting = waitingBySubject(await familyPageRead(page, (db) => quizCards(db, { accountId: page.session.accountId, childId: child.childId }, indiaDate(), { all: true })));

  const readerHref = (key: string) => `/family/study/chapter/${encodeURIComponent(key)}`;
  const readerLabel = t(lang, 'fam.study.openChapter');
  const catalogKeys = new Set(catalog?.chapters.map((c) => c.key) ?? []);
  const readableByKey = new Map(readable.map((c) => [c.key, c]));
  // Every chapter listed from the catalog is released to everyone. "Published" is a staff word: a family sees no badge on a
  // chapter it can open, only on one it asked for (below).
  const publishedBadge = undefined;
  type CatalogChapter = NonNullable<typeof catalog>['chapters'][number];
  const catalogRow = (c: CatalogChapter): SyllabusListChapter => {
      const pack = packs?.get(c.key);
      return {
        key: c.key,
        title: c.title,
        href: `/family/understand?kind=chapter&key=${encodeURIComponent(c.key)}`,
        hrefLabel: t(lang, 'fam.study.understandChapter'),
        reader: readableByKey.has(c.key) ? { href: readerHref(c.key), label: readerLabel } : undefined,
        status: publishedBadge,
        extra: pack && pack.topics.length > 0 ? <PackButton w={ow} lang={lang} childId={child.childId} chapterKey={c.key} chapterTitle={c.title} bytes={pack.bytes} missing={pack.missing.length} /> : undefined,
        topics: c.topics.map((tp) => ({
          key: tp.key,
          title: tp.title,
          href: `/family/understand?kind=topic&key=${encodeURIComponent(tp.key)}`,
          worksheet: worksheets ? { href: `/family/study/worksheet/${encodeURIComponent(tp.key)}`, label: t(lang, 'fam.worksheet.action'), ariaLabel: fill(t(lang, 'fam.worksheet.openFor'), { topic: tp.title }) } : undefined,
        })),
      };
  };
  // The child's book (founder, 9 Nov 2026; src/lib/family/books.ts): its chapters first, in the book's order, each
  // opening the chapter reader, with the catalog chapter it teaches (Explain, topics, offline pack) on the same row.
  const book = access.open && sourceShown(mode, 'catalog') ? bookFor({ board, classLevel: child.classLevel, subject }) : null;
  const catalogByKey = new Map((catalog?.chapters ?? []).map((c) => [c.key, c]));
  const inBook = new Set(book?.chapters.map((c) => c.catalogKey).filter((k): k is string => !!k && catalogByKey.has(k)) ?? []);
  const rows: SyllabusListChapter[] = [
    ...(book?.chapters ?? []).map((bc): SyllabusListChapter => {
      const c = bc.catalogKey ? catalogByKey.get(bc.catalogKey) : undefined;
      const reader = { href: bookHref(bc.key), label: readerLabel };
      const title = bc.title[lang === 'hi' ? 'hi' : 'en'];
      // W22-S1 (C488): no "Explain this chapter" on a book row: the reader and its tutor teach the chapter.
      return c ? { ...catalogRow(c), key: bc.key, title, reader, href: undefined, hrefLabel: undefined } : { key: bc.key, title, reader, status: publishedBadge, topics: [] };
    }),
    ...(catalog?.chapters ?? []).filter((c) => !inBook.has(c.key)).map(catalogRow),
    // S1 (C374), S3 (C376): a published chapter to read and hear that is not in the catalog (the parent's own, the showcase).
    // Only the child's own chapters, and published ones of this class: a sample or test chapter of another class (or with
    // no class) is not listed (founder, 16 Nov: the list showed a harness chapter and mixed classes).
    ...readable
      .filter((c) => !catalogKeys.has(c.key) && (c.own || chapterFitsClass(c.key, child.classLevel)))
      .map((c): SyllabusListChapter => ({ key: c.key, title: c.title[lang === 'hi' ? 'hi' : 'en'], reader: { href: readerHref(c.key), label: readerLabel }, status: publishedBadge, topics: [] })),
    // S3 (C376): the chapters the parent asked for, with the queue's badge (Received, Digitizing) or "Not possible".
    ...subjectRequests.map((r): SyllabusListChapter => {
      const st = requestStudyStatus(r.status);
      return {
        key: `request:${r.requestId}`,
        title: r.title,
        mark: 'dot',
        data: 'data-chapter-requests',
        topics: [],
        status: st ? <StatusBadge status={st} label={t(lang, STUDY_STATUS_KEY[st])} /> : <span className="shrink-0 text-sm font-semibold text-slate">{t(lang, 'fam.request.declined')}</span>,
      };
    }),
  ];
  // The tutor stays on the subject it teaches (every subject, for an all-subject tutor).
  const tutorHere = chosenTutor && (chosenTutor.subject === null || chosenTutor.subject === subject) ? { key: chosenTutor.key, name: chosenTutor.name } : null;
  const tabHref = (s: string) => `/family/study?subject=${s}${chosenTutor && (chosenTutor.subject === null || chosenTutor.subject === s) ? `&tutor=${encodeURIComponent(chosenTutor.key)}` : ''}`;
  const parts = tutorParts(switches);
  // W16-B5: "Call <tutor>" in the composer: the call opens on this subject with the chosen tutor, and its End comes back here.
  // Shown only when the call is switched on and the child may speak (the call screen checks the same rules and says why).
  const callOn = voice !== null && parts.call;
  const callHref = `/family/call?${tutorHere ? `tutor=${encodeURIComponent(tutorHere.key)}&` : ''}subject=${encodeURIComponent(subject)}`;
  const w = familyWords(lang, [...UNDERSTAND_KEYS, ...TUTOR_KEYS, 'fam.tutors.chattingWith', 'fam.tutors.change', 'fam.tutors.callWith', 'fam.call.tutorDefault', 'fam.tutor.askShort', 'fam.school.syllabusTitle', 'fam.school.syllabusAsk', 'fam.school.tonightTitle', 'fam.school.tonightLead', 'fam.school.tonightAsk', ...(voice ? VOICE_KEYS : [])] as MessageKey[]);
  return (
    <div lang={lang} className="flex min-h-screen flex-col">
      <SubPageHeader back="/family" backLabel={t(lang, 'fam.nav.home')} kicker={kicker} title={t(lang, 'fam.study.title')} subject={subject} wide
        aside={
          parts.hall ? (
            <Link href="/family/tutors" data-tutors-link className="fam-press inline-flex min-h-[44px] items-center rounded-full bg-white px-4 text-sm font-bold text-ink ring-1 ring-ink/10">
              {t(lang, 'fam.tutors.nav')}
            </Link>
          ) : undefined
        }
      />
      <main data-study-main className="relative mx-auto -mt-8 flex w-full max-w-none flex-1 flex-col gap-4 px-3 pb-[calc(var(--fam-bottom,0px)+5.25rem)] sm:px-4 lg:max-w-[68rem]">
        <StudySearch w={familyWords(lang, SEARCH_KEYS)} />
        <nav aria-label={t(lang, 'fam.study.subjects')} className="fam-surface relative -mx-1 flex gap-2 overflow-x-auto bg-white p-2">
          {subjects.map((s) => {
            const on = s === subject;
            const locked = !subjectAccess(child, s, openToAll).open;
            return (
              <div key={s} className={`flex shrink-0 items-center rounded-xl ${on ? 'bg-ink shadow-md' : 'bg-white hover:bg-off-white'}`}>
                <Link
                  href={tabHref(s)}
                  aria-current={on ? 'page' : undefined}
                  className={`fam-press flex min-h-[48px] items-center gap-2 rounded-xl pl-3 text-base font-bold ${waiting[s] ? 'pr-1' : 'pr-3'} ${on ? 'text-white' : 'text-slate'}`}
                >
                  <span aria-hidden="true" className={`flex h-8 w-8 items-center justify-center rounded-lg ${on ? 'fam-icon-glass' : subjectTheme(s).soft + ' ' + subjectTheme(s).ink}`}>
                    <SubjectGlyph subject={s} className="h-5 w-5" />
                  </span>
                  {t(lang, `fam.subject.${s}`)}
                  {locked && <span className="sr-only"> ({t(lang, 'fam.subject.locked')})</span>}
                  {locked && (
                    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="5" y="11" width="14" height="10" rx="2" />
                      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                    </svg>
                  )}
                </Link>
                <QuizBadge href={`/family/study/quizzes?subject=${s}`} count={waiting[s] ?? 0} word={t(lang, 'fam.quiz.chip')} label={waiting[s] > 0 ? fill(t(lang, 'fam.quiz.badge'), { n: waiting[s], subject: t(lang, `fam.subject.${s}`) }) : fill(t(lang, 'fam.quiz.badgeNone'), { subject: t(lang, `fam.subject.${s}`) })} />
              </div>
            );
          })}
        </nav>
        <TestList w={familyWords(lang, TEST_LIST_KEYS)} lang={lang} tests={tests} />
        {!access.open ? (
          <p data-family-locked className="fam-surface bg-white p-5 text-base text-slate">
            {t(lang, 'fam.subject.notOpen')}
          </p>
        ) : (
          // S2 (C375), W6-A (C395): the tutor window holds the chapters, so its composer stays pinned while they scroll. W24: one
          // page scroll, the answers then the chapters (no inner box).
          <TutorWindow w={w} subject={subject} tone={tone} voice={voice} files={files} homework={homeworkOn} serverVoice={serverVoice} follow pageScroll tutor={tutorHere} call={callOn ? { href: callHref, label: fill(w['fam.tutors.callWith'], { name: tutorHere?.name ?? w['fam.call.tutorDefault'] }) } : null}>
            {school.tonight.length > 0 && <TonightPractice w={w} topics={school.tonight} tone={tone} />}
            {rows.length > 0 && <SyllabusList id="fam-chapters" title={t(lang, 'fam.study.chapters')} tone={subject} chapters={rows} openKey={searchParams.chapter} />}
            {schoolChapters && <SchoolSyllabus w={w} chapters={schoolChapters} tone={tone} />}
            {own && (
              <SyllabusList
                id="fam-own-syllabus"
                title={t(lang, 'fam.syllabus.yours')}
                tone={subject}
                chapters={own.chapters.map((c) => ({ title: c.title, href: ownHref(c.itemId), hrefLabel: t(lang, 'fam.study.understandChapter'), topics: c.topics.map((tp) => ({ title: tp.title, href: ownHref(tp.itemId) })) }))}
              />
            )}
            {!catalog && !own && !book && (
              <p data-family-no-catalog className="fam-surface bg-white p-5 text-base text-slate">
                {t(lang, 'fam.study.noCatalog')}
              </p>
            )}
            {offline && <DataSaverSwitch w={ow} />}
          </TutorWindow>
        )}
      </main>
    </div>
  );
}
