import { notFound, redirect } from 'next/navigation';
import { LessonPlayer } from '@/components/family/english/LessonPlayer';
import { ENGLISH_KEYS } from '@/lib/family/english/words';
import { firstStepsNext, requireFamilyPage } from '@/lib/family/server';
import { familyWords } from '@/lib/family/words';

// One English lesson, full screen (docs/family-app/12 §4, C274). The lesson API decides whether it may open.
export default async function FamilyEnglishLessonPage({ params, searchParams }: { params: { key: string }; searchParams: { at?: string } }) {
  if (!/^[a-d]\.u[0-9]{2}\.l[1-5]$/.test(params.key)) notFound();
  const page = await requireFamilyPage();
  if (!page) redirect('/family/sign-in');
  const next = firstStepsNext(page);
  if (next) redirect(next);
  const lang = page.childLang;
  return (
    <main lang={lang} className="mx-auto flex min-h-screen w-full max-w-xl flex-col gap-4 px-4 pb-24 pt-4">
      <LessonPlayer lessonKey={params.key} w={familyWords(lang, ENGLISH_KEYS)} lang={lang} startAt={Math.max(0, Math.min(20, Number(searchParams.at) || 0))} />
    </main>
  );
}
