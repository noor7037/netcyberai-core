import { ModulePage } from '@/components/app-ui/ModulePage';
import { FamilyCountsView } from '@/components/control/apps/FamilyCountsView';
import { OpenSubjectsForm } from '@/components/control/apps/OpenSubjectsForm';
import { readOpenSubjects } from '@/lib/control/family-settings';
import { SUBJECT_IDS } from '@/lib/contracts/subjects';
import { withTenantContext } from '@/lib/auth/db';
import { getServerSession } from '@/lib/auth/server-session';
import { loadFamilyCounts } from '@/lib/control/family-counts';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

// Control → Family (docs/family-app/10 §9, M1-7): counts of the Family app, read only. They come from
// family.control_counts(), the only door Control has to family data; no name, child, answer or email is read. Below
// them, the one family setting Control holds: subjects open to every child (C298).

export const dynamic = 'force-dynamic';

export default async function ControlFamilyPage() {
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  // One transaction as the signed-in founder (the layout has already refused anyone else).
  const data = session ? await withTenantContext(session, async (db) => ({ counts: await loadFamilyCounts(db), open: await readOpenSubjects(db) })) : null;
  const counts = data?.counts ?? null;
  const open = data?.open ?? null;
  return (
    <ModulePage title={t(lang, 'control.family.title')} purpose={t(lang, 'control.family.purpose')} about={t(lang, 'control.family.about')} icon="users" tone="turquoise" eyebrow={t(lang, 'group.control')} headerLang={lang}>
      {counts && <FamilyCountsView counts={counts} lang={lang} />}
      {open && (
        <div className="mt-6">
          <OpenSubjectsForm subjects={SUBJECT_IDS} initial={open} />
        </div>
      )}
    </ModulePage>
  );
}
