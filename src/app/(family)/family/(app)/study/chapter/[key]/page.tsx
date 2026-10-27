import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { SubPageHeader } from '@/components/family/SubPageHeader';
import { ChapterReader } from '@/components/family/reader/ChapterReader';
import { loadChapter, readableChapters } from '@/lib/family/chapter-store';
import { chapterView, resumeIndex } from '@/lib/family/chapters';
import { isPrePrimary, syllabusBoardOf } from '@/lib/family/children';
import { READER_KEYS } from '@/lib/family/reader-words';
import { readFamilySwitches, switchOn } from '@/lib/family/flags';
import { openSubjects } from '@/lib/family/learning';
import { subjectAccess } from '@/lib/family/modules';
import { isSubject } from '@/lib/family/subjects';
import { TUTOR_KEYS } from '@/lib/family/tutor-words';
import { voiceDay } from '@/lib/family/voice';
import { VOICE_KEYS } from '@/lib/family/voice-words';
import { indiaDate } from '@/lib/time/india';
import { readPlace } from '@/lib/family/reading';
import { familyPageRead, firstStepsNext, requireFamilyPage } from '@/lib/family/server';
import { UNDERSTAND_KEYS } from '@/lib/family/understand-words';
import { familyWords } from '@/lib/family/words';
import { t } from '@/lib/i18n';

// The chapter reader (S1, C374): a NetCyber-authored chapter in the child's language, read on the page and, when the
// child asks, read aloud by the phone's own voice from where this child last stopped. Server side: the chapter is
// checked (lib/family/chapters.ts), its narration script built (only teaching text; never a diagram, table or
// interactive), and the child's saved place read; the phone gets the blocks, the script and the place.
export const dynamic = 'force-dynamic';

export default async function ChapterPage({ params }: { params: { key: string } }) {
  const page = await requireFamilyPage();
  if (!page) redirect('/family/sign-in');
  const next = firstStepsNext(page);
  if (next) redirect(next);
  const child = page.child!;
  if (isPrePrimary(child.classLevel)) redirect('/family/study');
  // S3 (C376): the published version in the database (the family's row level security shows only what this account may
  // read), else the showcase file.
  const chapter = await familyPageRead(page, (db) => loadChapter(db, decodeURIComponent(params.key)));
  if (!chapter) notFound();
  const lang = page.childLang;
  const view = chapterView(chapter, lang);
  const saved = await familyPageRead(page, (db) => readPlace(db, page.session.accountId, child.childId, chapter.key));
  const start = resumeIndex(view.script, saved);
  // S2 (C375): the doubt drawer, while the chapter's subject is open to this child and Understand is switched on; the
  // microphone and Attach file as on the Study page.
  const [switches, openToAll] = await familyPageRead(page, (db) => Promise.all([readFamilySwitches(db, page.session.accountId), openSubjects(db)]));
  const subject = isSubject(chapter.subject) ? chapter.subject : null;
  const tutorOn = !!subject && switchOn(switches, 'understand') && subjectAccess(child, subject, openToAll).open;
  const voice =
    tutorOn && page.consents.voice_practice && switchOn(switches, 'voice_input') ? { secondsLeft: (await familyPageRead(page, (db) => voiceDay(db, page.session.accountId, child.childId, indiaDate()))).left } : null;
  const tutor = tutorOn && subject ? { subject, voice, files: page.consents.photo_input, homework: switchOn(switches, 'homework') } : null;
  const w = familyWords(lang, [...UNDERSTAND_KEYS, ...READER_KEYS, ...(tutor ? TUTOR_KEYS : []), ...(voice ? VOICE_KEYS : [])]);
  const others = (await familyPageRead(page, (db) => readableChapters(db, { board: syllabusBoardOf(child), classLevel: child.classLevel, subject: chapter.subject, childId: child.childId }))).filter((c) => c.key !== chapter.key);
  return (
    <div lang={lang} className="flex min-h-screen flex-col">
      <SubPageHeader back={`/family/study?subject=${chapter.subject}`} backLabel={t(lang, 'fam.study.title')} kicker={t(lang, 'fam.reader.kicker')} title={view.title} subject={chapter.subject} />
      <main data-chapter-reader={chapter.key} lang={view.lang} className="relative mx-auto -mt-8 flex w-full max-w-xl flex-1 flex-col gap-4 px-4 pb-28">
        <ChapterReader chapterKey={chapter.key} lang={view.lang} blocks={view.blocks} ids={view.ids} script={view.script} start={start} resumed={saved !== null && start > 0} w={w} tone={chapter.subject} chapterTitle={view.title} tutor={tutor} />
        {others.length > 0 && (
          <nav aria-labelledby="fam-reader-more" className="flex flex-col gap-2">
            <h2 id="fam-reader-more" className="px-1 text-lg font-extrabold text-slate">
              {t(lang, 'fam.reader.more')}
            </h2>
            <ul className="flex flex-col gap-2">
              {others.map((c) => (
                <li key={c.key}>
                  <Link href={`/family/study/chapter/${encodeURIComponent(c.key)}`} className="fam-card fam-press flex min-h-[52px] items-center justify-between gap-3 bg-white px-4 text-base font-bold text-slate">
                    <span lang={lang}>{c.title[lang === 'hi' ? 'hi' : 'en']}</span>
                    <span aria-hidden="true">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </main>
    </div>
  );
}
