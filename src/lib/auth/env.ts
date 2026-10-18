function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

export const supabaseUrl = () => required('NEXT_PUBLIC_SUPABASE_URL');
export const supabaseAnonKey = () => required('NEXT_PUBLIC_SUPABASE_ANON_KEY');
export const appSessionSecret = () => required('APP_SESSION_SECRET');

// Service-role key: bypasses RLS and GoTrue's normal auth checks entirely.
// Never for login, never for anything a request carrying ordinary user
// input can reach. src/lib/auth/supabase.ts's newAuthAdminClient is the
// ONLY thing allowed to call this function -- see that file's own
// comment for its two authorized callers -- enforced by
// scripts/check_service_role.py.
export const supabaseServiceRoleKey = () => required('SUPABASE_SERVICE_ROLE_KEY');
// Whether the founder-console account tools can run (C91). Reports presence
// only, never the value.
export const hasServiceRoleKey = () => !!process.env.SUPABASE_SERVICE_ROLE_KEY;
// The setting's name, for the founder's setup checklist.
export const SERVICE_ROLE_SETTING_NAME = 'SUPABASE_SERVICE_ROLE_KEY';

// What the server key is, without handing any of it out (C236). Production's key belonged to the other Supabase
// project for eleven days and no screen said so; this is half of the check that now does (the other half lists the
// bucket, src/lib/observability/storage-health.ts):
//   missing          -- not set;
//   other_project    -- a JWT whose `ref` is not the project in NEXT_PUBLIC_SUPABASE_URL;
//   not_service_role -- a JWT for another role, or a publishable key: the store would read it as a visitor's;
//   to_try           -- nothing wrong can be read from it (a newer `sb_secret_` key, or a project the address does
//                       not name), so only the store can say.
// The key is decoded in memory here and nothing of it leaves this function: not its parts, not its claims.
export type ServiceKeyShape = 'missing' | 'other_project' | 'not_service_role' | 'to_try';

// A Supabase project's ref from its address (https://<ref>.supabase.co); null for any other address.
export function supabaseProjectRef(url: string | undefined): string | null {
  try {
    return new URL(url ?? '').hostname.match(/^([a-z0-9]+)\.supabase\.(?:co|in)$/)?.[1] ?? null;
  } catch {
    return null;
  }
}

export function serviceRoleKeyShape(): ServiceKeyShape {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) return 'missing';
  if (key.startsWith('sb_publishable_')) return 'not_service_role';
  const parts = key.split('.');
  if (parts.length !== 3) return 'to_try';
  let claims: { ref?: unknown; role?: unknown } | null = null;
  try {
    claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return 'to_try';
  }
  if (!claims || typeof claims !== 'object') return 'to_try';
  const project = supabaseProjectRef(process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (typeof claims.ref === 'string' && project && claims.ref !== project) return 'other_project';
  if (claims.role !== undefined && claims.role !== 'service_role') return 'not_service_role';
  return 'to_try';
}

// DATABASE_URL is intentionally allowed to be unset in this environment:
// app_backend (see supabase/migrations/20260917090000_auth_backend_role_and_sessions.sql)
// has no password until an operator sets one out-of-band. Code paths that
// need it call this and get a clear, specific error rather than a generic
// pg connection failure.
export const databaseUrl = () => required('DATABASE_URL');
