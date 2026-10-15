import { notFound } from 'next/navigation';
import { ModuleComingPage } from '@/components/app-shell/ModuleComingPage';
import { StaffProfileView } from '@/components/staff/StaffProfileView';
import { withTenantContext } from '@/lib/auth/db';
import { canAccessApp } from '@/lib/auth/guards';
import { getServerSession } from '@/lib/auth/server-session';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { loadStaffProfile, mayOpenStaffProfile } from '@/lib/staff/profile';

// A member of staff's profile (C235-D): Overview and Documents. The staff list's own rule (the principal and the
// school admin), and a member of staff their own profile; anyone else gets what the staff list gives them.
// ?tab=documents opens the Documents tab (the header's Documents button).
export default async function StaffProfilePage({ params, searchParams = {} }: { params: { staffId: string }; searchParams?: { tab?: string } }) {
  const session = await getServerSession();
  if (!session || !canAccessApp(session)) notFound();
  if (!mayOpenStaffProfile(session, params.staffId)) {
    return <ModuleComingPage moduleId="staff" />;
  }
  if (!isUuid(params.staffId)) notFound();
  const profile = await withTenantContext(session, (db) => loadStaffProfile(db, session.schoolId, params.staffId));
  if (!profile) notFound();
  const office = session.role === 'principal' || session.role === 'school_admin';
  return <StaffProfileView profile={profile} tab={searchParams.tab === 'documents' ? 'documents' : 'overview'} office={office} />;
}
