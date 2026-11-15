import Link from 'next/link';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { FutureReviewView } from '@/components/control/content/FutureReviewView';
import { withTenantContext } from '@/lib/auth/db';
import { getServerSession } from '@/lib/auth/server-session';
import { listDomains, listForReview } from '@/lib/future/review';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';
import { WordsProvider } from '@/components/app-shell/Words';
import { pageWords } from '@/components/app-shell/page-words';

// Control → Content → Future: the founder's review queue (approve, edit, reject) and the official sites Apply may open.
// NetCyberAI staff only (the layout refuses anyone else); read as the platform role.
export const dynamic = 'force-dynamic';

export default async function FuturePage() {
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  const data = session ? await withTenantContext(session, async (db) => ({ listings: await listForReview(db, 'pending'), domains: await listDomains(db) })) : null;
  return (
    <ModulePage title={t(lang, 'control.future.title')} purpose={t(lang, 'control.future.purpose')} about={t(lang, 'control.future.about')} icon="academics" tone="royal" eyebrow={t(lang, 'control.content.title')} headerLang={lang}
      more={
        <Link href="/control/content" className="inline-flex min-h-[44px] items-center text-sm font-semibold text-sapphire underline">
          {t(lang, 'control.content.title')}
        </Link>
      }
    >
      <WordsProvider words={pageWords(lang, '/control/content/future')}>{data && <FutureReviewView initial={data.listings} domains={data.domains} />}</WordsProvider>
    </ModulePage>
  );
}
