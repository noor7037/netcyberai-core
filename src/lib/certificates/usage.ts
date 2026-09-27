'use client';

// The free-use counter for the certificate studio. It stores two things
// in this browser profile only: how many certificates were generated
// (a number) and whether a free account was created here (a flag). No
// certificate content, no device fingerprint. Clearing site data resets
// it, which is accepted: it is a nudge, not a lock.

export const FREE_LIMIT = 3;
export const GATE_MESSAGE =
  'You have generated 3 free certificates. Create a free account to continue. No payment required. We do not save your certificates or form data.';

const COUNT_KEY = 'nca-cert-generations';
const ACCOUNT_KEY = 'nca-free-account';
let memoryCount = 0;
let memoryAccount = false;

export function generationCount(): number {
  try {
    const n = Number(window.localStorage.getItem(COUNT_KEY) ?? '0');
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  } catch {
    return memoryCount;
  }
}

export function addGenerations(n: number) {
  const next = generationCount() + n;
  memoryCount = next;
  try {
    window.localStorage.setItem(COUNT_KEY, String(next));
  } catch {
    /* storage blocked: the in-memory count still applies this visit */
  }
}

export function hasFreeAccount(): boolean {
  try {
    return window.localStorage.getItem(ACCOUNT_KEY) === '1' || memoryAccount;
  } catch {
    return memoryAccount;
  }
}

export function markFreeAccount() {
  memoryAccount = true;
  try {
    window.localStorage.setItem(ACCOUNT_KEY, '1');
  } catch {
    /* storage blocked: unlocked for this visit */
  }
}

// True when generating `n` more would go past the free limit without an account.
export function needsAccount(n = 1): boolean {
  return !hasFreeAccount() && generationCount() + n > FREE_LIMIT;
}
