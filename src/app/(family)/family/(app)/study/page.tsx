import Link from 'next/link';
import { redirect } from 'next/navigation';
import { StudyQuestion } from '@/components/family/StudyQuestion';
import { DataSaverSwitch } from '@/components/family/offline/DataSaverSwitch';
import { PackButton } from '@/components/family/offline/PackButton';
import { SaverLink } from '@/components/family/offline/SaverLink';
import { SubPageHeader } from '@/components/family/SubPageHeader';
import { classSubjects, readFamilyCatalog } from '@/lib/family/catalog';
import { readFamilySwitches, switchOn } from '@/lib/family/flags';
import { voiceDay } from '@/lib/family/voice';
import { indiaDate } from '@/lib/time/india';
import { isPrePrimary, syllabusBoardOf } from '@/lib/family/children';
import { classText, fill } from '@/lib/family/fill';
import { OFFLINE_KEYS } from '@/lib/family/offline-words';
import { chapterPacks } from '@/lib/family/pack';
import { subjectAccess } from '@/lib/family/modules';
import { familyPageRead, firstStepsNext, requireFamilyPage } from '@/lib/family/server';
import { UNDERSTAND_KEYS } from '@/lib/family/understand-words';
import { VOICE_KEYS } from '@/lib/family/voice-words';
import { familyWords } from '@/lib/family/words';
import { t, type MessageKey } from '@/lib/i18n';
import { Picture } from '@/components/family/Picture';
import { EmptyState } from '@/components/family/ui/EmptyState';
import { LIFT, PRESS } from '@/components/family/ui/motion';
import { subjectColour } from '@/lib/family/subject-colours';

// Study (M1-5, C251): the child's subject, its chapters and topics from the catalog released to everyone for the
// child's class, each opening Understand; and a typed question. Without a catalog for the class (classes 6–8 for
// 2026-27, C250) only the question is offered. Nursery, LKG and UKG (C263) see a plain note: their module comes later.
// A title is marked with the language it is written in (a Hindi title from NCERT's Hindi edition, or a Hindi
// textbook's own Devanagari title, is Hindi; an English-only title stays English on a Hindi page), for screen readers.
const titleLang = (title: string) => (/[\u0900-\u097F]/.test(title) ? 'hi' : 'en');

// The subject tabs are the subjects of the child's class (C264): the stage's school subjects and whatever the catalog
// holds for the class, the free one first once claimed.
// With Control's offline module on (M2-9, C283): the data-saver switch, and on each chapter whose responses are in the
// shared library, "Save for offline" with the pack's size, measured here before anything is fetched by the phone.

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
        <main className="mx-auto -mt-4 flex w-full max-w-xl flex-1 flex-col gap-4 px-4 pb-24">
          <div data-pre-primary>
            <EmptyState e="🧸" title={t(lang, 'fam.d13.study.prePrimaryTitle')} body={t(lang, 'fam.study.prePrimary')} action={{ href: '/family', label: t(lang, 'fam.nav.home') }} />
          </div>
        </main>
      </div>
    );
  }
  const board = syllabusBoardOf(child);
  const subjects = await familyPageRead(page, (db) => classSubjects(db, { board, classLevel: child.classLevel }));
  const requested = subjects.find((s) => s === searchParams.subject);
  const subject = requested ?? (child.freeSubject && subjects.includes(child.freeSubject) ? child.freeSubject : subjects[0]);
  const access = subjectAccess(child, subject);
  const catalog = access.open ? await familyPageRead(page, (db) => readFamilyCatalog(db, { board, classLevel: child.classLevel, subject, lang })) : null;
  const switches = await familyPageRead(page, (db) => readFamilySwitches(db, page.session.accountId));
  const homeworkOn = switchOn(switches, 'homework');
  // Voice input (M2-7, C281): the microphone shows only with the parent's voice consent and the module on, with the
  // seconds left of the child's day.
  const voice =
    page.consents.voice_practice && switchOn(switches, 'voice_input') ? { secondsLeft: (await familyPageRead(page, (db) => voiceDay(db, page.session.accountId, child.childId, indiaDate()))).left } : null;
  const offline = switchOn(switches, 'offline') && switchOn(switches, 'understand');
  // A pack downloads only for the child's free subject, with the parent's consent (the pack route checks both too).
  const packs = offline && catalog && page.consents.study_core && child.freeSubject === subject ? new Map((await familyPageRead(page, (db) => chapterPacks(db, { accountId: page.session.accountId, child }, subject))).map((p) => [p.chapter.key, p])) : null;
  const ow = offline ? familyWords(lang, OFFLINE_KEYS) : {};
  const tone = subject;
  // M2-4 (C278): a Worksheet action per topic while the module is switched on.
  const worksheets = access.open && switchOn(switches, 'worksheets');
  const w = familyWords(lang, [...UNDERSTAND_KEYS, 'fam.study.ask', 'fam.study.askHelp', 'fam.study.askButton', ...(voice ? VOICE_KEYS : [])] as MessageKey[]);
  return (
    <div lang={lang} className="flex min-h-screen flex-col">
      <SubPageHeader back="/family" backLabel={t(lang, 'fam.nav.home')} kicker={kicker} title={t(lang, 'fam.study.title')} subject={subject} />
      <main className="mx-auto -mt-4 flex w-full max-w-xl flex-1 flex-col gap-4 px-4 pb-24">
        <nav aria-label={t(lang, 'fam.study.subjects')} className="flex flex-wrap gap-2 rounded-3xl bg-white p-2 shadow-sm ring-1 ring-slate/10">
          {subjects.map((s) => (
            <Link
              key={s}
              href={`/family/study?subject=${s}`}
              aria-current={s === subject ? 'page' : undefined}
              className={`flex min-h-[44px] flex-1 basis-[calc(50%-0.25rem)] items-center justify-center rounded-2xl px-3 text-base font-bold focus-visible:outline-none focus-visible:ring-4 ${subjectColour(s).ring} ${PRESS} ${s === subject ? subjectColour(s).chip : 'text-slate hover:bg-slate/5'}`}
            >
              {t(lang, `fam.subject.${s}`)}
              {child.freeSubject && child.freeSubject !== s && <span className="sr-only"> ({t(lang, 'fam.subject.locked')})</span>}
              {child.freeSubject && child.freeSubject !== s && (
                <svg aria-hidden="true" viewBox="0 0 24 24" className="ml-2 h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="5" y="11" width="14" height="10" rx="2" />
                  <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                </svg>
              )}
            </Link>
          ))}
        </nav>
        {!child.freeSubject && <p className="rounded-2xl bg-sunshine/30 px-4 py-3 text-sm text-slate">{t(lang, 'fam.subject.firstIsFree')}</p>}
        {offline && (
          <div className="flex justify-end">
            <DataSaverSwitch w={ow} compact />
          </div>
        )}
        {!access.open ? (
          <div data-family-locked>
            <EmptyState
              e="🔒"
              title={t(lang, 'fam.d13.study.lockedTitle')}
              body={t(lang, 'fam.subject.notOpen')}
              action={child.freeSubject ? { href: `/family/study?subject=${child.freeSubject}`, label: t(lang, 'fam.d13.study.openFree') } : undefined}
            />
          </div>
        ) : (
          <>
            <StudyQuestion w={w} subject={subject} tone={tone} voice={voice} />
            {homeworkOn && (
              <Link href="/family/study/homework" data-homework-link className={`flex min-h-[56px] items-center gap-3 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate/10 hover:bg-slate/5 ${LIFT}`}>
                <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-sunshine/30 text-xl">
                  <Picture e="📷" />
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
              {catalog.chapters.map((c) => (
                <li key={c.key} data-chapter-edge={subject} className="relative overflow-hidden rounded-3xl bg-white p-3 pl-5 shadow-sm ring-1 ring-slate/10">
                  <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1.5 ${subjectColour(subject).bar}`} />
                  <SaverLink href={`/family/understand?kind=chapter&key=${encodeURIComponent(c.key)}`} className="flex min-h-[44px] items-center justify-between gap-2 px-1 text-base font-bold text-slate">
                    <span lang={titleLang(c.title)}>{c.title}</span>
                    <span aria-hidden="true" className={subjectColour(subject).text}>→</span>
                  </SaverLink>
                  {packs && (packs.get(c.key)?.topics.length ?? 0) > 0 && (
                    <PackButton w={ow} lang={lang} childId={child.childId} chapterKey={c.key} chapterTitle={c.title} bytes={packs.get(c.key)!.bytes} missing={packs.get(c.key)!.missing.length} />
                  )}
                  {c.topics.length > 0 && (
                    <ul className="mt-1 flex flex-col">
                      {c.topics.map((tp) => (
                        <li key={tp.key} className="flex items-center gap-1">
                          <SaverLink href={`/family/understand?kind=topic&key=${encodeURIComponent(tp.key)}`} className="flex min-h-[44px] flex-1 items-center rounded-xl px-2 text-sm text-slate hover:bg-slate/5">
                            <span lang={titleLang(tp.title)}>{tp.title}</span>
                          </SaverLink>
                          {worksheets && (
                            <Link
                              href={`/family/study/worksheet/${encodeURIComponent(tp.key)}`}
                              aria-label={fill(t(lang, 'fam.worksheet.openFor'), { topic: tp.title })}
                              className="flex min-h-[44px] shrink-0 items-center rounded-xl px-3 text-sm font-bold text-royal-deep hover:bg-slate/5"
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
        ) : (
          <div data-family-no-catalog>
            <EmptyState e="📚" title={t(lang, 'fam.d13.study.noCatalogTitle')} body={t(lang, 'fam.study.noCatalog')} />
          </div>
        )}
      </main>
    </div>
  );
}
