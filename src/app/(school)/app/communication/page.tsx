import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { BudgetView } from '@/components/communication/BudgetView';
import { MessagesView } from '@/components/communication/MessagesView';
import { NoticesShown } from '@/components/communication/NoticesShown';
import { NoticesView } from '@/components/communication/NoticesView';
import { ThreadsView } from '@/components/communication/ThreadsView';
import { getServerSession } from '@/lib/auth/server-session';
import { moduleOffReason } from '@/lib/frameworks/page-access';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';
import { NOTICES_SHOW, readRange } from '@/lib/insights/screens';
import { isMessageState } from '@/lib/whatsapp/delivery';

// Communication (docs/25, P4). Live so far: every WhatsApp message of the school and where it got to (slice 7b,
// C183), what parents wrote back (7f, C187) and notices written by staff, approved by the principal (7i, C191).
// ?state=&from=&to= comes from a dashboard number (C203): the messages list opens first, on those rows.
// ?show=notices comes from the dashboard's "Notices waiting for approval": those notices are listed first, and the
// notices list is told so, so a change made there has them read again (C210).
export default async function CommunicationPage({ searchParams = {} }: { searchParams?: { state?: string; from?: string; to?: string; show?: string } }) {
  const off = await moduleOffReason('communication');
  if (off) return <ModuleOffPage moduleId="communication" reason={off} />;
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  const range = readRange(searchParams) ?? undefined;
  const state = isMessageState(searchParams.state) ? searchParams.state : undefined;
  const opened = Boolean(range || state);
  const noticesShown = searchParams.show === NOTICES_SHOW;
  const messages = <MessagesView mayRead={session?.role === 'principal' || session?.role === 'school_admin'} initialState={state} range={range} />;
  return (
    <ModulePage moduleId="communication" help="message-states" tour="communication" title={t(lang, 'msg.page.title')} purpose={t(lang, 'msg.page.purpose')}>
      <div className="flex flex-col gap-6">
        {noticesShown && <NoticesShown />}
        {opened && messages}
        {(session?.role === 'principal' || session?.role === 'school_admin' || session?.role === 'teacher') && <NoticesView shownAbove={noticesShown} />}
        {(session?.role === 'principal' || session?.role === 'school_admin' || session?.role === 'teacher') && <ThreadsView />}
        {(session?.role === 'principal' || session?.role === 'school_admin') && <BudgetView />}
        {!opened && messages}
        <p className="text-sm text-slate/70">{t(lang, 'msg.page.notYet')}</p>
      </div>
    </ModulePage>
  );
}
