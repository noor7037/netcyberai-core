import { describe, expect, it } from 'vitest';
import {
  authenticatorFriendlyName,
  authenticatorRequired,
  authenticatorStepAtSignIn,
  canManageOwnAuthenticator,
  canRemoveAuthenticatorOf,
  emailProofFromAccessToken,
  emailProofFromAmr,
  factorIdsToRemoveAfterReplace,
  formatSetupKey,
  isPendingTotpFactor,
  normalizeTotpCode,
  svgDataUrl,
  rememberedDeviceSkipsEmailStep,
  staleUnverifiedTotpIds,
  unverifiedTotpIds,
  type FactorSummary,
} from './authenticator-rules';

// A JWT-shaped string with the given payload (signature not checked here).
function token(payload: unknown): string {
  const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
  return `${b64({ alg: 'HS256' })}.${b64(payload)}.sig`;
}

describe('authenticatorStepAtSignIn', () => {
  const base = { aal: 'aal1' as const, hasVerifiedAuthenticator: false, emailProven: false, passwordProven: false };

  it('asks nothing more once the session is already at aal2', () => {
    expect(authenticatorStepAtSignIn({ ...base, role: 'super_admin', aal: 'aal2' })).toBe('none');
    expect(authenticatorStepAtSignIn({ ...base, role: 'principal', aal: 'aal2', hasVerifiedAuthenticator: true })).toBe('none');
  });

  it('asks anyone with an authenticator for its code', () => {
    for (const role of ['super_admin', 'principal', 'school_admin', 'teacher']) {
      expect(authenticatorStepAtSignIn({ ...base, role, hasVerifiedAuthenticator: true })).toBe('verify');
    }
  });

  it('enrols a platform admin without one only after both the password and the email were proven', () => {
    const admin = { ...base, role: 'super_admin' };
    expect(authenticatorStepAtSignIn({ ...admin, passwordProven: true, emailProven: true })).toBe('setup');
    // A password alone (a remembered device, or the email step switched off).
    expect(authenticatorStepAtSignIn({ ...admin, passwordProven: true, emailProven: false })).toBe('not_enrolled');
    // A mailbox alone (an emailed code or link, a password reset).
    expect(authenticatorStepAtSignIn({ ...admin, passwordProven: false, emailProven: true })).toBe('not_enrolled');
    expect(authenticatorStepAtSignIn(admin)).toBe('not_enrolled');
  });

  it('gives platform admins the email step even on a remembered device', () => {
    expect(rememberedDeviceSkipsEmailStep('super_admin')).toBe(false);
    for (const role of ['principal', 'school_admin', 'teacher', 'accountant']) {
      expect(rememberedDeviceSkipsEmailStep(role)).toBe(true);
    }
  });

  it('does not require one of anyone else', () => {
    for (const role of ['principal', 'school_admin', 'teacher', 'accountant', 'academic_coordinator']) {
      expect(authenticatorStepAtSignIn({ ...base, role, emailProven: true, passwordProven: true })).toBe('none');
    }
  });
});

describe('who manages and removes authenticators', () => {
  it('lets platform admins, principals and school admins manage their own', () => {
    expect(canManageOwnAuthenticator('super_admin')).toBe(true);
    expect(canManageOwnAuthenticator('principal')).toBe(true);
    expect(canManageOwnAuthenticator('school_admin')).toBe(true);
    expect(canManageOwnAuthenticator('teacher')).toBe(false);
    expect(canManageOwnAuthenticator('accountant')).toBe(false);
    expect(canManageOwnAuthenticator('parent')).toBe(false);
  });

  it('requires one only of platform admins', () => {
    expect(authenticatorRequired('super_admin')).toBe(true);
    expect(authenticatorRequired('principal')).toBe(false);
  });

  it('never lets founder tools remove the caller’s own authenticator', () => {
    expect(canRemoveAuthenticatorOf('a', 'a')).toBe(false);
    expect(canRemoveAuthenticatorOf('a', 'b')).toBe(true);
  });
});

describe('email proof from the session', () => {
  it('accepts an emailed code, link, reset or invite', () => {
    for (const method of ['otp', 'magiclink', 'recovery', 'invite']) {
      expect(emailProofFromAmr([{ method, timestamp: 100 }])).toEqual({ method, at: 100 });
    }
  });

  it('does not count a password alone, or a malformed claim', () => {
    expect(emailProofFromAmr([{ method: 'password', timestamp: 100 }])).toBeNull();
    expect(emailProofFromAmr([{ method: 'otp' }])).toBeNull();
    expect(emailProofFromAmr('otp')).toBeNull();
    expect(emailProofFromAmr(undefined)).toBeNull();
  });

  it('finds the email method among several', () => {
    expect(emailProofFromAmr([{ method: 'password', timestamp: 1 }, { method: 'otp', timestamp: 2 }])).toEqual({ method: 'otp', at: 2 });
  });

  it('reads the amr claim from an access token', () => {
    expect(emailProofFromAccessToken(token({ amr: [{ method: 'otp', timestamp: 5 }] }))).toEqual({ method: 'otp', at: 5 });
    expect(emailProofFromAccessToken(token({ amr: [{ method: 'password', timestamp: 5 }] }))).toBeNull();
    expect(emailProofFromAccessToken('not-a-token')).toBeNull();
  });
});

describe('factor bookkeeping', () => {
  const factors: FactorSummary[] = [
    { id: 'old', factor_type: 'totp', status: 'verified' },
    { id: 'abandoned', factor_type: 'totp', status: 'unverified' },
    { id: 'new', factor_type: 'totp', status: 'unverified' },
    { id: 'sms', factor_type: 'phone', status: 'verified' },
  ];

  it('finds abandoned authenticator setups', () => {
    expect(unverifiedTotpIds(factors)).toEqual(['abandoned', 'new']);
  });

  it('removes every other authenticator after a replacement, never the new one or a phone factor', () => {
    expect(factorIdsToRemoveAfterReplace(factors, 'new')).toEqual(['old', 'abandoned']);
  });

  it('confirms only an own, unconfirmed authenticator setup', () => {
    expect(isPendingTotpFactor(factors, 'new')).toBe(true);
    expect(isPendingTotpFactor(factors, 'old')).toBe(false);
    expect(isPendingTotpFactor(factors, 'sms')).toBe(false);
    expect(isPendingTotpFactor(factors, 'someone-elses')).toBe(false);
    expect(isPendingTotpFactor(factors, 42)).toBe(false);
  });
});

describe('setups started at the same moment', () => {
  const at = (s: number) => `2026-09-30T10:00:0${s}Z`;
  it('keeps only the newest unconfirmed setup', () => {
    const factors: FactorSummary[] = [
      { id: 'old', factor_type: 'totp', status: 'verified', created_at: at(0) },
      { id: 'raceA', factor_type: 'totp', status: 'unverified', created_at: at(1) },
      { id: 'raceB', factor_type: 'totp', status: 'unverified', created_at: at(2) },
    ];
    // B's clean-up removes A; A's clean-up leaves B (it is newer).
    expect(staleUnverifiedTotpIds(factors, 'raceB')).toEqual(['raceA']);
    expect(staleUnverifiedTotpIds(factors, 'raceA')).toEqual([]);
  });

  it('never touches a confirmed authenticator or another factor type', () => {
    const factors: FactorSummary[] = [
      { id: 'old', factor_type: 'totp', status: 'verified', created_at: at(0) },
      { id: 'phone', factor_type: 'phone', status: 'unverified', created_at: at(0) },
      { id: 'new', factor_type: 'totp', status: 'unverified', created_at: at(3) },
    ];
    expect(staleUnverifiedTotpIds(factors, 'new')).toEqual([]);
  });
});

describe('display helpers', () => {
  it('names each enrolment distinctly, to the second', () => {
    expect(authenticatorFriendlyName(new Date('2026-09-29T12:46:40.123Z'))).toBe('NetCyberAI 2026-09-29 12:46:40 UTC');
  });

  it('groups the setup key in fours', () => {
    expect(formatSetupKey('jbswy3dpehpk3pxp')).toBe('JBSW Y3DP EHPK 3PXP');
    expect(formatSetupKey('ABCDE')).toBe('ABCD E');
  });

  it('re-encodes Supabase’s raw SVG data URL so a # does not cut it short', () => {
    const raw = 'data:image/svg+xml;utf-8,<svg xmlns="http://www.w3.org/2000/svg"><path fill="#000000" d="M0 0h1v1H0z"/></svg>';
    const url = svgDataUrl(raw);
    expect(url.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
    expect(url).not.toContain('#');
    expect(decodeURIComponent(url.slice('data:image/svg+xml;charset=utf-8,'.length))).toBe(raw.slice('data:image/svg+xml;utf-8,'.length));
  });

  it('leaves an already encoded data URL alone', () => {
    const encoded = 'data:image/png;base64,iVBORw0KGgo=';
    expect(svgDataUrl(encoded)).toBe(encoded);
  });

  it('accepts exactly six digits for an authenticator code', () => {
    expect(normalizeTotpCode(' 123 456 ')).toBe('123456');
    expect(normalizeTotpCode('12345')).toBeNull();
    expect(normalizeTotpCode('1234567')).toBeNull();
    expect(normalizeTotpCode(123456)).toBeNull();
  });
});
