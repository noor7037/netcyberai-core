import { describe, expect, it } from 'vitest';
import { ACCOUNT_FIELDS, ACCOUNT_SHAPE, PROBLEM_FIELD, VERIFY_TOKEN_LENGTH, accountProblem, fieldFault, makeVerifyToken } from './account-shape';

const GOOD = { phoneNumberId: '123456789012345', wabaId: '987654321098765', accessToken: 'EAAG'.padEnd(180, 'x'), appSecret: '5729dd56b3d864e6ab2615f794c45fe4', verifyToken: 'netcyberaiMetaWebhook2026x7q9' };

describe('the shape of the WhatsApp account', () => {
  it('accepts what Meta hands out', () => {
    for (const f of ACCOUNT_FIELDS) expect(fieldFault(f, GOOD[f])).toBeNull();
    expect(accountProblem(GOOD)).toBeNull();
  });

  it('names a paste slip before anything else: a space or a line break', () => {
    expect(fieldFault('accessToken', `${GOOD.accessToken}\n`)).toBe('space');
    expect(fieldFault('accessToken', 'EAAG abc'.padEnd(40, 'x'))).toBe('space');
    expect(fieldFault('phoneNumberId', '12345 6789')).toBe('space');
    expect(fieldFault('verifyToken', 'netcyberai Meta Webhook 2026')).toBe('space');
  });

  it('names the wrong characters, then the length', () => {
    expect(fieldFault('phoneNumberId', '+91 98177')).toBe('space');
    expect(fieldFault('phoneNumberId', '+919817707037')).toBe('chars');
    expect(fieldFault('wabaId', '1234')).toBe('short');
    expect(fieldFault('wabaId', '1'.repeat(31))).toBe('long');
    expect(fieldFault('appSecret', '5729dd56-b3d8-64e6')).toBe('chars');
    expect(fieldFault('appSecret', 'abc123')).toBe('short');
    expect(fieldFault('verifyToken', 'short')).toBe('short');
    expect(fieldFault('verifyToken', 'has.a.dot.in.it.here')).toBe('chars');
    expect(fieldFault('accessToken', 'x'.repeat(601))).toBe('long');
    expect(fieldFault('accessToken', '')).toBe('empty');
  });

  it('refuses a save with the code of the first wrong field, as before', () => {
    expect(accountProblem({ ...GOOD, phoneNumberId: 'abc' })).toBe('phone_number_id');
    expect(accountProblem({ ...GOOD, wabaId: '' })).toBe('waba_id');
    expect(accountProblem({ ...GOOD, accessToken: 'too short' })).toBe('access_token');
    expect(accountProblem({ ...GOOD, appSecret: 'not-hex-at-all-really' })).toBe('app_secret');
    expect(accountProblem({ ...GOOD, verifyToken: 'tiny' })).toBe('verify_token');
    // Both wrong: the first in the form's order.
    expect(accountProblem({ ...GOOD, wabaId: 'x', verifyToken: 'x' })).toBe('waba_id');
    for (const f of ACCOUNT_FIELDS) expect(PROBLEM_FIELD[ACCOUNT_SHAPE[f].problem]).toBe(f);
  });

  it('makes a verify token that passes its own rule, from the bytes it is given', () => {
    const bytes = new Uint8Array(VERIFY_TOKEN_LENGTH).map((_, i) => (i * 37) & 255);
    const token = makeVerifyToken(bytes);
    expect(token).toHaveLength(VERIFY_TOKEN_LENGTH);
    expect(fieldFault('verifyToken', token)).toBeNull();
    expect(makeVerifyToken(bytes)).toBe(token);
    expect(makeVerifyToken(new Uint8Array(VERIFY_TOKEN_LENGTH).fill(63))).toBe('_'.repeat(VERIFY_TOKEN_LENGTH));
    expect(() => makeVerifyToken(new Uint8Array(8))).toThrow();
  });
});
