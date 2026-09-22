import type { PoolClient } from 'pg';

export type WhatsAppConfigStatus = 'not_configured' | 'pending_verification' | 'active' | 'suspended' | 'revoked';

export interface SchoolWhatsAppConfigRow {
  id: string;
  status: WhatsAppConfigStatus;
  phone_number_id: string | null;
}

export type ProviderResolution =
  | { kind: 'school_specific'; configId: string; phoneNumberId: string }
  | { kind: 'platform_default'; fallbackReason: string | null };

// Task 2, Founder decision: Platform-Default with Optional Tenant
// Override. A school never gets blocked from sending just because it
// hasn't done its own WABA onboarding -- status active is the only
// state that resolves to the school's own credentials; every other
// state (including "no row at all") falls back to the platform
// default. `fallbackReason` is non-null only when a school-specific
// row actually exists but wasn't used, per Task 2c point 6 -- "a
// school-specific config that's suspended/revoked is logged as 'fell
// back to platform default,' not silently swapped without a trace."
export async function resolveProvider(client: PoolClient, schoolId: string): Promise<ProviderResolution> {
  const { rows } = await client.query<SchoolWhatsAppConfigRow>(
    `select id, status, phone_number_id from school_whatsapp_configs where school_id = $1`,
    [schoolId]
  );
  const config = rows[0];

  if (!config) {
    return { kind: 'platform_default', fallbackReason: null };
  }
  if (config.status === 'active' && config.phone_number_id) {
    return { kind: 'school_specific', configId: config.id, phoneNumberId: config.phone_number_id };
  }
  return { kind: 'platform_default', fallbackReason: `school config status: ${config.status}` };
}
