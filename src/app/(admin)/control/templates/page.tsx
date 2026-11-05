import { ModulePage } from '@/components/app-ui/ModulePage';
import { TemplatesPanel } from '@/components/control/TemplatesPanel';
import { EmailTemplatesPanel } from '@/components/control/EmailTemplatesPanel';
import { getServerSession } from '@/lib/auth/server-session';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';
import { WordsProvider } from '@/components/app-shell/Words';
import { pageWords } from '@/components/app-shell/page-words';

// WhatsApp templates (docs/25 slice 7c, C184): every version's words and its two approvals, read only here beyond
// Meta's review path; and the emails, whose plain-value words the founder can edit (W21-M6). The layout has already
// refused anyone but the founder.
export const dynamic = 'force-dynamic';

export default async function TemplatesPage() {
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  return (
    <ModulePage title={t(lang, 'tpl.title')} purpose={t(lang, 'tpl.purpose')} about={t(lang, 'tpl.about')} icon="chat" tone="cyan" eyebrow={t(lang, 'group.control')} headerLang={lang}>
      <WordsProvider words={pageWords(lang, '/control/templates')}>
      <TemplatesPanel />
      <div className="mt-8">
        <EmailTemplatesPanel />
      </div>
      </WordsProvider>
    </ModulePage>
  );
}
