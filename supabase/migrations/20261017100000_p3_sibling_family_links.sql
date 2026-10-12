-- P3 6e (C168): the sibling rule, and one payment link per family.
--
-- 1. A concession says where it came from: a person, or the school's sibling
--    rule (still approved by a person before it applies). A rule concession
--    may be for the heads every child pays only. One open rule concession
--    per child at most.
-- 2. fee_family_children(): for the fee desk, which children of each family
--    are on the rolls and in what order of age (1 = the eldest). The date of
--    birth itself never leaves the database. Same guard as
--    fee_billing_students(): the caller's own school, the three finance
--    roles, nobody else.
-- 3. payment_links and payment_link_lines: a link is for a family (or for a
--    child with no family), for an amount, and its lines fix to the paisa
--    which due of which child the money is for. One open link per family.

-- 1.
alter table fee_concessions add column source text not null default 'person' check (source in ('person', 'rule'));
alter table fee_concessions add column family_id uuid;
alter table fee_concessions add constraint fee_concessions_school_family_fkey foreign key (school_id, family_id) references families(school_id, family_id);
alter table fee_concessions add column mandatory_only boolean not null default false;
alter table fee_concessions add constraint fee_concessions_rule_has_family check (source = 'person' or family_id is not null);
create unique index fee_concessions_one_open_rule_per_child on fee_concessions (school_id, student_id) where source = 'rule' and status in ('proposed', 'approved');

-- 2.
create function public.fee_family_children()
returns table (school_id uuid, family_id uuid, student_id uuid, elder_rank int, children int)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.school_id, s.family_id, s.student_id,
         (row_number() over (partition by s.school_id, s.family_id order by s.dob nulls last, s.created_at, s.student_id))::int,
         (count(*) over (partition by s.school_id, s.family_id))::int
    from students s
   where s.school_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
     and current_setting('app.current_role', true) in ('principal', 'school_admin', 'accountant')
     and s.family_id is not null
     and s.status in ('active', 'pending_consent')
$$;
revoke all on function public.fee_family_children() from public;
grant execute on function public.fee_family_children() to app_user;

-- 3.
create table payment_links (
  link_id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(school_id),
  family_id uuid,
  student_id uuid not null,
  token text not null unique check (char_length(token) between 32 and 64),
  amount_minor bigint not null check (amount_minor > 0),
  status text not null default 'open' check (status in ('open', 'paid', 'cancelled', 'expired')),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  closed_at timestamptz,
  receipt_id uuid,
  unique (school_id, link_id),
  foreign key (school_id, family_id) references families(school_id, family_id),
  foreign key (school_id, student_id) references students(school_id, student_id),
  foreign key (school_id, receipt_id) references receipts(school_id, receipt_id),
  check ((status = 'open') = (closed_at is null)),
  check (status <> 'paid' or receipt_id is not null)
);
create unique index payment_links_one_open_per_family on payment_links (school_id, family_id) where status = 'open' and family_id is not null;
create unique index payment_links_one_open_per_lone_child on payment_links (school_id, student_id) where status = 'open' and family_id is null;
create table payment_link_lines (
  school_id uuid not null,
  link_id uuid not null,
  fee_id uuid not null,
  amount_minor bigint not null check (amount_minor > 0),
  primary key (link_id, fee_id),
  foreign key (school_id, link_id) references payment_links(school_id, link_id),
  foreign key (school_id, fee_id) references fees_ledger(school_id, fee_id)
);
revoke all on payment_links, payment_link_lines from public, anon, authenticated, service_role;
grant select, insert, update on payment_links to app_user;
grant select, insert on payment_link_lines to app_user;
alter table payment_links enable row level security;
alter table payment_links force row level security;
alter table payment_link_lines enable row level security;
alter table payment_link_lines force row level security;
create policy payment_links_tenant_isolation on payment_links using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy payment_links_finance on payment_links as restrictive
  for all using (current_setting('app.current_role', true) = any (array['accountant', 'school_admin', 'principal', 'super_admin']));
create policy payment_links_made_as_self on payment_links as restrictive
  for insert with check (created_by = nullif(current_setting('app.current_user_id', true), '')::uuid);
create policy payment_link_lines_tenant_isolation on payment_link_lines using (school_id = (current_setting('app.current_tenant_id', true))::uuid);
create policy payment_link_lines_finance on payment_link_lines as restrictive
  for all using (current_setting('app.current_role', true) = any (array['accountant', 'school_admin', 'principal', 'super_admin']));
