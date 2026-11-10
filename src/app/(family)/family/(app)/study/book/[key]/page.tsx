import { notFound, redirect } from 'next/navigation';
import { BookChapter } from '@/components/family/book/BookChapter';
import { bookChapter, bookFor, readerSrc } from '@/lib/family/books';
import { isPrePrimary, syllabusBoardOf } from '@/lib/family/children';
import { readFamilySwitches, switchOn } from '@/lib/family/flags';
import { openSubjects } from '@/lib/family/learning';
import { subjectAccess } from '@/lib/family/modules';
import { photoGate } from '@/lib/family/photo-gate';
import { familyPageRead, firstStepsNext, requireFamilyPage } from '@/lib/family/server';
import { isSubject } from '@/lib/family/subjects';
import { TUTOR_READS_FILES } from '@/lib/family/tutor-shape';
import { TUTOR_KEYS } from '@/lib/family/tutor-words';
import { UNDERSTAND_KEYS } from '@/lib/family/understand-words';
import { voiceDay } from '@/lib/family/voice';
import { VOICE_KEYS } from '@/lib/family/voice-words';
import { familyWords } from '@/lib/family/words';
import { indiaDate } from '@/lib/time/india';
import { t } from '@/lib/i18n';

// A chapter of the child's book in the NetCyberAI chapter reader (founder, 9 Nov 2026): topic by topic, with its
// diagrams, the labs inside the lessons, the topic checks and the chapter test, in the child's language (the reader's
// own switch changes it). The reader is served to signed-in families only (/family/learn/...) and framed here (W22-S2:
// BookChapter) under a slim bar with the tutor's face, which also plays the reader's voice and opens the tutor over the
// chapter; the tab dock steps aside (FamilyTabs) so the reader has the screen. Only a chapter of the book for this
// child's board, class and subject. The tutor has the chapter page's own gates: the 'understand' switch, the subject
// open to this child, the voice and photo gates.
export const dynamic = 'force-dynamic';

export default async function BookChapterPage({ params }: { params: { key: string } }) {
  const page = await requireFamilyPage();
  if (!page) redirect('/family/sign-in');
  const next = firstStepsNext(page);
  if (next) redirect(next);
  const child = page.child!;
  if (isPrePrimary(child.classLevel)) redirect('/family/study');
  const found = bookChapter(decodeURIComponent(params.key));
  if (!found) notFound();
  const mine = bookFor({ board: syllabusBoardOf(child), classLevel: child.classLevel, subject: found.book.subject });
  if (!mine || mine.id !== found.book.id) notFound();
  const lang = page.childLang;
  const title = found.chapter.title[lang === 'hi' ? 'hi' : 'en'];
  const subject = isSubject(found.book.subject) ? found.book.subject : null;
  const [switches, openToAll] = await familyPageRead(page, (db) => Promise.all([readFamilySwitches(db, page.session.accountId), openSubjects(db)]));
  const tutorOn = !!subject && switchOn(switches, 'understand') && subjectAccess(child, subject, openToAll).open;
  const voice =
    tutorOn && page.consents.voice_practice && switchOn(switches, 'voice_input') ? { secondsLeft: (await familyPageRead(page, (db) => voiceDay(db, page.session.accountId, child.childId, indiaDate()))).left } : null;
  const files = tutorOn && TUTOR_READS_FILES && (await familyPageRead(page, (db) => photoGate(db, page.session.accountId, child))) === null;
  const w = familyWords(lang, ['fam.book.ask', ...(tutorOn ? [...UNDERSTAND_KEYS, ...TUTOR_KEYS] : []), ...(voice ? VOICE_KEYS : [])]);
  // The reader keeps the child's place and what was read on this device, under this child's id (the address carries it).
  const src = readerSrc(found.book, found.chapter, lang).replace('#', `&host=family&child=${encodeURIComponent(child.childId)}#`);
  return (
    <div lang={lang}>
      <BookChapter
        src={src}
        title={title}
        chapterKey={found.chapter.key}
        subject={subject ?? 'science'}
        back={{ href: `/family/study?subject=${found.book.subject}`, label: t(lang, 'fam.study.title') }}
        w={w}
        tutor={tutorOn ? { voice, files, homework: switchOn(switches, 'homework') } : null}
      />
    </div>
  );
}
