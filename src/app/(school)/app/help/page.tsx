import { PageHeader } from '@/components/app-ui/PageHeader';
import { HelpIndex } from '@/components/help/HelpIndex';
import { HELP_TEXT, isHelpLang } from '@/content/help/articles';

// Help Center (C129): guides for what is live today, in English and Hindi
// (?lang=hi). Always on for every school and in every access mode (C112).
export default function HelpPage({ searchParams }: { searchParams: { lang?: string } }) {
  const lang = isHelpLang(searchParams.lang) ? searchParams.lang : 'en';
  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <PageHeader eyebrow="Help" tone="sapphire" title={HELP_TEXT.title[lang]} />
      <HelpIndex lang={lang} mode="app" />
    </div>
  );
}
