import { newAuthAdminClient } from './supabase';
import { hasServiceRoleKey } from './env';
import { AuthError } from './errors';
import { passwordProblem, signOutEverywhere } from './account';
import { inviteFailure, type InviteFailure } from './invite-failure';
import { PermanentJobError } from '@/lib/jobs/types';

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
  if (error && inviteFailure(error) === 'service_key') throw new AuthError('setup_required', 'the service role key was refused');
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
  const failed = inviteSendError({ status: error?.status, code, message: error?.message });
  throw failed.final ? new PermanentJobError(failed.message) : new Error(failed.message);
}

// What an invite's failure means for its job (W15-A, the founder's verification of 1 Nov): a refusal is final, so the
// job dies at once instead of trying eight times and showing a raw "500 unexpected_failure" in Monitoring. Supabase
// Auth's mail sender refusing the address ("error sending invite email"; its SMTP answer is in Supabase's own log) and
// any 4xx but a rate limit (429) or a server setting (401/403, which the founder fixes and the retry then passes)
// are refusals. Said as such in the job's error, so Control can tell them apart (W11-B).
export function inviteSendError(error: { status?: number | null; code?: string | null; message?: string | null }): { message: string; final: boolean } {
  const status = typeof error.status === 'number' ? error.status : null;
  const unsent = /sending .*email|email.*(send|deliver)/i.test(error.message ?? '');
  const refused = unsent || (status !== null && status >= 400 && status < 500 && ![401, 403, 408, 429].includes(status));
  return { message: `invite failed: ${status ?? 'no status'} ${error.code ?? ''}${unsent ? ' email_not_sent' : ''}`.replace(/\s+/g, ' ').trim(), final: refused };
}

// A sign-in account the founder makes from Control with a password he hands over (C230-D): confirmed at once, so no
// email is sent and none is needed. `id` makes the account's id a given one (a parent's account is their guardian
// record's id, so the parent rules already written in the database apply to it). A refusal comes back as the same
// codes an invite uses, so the screen says the same plain words.
export type CreatedLogin = { ok: true; userId: string } | { ok: false; failure: InviteFailure };
export async function createLoginAccount(email: string, password: string, id?: string): Promise<CreatedLogin> {
  if (passwordProblem(password)) throw new AuthError('password_invalid', 'password does not meet the rule');
  if (!hasServiceRoleKey()) return { ok: false, failure: 'service_key' };
  const { data, error } = await newAuthAdminClient().auth.admin.createUser({ email, password, email_confirm: true, ...(id ? { id } : {}) });
  if (error || !data?.user) return { ok: false, failure: inviteFailure(error) };
  return { ok: true, userId: data.user.id };
}

// Undoes createLoginAccount when the school's own rows could not be written, so no account is left with no school.
export async function deleteLoginAccount(userId: string): Promise<void> {
  if (!hasServiceRoleKey()) return;
  await newAuthAdminClient().auth.admin.deleteUser(userId).catch(() => undefined);
}

// Supabase Auth answers "User not found" (404) for an id it holds no account for: a users row written straight into
// the database (staff made by a seed or a fixture) has none until one is made (W14-B).
export function isNoLoginAccount(error: { message?: string; status?: number; code?: string } | null | undefined): boolean {
  return Boolean(error) && (error?.status === 404 || error?.code === 'user_not_found' || /user not found/i.test(error?.message ?? ''));
}

// A person's sign-in account, made first when their users row has none (W14-B): with the row's own id and email,
// already confirmed, and the password given (a random one for a link, never shown). `exists` when it was there.
export type EnsuredLogin = { state: 'exists' } | { state: 'created' } | { state: 'no_email' } | { state: 'refused'; failure: InviteFailure };
export async function ensureLoginAccount(userId: string, email: string | null, password: string): Promise<EnsuredLogin> {
  const { data, error } = await admin().auth.admin.getUserById(userId);
  if (!error && data?.user) return { state: 'exists' };
  if (!isNoLoginAccount(error)) {
    if (inviteFailure(error) === 'service_key') throw new AuthError('setup_required', 'the service role key was refused');
    throw new AuthError('password_rejected', error?.message ?? 'the account could not be read');
  }
  if (!email) return { state: 'no_email' };
  const made = await createLoginAccount(email, password, userId);
  return made.ok ? { state: 'created' } : { state: 'refused', failure: made.failure };
}

// Whether Supabase Auth holds a sign-in account with this id (W14-B, the "Existing staff" list); null when it cannot
// be known (no service key, or Supabase did not answer).
export async function hasLoginAccount(userId: string): Promise<boolean | null> {
  if (!hasServiceRoleKey()) return null;
  const { data, error } = await newAuthAdminClient().auth.admin.getUserById(userId);
  if (!error && data?.user) return true;
  return isNoLoginAccount(error) ? false : null;
}

// Removing a person from their only school (W14-B): their sign-in account goes too. True when it is gone (or was
// never there); false when Supabase refused.
export async function removeLoginAccount(userId: string): Promise<boolean> {
  const { error } = await admin().auth.admin.deleteUser(userId);
  return !error || isNoLoginAccount(error);
}
