import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseUrl, supabaseAnonKey, supabaseServiceRoleKey } from './env';

// Supabase Auth (GoTrue) is used ONLY as the credential + MFA oracle:
// verifying a password and a TOTP code, and reporting the resulting AAL.
// Its own JWT and session are discarded after that -- this app mints and
// owns its own session (src/lib/auth/jwt.ts) because authorization
// claims (role, school_id) come from `memberships`, a table Supabase
// Auth knows nothing about, and because RLS here reads session GUCs
// (app.current_role etc.), not `auth.jwt()`. See the B2 report's
// "architecture" section for the fuller rationale, including why the
// Custom-Access-Token-Hook alternative was rejected.
export function newAuthClient(): SupabaseClient {
  return createClient(supabaseUrl(), supabaseAnonKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

// Service-role client -- bypasses RLS and GoTrue's normal checks. Two
// callers: src/lib/onboarding/invite.ts (auth.admin.inviteUserByEmail --
// Prompt E Task 4: credential delivery is Supabase's own one-time email
// link, so this app never sees, generates, or logs a plaintext
// credential at all), and src/lib/capture/storage.ts (Prompt F Task 3 --
// the Storage bucket has no RLS policy expressible in terms of this
// app's own session model, so the tenant boundary for it is enforced in
// application code instead; see that file's own comment). Never use
// this client for login/session work -- that's newAuthClient's job, on
// purpose the less-privileged one.
export function newAuthAdminClient(): SupabaseClient {
  return createClient(supabaseUrl(), supabaseServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
