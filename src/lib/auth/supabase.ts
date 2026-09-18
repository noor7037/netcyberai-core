import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseUrl, supabaseAnonKey } from './env';

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
