-- P3 6a (C157): fee heads and structures, as the office edits them.
--
--   1. A structure belongs to a session (not only a year's label), and a
--      class has at most one version of it from any one date.
--   2. A fee rule is never overwritten (E4): the app can add a head, retire
--      one, and add a new version of a structure. It cannot change or
--      delete a structure or its items.
--   3. A teacher reads no fee rule. Only the principal, the school admin
--      and the accountant do.
--   4. Fees becomes partly live and is switched on for every existing
--      school (C149 rule).

-- 1.
alter table fee_structures add column session_id uuid;
update fee_structures f set session_id = a.session_id
  from academic_sessions a where a.school_id = f.school_id and a.label = f.academic_year and f.session_id is null;
alter table academic_sessions add constraint academic_sessions_school_id_session_id_key unique (school_id, session_id);
alter table fee_structures add constraint fee_structures_school_session_fkey
  foreign key (school_id, session_id) references academic_sessions(school_id, session_id);
alter table fee_structures add constraint fee_structures_one_version_per_date
  unique (school_id, class_id, academic_year, effective_from);
alter table fee_structure_items add constraint fee_structure_items_one_per_head unique (structure_id, head_id);
alter table fee_structure_items add constraint fee_structure_items_amount_not_negative check (amount_minor >= 0);

alter table fee_heads add column is_active boolean not null default true;
create unique index fee_heads_one_name_per_school on fee_heads (school_id, lower(btrim(name)));
alter table fee_heads add constraint fee_heads_name_length check (char_length(btrim(name)) between 1 and 60);

-- 2.
revoke update, delete on fee_structures, fee_structure_items from app_user;
revoke delete on fee_heads from app_user;

-- 3.
create policy fee_heads_finance_read on fee_heads as restrictive
  for select using (current_setting('app.current_role', true) = any (array['accountant', 'school_admin', 'principal', 'super_admin']));
create policy fee_structures_finance_read on fee_structures as restrictive
  for select using (current_setting('app.current_role', true) = any (array['accountant', 'school_admin', 'principal', 'super_admin']));
create policy fee_structure_items_finance_read on fee_structure_items as restrictive
  for select using (current_setting('app.current_role', true) = any (array['accountant', 'school_admin', 'principal', 'super_admin']));

-- 4.
insert into school_module_entitlements (school_id, module_id, enabled, source)
select s.school_id, 'fees', true, 'plan' from schools s
on conflict (school_id, module_id) do nothing;
