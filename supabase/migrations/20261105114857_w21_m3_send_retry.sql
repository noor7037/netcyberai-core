-- W21-M3 (1): every try of a failed send is kept on its row, with the kind of failure the provider gave.
-- (jobs.attempt_log, the email job's tries, is the migration before this one.)
-- communication_log: one entry a try for a WhatsApp message, and the kind of its last failure. "Retry now" writes a NEW
-- row (its dedupe key 'retry:<log_id>:<n>'); the old row is never changed back, so the log stays forward-only.
alter table communication_log add column attempt_log jsonb not null default '[]'::jsonb check (jsonb_typeof(attempt_log) = 'array');
alter table communication_log add column failure_kind text check (failure_kind is null or char_length(failure_kind) between 1 and 40);

-- W21-M3 (2): a message to a member of staff (the substitute told on WhatsApp). The row names the person it is for;
-- no child. Their state is read by cover_whatsapp_state() below, which gives the arranging roles (the academic
-- coordinator cannot read the message log) the state of ONE cover's message and nothing else: no number, no words.
alter table communication_log add column staff_user_id uuid references users(user_id);
create index idx_communication_log_staff on communication_log (school_id, dedupe_key) where staff_user_id is not null;

create or replace function public.cover_whatsapp_state(p_substitution_ids uuid[]) returns table (substitution_id uuid, state text)
language sql stable security definer set search_path = public, pg_temp as $$
  select s.substitution_id,
         case when l.log_id is null then 'none'
              when l.status::text like 'blocked_%' then 'held'
              when l.status::text in ('queued', 'uncertain') then 'queued'
              when l.status::text = 'failed' then 'failed'
              else 'told' end
    from substitutions s
    left join lateral (select x.log_id, x.status from communication_log x
                        where x.school_id = s.school_id and x.dedupe_key = 'cover:' || s.substitution_id::text and x.staff_user_id is not null
                        order by x.created_at desc limit 1) l on true
   where s.substitution_id = any(p_substitution_ids)
     and s.school_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
     and current_setting('app.current_role', true) in ('principal', 'school_admin', 'academic_coordinator');
$$;
revoke all on function public.cover_whatsapp_state(uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.cover_whatsapp_state(uuid[]) to app_user, nca_super;
