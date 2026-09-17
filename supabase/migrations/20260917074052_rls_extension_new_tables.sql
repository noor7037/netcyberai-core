-- =====================================================================
-- Prompt B step 2 — extend the same tenant-isolation pattern to every
-- table added in Prompt A (migrations 2-5, 7, 8). ENABLE + FORCE RLS
-- on each, same generic policy shape as db/rls_policies.sql's own
-- do-loop. memberships already got its own (necessarily different)
-- policy in migration 7, so it is not in this list.
-- =====================================================================

do $$
declare t text;
begin
  for t in
    select unnest(array[
      'fee_heads','fee_structures','fee_structure_items','fee_concessions','payments',
      'compliance_config','at_risk_flags','pulse_messages','pulse_response_log',
      'student_qr_tokens','qr_scan_log','captured_documents','ocr_extractions',
      'webhook_events'
    ])
  loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format(
      'create policy %I_tenant_isolation on %I using (school_id = current_setting(''app.current_tenant_id'', true)::uuid)',
      t, t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 05_BUSINESS_LOGIC.md §2: "Accountant role may read and write fee
-- tables but has no academic write access -- add the corresponding
-- policies when the migration lands." Tenant isolation above already
-- covers scoping; this adds the write-side role restriction: only
-- accounting-capable staff roles may insert/update/delete the financial
-- tables. Reads stay governed by tenant isolation alone (a teacher or
-- principal can still see fee status; parents keep their existing
-- parent_scope_fees policy on fees_ledger itself, unchanged).
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  for t in
    select unnest(array[
      'fee_heads','fee_structures','fee_structure_items','fee_concessions','payments'
    ])
  loop
    execute format(
      'create policy %I_accounting_write on %I for insert with check (current_setting(''app.current_role'', true) in (''accountant'',''school_admin'',''principal'',''super_admin''))',
      t, t
    );
    execute format(
      'create policy %I_accounting_update on %I for update using (current_setting(''app.current_role'', true) in (''accountant'',''school_admin'',''principal'',''super_admin''))',
      t, t
    );
    execute format(
      'create policy %I_accounting_delete on %I for delete using (current_setting(''app.current_role'', true) in (''accountant'',''school_admin'',''principal'',''super_admin''))',
      t, t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- message_rate_table: platform-level, no school_id (migration 5's own
-- comment explains why). Every school's app needs to read current
-- rates for the cost governor; nobody but nca_super (which bypasses
-- RLS entirely) should ever write a rate row.
-- ---------------------------------------------------------------------
alter table message_rate_table enable row level security;
alter table message_rate_table force row level security;

create policy message_rate_table_read_all on message_rate_table
  for select using (true);
