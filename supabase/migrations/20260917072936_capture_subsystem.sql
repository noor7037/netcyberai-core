-- =====================================================================
-- Migration 4 (Prompt A) — Capture subsystem (scanner, OCR, QR)
-- Source: docs/04_SYSTEM_DESIGN_PRD.md §6.4, verbatim.
-- =====================================================================

create table student_qr_tokens (
  token_id     uuid primary key default gen_random_uuid(),
  school_id    uuid not null references schools(school_id),
  student_id   uuid not null references students(student_id),
  token        text not null unique,          -- 128-bit random, opaque
  issued_at    timestamptz not null default now(),
  revoked_at   timestamptz,
  revoked_by   uuid references users(user_id),
  revoke_reason text
);
create index idx_qr_school_student on student_qr_tokens(school_id, student_id);
create unique index idx_qr_active on student_qr_tokens(token) where revoked_at is null;

create table qr_scan_log (
  scan_id      uuid primary key default gen_random_uuid(),
  school_id    uuid not null references schools(school_id),
  token_id     uuid references student_qr_tokens(token_id),
  student_id   uuid references students(student_id),
  scanned_by   uuid not null references users(user_id),
  purpose      text not null check (purpose in
                 ('lookup','gate_entry','exam_verify','event_checkin','library','lab')),
  result       text not null check (result in
                 ('resolved','revoked_token','unknown_token','unauthorized','cross_tenant_denied')),
  device_hint  text,
  scanned_at   timestamptz not null default now()
);
create index idx_scan_school_time on qr_scan_log(school_id, scanned_at desc);
create index idx_scan_student on qr_scan_log(school_id, student_id, scanned_at desc);

create table captured_documents (
  document_id   uuid primary key default gen_random_uuid(),
  school_id     uuid not null references schools(school_id),
  student_id    uuid references students(student_id),
  staff_id      uuid references users(user_id),
  doc_type      text not null,
  storage_path  text not null,
  mime_type     text not null,
  size_bytes    bigint not null,
  ocr_status    text not null default 'pending'
                  check (ocr_status in ('pending','processing','done','failed','skipped')),
  ocr_confidence numeric,
  uploaded_by   uuid not null references users(user_id),
  uploaded_at   timestamptz not null default now(),
  verified_by   uuid references users(user_id),
  verified_at   timestamptz,
  retention_until date
);
create index idx_docs_school_student on captured_documents(school_id, student_id);

create table ocr_extractions (
  extraction_id uuid primary key default gen_random_uuid(),
  school_id     uuid not null references schools(school_id),
  document_id   uuid not null references captured_documents(document_id),
  field_name    text not null,
  extracted_value text,
  confidence    numeric,
  accepted      boolean,                      -- did the human keep it?
  corrected_value text,                        -- what they changed it to
  reviewed_by   uuid references users(user_id),
  reviewed_at   timestamptz
);
create index idx_ocr_school_doc on ocr_extractions(school_id, document_id);

-- Attendance gains a capture-method discriminator.
alter table attendance
  add column capture_method text not null default 'manual'
    check (capture_method in ('manual','qr_gate','qr_exam','qr_event','import'));
