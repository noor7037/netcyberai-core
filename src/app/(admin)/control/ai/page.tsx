import Link from 'next/link';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { AiControls } from '@/components/control/ai/AiControls';
import { loadAiOverview, providerChoices } from '@/lib/ai/control';
import { withTenantContext } from '@/lib/auth/db';
import { getServerSession } from '@/lib/auth/server-session';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

// Control → AI (docs/family-app/10 §3, C249): the AI services and their clearance for children's words, each
// service's key (write-only: its last four characters, who saved it and when), the features with their service,
// model, prompt version and on switch, today's and this month's counts, the daily limit per family, and the recent
// changes with one-step undo. The founder only (the layout), and only after the authenticator's step (aal2).

export const dynamic = 'force-dynamic';

export default async function AiControlPage() {
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  const strong = session?.aal === 'aal2';
  // The layout has already refused anyone but the founder; this runs as nca_super.
  const data = session && strong ? await withTenantContext(session, (db) => loadAiOverview(db)) : null;
  return (
    <ModulePage
      title={t(lang, 'control.ai.title')}
      purpose={t(lang, 'control.ai.purpose')}
      about={t(lang, 'control.ai.about')}
      icon="sparkle"
      tone="grape"
      eyebrow={t(lang, 'group.control')}
      headerLang={lang}
      more={
        <Link href="/control/ai/lab" data-ai-lab-link className="inline-flex min-h-[44px] items-center text-sm font-semibold text-sapphire underline">
          {t(lang, 'control.ai.lab.link')}
        </Link>
      }
      notice={
        !strong ? (
          <p data-ai-need-aal2 className="rounded-md border border-slate/20 bg-off-white px-3 py-2 text-sm font-semibold text-slate">{t(lang, 'control.ai.needAal2')}</p>
        ) : data && !data.keyReady ? (
          <p data-ai-no-server-key className="rounded-md border border-red-800/30 px-3 py-2 text-sm font-semibold text-red-800">{t(lang, 'control.ai.noServerKey')}</p>
        ) : undefined
      }
    >
      {data && <AiControls initial={{ ...data, providerChoices: providerChoices() }} />}
    </ModulePage>
  );
}
