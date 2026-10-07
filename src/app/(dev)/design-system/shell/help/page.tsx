import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/app-shell/AppShell';
import { toShellGroups } from '@/components/app-shell/shell-nav';
import { PageHeader } from '@/components/app-ui/PageHeader';
import { HelpArticleView } from '@/components/help/HelpArticleView';
import { HelpIndex } from '@/components/help/HelpIndex';
import { HELP_TEXT, helpArticle, isHelpLang } from '@/content/help/articles';
import { principalNavigationFixture } from '@/demo-fixture/contracts';

// The Help Center in the app shell (C129), development only: the real
// /app/help needs a signed-in session. The guides are the real ones.
// ?lang=hi, ?article=<slug>, ?q=<search>.
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Help Center (development)', robots: { index: false, follow: false } };

export default function HelpPreviewPage({ searchParams }: { searchParams: { lang?: string; article?: string; q?: string } }) {
  if (process.env.NODE_ENV === 'production') notFound();
  const lang = isHelpLang(searchParams.lang) ? searchParams.lang : 'en';
  const article = searchParams.article ? helpArticle(searchParams.article) : null;
  return (
    <AppShell groups={toShellGroups(principalNavigationFixture.data)} brand="Illustrative School" roleLabel="Principal" navLabel="School navigation" accountHref="/design-system/shell/help">
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <PageHeader eyebrow="Help" tone="sapphire" title={HELP_TEXT.title[lang]} />
        {article ? <HelpArticleView article={article} lang={lang} mode="preview" /> : <HelpIndex lang={lang} mode="preview" initialQuery={searchParams.q ?? ''} />}
      </div>
    </AppShell>
  );
}
