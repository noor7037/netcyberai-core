import { passwordProblem } from '@/lib/auth/account';
import { signInName, type SignInName } from '@/lib/auth/usernames';
import { hasAadhaarNumber } from '@/lib/privacy/aadhaar';
import { isUuid } from '@/lib/frameworks/custom-fields';

// "Create a login" in Control → a school → People (founder, 2026-10-15, C230-D): a name, a role, a sign-in name
// (a username or an email) and a password. Read here, once, for the route; the screen shows the same rules.

export { LOGIN_ROLES, type LoginRole } from './login-roles';
import { LOGIN_ROLES, type LoginRole } from './login-roles';
export type NewLoginProblem = 'name' | 'role' | 'sign_in' | 'password' | 'guardian';
// A parent's login names its guardian record (`parentId`); its name is the guardian's, read from that record.
export type NewLogin = { name: string; role: LoginRole; signIn: SignInName; password: string | null; parentId: string | null };

export function parseNewLogin(body: unknown): { ok: true; login: NewLogin } | { ok: false; problem: NewLoginProblem } {
  const b = (body ?? {}) as Record<string, unknown>;
  if (!LOGIN_ROLES.includes(b.role as LoginRole)) return { ok: false, problem: 'role' };
  const parentId = b.role === 'parent' ? (isUuid(b.parentId) ? b.parentId : null) : null;
  if (b.role === 'parent' && !parentId) return { ok: false, problem: 'guardian' };
  const name = typeof b.name === 'string' ? b.name.trim().replace(/\s+/g, ' ') : '';
  if (b.role !== 'parent' && (name.length < 2 || name.length > 80 || hasAadhaarNumber(name))) return { ok: false, problem: 'name' };
  const signIn = signInName(b.signIn);
  if (!signIn) return { ok: false, problem: 'sign_in' };
  // Empty: the server makes one. Typed: the sign-in rule (8 to 72 characters, no spaces at either end).
  const password = typeof b.password === 'string' && b.password !== '' ? b.password : null;
  if (password !== null && passwordProblem(password)) return { ok: false, problem: 'password' };
  return { ok: true, login: { name, role: b.role as LoginRole, signIn, password, parentId } };
}
