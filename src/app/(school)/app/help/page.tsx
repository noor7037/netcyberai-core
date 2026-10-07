import { ModulePage } from '@/components/app-ui/ModulePage';
import { HelpIndex } from '@/components/help/HelpIndex';
import { HELP_TEXT, isHelpLang } from '@/content/help/articles';

// Help Center (C129): guides for what is live today, in English and Hindi
// (?lang=hi). Always on for every school and in every access mode (C112).
export default function HelpPage({ searchParams }: { searchParams: { lang?: string } }) {
  const lang = isHelpLang(searchParams.lang) ? searchParams.lang : 'en';
  return (
    <ModulePage moduleId="help-center" title={HELP_TEXT.title[lang]} purpose={HELP_TEXT.intro[lang]} headerLang={lang}>
      <HelpIndex lang={lang} mode="app" />
    </ModulePage>
  );
}
