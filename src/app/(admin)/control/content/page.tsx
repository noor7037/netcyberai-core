import Link from 'next/link';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { ContentView } from '@/components/control/content/ContentView';
import { EnglishVersionsView } from '@/components/control/content/EnglishVersionsView';
import { VideoPicksView } from '@/components/control/content/VideoPicksView';
import { listEnglishVersions } from '@/lib/content/english-library';
import { withTenantContext } from '@/lib/auth/db';
import { getServerSession } from '@/lib/auth/server-session';
import { listVersions } from '@/lib/content/library';
import { listVideoReview } from '@/lib/content/video-picks';
import { indiaDate } from '@/lib/time/india';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';
import { WordsProvider } from '@/components/app-shell/Words';
import { pageWords } from '@/components/app-shell/page-words';

// Control → Content (M1-4, docs/family-app/10 §4): the syllabus library. Import a catalog CSV, review and approve it
// (two people), look at it as a family will in staff preview, release it to everyone, compare versions and roll back.

export const dynamic = 'force-dynamic';

export default async function ContentPage() {
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  // The layout has already refused anyone but NetCyberAI staff; this runs as the platform role.
  const versions = session ? await withTenantContext(session, (db) => listVersions(db, { userId: session.sub })) : null;
  // The English course's versions (C274).
  const english = session ? await withTenantContext(session, (db) => listEnglishVersions(db)) : null;
  // The video finder's picks and channels (M2-5, C279).
  const videos = session ? await withTenantContext(session, (db) => listVideoReview(db, { today: indiaDate() })) : null;
  return (
    <ModulePage title={t(lang, 'control.content.title')} purpose={t(lang, 'control.content.purpose')} about={t(lang, 'control.content.about')} icon="academics" tone="royal" eyebrow={t(lang, 'group.control')} headerLang={lang}
      more={
        <div className="flex flex-wrap gap-x-5">
          <Link href="/control/content/studio" data-studio-link className="inline-flex min-h-[44px] items-center text-sm font-semibold text-sapphire underline">
            {t(lang, 'control.content.studioLink')}
          </Link>
          <Link href="/control/content/coverage" data-coverage-link className="inline-flex min-h-[44px] items-center text-sm font-semibold text-sapphire underline">
            {t(lang, 'control.coverage.link')}
          </Link>
          <Link href="/control/content/hubs" data-hubs-link className="inline-flex min-h-[44px] items-center text-sm font-semibold text-sapphire underline">
            {t(lang, 'control.content.hubsLink')}
          </Link>
        </div>
      }
    >
      <WordsProvider words={pageWords(lang, '/control/content')}>
      {versions && <ContentView initial={versions} />}
      {english && <EnglishVersionsView initial={english} />}
      {videos && <VideoPicksView initial={videos} />}
      </WordsProvider>
    </ModulePage>
  );
}
