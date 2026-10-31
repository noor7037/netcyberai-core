import { familyClaims } from '@/lib/family/db';
import Link from 'next/link';
import { TUTOR_READS_FILES } from '@/lib/family/tutor-shape';
import { redirect } from 'next/navigation';
import { TutorWindow } from '@/components/family/tutor/TutorWindow';
import { TUTOR_KEYS } from '@/lib/family/tutor-words';
import { DataSaverSwitch } from '@/components/family/offline/DataSaverSwitch';
import { PackButton } from '@/components/family/offline/PackButton';
import { SubPageHeader } from '@/components/family/SubPageHeader';
import { SyllabusList, type SyllabusListChapter } from '@/components/family/SyllabusList';
import { StatusBadge } from '@/components/family/StatusBadge';
import { SubjectGlyph } from '@/components/family/ui/SubjectGlyph';
import { classSubjects, publishedSubjects, readFamilyCatalog } from '@/lib/family/catalog';
import { readableChapters } from '@/lib/family/chapter-store';
import { listRequests, queueStatusOf, readSourceModes, requestStudyStatus, sourceShown } from '@/lib/family/chapter-requests';
import { readOwnSyllabus } from '@/lib/family/child-syllabus';
import { isPrePrimary, syllabusBoardOf } from '@/lib/family/children';
import { classText, fill } from '@/lib/family/fill';
import { openSubjects } from '@/lib/family/learning';
import { subjectAccess } from '@/lib/family/modules';
import { readFamilySwitches, switchOn } from '@/lib/family/flags';
import { photoGate } from '@/lib/family/photo-gate';
import { voiceDay } from '@/lib/family/voice';
import { VOICE_KEYS } from '@/lib/family/voice-words';
import { indiaDate } from '@/lib/time/india';
import { OFFLINE_KEYS } from '@/lib/family/offline-words';
import { chapterPacks } from '@/lib/family/pack';
import { subjectTheme } from '@/lib/family/subject-theme';
import { STUDY_STATUS_KEY, subjectStatus } from '@/lib/family/study-status';
import { SchoolSyllabus } from '@/components/family/SchoolSyllabus';
import { TonightPractice } from '@/components/family/TonightPractice';
import { TEST_LIST_KEYS, TestList } from '@/components/family/school-test/TestList';
import { childOnlineTests } from '@/lib/family/online-tests';
import { activeLinks, schoolStudyFor } from '@/lib/family/school';
import { familyPageRead, firstStepsNext, requireFamilyPage } from '@/lib/family/server';
import { UNDERSTAND_KEYS } from '@/lib/family/understand-words';
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

export default async function FamilyStudyPage({ searchParams }: { searchParams: { subject?: string } }) {
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
  const [subjects, openToAll, published] = await familyPageRead(page, (db) => Promise.all([classSubjects(db, { board, classLevel: child.classLevel, stream: child.stream }), openSubjects(db), publishedSubjects(db, { board, classLevel: child.classLevel })]));
  const requested = subjects.find((s) => s === searchParams.subject);
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

  const readerHref = (key: string) => `/family/study/chapter/${encodeURIComponent(key)}`;
  const readerLabel = t(lang, 'fam.study.openChapter');
  const catalogKeys = new Set(catalog?.chapters.map((c) => c.key) ?? []);
  const readableByKey = new Map(readable.map((c) => [c.key, c]));
  // Every chapter listed from the catalog comes from the version released to everyone: it is Published.
  const publishedBadge = <StatusBadge status="published" label={t(lang, STUDY_STATUS_KEY.published)} />;
  const rows: SyllabusListChapter[] = [
    ...(catalog?.chapters ?? []).map((c): SyllabusListChapter => {
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
    }),
    // S1 (C374), S3 (C376): a published chapter to read and hear that is not in the catalog (the parent's own, the showcase).
    ...readable
      .filter((c) => !catalogKeys.has(c.key))
      .map((c): SyllabusListChapter => ({ key: c.key, title: c.title[lang === 'hi' ? 'hi' : 'en'], mark: 'book', reader: { href: readerHref(c.key), label: readerLabel }, status: publishedBadge, topics: [] })),
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
  const w = familyWords(lang, [...UNDERSTAND_KEYS, ...TUTOR_KEYS, 'fam.school.syllabusTitle', 'fam.school.syllabusAsk', 'fam.school.tonightTitle', 'fam.school.tonightLead', 'fam.school.tonightAsk', ...(voice ? VOICE_KEYS : [])] as MessageKey[]);
  return (
    <div lang={lang} className="flex min-h-screen flex-col">
      <SubPageHeader back="/family" backLabel={t(lang, 'fam.nav.home')} kicker={kicker} title={t(lang, 'fam.study.title')} subject={subject} />
      <main className="relative mx-auto -mt-8 flex w-full max-w-xl flex-1 flex-col gap-4 px-4 pb-24">
        <nav aria-label={t(lang, 'fam.study.subjects')} className="fam-surface relative -mx-1 flex gap-2 overflow-x-auto bg-white p-2">
          {subjects.map((s) => {
            const on = s === subject;
            const locked = !subjectAccess(child, s, openToAll).open;
            // S4 (C377): Published only where a version is really released; nothing is shown otherwise.
            const status = subjectStatus(s, published, queueStatusOf(requests, s));
            return (
              <Link
                key={s}
                href={`/family/study?subject=${s}`}
                aria-current={on ? 'page' : undefined}
                className={`fam-press flex min-h-[48px] shrink-0 items-center gap-2 rounded-xl px-3 text-base font-bold ${on ? 'bg-ink text-white shadow-md' : 'bg-white text-slate hover:bg-off-white'}`}
              >
                <span aria-hidden="true" className={`flex h-8 w-8 items-center justify-center rounded-lg ${on ? 'fam-icon-glass' : subjectTheme(s).soft + ' ' + subjectTheme(s).ink}`}>
                  <SubjectGlyph subject={s} className="h-5 w-5" />
                </span>
                {t(lang, `fam.subject.${s}`)}
                {status && <StatusBadge status={status} label={t(lang, STUDY_STATUS_KEY[status])} />}
                {locked && <span className="sr-only"> ({t(lang, 'fam.subject.locked')})</span>}
                {locked && (
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="5" y="11" width="14" height="10" rx="2" />
                    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                  </svg>
                )}
              </Link>
            );
          })}
        </nav>
        {!child.freeSubject && <p className="fam-rise flex items-center gap-2 rounded-2xl bg-sunshine/30 px-4 py-3 text-sm font-semibold text-slate"><svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-gold-deep" fill="currentColor"><path d="M12 2l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" /></svg>{t(lang, 'fam.subject.firstIsFree')}</p>}
        <TestList w={familyWords(lang, TEST_LIST_KEYS)} lang={lang} tests={tests} />
        {!access.open ? (
          <p data-family-locked className="fam-surface bg-white p-5 text-base text-slate">
            {t(lang, 'fam.subject.notOpen')}
          </p>
        ) : (
          // S2 (C375), W6-A (C395): the tutor window holds the chapters, so its composer stays pinned while they scroll.
          <TutorWindow w={w} subject={subject} tone={tone} voice={voice} files={files} homework={homeworkOn} follow>
            {school.tonight.length > 0 && <TonightPractice w={w} topics={school.tonight} tone={tone} />}
            {rows.length > 0 && <SyllabusList id="fam-chapters" title={t(lang, 'fam.study.chapters')} tone={subject} chapters={rows} />}
            {schoolChapters && <SchoolSyllabus w={w} chapters={schoolChapters} tone={tone} />}
            {own && (
              <SyllabusList
                id="fam-own-syllabus"
                title={t(lang, 'fam.syllabus.yours')}
                tone={subject}
                chapters={own.chapters.map((c) => ({ title: c.title, href: ownHref(c.itemId), hrefLabel: t(lang, 'fam.study.understandChapter'), topics: c.topics.map((tp) => ({ title: tp.title, href: ownHref(tp.itemId) })) }))}
              />
            )}
            {!catalog && !own && (
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
