import { describe, expect, it } from 'vitest';
import { USERNAME_DOMAIN } from '@/lib/auth/usernames';
import { parseNewLogin } from './logins';

const good = { name: '  Priya   Sharma ', role: 'teacher', signIn: 'Priya.Sharma', password: '' };

describe('a new login from Control', () => {
  it('reads a username login and leaves the password for the server to make', () => {
    const r = parseNewLogin(good);
    expect(r).toEqual({ ok: true, login: { name: 'Priya Sharma', role: 'teacher', signIn: { kind: 'username', username: 'priya.sharma', email: `priya.sharma@${USERNAME_DOMAIN}` }, password: null, parentId: null } });
  });

  it('reads an email login with a typed password', () => {
    const r = parseNewLogin({ ...good, role: 'principal', signIn: 'Head@School.in', password: 'longenough1' });
    expect(r.ok && r.login.signIn).toEqual({ kind: 'email', email: 'head@school.in' });
    expect(r.ok && r.login.password).toBe('longenough1');
  });

  it('ties a parent’s login to a guardian record, whose name it takes', () => {
    const r = parseNewLogin({ role: 'parent', parentId: 'd1000000-0000-4000-8000-0000000000e1', signIn: 'rajesh.k', password: '' });
    expect(r.ok && r.login.parentId).toBe('d1000000-0000-4000-8000-0000000000e1');
    expect(r.ok && r.login.role).toBe('parent');
  });

  it('names the first thing that is wrong', () => {
    expect(parseNewLogin({ ...good, name: 'P' })).toEqual({ ok: false, problem: 'name' });
    expect(parseNewLogin({ ...good, name: 'Priya 1234 5678 9012' })).toEqual({ ok: false, problem: 'name' });
    expect(parseNewLogin({ ...good, role: 'super_admin' })).toEqual({ ok: false, problem: 'role' });
    expect(parseNewLogin({ ...good, role: 'parent' })).toEqual({ ok: false, problem: 'guardian' });
    expect(parseNewLogin({ ...good, role: 'parent', parentId: 'not-an-id' })).toEqual({ ok: false, problem: 'guardian' });
    expect(parseNewLogin({ ...good, signIn: '98177 07037' })).toEqual({ ok: false, problem: 'sign_in' });
    expect(parseNewLogin({ ...good, password: 'short' })).toEqual({ ok: false, problem: 'password' });
    expect(parseNewLogin({ ...good, password: ' padded password ' })).toEqual({ ok: false, problem: 'password' });
    expect(parseNewLogin(null)).toEqual({ ok: false, problem: 'role' });
  });
});
