import { withPlatformService } from '@/lib/auth/db';
import type { Sql } from '@/lib/jobs/types';
import { credentialsMeta, encryptionKey, gatewayAllowed, openCredentials, recordTest, type CredentialsMeta, type Mode } from './credentials';
import { configuredPaymentProvider, type PaymentProvider } from './provider';
import { razorpayProvider } from './razorpay';

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

// Which provider opens a checkout for this school's new links (docs/24 §3.2, §3.8). Razorpay, when the school has
// switched it on and it is still allowed and tested: with the live keys if they have passed the test, otherwise the
// test keys. Otherwise the stand-in where one is configured (never a production build). Otherwise none.
// Switching the method off stops new links at once; notices for links already made are still accepted.
export async function providerForSchool(schoolId: string): Promise<{ provider: PaymentProvider; configId: string | null } | null> {
  const gateway = await platform(async (db) => {
    const on = (await db.query(`select 1 from payment_methods where school_id = $1 and method = 'razorpay' and enabled`, [schoolId])).rows[0];
    if (!on || !(await gatewayAllowed(db, schoolId, 'razorpay'))) return null;
    const tested = (await credentialsMeta(db, schoolId)).filter((c) => c.provider === 'razorpay' && c.testOk === true);
    const use = tested.find((c) => c.mode === 'live') ?? tested.find((c) => c.mode === 'test');
    const opened = use ? await openCredentials(db, use.configId) : null;
    return opened && use ? { provider: razorpayProvider(opened.keys), configId: use.configId } : null;
  });
  if (gateway) return gateway;
  const standIn = configuredPaymentProvider();
  return standIn ? { provider: standIn, configId: null } : null;
}

// "Test connection": a harmless call to the provider with the saved keys; the result is kept beside them.
export async function testGateway(schoolId: string, mode: Mode, make: (keys: Parameters<typeof razorpayProvider>[0]) => PaymentProvider = razorpayProvider): Promise<{ ok: boolean; message: string } | null> {
  const opened = await platform(async (db) => {
    const row = (await db.query(`select config_id from payment_credentials where school_id = $1 and provider = 'razorpay' and mode = $2`, [schoolId, mode])).rows[0];
    return row ? { configId: row.config_id as string, creds: await openCredentials(db, row.config_id as string) } : null;
  });
  if (!opened?.creds) return null;
  const result = (await make(opened.creds.keys).testConnection?.()) ?? { ok: false, message: 'This provider cannot be tested.' };
  await platform((db) => recordTest(db, opened.configId, result.ok, result.message));
  return result;
}

export { platform as paymentsPlatform };
