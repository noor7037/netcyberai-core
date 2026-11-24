import { notFound } from 'next/navigation';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { agentWords } from '@/components/agent/words';
import { RequestReview } from '@/components/agent/RequestReview';
import { getServerSession } from '@/lib/auth/server-session';
import { getLang } from '@/lib/i18n/server';
import { getRequest } from '@/lib/agent/requests';

// One change request to check (C546). Read as this person: their own, or any for the principal and the office.
export default async function RequestPage({ params }: { params: { requestId: string } }) {
  const session = await getServerSession();
  if (!session?.schoolId || !/^[0-9a-f-]{36}$/.test(params.requestId)) notFound();
  const { lang } = getLang(session.sub);
  const view = await getRequest(session, params.requestId);
  if (!view) notFound();
  return (
    <ModulePage help="ask-the-assistant" title={agentWords(lang).title} purpose={agentWords(lang).purpose}>
      <div className="mx-auto w-full max-w-2xl">
        <RequestReview initial={view} lang={lang} />
      </div>
    </ModulePage>
  );
}
