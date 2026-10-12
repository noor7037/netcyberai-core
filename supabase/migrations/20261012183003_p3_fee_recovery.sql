-- P3 6g part 1 (C178): fee recovery: the follow-up list, a promise to pay,
-- hardship, and refunds made by hand.
--
-- 1. fee_followups: what the office did about a family's unpaid fees: a
--    call (a note), a promise to pay (with a date), or hardship. A family is
--    the linked family, or a lone child. An OPEN promise or an OPEN
--    hardship holds every reminder to that family. A follow-up is a record:
--    its words are never edited; it can only be closed, by a named person.
-- 2. fee_refunds: money that arrived and could not be applied (paid twice,
--    paid more than owed) is on the refund list. The school gives it back
--    by hand, outside the app; this records that it did, once per evidence.

-- 1.
create table fee_followups (
  followup_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  family_id uuid,
  student_id uuid not null,
  kind text not null check (kind in ('call', 'promise', 'hardship')),
  note text not null check (char_length(btrim(note)) between 1 and 300),
  promise_date date,
  status text not null check (status in ('open', 'closed')),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  closed_by uuid,
  closed_at timestamptz,
  close_note text check (close_note is null or char_length(btrim(close_note)) between 1 and 300),
  unique (school_id, followup_id),
  foreign key (school_id, family_id) references families(school_id, family_id),
  foreign key (school_id, student_id) references students(school_id, student_id),
  check ((kind = 'promise') = (promise_date is not null)),
  check (kind <> 'call' or status = 'closed'),
  check ((status = 'closed' and kind <> 'call') = (closed_by is not null and closed_at is not null))
);
create unique index fee_followups_one_open_per_payer on fee_followups (school_id, coalesce(family_id, student_id), kind) where status = 'open';
create index idx_fee_followups_payer on fee_followups (school_id, coalesce(family_id, student_id), created_at desc);
revoke all on fee_followups from public, anon, authenticated, service_role;
grant select, insert, update on fee_followups to app_user;
grant select on fee_followups to nca_super;
alter table fee_followups enable row level security;
alter table fee_followups force row level security;
create policy fee_followups_tenant_isolation on fee_followups using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy fee_followups_finance on fee_followups as restrictive
  for all using (current_setting('app.current_role', true) = any (array['accountant', 'school_admin', 'principal', 'super_admin']));
create policy fee_followups_as_self on fee_followups as restrictive
  for insert with check (created_by = nullif(current_setting('app.current_user_id', true), '')::uuid);
create function public.fee_followups_fixed() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if (new.school_id, new.student_id, new.kind, new.note, new.created_by, new.created_at) is distinct from (old.school_id, old.student_id, old.kind, old.note, old.created_by, old.created_at)
     or new.family_id is distinct from old.family_id or new.promise_date is distinct from old.promise_date then
    raise exception 'a follow-up is never edited' using errcode = 'check_violation';
  end if;
  if old.status = 'closed' then
    raise exception 'a closed follow-up stays closed' using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke all on function public.fee_followups_fixed() from public;
create trigger fee_followups_fixed before update on fee_followups for each row execute function public.fee_followups_fixed();

-- 2.
create table fee_refunds (
  refund_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  evidence_id uuid not null,
  amount_minor bigint not null check (amount_minor > 0),
  how text not null check (char_length(btrim(how)) between 1 and 300),
  refunded_on date not null,
  recorded_by uuid not null,
  recorded_at timestamptz not null default now(),
  unique (evidence_id),
  foreign key (school_id, evidence_id) references payment_evidence(school_id, evidence_id)
);
revoke all on fee_refunds from public, anon, authenticated, service_role;
grant select, insert on fee_refunds to app_user;
alter table fee_refunds enable row level security;
alter table fee_refunds force row level security;
create policy fee_refunds_tenant_isolation on fee_refunds using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy fee_refunds_finance on fee_refunds as restrictive
  for all using (current_setting('app.current_role', true) = any (array['accountant', 'school_admin', 'principal', 'super_admin']));
create policy fee_refunds_as_self on fee_refunds as restrictive
  for insert with check (recorded_by = nullif(current_setting('app.current_user_id', true), '')::uuid);
-- The refund recorded is the whole amount that could not be applied: never more, never a part.
create function public.fee_refunds_whole() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from payment_evidence v where v.school_id = new.school_id and v.evidence_id = new.evidence_id and v.unapplied_minor = new.amount_minor) then
    raise exception 'a refund is the whole amount that could not be applied' using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke all on function public.fee_refunds_whole() from public;
create trigger fee_refunds_whole before insert on fee_refunds for each row execute function public.fee_refunds_whole();
