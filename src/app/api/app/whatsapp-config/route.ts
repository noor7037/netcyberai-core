import { NextRequest, NextResponse } from 'next/server';
import { requireAppSession, canWriteMasterData } from '@/lib/auth/require-app-session';
import { withTenantContext } from '@/lib/auth/db';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { ruleError } from '@/lib/frameworks/route';

// GET: routing metadata only -- status/phone_number_id/waba_id, never
// the credential itself. Any staff role in the school can see this
// (school_whatsapp_configs_tenant_isolation), same as knowing a fee
// structure exists.
export async function GET(req: NextRequest) {
  const guard = await requireAppSession(req);
  if ('error' in guard) return guard.error;

  try {
    const config = await withTenantContext(guard.claims, async (client) => {
      const { rows } = await client.query(
        `select id, waba_id, phone_number_id, phone_number_display, status, updated_at
         from school_whatsapp_configs where school_id = $1`,
        [guard.claims.schoolId]
      );
      return rows[0] ?? null;
    });
    return NextResponse.json({ config });
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}

// POST: the one write path, gated to school_admin/principal at the
// route AND by school_whatsapp_configs_admin_write's own RESTRICTIVE
// RLS policy (defense in depth, same pattern as every other master-
// data write in this app). Design decision (Task 2d): this deliberately
// stops short of a full re-authentication/step-up-auth flow -- no such
// mechanism exists yet for school_admin/principal (only super_admin's
// MFA aal2 does, for an unrelated purpose), and building one is out of
// this prompt's scope. Instead the CLIENT requires an explicit
// confirmation step before this request is ever sent (see
// WhatsAppConfigPanel.tsx) -- real, deliberate friction against a
// fat-fingered submission of a live credential, short of the bigger
// step-up-auth lift a full re-auth flow would need. Encryption itself
// (Supabase Vault, via the SECURITY DEFINER function below) is the
// actual security boundary regardless of what gates the write.
export async function POST(req: NextRequest) {
  const guard = await requireAppSession(req);
  if ('error' in guard) return guard.error;
  if (!canWriteMasterData(guard.claims.role)) {
    return ruleError(403, 'not_allowed');
  }

  const body = await req.json().catch(() => null);
  const { wabaId, phoneNumberId, phoneNumberDisplay, accessToken, webhookVerifyToken } = body ?? {};
  if (
    typeof phoneNumberId !== 'string' ||
    !phoneNumberId ||
    typeof accessToken !== 'string' ||
    !accessToken ||
    typeof webhookVerifyToken !== 'string' ||
    !webhookVerifyToken
  ) {
    return ruleError(400, 'required', { field: 'whatsapp_details' });
  }

  try {
    const configId = await withTenantContext(guard.claims, async (client) => {
      const { rows } = await client.query(
        `select whatsapp_config_set_credentials($1, $2, $3, $4, $5, $6, $7) as id`,
        [
          guard.claims.schoolId,
          typeof wabaId === 'string' ? wabaId : null,
          phoneNumberId,
          typeof phoneNumberDisplay === 'string' ? phoneNumberDisplay : null,
          accessToken,
          webhookVerifyToken,
          guard.claims.sub,
        ]
      );
      return rows[0].id;
    });
    return NextResponse.json({ id: configId, status: 'pending_verification' }, { status: 201 });
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}
