import Link from 'next/link';
import { ModulePage, QUIET_ACTION } from '@/components/app-ui/ModulePage';
import { getServerSession } from '@/lib/auth/server-session';
import { moduleById, type ModuleId } from '@/lib/contracts/modules';
import { errorMessage } from '@/lib/errors/catalogue';
import { t, tOr } from '@/lib/i18n';
import { moduleOffSentence } from '@/lib/i18n/module-off';
import { getLang } from '@/lib/i18n/server';

// What a module's page shows when the module is switched off for the
// school, or the school's account is paused (C140): the same header as the
// screen would have, one plain sentence on why it is not available, what
// being off means, and how to ask for it. The module's APIs refuse in the
// same way (the access guard), so nothing behind the page is readable.
export async function ModuleOffPage({ moduleId, reason }: { moduleId: ModuleId; reason: 'module_off' | 'account_paused' }) {
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  const m = moduleById(moduleId);
  return (
    <ModulePage moduleId={moduleId} title={tOr(lang, `module.${moduleId}`, m.label)} purpose={errorMessage(reason, {}, lang)} headerLang={lang}>
      <div lang={lang} data-module-off-page={moduleId} data-reason={reason} className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-slate/20 bg-white p-5">
        {reason === 'module_off' && (
          <p className="max-w-prose text-sm text-slate">
            <span className="font-semibold">{t(lang, 'modules.whenOff')} </span>
            {moduleOffSentence(lang, m)}
          </p>
        )}
        <p className="max-w-prose text-sm text-slate">{t(lang, 'modules.ask')}</p>
        <Link href="/app/help/ticket/new" className={QUIET_ACTION}>
          {t(lang, 'modules.askAction')}
        </Link>
      </div>
    </ModulePage>
  );
}
