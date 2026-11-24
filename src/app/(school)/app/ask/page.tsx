import { ModulePage } from '@/components/app-ui/ModulePage';
import { AgentView } from '@/components/agent/AgentView';
import { agentWords } from '@/components/agent/words';
import { getServerSession } from '@/lib/auth/server-session';
import { getLang } from '@/lib/i18n/server';

// Ask (C546): the school's own assistant. Its every action is checked by the route it calls, as this person.
export default async function AskPage() {
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  const w = agentWords(lang);
  return (
    <ModulePage help="ask-the-assistant" tour="ask" title={w.title} purpose={w.purpose}>
      <AgentView lang={lang} />
    </ModulePage>
  );
}
