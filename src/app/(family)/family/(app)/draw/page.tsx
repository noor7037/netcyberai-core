import { createHash } from 'node:crypto';
import { redirect } from 'next/navigation';
import { SubPageHeader } from '@/components/family/SubPageHeader';
import { DrawHome } from '@/components/family/draw/DrawHome';
import { readFamilySwitches, switchOn } from '@/lib/family/flags';
import { familyPageRead, firstStepsNext, requireFamilyPage } from '@/lib/family/server';
import { familyWords } from '@/lib/family/words';
import { DRAW_PAGE_KEYS } from '@/lib/family/draw-words';
import { readDrawDaily } from '@/lib/family/draw-daily';
import { DRAW_TEMPLATE_KEYS } from '@/lib/family/draw-template-words';
import { SKETCH_KEYS } from '@/lib/family/sketch-words';
import { TUTOR_KEYS } from '@/lib/family/tutor-words';
import { TUTOR_READS_FILES } from '@/lib/family/tutor-shape';
import { classSubjects } from '@/lib/family/catalog';
import { isPrePrimary, syllabusBoardOf } from '@/lib/family/children';
import { openSubjects } from '@/lib/family/learning';
import { subjectAccess } from '@/lib/family/modules';
import { photoGate } from '@/lib/family/photo-gate';
import { t } from '@/lib/i18n';

// The Draw tab (C513): a free art table, its own tab between English and Future. Control's `draw` switch hides it (the
// module registry; nothing hard-codes it). Pre-primary children may draw. The page: a "Start drawing" hero that opens the
// studio's free canvas, the templates' slot (the templates slice fills it), and My drawings from this phone. The daily
// creation limit is Control's number, read here and handed to the page; the count is kept on the phone, per child, under
// a one-way tag of the child (never the id). Send to tutor shows only where the tutor may read a picture for this child
// (not pre-primary, the parent's study and photo consents, the subject open): it goes through the tutor window's own
// path, in its drawer, for the child's free subject (else the first of the class).
export const dynamic = 'force-dynamic';

export default async function FamilyDrawPage() {
  const page = await requireFamilyPage();
  if (!page) redirect('/family/sign-in');
  const next = firstStepsNext(page);
  if (next) redirect(next);
  const lang = page.childLang;
  const child = page.child!;
  const switches = await familyPageRead(page, (db) => readFamilySwitches(db, page.session.accountId));
  if (!switches || !switchOn(switches, 'draw')) redirect('/family');
  const limit = await familyPageRead(page, (db) => readDrawDaily(db));
  const subjects = await familyPageRead(page, (db) => classSubjects(db, { board: syllabusBoardOf(child), classLevel: child.classLevel, stream: child.stream }));
  let tutor: { subject: string; tone: string; homework: boolean } | null = null;
  if (!isPrePrimary(child.classLevel) && page.consents.study_core && TUTOR_READS_FILES) {
    const [subjects, openToAll] = await familyPageRead(page, (db) => Promise.all([classSubjects(db, { board: syllabusBoardOf(child), classLevel: child.classLevel, stream: child.stream }), openSubjects(db)]));
    const subject = child.freeSubject && subjects.includes(child.freeSubject) ? child.freeSubject : subjects[0];
    const photos = subject && subjectAccess(child, subject, openToAll).open ? (await familyPageRead(page, (db) => photoGate(db, page.session.accountId, child))) === null : false;
    if (subject && photos) tutor = { subject, tone: subject, homework: switchOn(switches, 'homework') };
  }
  const w = familyWords(lang, [...DRAW_PAGE_KEYS, ...DRAW_TEMPLATE_KEYS, ...SKETCH_KEYS, ...(tutor ? TUTOR_KEYS : [])]);
  const childTag = createHash('sha256').update(`ncf-draw:${child.childId}`).digest('hex').slice(0, 24);
  return (
    <div lang={lang} className="flex min-h-screen flex-col">
      <SubPageHeader back="/family" backLabel={t(lang, 'fam.nav.home')} title={t(lang, 'fam.draw.title')} />
      <main className="fam-page">
        <DrawHome w={w} limit={limit} child={childTag} tutor={tutor} classLevel={child.classLevel} childId={child.childId} lang={lang} subjects={subjects} />
      </main>
    </div>
  );
}
