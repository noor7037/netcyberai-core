// Why Supabase Auth refused to send an invite, as a code the Control screen can say in plain words
// (docs/19 rule 3). The usual one: the server's service key is wrong or missing, which Supabase reports as
// "Invalid API key" with status 401. That is a deployment setting, not something the person on the screen
// did, so the screen says which setting and what to do.
import { SERVICE_ROLE_SETTING_NAME } from './env';

export type InviteFailure = 'service_key' | 'already_registered' | 'email' | 'other';

export function inviteFailure(error: { message?: string; status?: number; code?: string } | null | undefined): InviteFailure {
  const m = (error?.message ?? '').toLowerCase();
  const code = error?.code ?? '';
  if (error?.status === 401 || /api key|jwt|unauthori[sz]ed|service.?role/.test(m)) return 'service_key';
  if (code === 'email_exists' || /already (been )?registered|already exists|already in use/.test(m)) return 'already_registered';
  if (code === 'validation_failed' || (/email/.test(m) && /format|valid/.test(m))) return 'email';
  return 'other';
}

// The server's own words for an API caller; the screen has the same in both languages.
export const INVITE_FAILURE_TEXT: Record<Exclude<InviteFailure, 'other'>, string> = {
  service_key: `The invite was not sent: the server’s Supabase service key (${SERVICE_ROLE_SETTING_NAME}) is wrong, expired or missing. Set the project’s current service_role key in the deployment’s environment and redeploy.`,
  already_registered: 'This email already has a login, so no new invite was sent.',
  email: 'That does not look like an email address.',
};
