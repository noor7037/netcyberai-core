-- Real bug found live via verify-prompt-e: impersonation_sessions only
-- had a SELECT policy. /api/control/impersonate/end runs its
-- `update impersonation_sessions set ended_at = now() where
-- impersonation_id = $1` under app_user (the impersonated identity's
-- own resolved role, per that route's own design -- ending your own
-- impersonation session, not someone else's). With row level security
-- forced and no UPDATE-applicable policy, Postgres silently matched
-- zero rows -- no error, "200 ended", but ended_at never actually got
-- set, so the impersonated token kept passing withTenantContext's live
-- check indefinitely instead of being revoked the moment /end is called.
-- Confirmed live: a fetch to a protected route with the "ended" token
-- still returned 200 after this.
create policy impersonation_self_end on impersonation_sessions
  for update
  using (target_user_id = current_setting('app.current_user_id', true)::uuid)
  with check (target_user_id = current_setting('app.current_user_id', true)::uuid);
