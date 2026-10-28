import { getServerSession } from '@/lib/auth/server-session';
import { withTenantContext } from '@/lib/auth/db';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { ProvisionSchool } from '@/components/control/ProvisionSchool';
import { INDIAN_STATES } from '@/lib/contracts/indian-states';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';
import { defaultSession } from '@/lib/onboarding/provision-input';
import { indiaDate } from '@/lib/time/india';

// Control → Onboarding → Provision a school (W6-E, C230-AU; Decision Log C399). The layout already admits only
// NetCyberAI staff; the route the screen posts to checks again. The boards are the exam boards Control keeps.
export const dynamic = 'force-dynamic';

export default async function ProvisionPage() {
  const session = await getServerSession();
  const { lang } = getLang(session!.sub);
  const boards = session
    ? await withTenantContext(session, async (db) =>
        (await db.query(`select board_id, name from boards order by lower(name), board_id`)).rows.map((r) => ({ boardId: r.board_id as string, name: r.name as string }))
      )
    : [];
  return (
    <ModulePage title={t(lang, 'control.provision.title')} purpose={t(lang, 'control.provision.purpose')} icon="admissions" tone="turquoise" eyebrow={t(lang, 'group.control')}>
      <ProvisionSchool boards={boards} states={[...INDIAN_STATES]} initialSession={defaultSession(indiaDate())} />
    </ModulePage>
  );
}
