// The Family app (/family, M1-2, C248): one parent-and-student app with its own session (src/lib/family/session.ts).
// This outer layout only sets the page; the session guard is (app)/layout.tsx, and the pages outside it (sign-in,
// offline) need no session. scripts/check_route_guards.py holds that split.
import './family.css';

export const dynamic = 'force-dynamic';

// The Family app's own install manifest for browsers (the Android app is the Capacitor shell, M1-8, C254).
export const metadata = { manifest: '/family.webmanifest' };

export default function FamilyRootLayout({ children }: { children: React.ReactNode }) {
  // D1 (C230-Q): the page's soft colour light (family.css); bg-off-white stays the contrast surface.
  return <div className="fam-canvas min-h-screen bg-off-white text-slate">{children}</div>;
}
