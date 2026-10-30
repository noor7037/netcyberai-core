import Link from 'next/link';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { CoverageView } from '@/components/control/CoverageView';
import { WordsProvider } from '@/components/app-shell/Words';
import { pageWords } from '@/components/app-shell/page-words';
import { withTenantContext } from '@/lib/auth/db';
import { getServerSession } from '@/lib/auth/server-session';
import { coverage } from '@/lib/content/coverage';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

// Control → Content → Coverage (W9-D, docs/39 §4): what the library holds against the syllabus, unit by unit. The layout
// already admits only NetCyberAI staff; /api/control/content/coverage/export checks again for the export.
export const dynamic = 'force-dynamic';

export default async function CoveragePage() {
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  const data = session ? await withTenantContext(session, (db) => coverage(db)) : null;
  return (
    <ModulePage
      title={t(lang, 'control.coverage.title')}
      purpose={t(lang, 'control.coverage.purpose')}
      about={t(lang, 'control.coverage.about')}
      icon="academics"
      tone="royal"
      eyebrow={t(lang, 'group.control')}
      headerLang={lang}
      more={
        <Link href="/control/content" className="inline-flex min-h-[44px] items-center text-sm font-semibold text-sapphire underline">
          {t(lang, 'control.coverage.back')}
        </Link>
      }
    >
      <WordsProvider words={pageWords(lang, '/control/content/coverage')}>{data && <CoverageView initial={data} />}</WordsProvider>
    </ModulePage>
  );
}
