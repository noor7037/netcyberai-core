import { notFound, redirect } from 'next/navigation';
import { TechPlayer } from '@/components/family/tech/TechPlayer';
import { WORD_MENU_KEYS } from '@/lib/family/word-menu-words';
import { courseCatalog, LESSON_KEY, lessonForChild } from '@/lib/family/tech/catalog';
import { isTechLang, langForChild } from '@/lib/family/tech/text';
import { passPercent, readProgress } from '@/lib/family/tech/progress';
import { readTechSettings, visibleCatalog } from '@/lib/family/tech/settings';
import { readFamilySwitches, switchOn } from '@/lib/family/flags';
import { familyPageRead, firstStepsNext, requireFamilyPage } from '@/lib/family/server';
import { familyWords } from '@/lib/family/words';
import { serverVoiceReady } from '@/lib/family/voice-out';

export const dynamic = 'force-dynamic';

export default async function FamilyTechLessonPage({ params, searchParams }: { params: { key: string }; searchParams: { view?: string; lang?: string } }) {
  if (!LESSON_KEY.test(params.key)) notFound();
  const page = await requireFamilyPage();
  if (!page) redirect('/family/sign-in');
  const next = firstStepsNext(page);
  if (next) redirect(next);
  const child = page.child;
  if (!child) redirect('/family/welcome/child');
  const open = await familyPageRead(page, async (db) => {
    const switches = await readFamilySwitches(db, page.session.accountId);
    if (!switchOn(switches, 'tech_lab')) return { on: false as const };
    return { on: true as const, voice: await serverVoiceReady(db, page.session.accountId), progress: await readProgress(db, child.childId), pass: await passPercent(db), settings: await readTechSettings(db, child.childId) };
  });
  if (!open.on) redirect('/family');
  const lesson = lessonForChild(params.key);
  if (!lesson) notFound();
  const catalog = visibleCatalog(courseCatalog(), open.settings);
  const unit = catalog.units.find((item) => item.lessons.some((row) => row.key === lesson.id));
  // C557: a topic area the parent switched off is hidden, its lessons too.
  if (!unit) redirect('/family/tech');
  const index = unit?.lessons.findIndex((row) => row.key === lesson.id) ?? -1;
  const nextKey = unit && index >= 0 ? unit.lessons[index + 1]?.key ?? null : null;
  const prev = unit && index > 0 ? unit.lessons[index - 1] : null;
  // Where this lesson sits in this child's path: the lesson before (when passed), the one after, and a revisit.
  const personal = {
    name: child.firstName,
    prevTitle: prev && open.progress.done[prev.key] ? prev.title : null,
    nextTitle: nextKey ? unit?.lessons[index + 1]?.title ?? null : null,
    returning: !!open.progress.done[lesson.id],
  };
  const lab = catalog.labs.find((item) => item.id === lesson.play?.lab);
  const view = searchParams.view && /^-?[0-9]+$/.test(searchParams.view) ? `?view=${searchParams.view}` : '';
  const lang = isTechLang(searchParams.lang) ? searchParams.lang : langForChild(child.style);
  return (
    <TechPlayer
      lesson={lesson}
      strand={unit ? catalog.strands[unit.strand] : undefined}
      nextKey={nextKey}
      backHref={`/family/tech${view}`}
      initialLang={lang}
      voice={open.voice ? 'server' : 'phone'}
      words={familyWords(page.childLang, WORD_MENU_KEYS)}
      labLevel={lab?.level ?? null}
      childId={child.childId}
      personal={personal}
      passPercent={open.pass}
    />
  );
}
