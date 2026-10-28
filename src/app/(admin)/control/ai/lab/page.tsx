import Link from 'next/link';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { QualityLab } from '@/components/control/ai/QualityLab';
import { caseSummaries } from '@/lib/ai/lab/cases';
import { listLabRuns, loadLabSetup } from '@/lib/ai/lab/store';
import { loadReplyChecks } from '@/lib/ai/gateway/ledger';
import { ReplyChecksView } from '@/components/control/ai/ReplyChecksView';
import { indiaDate } from '@/lib/time/india';
import { withTenantContext } from '@/lib/auth/db';
import { getServerSession } from '@/lib/auth/server-session';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';
import { WordsProvider } from '@/components/app-shell/Words';
import { pageWords } from '@/components/app-shell/page-words';

// Control → AI → Quality Lab (G4, C372): the same made-up questions to two to four models side by side, scored 1–5 by
// the founder and exported. The founder only (the layout), and only after the authenticator's step (aal2), as
// Control → AI. With no provider key that opens, the screen says Not configured. Below it, the safety checks each real
// reply took over the last week (C390), from control.ai_reply_checks.

export const dynamic = 'force-dynamic';

export default async function QualityLabPage() {
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  const strong = session?.aal === 'aal2';
  // The layout has already refused anyone but the founder; this runs as nca_super.
  const data = session && strong ? await withTenantContext(session, async (db) => ({ setup: await loadLabSetup(db), runs: await listLabRuns(db), checks: await loadReplyChecks(db, indiaDate()) })) : null;
  return (
    <ModulePage
      title={t(lang, 'control.ai.lab.title')}
      purpose={t(lang, 'control.ai.lab.purpose')}
      about={t(lang, 'control.ai.lab.about')}
      icon="sparkle"
      tone="grape"
      eyebrow={t(lang, 'group.control')}
      headerLang={lang}
      more={
        <Link href="/control/ai" className="inline-flex min-h-[44px] items-center text-sm font-semibold text-sapphire underline">
          {t(lang, 'control.ai.lab.backToAi')}
        </Link>
      }
      notice={!strong ? <p data-lab-need-aal2 className="rounded-md border border-slate/20 bg-off-white px-3 py-2 text-sm font-semibold text-slate">{t(lang, 'control.ai.lab.needAal2')}</p> : undefined}
    >
      <WordsProvider words={pageWords(lang, '/control/ai/lab')}>
      {data && <QualityLab initial={{ ...data.setup, cases: caseSummaries(), runs: data.runs }} />}
      {data && <ReplyChecksView rows={data.checks} lang={lang} />}
      </WordsProvider>
    </ModulePage>
  );
}
