import { describe, expect, it } from 'vitest';
import { emailStepEnabled, maskEmail, normalizeCode, normalizeEmail, normalizePhone, passwordProblem, PASSWORD_MAX } from './account';
import { isUserId } from './staff-accounts';

describe('normalizeEmail', () => {
  it('trims and lowercases a valid email', () => {
    expect(normalizeEmail('  Noor.Test@Example.COM ')).toBe('noor.test@example.com');
  });
  it('rejects non-strings and malformed emails', () => {
    expect(normalizeEmail(undefined)).toBeNull();
    expect(normalizeEmail(42)).toBeNull();
    expect(normalizeEmail('no-at-sign')).toBeNull();
    expect(normalizeEmail('a@b')).toBeNull();
    expect(normalizeEmail('a b@c.in')).toBeNull();
  });
});

describe('normalizeCode', () => {
  it('accepts 6 to 10 digits, ignoring spaces', () => {
    expect(normalizeCode('123 456')).toBe('123456');
    expect(normalizeCode('1234567890')).toBe('1234567890');
  });
  it('rejects short, long and non-digit codes', () => {
    expect(normalizeCode('12345')).toBeNull();
    expect(normalizeCode('12345678901')).toBeNull();
    expect(normalizeCode('12a456')).toBeNull();
    expect(normalizeCode(null)).toBeNull();
  });
});

describe('passwordProblem', () => {
  it('accepts a normal password', () => {
    expect(passwordProblem('correct horse battery')).toBeNull();
  });
  it('names the problem', () => {
    expect(passwordProblem(undefined)).toBe('missing');
    expect(passwordProblem('short')).toBe('too_short');
    expect(passwordProblem('x'.repeat(PASSWORD_MAX + 1))).toBe('too_long');
    expect(passwordProblem(' leading-space')).toBe('edge_spaces');
  });
});

describe('isUserId', () => {
  it('accepts a uuid and rejects anything else', () => {
    expect(isUserId('3f2b8c1e-0a4d-4c1e-9b7a-1d2e3f4a5b6c')).toBe(true);
    expect(isUserId("1' or '1'='1")).toBe(false);
    expect(isUserId(undefined)).toBe(false);
  });
});

describe('normalizePhone', () => {
  it('accepts Indian mobile numbers in common forms', () => {
    expect(normalizePhone('98765 43210')).toBe('9876543210');
    expect(normalizePhone('+91 98765-43210')).toBe('9876543210');
    expect(normalizePhone('919876543210')).toBe('9876543210');
    expect(normalizePhone('09876543210')).toBe('9876543210');
  });
  it('rejects landlines, short numbers and letters', () => {
    expect(normalizePhone('1234567890')).toBeNull();
    expect(normalizePhone('98765')).toBeNull();
    expect(normalizePhone('98765abc10')).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
  });
});

describe('maskEmail', () => {
  it('keeps the first and last letter of the name and the domain', () => {
    expect(maskEmail('noorislam@gmail.com')).toBe('n******m@gmail.com');
    expect(maskEmail('ab@x.in')).toBe('a@x.in');
  });
});

describe('emailStepEnabled', () => {
  it('is on unless AUTH_EMAIL_STEP=off', () => {
    const before = process.env.AUTH_EMAIL_STEP;
    delete process.env.AUTH_EMAIL_STEP;
    expect(emailStepEnabled()).toBe(true);
    process.env.AUTH_EMAIL_STEP = 'off';
    expect(emailStepEnabled()).toBe(false);
    if (before === undefined) delete process.env.AUTH_EMAIL_STEP;
    else process.env.AUTH_EMAIL_STEP = before;
  });
});
