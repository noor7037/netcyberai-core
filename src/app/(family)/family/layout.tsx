// The Family app (/family, M1-2, C248): one parent-and-student app with its own session (src/lib/family/session.ts).
// This outer layout only sets the page; the session guard is (app)/layout.tsx, and the pages outside it (sign-in,
// offline) need no session. scripts/check_route_guards.py holds that split.
import type { Viewport } from 'next';
import { headers } from 'next/headers';
import { shellNeedsEdgeRoom } from '@/lib/family/flags';
import './family.css';

export const dynamic = 'force-dynamic';

// The Family app's own install manifest for browsers (the Android app is the Capacitor shell, M1-8, C254).
export const metadata = { manifest: '/family.webmanifest' };
// The page may run under the phone's bars, so the browser reports their size (env(safe-area-inset-*), family.css).
// C415: the composer must stay above the phone's keyboard. Android's browser and web view keep a fixed element under the
// keyboard unless the page asks the keyboard to shrink the page (interactive-widget=resizes-content, Chrome 108+).
export const viewport: Viewport = { viewportFit: 'cover', interactiveWidget: 'resizes-content' };

export default function FamilyRootLayout({ children }: { children: React.ReactNode }) {
  // D1 (C230-Q): the page's soft colour light (family.css); bg-off-white stays the contrast surface. `data-edge`: the
  // first Android shell on Android 15+, which draws the page under the phone's bars without saying how tall they are.
  const edge = shellNeedsEdgeRoom(headers().get('user-agent'));
  return (
    <div className="fam-canvas min-h-screen bg-off-white text-slate" data-edge={edge ? '' : undefined}>
      {children}
    </div>
  );
}
