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

// DATABASE_URL is intentionally allowed to be unset in this environment:
// app_backend (see supabase/migrations/20260917090000_auth_backend_role_and_sessions.sql)
// has no password until an operator sets one out-of-band. Code paths that
// need it call this and get a clear, specific error rather than a generic
// pg connection failure.
export const databaseUrl = () => required('DATABASE_URL');
