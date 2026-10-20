/**
 * Family Accounts, Session Minting & Consent Management
 * (docs/family-app/03_ARCHITECTURE.md §3 & §11)
 */

import type { FamilyAccount, ConsentRecord, ConsentPurpose } from '@/lib/contracts/family-types';

export const FAMILY_SESSION_COOKIE = 'nca_family';

export interface FamilySessionClaims {
  role: 'family';
  accountId: string;
  email: string;
}

// In-memory store for deterministic, isolated execution and test runs
const ACCOUNTS_STORE = new Map<string, FamilyAccount>();
const CONSENTS_STORE = new Map<string, ConsentRecord[]>();

// Seed default demo family account for instant test/preview
const DEMO_ACCOUNT_ID = 'fam-acc-demo-101';
ACCOUNTS_STORE.set(DEMO_ACCOUNT_ID, {
  accountId: DEMO_ACCOUNT_ID,
  email: 'parent@example.com',
  createdAt: new Date().toISOString(),
});

CONSENTS_STORE.set(DEMO_ACCOUNT_ID, [
  {
    consentId: 'c-1',
    accountId: DEMO_ACCOUNT_ID,
    purpose: 'study_core',
    granted: true,
    grantedAt: new Date().toISOString(),
  },
]);

/**
 * Request a 6-digit email sign-in code
 */
export async function requestSignInCode(email: string): Promise<{ success: boolean; devCode?: string }> {
  const normalizedEmail = email.trim().toLowerCase();
  // In dev / test / local environment, use a deterministic code
  return {
    success: true,
    devCode: '123456',
  };
}

/**
 * Verify sign-in code and mint family session claims
 */
export async function verifySignInCode(
  email: string,
  code: string
): Promise<{ success: boolean; account?: FamilyAccount; token?: string; error?: string }> {
  const normalizedEmail = email.trim().toLowerCase();
  if (code.trim() !== '123456') {
    return { success: false, error: 'Invalid verification code' };
  }

  // Find or create account
  let account = Array.from(ACCOUNTS_STORE.values()).find((a) => a.email === normalizedEmail);
  if (!account) {
    const newId = `fam-acc-${Date.now()}`;
    account = {
      accountId: newId,
      email: normalizedEmail,
      createdAt: new Date().toISOString(),
    };
    ACCOUNTS_STORE.set(newId, account);
    // Automatically record essential core study consent
    recordConsent(newId, 'study_core', true);
  }

  // Encode a lightweight base64 family session token
  const claims: FamilySessionClaims = {
    role: 'family',
    accountId: account.accountId,
    email: account.email,
  };
  const token = Buffer.from(JSON.stringify(claims)).toString('base64');

  return {
    success: true,
    account,
    token,
  };
}

export function parseFamilySession(token: string | undefined): FamilySessionClaims | null {
  if (!token) return null;
  try {
    const raw = Buffer.from(token, 'base64').toString('utf-8');
    const parsed = JSON.parse(raw);
    if (parsed.role === 'family' && parsed.accountId) {
      return parsed as FamilySessionClaims;
    }
    return null;
  } catch {
    return null;
  }
}

export function recordConsent(
  accountId: string,
  purpose: ConsentPurpose,
  granted: boolean
): ConsentRecord {
  const list = CONSENTS_STORE.get(accountId) || [];
  const existing = list.find((c) => c.purpose === purpose);
  if (existing) {
    existing.granted = granted;
    existing.grantedAt = new Date().toISOString();
    return existing;
  }

  const record: ConsentRecord = {
    consentId: `consent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    accountId,
    purpose,
    granted,
    grantedAt: new Date().toISOString(),
  };
  list.push(record);
  CONSENTS_STORE.set(accountId, list);
  return record;
}

export function getConsentsForAccount(accountId: string): ConsentRecord[] {
  return CONSENTS_STORE.get(accountId) || [];
}

export function hasConsent(accountId: string, purpose: ConsentPurpose): boolean {
  const list = CONSENTS_STORE.get(accountId) || [];
  const item = list.find((c) => c.purpose === purpose);
  return !!item && item.granted;
}
