import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { hasServiceRoleKey, SERVICE_ROLE_SETTING_NAME } from '@/lib/auth/env';
import { emailStepEnabled } from '@/lib/auth/account';

// What the founder console's sign-in setup panel shows (C91). Presence and
// on/off only, never a value.
export async function GET(req: NextRequest) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  return NextResponse.json({
    serviceRoleKey: hasServiceRoleKey(),
    settingName: SERVICE_ROLE_SETTING_NAME,
    emailStep: emailStepEnabled(),
    origin: req.nextUrl.origin,
  });
}
