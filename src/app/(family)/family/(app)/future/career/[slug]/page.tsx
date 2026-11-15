import { notFound } from 'next/navigation';
import { SubPageHeader } from '@/components/family/SubPageHeader';
import { RoadmapView } from '@/components/family/careers/RoadmapView';
import { openCareer } from '@/lib/family/careers/gate';
import { loadRoadmap } from '@/lib/family/careers/load';
import { opensNow } from '@/lib/family/careers/opens-now';
import { familyPageRead } from '@/lib/family/server';
import { t } from '@/lib/i18n';
import { indiaDate } from '@/lib/time/india';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: { slug: string } }) {
  const page = await openCareer();
  const child = page.child!;
  const lang = page.childLang;
  const roadmap = await familyPageRead(page, (db) => loadRoadmap(db, params.slug, indiaDate()));
  if (!roadmap) notFound();
  const now = opensNow(child.classLevel, child.stream ?? null);
  return (
    <div lang={lang} className="flex min-h-screen flex-col">
      <SubPageHeader back="/family/future/career" backLabel={t(lang, 'fam.hub.career')} title={lang === 'hi' ? roadmap.career.title.hi : roadmap.career.title.en} />
      <main className="fam-page fam-roadmap">
        <RoadmapView roadmap={roadmap} lang={lang} openLane={now.openLane} />
      </main>
    </div>
  );
}
