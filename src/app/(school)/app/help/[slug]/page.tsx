import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/app-ui/PageHeader';
import { HelpArticleView } from '@/components/help/HelpArticleView';
import { HELP_TEXT, helpArticle, isHelpLang } from '@/content/help/articles';

// One Help Center guide. /app/help/ticket (Raise Ticket) is its own route
// and wins over this one.
export default function HelpArticlePage({ params, searchParams }: { params: { slug: string }; searchParams: { lang?: string } }) {
  const article = helpArticle(params.slug);
  if (!article) notFound();
  const lang = isHelpLang(searchParams.lang) ? searchParams.lang : 'en';
  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <PageHeader eyebrow="Help" tone="sapphire" title={HELP_TEXT.title[lang]} />
      <HelpArticleView article={article} lang={lang} mode="app" />
    </div>
  );
}
