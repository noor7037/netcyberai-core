-- AM-4 (C351): a linked family's checked paper adds up exactly as the teacher's does. Internal choice ("attempt any
-- two of three") is kept in marking_setups, which a guardian never reads (it also holds the teacher's guidance for the
-- AI). This gives the guardian the choice counts only, of the papers of their own child's approved scripts of a
-- publication in force (guardian_marking_sheets(), unchanged), and nothing else of the setup.
create function public.guardian_choice_counts()
returns table (paper_id uuid, choice_counts jsonb)
language sql stable security definer set search_path = '' as $$
  select m.paper_id, m.choice_counts
    from public.marking_setups m
   where m.school_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
     and m.paper_id in (select s.paper_id from public.marking_sheets s where s.sheet_id in (select public.guardian_marking_sheets()))
$$;
revoke all on function public.guardian_choice_counts() from public, anon, authenticated, service_role;
grant execute on function public.guardian_choice_counts() to app_user;
