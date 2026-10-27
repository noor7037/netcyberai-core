import { familyClaims } from '@/lib/family/db';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { StudyQuestion } from '@/components/family/StudyQuestion';
import { DataSaverSwitch } from '@/components/family/offline/DataSaverSwitch';
import { PackButton } from '@/components/family/offline/PackButton';
import { SaverLink } from '@/components/family/offline/SaverLink';
import { SubPageHeader } from '@/components/family/SubPageHeader';
import { SyllabusList } from '@/components/family/SyllabusList';
import { SubjectGlyph } from '@/components/family/ui/SubjectGlyph';
import { classSubjects, readFamilyCatalog } from '@/lib/family/catalog';
import { readOwnSyllabus } from '@/lib/family/child-syllabus';
import { isPrePrimary, syllabusBoardOf } from '@/lib/family/children';
import { classText, fill } from '@/lib/family/fill';
import { openSubjects } from '@/lib/family/learning';
import { subjectAccess } from '@/lib/family/modules';
import { readFamilySwitches, switchOn } from '@/lib/family/flags';
import { voiceDay } from '@/lib/family/voice';
import { VOICE_KEYS } from '@/lib/family/voice-words';
import { indiaDate } from '@/lib/time/india';
import { OFFLINE_KEYS } from '@/lib/family/offline-words';
import { chapterPacks } from '@/lib/family/pack';
import { subjectTheme } from '@/lib/family/subject-theme';
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
// child's class, each opening Understand; and a typed question. Without a catalog for the class (classes 6–8 for
// 2026-27, C250) only the question is offered. Nursery, LKG and UKG (C263) see a plain note: their module comes later.
// A title is marked with the language it is written in (a Hindi title from NCERT's Hindi edition, or a Hindi
// textbook's own Devanagari title, is Hindi; an English-only title stays English on a Hindi page), for screen readers.
const titleLang = (title: string) => (/[\u0900-\u097F]/.test(title) ? 'hi' : 'en');

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
        <SubPageHeader back="/family" backLabel={t(lang, 'fam.nav.home')} kicker={kicker} title={t(lang, 'fam.study.title')} tone="royal" />
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
  const [subjects, openToAll] = await familyPageRead(page, (db) => Promise.all([classSubjects(db, { board, classLevel: child.classLevel }), openSubjects(db)]));
  const requested = subjects.find((s) => s === searchParams.subject);
  const subject = requested ?? (child.freeSubject && subjects.includes(child.freeSubject) ? child.freeSubject : subjects[0]);
  const access = subjectAccess(child, subject, openToAll);
  const catalog = access.open ? await familyPageRead(page, (db) => readFamilyCatalog(db, { board, classLevel: child.classLevel, subject, lang })) : null;
  // C230-AB: the syllabus the parent saved for this child and subject, below the board's catalog when there is one.
  // Each line opens Understand as a typed question about it.
  const own = access.open ? await familyPageRead(page, (db) => readOwnSyllabus(db, page.session.accountId, child.childId, subject)) : null;
  const ownHref = (itemId: string) => `/family/understand?kind=own&key=${encodeURIComponent(itemId)}`;
  // The school's own syllabus for this subject (C230-AA), for a child matched to a connected school's student.
  const [switches, links] = await familyPageRead(page, (db) => Promise.all([readFamilySwitches(db, page.session.accountId), access.open ? activeLinks(db, page.session.accountId) : Promise.resolve([])]));
  const school = links.length ? await schoolStudyFor(familyClaims(page.session), links, child.childId, subject) : { chapters: null, tonight: [] };
  // AQ-4 (C365): the school's online tests for the child's class, coming up or open now, whatever the subject chosen.
  const testLinks = access.open ? links : await familyPageRead(page, (db) => activeLinks(db, page.session.accountId));
  const tests = testLinks.length ? await childOnlineTests(familyClaims(page.session), testLinks, child.childId) : [];
  const schoolChapters = school.chapters;
  // M2-6 (C280): the homework helper's link, while its module is on.
  const homeworkOn = switchOn(switches, 'homework');
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
  const w = familyWords(lang, [...UNDERSTAND_KEYS, 'fam.study.ask', 'fam.study.askHelp', 'fam.study.askButton', 'fam.school.syllabusTitle', 'fam.school.syllabusAsk', 'fam.school.tonightTitle', 'fam.school.tonightLead', 'fam.school.tonightAsk', ...(voice ? VOICE_KEYS : [])] as MessageKey[]);
  return (
    <div lang={lang} className="flex min-h-screen flex-col">
      <SubPageHeader back="/family" backLabel={t(lang, 'fam.nav.home')} kicker={kicker} title={t(lang, 'fam.study.title')} subject={subject} />
      <main className="relative mx-auto -mt-8 flex w-full max-w-xl flex-1 flex-col gap-4 px-4 pb-24">
        <nav aria-label={t(lang, 'fam.study.subjects')} className="fam-card relative -mx-1 flex gap-2 overflow-x-auto bg-white p-2">
          {subjects.map((s) => {
            const on = s === subject;
            const locked = !subjectAccess(child, s, openToAll).open;
            return (
              <Link
                key={s}
                href={`/family/study?subject=${s}`}
                aria-current={on ? 'page' : undefined}
                className={`fam-press flex min-h-[48px] shrink-0 items-center gap-2 rounded-2xl px-3 text-base font-bold ${on ? `bg-royal-deep text-white shadow-md ${subjectTheme(s).tile}` : 'bg-white text-slate hover:bg-off-white'}`}
              >
                <span aria-hidden="true" className={`flex h-8 w-8 items-center justify-center rounded-xl ${on ? 'fam-icon-glass' : subjectTheme(s).soft + ' ' + subjectTheme(s).ink}`}>
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
            );
          })}
        </nav>
        {!child.freeSubject && <p className="fam-rise flex items-center gap-2 rounded-2xl bg-sunshine/30 px-4 py-3 text-sm font-semibold text-slate"><svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-gold-deep" fill="currentColor"><path d="M12 2l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" /></svg>{t(lang, 'fam.subject.firstIsFree')}</p>}
        {offline && <DataSaverSwitch w={ow} />}
        <TestList w={familyWords(lang, TEST_LIST_KEYS)} lang={lang} tests={tests} />
        {!access.open ? (
          <p data-family-locked className="fam-card bg-white p-5 text-base text-slate">
            {t(lang, 'fam.subject.notOpen')}
          </p>
        ) : (
          <>
            <StudyQuestion w={w} subject={subject} tone={tone} voice={voice} />
            {school.tonight.length > 0 && <TonightPractice w={w} topics={school.tonight} tone={tone} />}
            {schoolChapters && <SchoolSyllabus w={w} chapters={schoolChapters} tone={tone} />}
            {homeworkOn && (
              <Link href="/family/study/homework" data-homework-link className="fam-card fam-press flex min-h-[56px] items-center gap-3 bg-white p-4">
                <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-sunshine/30 text-gold-deep">
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
                    <circle cx="12" cy="13" r="3.5" />
                  </svg>
                </span>
                <span className="flex flex-col">
                  <span className="text-base font-bold text-slate">{t(lang, 'fam.homework.studyLink')}</span>
                  <span className="text-sm text-slate/80">{t(lang, 'fam.homework.studyLead')}</span>
                </span>
              </Link>
            )}
          </>
        )}
        {!access.open ? null : catalog ? (
          <section aria-labelledby="fam-chapters" className="flex flex-col gap-2">
            <h2 id="fam-chapters" className="px-1 text-lg font-extrabold text-slate">
              {t(lang, 'fam.study.chapters')}
            </h2>
            <ol className="flex flex-col gap-2">
              {catalog.chapters.map((c, i) => (
                <li key={c.key} className="fam-card fam-rise bg-white p-3" style={{ ['--d' as string]: `${Math.min(i, 8) * 50}ms` } as React.CSSProperties}>
                  <SaverLink href={`/family/understand?kind=chapter&key=${encodeURIComponent(c.key)}`} className="fam-press flex min-h-[52px] items-center gap-3 rounded-2xl px-1 text-base font-bold text-slate">
                    <span aria-hidden="true" className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-royal-deep text-base font-black text-white shadow-md ${subjectTheme(subject).tile}`}>
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1" lang={titleLang(c.title)}>
                      {c.title}
                    </span>
                    <svg aria-hidden="true" viewBox="0 0 24 24" className={`h-5 w-5 shrink-0 ${subjectTheme(subject).ink}`} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                  </SaverLink>
                  {packs && (packs.get(c.key)?.topics.length ?? 0) > 0 && (
                    <PackButton w={ow} lang={lang} childId={child.childId} chapterKey={c.key} chapterTitle={c.title} bytes={packs.get(c.key)!.bytes} missing={packs.get(c.key)!.missing.length} />
                  )}
                  {c.topics.length > 0 && (
                    <ul className="mt-1 flex flex-col">
                      {c.topics.map((tp) => (
                        <li key={tp.key} className="flex items-center gap-1">
                          <SaverLink href={`/family/understand?kind=topic&key=${encodeURIComponent(tp.key)}`} className="flex min-h-[44px] flex-1 items-center gap-3 rounded-xl px-2 text-sm text-slate hover:bg-off-white">
                            <span aria-hidden="true" className={`ml-4 h-2 w-2 shrink-0 rounded-full ${subjectTheme(subject).chip}`} />
                            <span lang={titleLang(tp.title)}>{tp.title}</span>
                          </SaverLink>
                          {worksheets && (
                            <Link
                              href={`/family/study/worksheet/${encodeURIComponent(tp.key)}`}
                              aria-label={fill(t(lang, 'fam.worksheet.openFor'), { topic: tp.title })}
                              className={`fam-press flex min-h-[44px] shrink-0 items-center rounded-xl px-3 text-sm font-bold hover:bg-off-white ${subjectTheme(subject).ink}`}
                            >
                              {t(lang, 'fam.worksheet.action')}
                            </Link>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          </section>
        ) : own ? null : (
          <p data-family-no-catalog className="fam-card bg-white p-5 text-base text-slate">
            {t(lang, 'fam.study.noCatalog')}
          </p>
        )}
        {access.open && own && (
          <SyllabusList
            id="fam-own-syllabus"
            title={t(lang, 'fam.syllabus.yours')}
            note={t(lang, 'fam.syllabus.yoursNote')}
            tone={subject}
            chapters={own.chapters.map((c) => ({ title: c.title, href: ownHref(c.itemId), topics: c.topics.map((tp) => ({ title: tp.title, href: ownHref(tp.itemId) })) }))}
          />
        )}
      </main>
    </div>
  );
}
