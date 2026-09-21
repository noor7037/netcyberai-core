-- Prompt F Task 2: CSV import idempotency + audit trail.
--
-- File-hash idempotency, enforced at the database layer, not just the
-- app layer: a unique (school_id, file_hash) constraint means a second
-- upload of the byte-identical file can never insert a second row here
-- even under a retried/duplicate request racing itself, the same
-- discipline the fee-webhook idempotency pattern (05_BUSINESS_LOGIC.md
-- Sec3.3, payload_hash) already uses. The import route checks this
-- table BEFORE running Phase 2's inserts and returns the prior result
-- unchanged on a repeat -- this row is what makes that possible.
create table csv_imports (
  import_id     uuid primary key default gen_random_uuid(),
  school_id     uuid not null references schools(school_id),
  file_hash     text not null,          -- sha256 of the raw uploaded file
  file_name     text not null,
  imported_by   uuid not null references users(user_id),
  row_count     int not null,
  imported_count int not null,
  skipped_count int not null,
  errors        jsonb not null default '[]'::jsonb,  -- per-row error report
  created_at    timestamptz not null default now()
);
create unique index idx_csv_imports_school_hash on csv_imports(school_id, file_hash);
create index idx_csv_imports_school_time on csv_imports(school_id, created_at desc);

alter table csv_imports add constraint csv_imports_school_imported_by_fkey
  foreign key (school_id, imported_by) references users(school_id, user_id);

alter table csv_imports enable row level security;
alter table csv_imports force row level security;
create policy csv_imports_tenant_isolation on csv_imports
  using (school_id = current_setting('app.current_tenant_id', true)::uuid);
