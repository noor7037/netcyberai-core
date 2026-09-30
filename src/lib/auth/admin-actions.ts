import { newAuthAdminClient } from './supabase';
import { hasServiceRoleKey } from './env';
import { AuthError } from './errors';
import { passwordProblem, signOutEverywhere } from './account';

// Founder console account tools (C91), super_admin only (the routes check).
// They work without any email being delivered: the founder can create a
// one-time sign-in or password link (and its code) and pass it on over
// WhatsApp or in person, set a temporary password, or remove a lost
// authenticator. Every use is audited by the calling route; no link, code or
// password is ever written to the audit log.

function admin() {
  if (!hasServiceRoleKey()) throw new AuthError('setup_required', 'service role key is not set');
  return newAuthAdminClient();
}

export type OneTimeLink = { link: string; code: string | null; expiresInMinutes: number };

// A link to our own login page (/login?th=...), checked on our server, so it
// does not depend on Supabase's Site URL setting. Creating it sends no email.
export async function createOneTimeLink(email: string, kind: 'signin' | 'reset', origin: string): Promise<OneTimeLink> {
  const type = kind === 'signin' ? 'magiclink' : 'recovery';
  const { data, error } = await admin().auth.admin.generateLink({ type, email });
  if (error || !data?.properties?.hashed_token) throw new AuthError('email_send_failed', error?.message ?? 'link not created');
  return {
    link: `${origin}/login?th=${encodeURIComponent(data.properties.hashed_token)}&type=${type}`,
    code: data.properties.email_otp ?? null,
    expiresInMinutes: 60,
  };
}

export async function setTemporaryPassword(userId: string, password: string): Promise<void> {
  const problem = passwordProblem(password);
  if (problem) throw new AuthError('password_invalid', problem);
  const { error } = await admin().auth.admin.updateUserById(userId, { password });
  if (error) throw new AuthError('password_rejected', error.message);
  await signOutEverywhere(userId);
}

// For someone who lost the phone with their authenticator app. They sign in
// with password and email code afterwards; a platform admin then enrols a new
// authenticator on the sign-in screen (C95). The route refuses the caller's own.
export async function removeAuthenticators(userId: string): Promise<number> {
  const client = admin();
  const { data, error } = await client.auth.admin.mfa.listFactors({ userId });
  if (error) throw new AuthError('mfa_not_enrolled', error.message);
  let removed = 0;
  for (const f of data?.factors ?? []) {
    const { error: delError } = await client.auth.admin.mfa.deleteFactor({ userId, id: f.id });
    if (!delError) removed += 1;
  }
  await signOutEverywhere(userId);
  return removed;
}

// Whether the account has a confirmed authenticator, for its own account
// page (C95). null when it cannot be known (service role key not set, or
// Supabase did not answer); the page then still offers set-up/replace, and
// the password step finds out.
export async function hasConfirmedAuthenticator(userId: string): Promise<boolean | null> {
  if (!hasServiceRoleKey()) return null;
  const { data, error } = await newAuthAdminClient().auth.admin.mfa.listFactors({ userId });
  if (error) return null;
  return (data?.factors ?? []).some((f) => f.factor_type === 'totp' && f.status === 'verified');
}

// The invite job (C98): Supabase Auth creates the account and sends its
// invite email, which lands on /login?th=…&type=invite (the set-password
// step). An email that already has an account answers `exists`; the job
// then gives that account the school instead. Only the invite job calls
// this, never a request directly.
export async function inviteUserToSchool(
  email: string,
  redirectTo: string,
  displayName: string
): Promise<{ userId: string } | { exists: true }> {
  const { data, error } = await admin().auth.admin.inviteUserByEmail(email, { redirectTo, data: { display_name: displayName } });
  if (!error && data?.user) return { userId: data.user.id };
  const code = (error as { code?: string } | null)?.code;
  if (code === 'email_exists' || /already (been )?registered/i.test(error?.message ?? '')) return { exists: true };
  throw new Error(`invite failed: ${error?.status ?? 'no status'} ${code ?? ''}`.trim());
}
