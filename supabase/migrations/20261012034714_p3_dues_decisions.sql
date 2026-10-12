-- P3 dues decisions (C162).
--
-- 1. A child owes fees before the parent's consent is recorded: dues are
--    raised for active and pending_consent students. Consent governs
--    messages, which the send-gate blocks. The consent gate on `students`
--    hides a pending student from the accountant, and stays as it is; the
--    fee desk reads only the fields billing needs through this function.
--    It answers for the caller's own school and only to the three finance
--    roles (the same settings every policy trusts); anyone else gets no row.
-- 2. A fee head says whether RTE covers it. A new head takes the value of
--    its "every child pays it" flag unless told otherwise.

create function public.fee_billing_students()
returns table (school_id uuid, student_id uuid, name text, class_id uuid, family_id uuid, status text, rte_admission boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.school_id, s.student_id, s.name, s.class_id, s.family_id, s.status::text, s.rte_admission
    from students s
   where s.school_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
     and current_setting('app.current_role', true) in ('principal', 'school_admin', 'accountant')
$$;
revoke all on function public.fee_billing_students() from public;
grant execute on function public.fee_billing_students() to app_user;

alter table fee_heads add column rte_covered boolean;
update fee_heads set rte_covered = is_mandatory;
alter table fee_heads alter column rte_covered set not null;

create function public.fee_heads_rte_default() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.rte_covered is null then new.rte_covered := new.is_mandatory; end if;
  return new;
end $$;
revoke all on function public.fee_heads_rte_default() from public;
create trigger fee_heads_rte_default before insert on fee_heads for each row execute function public.fee_heads_rte_default();
