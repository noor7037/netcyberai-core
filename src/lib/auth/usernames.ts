// Sign-in names the founder gives from Control (founder, 2026-10-15, C230-D): a person signs in with a username or
// an email, and a password. Supabase Auth keys every account on an email, so a username account is kept there under
// a hidden address on our own domain, `<username>@login.netcyberai.com`. That address receives no mail, so a
// username account has no emailed step: it signs in with its password alone, and a lost password is reset by the
// school's office or NetCyberAI, never by email. Supabase refuses only example and test domains, not ours.

export const USERNAME_DOMAIN = 'login.netcyberai.com';

// Lowercase, 3 to 40 characters, starting with a letter (so it is never read as a mobile number), then letters,
// digits, dots, dashes or underscores, with no two dots in a row and no dot at the end.
const USERNAME_RE = /^[a-z][a-z0-9._-]{2,39}$/;

export function normalizeUsername(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const u = raw.trim().toLowerCase();
  return USERNAME_RE.test(u) && !u.includes('..') && !u.endsWith('.') ? u : null;
}

export const emailForUsername = (username: string): string => `${username}@${USERNAME_DOMAIN}`;
export const isUsernameEmail = (email: string | null | undefined): boolean => !!email && email.toLowerCase().endsWith(`@${USERNAME_DOMAIN}`);
export const usernameOf = (email: string | null | undefined): string | null => (email && isUsernameEmail(email) ? email.slice(0, email.length - USERNAME_DOMAIN.length - 1) : null);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// What the founder typed in "Sign-in name": an email, or a username. Null when it is neither.
export type SignInName = { kind: 'email'; email: string } | { kind: 'username'; username: string; email: string };
export function signInName(raw: unknown): SignInName | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim();
  if (v.includes('@')) {
    const email = v.toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 254 || isUsernameEmail(email)) return null;
    return { kind: 'email', email };
  }
  const username = normalizeUsername(v);
  return username ? { kind: 'username', username, email: emailForUsername(username) } : null;
}

// A password the founder can read out or type: 12 signs with no look-alikes (no 0/O, 1/l/I), in three groups of
// four, from the random bytes it is given (the server's crypto). Each sign is taken only from a byte below 224, a
// multiple of the 56 signs, so no sign is favoured.
const PASSWORD_SIGNS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
export function makePassword(randomBytes: Uint8Array): string {
  const out: string[] = [];
  for (const b of randomBytes) {
    if (b >= 224) continue;
    out.push(PASSWORD_SIGNS[b % PASSWORD_SIGNS.length]);
    if (out.length === 12) break;
  }
  if (out.length < 12) throw new Error('makePassword needs more random bytes');
  return `${out.slice(0, 4).join('')}-${out.slice(4, 8).join('')}-${out.slice(8).join('')}`;
}
