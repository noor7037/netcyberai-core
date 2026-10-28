import { notFound, redirect } from 'next/navigation';
import { AssessmentPlayer } from '@/components/family/english/AssessmentPlayer';
import type { AssessmentKind } from '@/lib/family/english/course';
import { ENGLISH_KEYS } from '@/lib/family/english/words';
import { firstStepsNext, requireFamilyPage } from '@/lib/family/server';
import { familyWords } from '@/lib/family/words';

// The day-0, day-45 and day-90 checks (docs/family-app/12 §3, C274). The assessment API decides whether one is open.
export default async function FamilyEnglishCheckPage({ params }: { params: { kind: string } }) {
  if (!['day0', 'day45', 'day90'].includes(params.kind)) notFound();
  const page = await requireFamilyPage();
  if (!page) redirect('/family/sign-in');
  const next = firstStepsNext(page);
  if (next) redirect(next);
  const lang = page.childLang;
  return (
    <div lang={lang} className="flex min-h-screen flex-col">
      <AssessmentPlayer kind={params.kind as AssessmentKind} w={familyWords(lang, ENGLISH_KEYS)} lang={lang} />
    </div>
  );
}
