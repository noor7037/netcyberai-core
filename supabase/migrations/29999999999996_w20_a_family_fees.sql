-- W20-A (H1, docs/42): fees in the Family app. A linked guardian reads, read only, what the school's own fee records say
-- about their own children: the dues with their concession (fees_ledger, already open to a parent), what was paid on
-- each (payments), the fee names (fee_heads), the receipts that paid them (receipts) and the reminders the office's
-- nightly run sent (fee_reminders), so the Family app's feed can say a reminder went out. As the School Link reads
-- before (school_link_homework.sql, school_link_notices_events.sql): the guardian's own active children with the
-- school's consent come from guardian_student_ids() (reused); each table's two parent refusals (no_parent, and the
-- finance-only rule) let those rows be READ; every write check stays as it was, written out word for word; a new
-- restrictive rule per table refuses a parent's update and delete outright.
--
-- And one link origin: the Family app may make the family's payment link for what it owes, as the nightly reminder
-- already does, with no person named and only as the platform role (C180's rule, unchanged in kind). The parent's
-- claim (the UTR) is the school's existing direct-UPI path (payment_reports, C174); nothing is credited until the
-- school finds the money in its own bank.

-- 1. Payments: only those put against a due of one of the guardian's own children.
alter policy payments_no_parent on public.payments
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent'
         or exists (select 1 from public.fees_ledger l
                     where l.school_id = payments.school_id and l.fee_id = payments.fee_id
                       and l.student_id = any ((select public.guardian_student_ids())::uuid[])))
  with check (coalesce(current_setting('app.current_role', true), '') <> 'parent');
alter policy payments_finance_read on public.payments
  using (current_setting('app.current_role', true) = any (array['accountant', 'school_admin', 'principal', 'super_admin'])
         or (current_setting('app.current_role', true) = 'parent'
             and exists (select 1 from public.fees_ledger l
                          where l.school_id = payments.school_id and l.fee_id = payments.fee_id
                            and l.student_id = any ((select public.guardian_student_ids())::uuid[]))));

-- 2. Fee names: the school's heads, for a guardian with a child at the school (names only; amounts live on the dues).
alter policy fee_heads_no_parent on public.fee_heads
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent'
         or cardinality((select public.guardian_student_ids())::uuid[]) > 0)
  with check (coalesce(current_setting('app.current_role', true), '') <> 'parent');
alter policy fee_heads_finance_read on public.fee_heads
  using (current_setting('app.current_role', true) = any (array['accountant', 'school_admin', 'principal', 'super_admin'])
         or (current_setting('app.current_role', true) = 'parent' and cardinality((select public.guardian_student_ids())::uuid[]) > 0));

-- 3. Receipts: one made for one of the guardian's own children, or holding a payment the guardian may read (above).
alter policy receipts_no_parent on public.receipts
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent'
         or student_id = any ((select public.guardian_student_ids())::uuid[])
         or exists (select 1 from public.payments p where p.school_id = receipts.school_id and p.receipt_id = receipts.receipt_id))
  with check (coalesce(current_setting('app.current_role', true), '') <> 'parent');
alter policy receipts_finance on public.receipts
  using (current_setting('app.current_role', true) = any (array['accountant', 'school_admin', 'principal', 'super_admin'])
         or (current_setting('app.current_role', true) = 'parent'
             and (student_id = any ((select public.guardian_student_ids())::uuid[])
                  or exists (select 1 from public.payments p where p.school_id = receipts.school_id and p.receipt_id = receipts.receipt_id))))
  with check (current_setting('app.current_role', true) = any (array['accountant', 'school_admin', 'principal', 'super_admin']));

-- 4. Reminders: those of a due of one of the guardian's own children.
alter policy fee_reminders_no_parent on public.fee_reminders
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent'
         or exists (select 1 from public.fees_ledger l
                     where l.school_id = fee_reminders.school_id and l.fee_id = fee_reminders.fee_id
                       and l.student_id = any ((select public.guardian_student_ids())::uuid[])))
  with check (coalesce(current_setting('app.current_role', true), '') <> 'parent');
alter policy fee_reminders_finance on public.fee_reminders
  using (current_setting('app.current_role', true) = any (array['accountant', 'school_admin', 'principal', 'super_admin'])
         or (current_setting('app.current_role', true) = 'parent'
             and exists (select 1 from public.fees_ledger l
                          where l.school_id = fee_reminders.school_id and l.fee_id = fee_reminders.fee_id
                            and l.student_id = any ((select public.guardian_student_ids())::uuid[]))))
  with check (current_setting('app.current_role', true) = any (array['accountant', 'school_admin', 'principal', 'super_admin']));

-- 5. A parent never writes any of these.
create policy payments_parent_no_update on public.payments as restrictive for update
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent');
create policy payments_parent_no_delete on public.payments as restrictive for delete
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent');
create policy fee_heads_parent_no_update on public.fee_heads as restrictive for update
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent');
create policy fee_heads_parent_no_delete on public.fee_heads as restrictive for delete
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent');
create policy receipts_parent_no_update on public.receipts as restrictive for update
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent');
create policy receipts_parent_no_delete on public.receipts as restrictive for delete
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent');
create policy fee_reminders_parent_no_update on public.fee_reminders as restrictive for update
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent');
create policy fee_reminders_parent_no_delete on public.fee_reminders as restrictive for delete
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent');

-- 6. The Family app's payment link: made by no person, only as the platform role, like the nightly reminder's.
alter table public.payment_links drop constraint payment_links_origin_check;
alter table public.payment_links add constraint payment_links_origin_check check (origin in ('person', 'reminder_job', 'family_app'));

create or replace function public.payment_links_origin() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    if new.origin in ('reminder_job', 'family_app') and current_user <> 'nca_super' then
      raise exception 'only the nightly reminder or the Family app makes a payment link without a person' using errcode = 'check_violation';
    end if;
    return new;
  end if;
  if new.origin is distinct from old.origin or new.created_by is distinct from old.created_by then
    raise exception 'who made a payment link never changes' using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke all on function public.payment_links_origin() from public;
