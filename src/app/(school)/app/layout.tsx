import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/auth/server-session';
import { canAccessApp, shellForRole } from '@/lib/auth/guards';
import { TopNav } from '@/components/shell/TopNav';
import { BottomNav } from '@/components/shell/BottomNav';
import { ToastProvider } from '@/components/ui/Toast';
import { officeNav, financeNav, academicNav, teacherNav } from '@/lib/nav/nav-items';

// Every page under this route group renders through THIS layout by
// Next.js's own nesting rules. Which of the four shells' nav a session
// sees is decided ONCE, here, from the resolved role already on the
// verified session -- never re-derived per page, so there is exactly
// one place a role could see the wrong shell's nav, and it's checked
// by scripts/check_route_guards.py and the Playwright verification in
// this prompt's report, not left to each page to get right.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  if (!canAccessApp(session)) {
    redirect('/login');
  }

  const shell = shellForRole(session!.role);

  if (shell === 'teacher') {
    return (
      <ToastProvider>
        <div className="min-h-screen bg-off-white pb-16">
          <BottomNav items={teacherNav} ariaLabel="Teacher navigation" />
          <main>{children}</main>
        </div>
      </ToastProvider>
    );
  }

  const items = shell === 'finance' ? financeNav : shell === 'academic' ? academicNav : officeNav;
  const label = shell === 'finance' ? 'Finance navigation' : shell === 'academic' ? 'Academic navigation' : 'Office navigation';

  return (
    <ToastProvider>
      <div className="min-h-screen bg-off-white">
        <TopNav items={items} ariaLabel={label} />
        <main>{children}</main>
      </div>
    </ToastProvider>
  );
}
