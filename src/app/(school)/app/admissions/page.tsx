import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { AdmissionsView } from '@/components/admissions/AdmissionsView';
import { AdmissionsWaiting } from '@/components/admissions/AdmissionsWaiting';
import { StudentsView } from '@/components/students/StudentsView';
import { ADMISSIONS_OFFICE } from '@/lib/admissions/admissions';
import { getServerSession } from '@/lib/auth/server-session';
import { moduleOffReason } from '@/lib/frameworks/page-access';
import { SCHOOL_ROLES } from '@/lib/contracts/modules';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

// The admissions pipeline (docs/28 slice 10a, C221): the office's enquiries, "Follow up today", "Gone quiet" and
// Admit. Under it, the children waiting for consent: where Admit leaves a child, and the list the dashboard's
// number and the School Health Auditor's consent check open. Their full list, with "+ Add student" and
// "Import CSV", is /app/admissions/waiting. ?show=conversion (the principal's tile, W21-M1) opens at the conversion table.
// The children waiting for consent are the Students module's own: a school whose plan has no Admissions keeps
// them here, with "+ Add student" and "Import CSV", as before the pipeline (lead, at integration of C221).
export default async function AdmissionsPage({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const off = await moduleOffReason('students', { roles: SCHOOL_ROLES });
  if (off) return <ModuleOffPage moduleId="students" reason={off} />;
  const session = await getServerSession();
  if (await moduleOffReason('admissions', { roles: SCHOOL_ROLES })) {
    const { lang } = getLang(session?.sub ?? '');
    return <StudentsView title={t(lang, 'adm.waitingPage.title')} description={t(lang, 'adm.waitingPage.purpose')} statusFilter="pending_consent" />;
  }
  return (
    <AdmissionsView office={ADMISSIONS_OFFICE.includes(session?.role ?? '')} show={typeof searchParams?.show === 'string' ? searchParams.show : undefined}>
      <AdmissionsWaiting />
    </AdmissionsView>
  );
}
