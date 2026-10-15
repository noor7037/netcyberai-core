import { describe, expect, it } from 'vitest';
import { USERNAME_DOMAIN, emailForUsername, isUsernameEmail, makePassword, normalizeUsername, signInName, usernameOf } from './usernames';
import { passwordProblem } from './account';

describe('usernames for sign-in', () => {
  it('accepts a plain name and keeps it lowercase', () => {
    expect(normalizeUsername(' Priya.Sharma ')).toBe('priya.sharma');
    expect(normalizeUsername('t_kumar-2')).toBe('t_kumar-2');
  });

  it('refuses what could be a phone number, an email or a slip', () => {
    for (const bad of ['9817707037', '1abc', 'ab', 'a'.repeat(41), 'priya..s', 'priya.', 'priya sharma', 'priya@x', '', 42]) expect(normalizeUsername(bad)).toBeNull();
  });

  it('keeps a username behind a hidden address on our domain, and reads it back', () => {
    const email = emailForUsername('priya.sharma');
    expect(email).toBe(`priya.sharma@${USERNAME_DOMAIN}`);
    expect(isUsernameEmail(email)).toBe(true);
    expect(isUsernameEmail('priya@gmail.com')).toBe(false);
    expect(usernameOf(email)).toBe('priya.sharma');
    expect(usernameOf('priya@gmail.com')).toBeNull();
  });

  it('reads the "sign-in name" box as an email or a username', () => {
    expect(signInName(' Priya@Gmail.com ')).toEqual({ kind: 'email', email: 'priya@gmail.com' });
    expect(signInName('Priya.Sharma')).toEqual({ kind: 'username', username: 'priya.sharma', email: `priya.sharma@${USERNAME_DOMAIN}` });
    expect(signInName(`x@${USERNAME_DOMAIN}`)).toBeNull();
    expect(signInName('not an email@')).toBeNull();
    expect(signInName('98177 07037')).toBeNull();
  });

  it('makes a 14-character password with no look-alike signs that passes the password rule', () => {
    const bytes = new Uint8Array(64).map((_, i) => (i * 53 + 7) & 255);
    const pw = makePassword(bytes);
    expect(pw).toMatch(/^[A-HJ-NP-Za-km-z2-9]{4}-[A-HJ-NP-Za-km-z2-9]{4}-[A-HJ-NP-Za-km-z2-9]{4}$/);
    expect(passwordProblem(pw)).toBeNull();
    expect(makePassword(bytes)).toBe(pw);
    expect(() => makePassword(new Uint8Array(12).fill(250))).toThrow();
  });
});
