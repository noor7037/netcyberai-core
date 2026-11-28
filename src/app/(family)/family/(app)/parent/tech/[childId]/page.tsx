import { notFound, redirect } from 'next/navigation';
import { SubPageHeader } from '@/components/family/SubPageHeader';
import { TechParentSettings } from '@/components/family/tech/TechParentSettings';
import { fill } from '@/lib/family/fill';
import { readFamilySwitches, switchOn } from '@/lib/family/flags';
import { familyPageRead, requireFamilyPage } from '@/lib/family/server';
import { courseCatalog } from '@/lib/family/tech/catalog';
import { readProgress } from '@/lib/family/tech/progress';
import { readTechSettings } from '@/lib/family/tech/settings';
import { familyWords } from '@/lib/family/words';
import { t } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

// The parent's Tech & AI Lab choices for one child (C557), behind the parent PIN like the English course's page: the
// class the course is shown for and the topic areas switched on, with what the child has passed so far.
const KEYS = ['fam.tech.parent.title', 'fam.tech.parent.class', 'fam.tech.parent.ownClass', 'fam.tech.parent.areas', 'fam.tech.parent.areasHelp', 'fam.tech.parent.keepOne', 'fam.tech.parent.save', 'fam.tech.parent.saving', 'fam.tech.parent.saved', 'fam.tech.parent.failed', 'fam.tech.parent.progress'] as const;

export default async function FamilyParentTechPage({ params }: { params: { childId: string } }) {
  const page = await requireFamilyPage();
  if (!page) redirect('/family/sign-in');
  if (!page.parentMode) redirect('/family/parent');
  const child = page.children.find((c) => c.childId === params.childId);
  if (!child) notFound();
  const data = await familyPageRead(page, async (db) => {
    if (!switchOn(await readFamilySwitches(db, page.session.accountId), 'tech_lab')) return null;
    return { settings: await readTechSettings(db, child.childId), progress: await readProgress(db, child.childId) };
  });
  if (!data) redirect('/family/parent');
  const lang = page.parentLang;
  const w = familyWords(lang, KEYS);
  const catalog = courseCatalog();
  const strands = [...new Set(catalog.units.map((unit) => unit.strand))].map((id) => ({ id, e: catalog.strands[id]?.e ?? '', name: lang === 'hi' ? catalog.strands[id]?.hi || catalog.strands[id]?.en || id : catalog.strands[id]?.en || id }));
  return (
    <div lang={lang} className="flex min-h-screen flex-col">
      <SubPageHeader back="/family/parent" backLabel={t(lang, 'fam.parent.title')} title={fill(w['fam.tech.parent.title'], { name: child.firstName })} tone="ink" />
      <main className="fam-page">
        <TechParentSettings
          w={w}
          lang={lang}
          childId={child.childId}
          name={child.firstName}
          childClass={child.classLevel}
          initial={data.settings}
          strands={strands}
          passed={Object.keys(data.progress.done).length}
          labs={data.progress.labs.length}
        />
      </main>
    </div>
  );
}
