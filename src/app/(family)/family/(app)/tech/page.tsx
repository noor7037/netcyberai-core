import { redirect } from 'next/navigation';
import { TechCourse } from '@/components/family/tech/TechCourse';
import { courseCatalog } from '@/lib/family/tech/catalog';
import { readProgress } from '@/lib/family/tech/progress';
import { langForChild, isTechLang } from '@/lib/family/tech/text';
import { readFamilySwitches, switchOn } from '@/lib/family/flags';
import { familyPageRead, firstStepsNext, requireFamilyPage } from '@/lib/family/server';

export const dynamic = 'force-dynamic';

export default async function FamilyTechPage({ searchParams }: { searchParams: { view?: string; lang?: string } }) {
  const page = await requireFamilyPage();
  if (!page) redirect('/family/sign-in');
  const next = firstStepsNext(page);
  if (next) redirect(next);
  const child = page.child;
  if (!child) redirect('/family/welcome/child');
  const ready = await familyPageRead(page, async (db) => {
    const switches = await readFamilySwitches(db, page.session.accountId);
    if (!switchOn(switches, 'tech_lab')) return null;
    return readProgress(db, child.childId);
  });
  if (!ready) redirect('/family');
  const view = Number(searchParams.view);
  const lang = isTechLang(searchParams.lang) ? searchParams.lang : langForChild(child.style);
  return <TechCourse catalog={courseCatalog()} progress={ready} classLevel={child.classLevel} initialLang={lang} view={Number.isInteger(view) ? view : null} />;
}
