import { ModulePage } from '@/components/app-ui/ModulePage';
import { FamilyCountsView } from '@/components/control/apps/FamilyCountsView';
import { SubjectListForm } from '@/components/control/apps/SubjectListForm';
import { readSubjectList } from '@/lib/control/family-settings';
import { SUBJECT_IDS } from '@/lib/contracts/subjects';
import { withPlatformService, withTenantContext } from '@/lib/auth/db';
import { getServerSession } from '@/lib/auth/server-session';
import { loadFamilyCounts } from '@/lib/control/family-counts';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

// Control → Family (docs/family-app/10 §9, M1-7): counts of the Family app, read only. They come from
// family.control_counts(), the only door Control has to family data; no name, child, answer or email is read. Below
// them, the two lists of subjects Control holds: open to every child (C298), and checked explanations only (C300).

export const dynamic = 'force-dynamic';

export default async function ControlFamilyPage() {
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  const counts = session ? await withTenantContext(session, (db) => loadFamilyCounts(db)) : null;
  const lists = session ? await withPlatformService(async (db) => ({ open: await readSubjectList(db, 'open'), reviewed: await readSubjectList(db, 'reviewed_only') })) : null;
  return (
    <ModulePage title={t(lang, 'control.family.title')} purpose={t(lang, 'control.family.purpose')} about={t(lang, 'control.family.about')} icon="users" tone="turquoise" eyebrow={t(lang, 'group.control')} headerLang={lang}>
      {counts && <FamilyCountsView counts={counts} lang={lang} />}
      {lists && (
        <div className="mt-6 flex flex-col gap-6">
          <SubjectListForm list="open_subjects" subjects={SUBJECT_IDS} initial={lists.open} />
          <SubjectListForm list="reviewed_only" subjects={SUBJECT_IDS} initial={lists.reviewed} />
        </div>
      )}
    </ModulePage>
  );
}
