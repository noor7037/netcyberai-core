import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { EnglishReport } from '@/components/family/english/EnglishReport';
import { LiveSessions } from '@/components/family/english/LiveSessions';
import { tracksAllowed } from '@/lib/family/english/progress';
import { ENGLISH_PARENT_KEYS, LIVE_PARENT_KEYS } from '@/lib/family/english/words';
import { fill } from '@/lib/family/fill';
import { requireFamilyPage } from '@/lib/family/server';
import { familyWords } from '@/lib/family/words';
import { t } from '@/lib/i18n';

// A child's English report, for the parent (docs/family-app/12 §8, C274): behind the parent PIN, like the whole parent
// area. The report API checks the course switch, the consent and that the child is the account's own. Below it, the
// child's live practice talks, which the parent may clear (E1, C382).
export default async function FamilyParentEnglishPage({ params }: { params: { childId: string } }) {
  const page = await requireFamilyPage();
  if (!page) redirect('/family/sign-in');
  if (!page.parentMode) redirect('/family/parent');
  const child = page.children.find((c) => c.childId === params.childId);
  if (!child) notFound();
  const lang = page.parentLang;
  const w = familyWords(lang, ENGLISH_PARENT_KEYS);
  return (
    <main lang={lang} className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-6 pb-24">
      <Link href="/family/parent" className="flex min-h-[44px] items-center self-start text-sm font-bold text-royal">
        ← {t(lang, 'fam.parent.back')}
      </Link>
      <h1 className="text-2xl font-extrabold text-slate">{fill(w['fam.english.parent.title'], { name: child.firstName })}</h1>
      <EnglishReport childId={child.childId} w={w} lang={lang} tracks={tracksAllowed(child.classLevel)} />
      <LiveSessions childId={child.childId} w={familyWords(lang, LIVE_PARENT_KEYS)} lang={lang} />
    </main>
  );
}
