import { withPlatformService } from '@/lib/auth/db';
import type { Sql } from '@/lib/jobs/types';
import { credentialsMeta, encryptionKey, gatewayAllowed, type CredentialsMeta } from './credentials';

// What the payment set-up screens show for one school, in the school's
// Settings and in Control (C171). Read as the platform role, for a school id
// the caller has already verified. Metadata only: no key leaves the server.

const platform = withPlatformService as <T>(fn: (db: Sql) => Promise<T>) => Promise<T>;
export type GatewaySetup = { credentials: CredentialsMeta[]; allowed: boolean; canSave: boolean };

export async function gatewaySetup(schoolId: string): Promise<GatewaySetup> {
  return platform(async (db) => ({ credentials: await credentialsMeta(db, schoolId), allowed: await gatewayAllowed(db, schoolId, 'razorpay'), canSave: encryptionKey() !== null }));
}

// A gateway may be switched on only when NetCyberAI allows it for the school, its keys are saved and "Test connection" has passed.
export async function gatewayReady(schoolId: string, provider: string): Promise<boolean> {
  const s = await gatewaySetup(schoolId);
  return s.allowed && s.credentials.some((c) => c.provider === provider && c.testOk === true);
}

// Where the provider sends its notices for one configuration: an address of its own, so a notice can only credit that school.
export const webhookPath = (provider: string, configId: string) => `/api/public/payments/webhook/${provider}/${configId}`;

export { platform as paymentsPlatform };
