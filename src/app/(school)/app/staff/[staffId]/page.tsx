import { notFound } from 'next/navigation';
import { ModuleComingPage } from '@/components/app-shell/ModuleComingPage';
import { StaffProfileView } from '@/components/staff/StaffProfileView';
import { withTenantContext } from '@/lib/auth/db';
import { canAccessApp } from '@/lib/auth/guards';
import { getServerSession } from '@/lib/auth/server-session';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { loadStaffProfile, mayOpenStaffProfile } from '@/lib/staff/profile';
import { STAFF_PROFILE_TABS, type StaffProfileTab } from '@/lib/staff/profile-rules';

// A member of staff's profile (C235-D, C238): nine tabs. The staff list's own rule (the principal and the school
// admin), and a member of staff their own profile; anyone else gets what the staff list gives them.
// ?tab=<id> opens that tab (the header's Documents and Biodata buttons, a tile's drill-down).
export default async function StaffProfilePage({ params, searchParams = {} }: { params: { staffId: string }; searchParams?: { tab?: string } }) {
  const session = await getServerSession();
  if (!session || !canAccessApp(session)) notFound();
  if (!mayOpenStaffProfile(session, params.staffId)) {
    return <ModuleComingPage moduleId="staff" />;
  }
  if (!isUuid(params.staffId)) notFound();
  const found = await withTenantContext(session, async (db) => {
    const profile = await loadStaffProfile(db, session.schoolId, params.staffId);
    const school = (await db.query(`select name from schools where school_id = $1`, [session.schoolId])).rows[0]?.name as string | undefined;
    return profile ? { profile, school: school ?? '' } : null;
  });
  if (!found) notFound();
  const office = session.role === 'principal' || session.role === 'school_admin';
  const tab = (STAFF_PROFILE_TABS as readonly string[]).includes(searchParams.tab ?? '') ? (searchParams.tab as StaffProfileTab) : 'overview';
  return <StaffProfileView profile={found.profile} tab={tab} office={office} schoolName={found.school} />;
}
