import { withPlatformService } from '@/lib/auth/db';
import type { Sql } from '@/lib/jobs/types';
import { credentialsMeta, encryptionKey, gatewayAllowed, openCredentials, recordTest, type CredentialsMeta, type Mode } from './credentials';
import { configuredPaymentProvider, type PaymentProvider } from './provider';
import { razorpayProvider } from './razorpay';

// What the payment set-up screens show for one school, in the school's
// Settings and in Control (C171). Read as the platform role, for a school id
// the caller has already verified. Metadata only: no key leaves the server.

const platform = withPlatformService as <T>(fn: (db: Sql) => Promise<T>) => Promise<T>;
export type GatewaySetup = { credentials: CredentialsMeta[]; allowed: boolean; canSave: boolean; testSchool: boolean };

const isTestSchool = async (db: Sql, schoolId: string) => (await db.query(`select is_test_fixture from schools where school_id = $1`, [schoolId])).rows[0]?.is_test_fixture === true;

export async function gatewaySetup(schoolId: string): Promise<GatewaySetup> {
  return platform(async (db) => ({ credentials: await credentialsMeta(db, schoolId), allowed: await gatewayAllowed(db, schoolId, 'razorpay'), canSave: encryptionKey() !== null, testSchool: await isTestSchool(db, schoolId) }));
}

// A gateway may be switched on only when NetCyberAI allows it for the school, its keys are saved and "Test
// connection" has passed. For a real school that means LIVE keys: test keys move no money, so they can never be
// what a real school collects with (C173). A test-fixture school may use test keys.
export const usableKeys = (credentials: readonly CredentialsMeta[], provider: string, testSchool: boolean): CredentialsMeta | null => {
  const tested = credentials.filter((c) => c.provider === provider && c.testOk === true);
  return tested.find((c) => c.mode === 'live') ?? (testSchool ? (tested.find((c) => c.mode === 'test') ?? null) : null);
};
export async function gatewayReady(schoolId: string, provider: string): Promise<boolean> {
  const s = await gatewaySetup(schoolId);
  return s.allowed && usableKeys(s.credentials, provider, s.testSchool) !== null;
}

// Where the provider sends its notices for one configuration: an address of its own, so a notice can only credit that school.
export const webhookPath = (provider: string, configId: string) => `/api/public/payments/webhook/${provider}/${configId}`;

// Which provider opens a checkout for this school's new links (docs/24 §3.2, §3.8). Razorpay, when the school has
// switched it on and it is still allowed and tested: with the live keys. Test keys, and the stand-in, are used only
// for a test-fixture school: a real school is never given a checkout that moves no money (C173).
// Switching the method off stops new links at once; notices for links already made are still accepted.
export async function providerForSchool(schoolId: string): Promise<{ provider: PaymentProvider; configId: string | null } | null> {
  const found = await platform(async (db) => {
    const testSchool = await isTestSchool(db, schoolId);
    const on = (await db.query(`select 1 from payment_methods where school_id = $1 and method = 'razorpay' and enabled`, [schoolId])).rows[0];
    if (!on || !(await gatewayAllowed(db, schoolId, 'razorpay'))) return { testSchool, gateway: null };
    const use = usableKeys(await credentialsMeta(db, schoolId), 'razorpay', testSchool);
    const opened = use ? await openCredentials(db, use.configId) : null;
    return { testSchool, gateway: opened && use ? { provider: razorpayProvider(opened.keys), configId: use.configId } : null };
  });
  if (found.gateway) return found.gateway;
  const standIn = found.testSchool ? configuredPaymentProvider() : null;
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
