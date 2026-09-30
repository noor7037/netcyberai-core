import { NextRequest, NextResponse } from 'next/server';
import { buildNavigation } from '@/lib/contracts/navigation';
import { loadEntitlements } from '@/lib/frameworks/entitlements';
import { appRoute } from '@/lib/frameworks/route';

// The signed-in school's entitlements and the navigation they give this
// role (C112). The app shell renders the navigation and keeps no module
// list of its own.
export async function GET(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    const entitlements = await loadEntitlements(db, claims.schoolId);
    return NextResponse.json({ entitlements, navigation: buildNavigation(claims.role, entitlements) });
  });
}
