-- Stage 1a (Pre-F Architecture Hardening): composite foreign keys for
-- cross-tenant relational integrity. Postgres FK checks bypass RLS --
-- confirmed live below with a real cross-tenant insert -- so today an
-- `attendance` row for School A can reference School B's student_id and
-- both the FK and RLS's tenant WITH CHECK accept it (RLS filters what a
-- role can SEE; it never validates that a REFERENCED row belongs to the
-- same tenant). Every child table that carries its own school_id and
-- also references a same-tenant parent gets its single-column FK
-- replaced with a composite (school_id, fk_col) -> parent(school_id, pk)
-- FK, so a cross-tenant reference is rejected at the database layer
-- itself, independent of RLS, independent of application code.
--
-- Deliberately EXCLUDED, with reasons (see PR/Decision Log for the full
-- writeup):
--   * memberships.user_id -> users(user_id): a user's memberships span
--     multiple schools by design (Decision Log C14); users.school_id is
--     only a nullable "home school" default, not a membership scope.  A
--     composite FK here would force every membership to match the
--     user's single home school, breaking multi-school membership.
--   * sessions.user_id / sessions.selected_school_id: sessions is not
--     tenant data and carries no RLS policy at all (src/lib/auth/db.ts's
--     own comment on withBackendConnection) -- there is no tenant
--     invariant here to enforce.
--   * audit_log.actor_user_id -> users(user_id): a platform-scoped
--     super_admin (users.school_id IS NULL) can legitimately write an
--     audit row against a real school_id. A composite FK would reject
--     that legitimate row.
--   * impersonation_sessions.actor_user_id -> users(user_id): same
--     reason -- the actor is a super_admin, platform-scoped.
--   * impersonation_sessions.target_user_id/target_school_id: UPGRADED
--     below to a composite FK against memberships(user_id, school_id)
--     instead of the generic users(school_id, user_id) pattern -- this
--     is the *actually correct* tenant relationship for impersonation
--     (which resolves to a real active membership row, not a user's
--     mutable home-school default; see impersonate/start's own comment).
--
-- Every other single-parent child of `schools` (system_config,
-- communication_log, subjects, parents, fee_heads, teachers, webhook_events,
-- users itself) has nothing else to cross-check against and is
-- unaffected.

-- ---------------------------------------------------------------------
-- 1. UNIQUE(school_id, pk) on every parent table referenced compositely
--    below -- required before a composite FK can target it.
-- ---------------------------------------------------------------------
alter table students add constraint students_school_id_student_id_key unique (school_id, student_id);
alter table classes add constraint classes_school_id_class_id_key unique (school_id, class_id);
alter table subjects add constraint subjects_school_id_subject_id_key unique (school_id, subject_id);
alter table teachers add constraint teachers_school_id_teacher_id_key unique (school_id, teacher_id);
alter table parents add constraint parents_school_id_parent_id_key unique (school_id, parent_id);
alter table exams add constraint exams_school_id_exam_id_key unique (school_id, exam_id);
alter table fee_heads add constraint fee_heads_school_id_head_id_key unique (school_id, head_id);
alter table fee_structures add constraint fee_structures_school_id_structure_id_key unique (school_id, structure_id);
alter table fees_ledger add constraint fees_ledger_school_id_fee_id_key unique (school_id, fee_id);
alter table captured_documents add constraint captured_documents_school_id_document_id_key unique (school_id, document_id);
alter table pulse_messages add constraint pulse_messages_school_id_pulse_id_key unique (school_id, pulse_id);
alter table student_qr_tokens add constraint student_qr_tokens_school_id_token_id_key unique (school_id, token_id);
-- school_id is nullable on users (super_admin has none, C35) -- fine:
-- Postgres treats each NULL as distinct in a unique constraint, so
-- multiple super_admin rows with school_id IS NULL never conflict.
alter table users add constraint users_school_id_user_id_key unique (school_id, user_id);

-- ---------------------------------------------------------------------
-- 2. Replace single-column FKs with composite (school_id, col) FKs.
-- ---------------------------------------------------------------------
alter table at_risk_flags drop constraint at_risk_flags_student_id_fkey,
  add constraint at_risk_flags_school_student_fkey foreign key (school_id, student_id) references students(school_id, student_id);

alter table attendance drop constraint attendance_class_id_fkey,
  add constraint attendance_school_class_fkey foreign key (school_id, class_id) references classes(school_id, class_id);
alter table attendance drop constraint attendance_marked_by_fkey,
  add constraint attendance_school_marked_by_fkey foreign key (school_id, marked_by) references users(school_id, user_id);
alter table attendance drop constraint attendance_student_id_fkey,
  add constraint attendance_school_student_fkey foreign key (school_id, student_id) references students(school_id, student_id);

alter table captured_documents drop constraint captured_documents_staff_id_fkey,
  add constraint captured_documents_school_staff_fkey foreign key (school_id, staff_id) references users(school_id, user_id);
alter table captured_documents drop constraint captured_documents_student_id_fkey,
  add constraint captured_documents_school_student_fkey foreign key (school_id, student_id) references students(school_id, student_id);
alter table captured_documents drop constraint captured_documents_uploaded_by_fkey,
  add constraint captured_documents_school_uploaded_by_fkey foreign key (school_id, uploaded_by) references users(school_id, user_id);
alter table captured_documents drop constraint captured_documents_verified_by_fkey,
  add constraint captured_documents_school_verified_by_fkey foreign key (school_id, verified_by) references users(school_id, user_id);

alter table certificate_requests drop constraint certificate_requests_student_id_fkey,
  add constraint certificate_requests_school_student_fkey foreign key (school_id, student_id) references students(school_id, student_id);

alter table classes drop constraint classes_class_teacher_id_fkey,
  add constraint classes_school_class_teacher_fkey foreign key (school_id, class_teacher_id) references users(school_id, user_id);

alter table compliance_config drop constraint compliance_config_muted_by_fkey,
  add constraint compliance_config_school_muted_by_fkey foreign key (school_id, muted_by) references users(school_id, user_id);

alter table consent_ledger drop constraint consent_ledger_actor_user_id_fkey,
  add constraint consent_ledger_school_actor_fkey foreign key (school_id, actor_user_id) references users(school_id, user_id);
alter table consent_ledger drop constraint consent_ledger_student_id_fkey,
  add constraint consent_ledger_school_student_fkey foreign key (school_id, student_id) references students(school_id, student_id);

alter table fee_concessions drop constraint fee_concessions_approved_by_fkey,
  add constraint fee_concessions_school_approved_by_fkey foreign key (school_id, approved_by) references users(school_id, user_id);
alter table fee_concessions drop constraint fee_concessions_head_id_fkey,
  add constraint fee_concessions_school_head_fkey foreign key (school_id, head_id) references fee_heads(school_id, head_id);
alter table fee_concessions drop constraint fee_concessions_student_id_fkey,
  add constraint fee_concessions_school_student_fkey foreign key (school_id, student_id) references students(school_id, student_id);

alter table fee_structure_items drop constraint fee_structure_items_head_id_fkey,
  add constraint fee_structure_items_school_head_fkey foreign key (school_id, head_id) references fee_heads(school_id, head_id);
alter table fee_structure_items drop constraint fee_structure_items_structure_id_fkey,
  add constraint fee_structure_items_school_structure_fkey foreign key (school_id, structure_id) references fee_structures(school_id, structure_id);

alter table fee_structures drop constraint fee_structures_class_id_fkey,
  add constraint fee_structures_school_class_fkey foreign key (school_id, class_id) references classes(school_id, class_id);
alter table fee_structures drop constraint fee_structures_created_by_fkey,
  add constraint fee_structures_school_created_by_fkey foreign key (school_id, created_by) references users(school_id, user_id);

alter table fees_ledger drop constraint fees_ledger_student_id_fkey,
  add constraint fees_ledger_school_student_fkey foreign key (school_id, student_id) references students(school_id, student_id);

alter table marks drop constraint marks_exam_id_fkey,
  add constraint marks_school_exam_fkey foreign key (school_id, exam_id) references exams(school_id, exam_id);
alter table marks drop constraint marks_student_id_fkey,
  add constraint marks_school_student_fkey foreign key (school_id, student_id) references students(school_id, student_id);
alter table marks drop constraint marks_subject_id_fkey,
  add constraint marks_school_subject_fkey foreign key (school_id, subject_id) references subjects(school_id, subject_id);

alter table ocr_extractions drop constraint ocr_extractions_document_id_fkey,
  add constraint ocr_extractions_school_document_fkey foreign key (school_id, document_id) references captured_documents(school_id, document_id);
alter table ocr_extractions drop constraint ocr_extractions_reviewed_by_fkey,
  add constraint ocr_extractions_school_reviewed_by_fkey foreign key (school_id, reviewed_by) references users(school_id, user_id);

alter table parent_feedback drop constraint parent_feedback_parent_id_fkey,
  add constraint parent_feedback_school_parent_fkey foreign key (school_id, parent_id) references parents(school_id, parent_id);
alter table parent_feedback drop constraint parent_feedback_teacher_id_fkey,
  add constraint parent_feedback_school_teacher_fkey foreign key (school_id, teacher_id) references teachers(school_id, teacher_id);

alter table parent_student_map drop constraint parent_student_map_parent_id_fkey,
  add constraint parent_student_map_school_parent_fkey foreign key (school_id, parent_id) references parents(school_id, parent_id);
alter table parent_student_map drop constraint parent_student_map_student_id_fkey,
  add constraint parent_student_map_school_student_fkey foreign key (school_id, student_id) references students(school_id, student_id);

alter table payments drop constraint payments_fee_id_fkey,
  add constraint payments_school_fee_fkey foreign key (school_id, fee_id) references fees_ledger(school_id, fee_id);
alter table payments drop constraint payments_received_by_fkey,
  add constraint payments_school_received_by_fkey foreign key (school_id, received_by) references users(school_id, user_id);

alter table pulse_messages drop constraint pulse_messages_class_id_fkey,
  add constraint pulse_messages_school_class_fkey foreign key (school_id, class_id) references classes(school_id, class_id);
alter table pulse_messages drop constraint pulse_messages_subject_id_fkey,
  add constraint pulse_messages_school_subject_fkey foreign key (school_id, subject_id) references subjects(school_id, subject_id);

alter table pulse_response_log drop constraint pulse_response_log_parent_id_fkey,
  add constraint pulse_response_log_school_parent_fkey foreign key (school_id, parent_id) references parents(school_id, parent_id);
alter table pulse_response_log drop constraint pulse_response_log_pulse_id_fkey,
  add constraint pulse_response_log_school_pulse_fkey foreign key (school_id, pulse_id) references pulse_messages(school_id, pulse_id);
alter table pulse_response_log drop constraint pulse_response_log_student_id_fkey,
  add constraint pulse_response_log_school_student_fkey foreign key (school_id, student_id) references students(school_id, student_id);

alter table qr_scan_log drop constraint qr_scan_log_scanned_by_fkey,
  add constraint qr_scan_log_school_scanned_by_fkey foreign key (school_id, scanned_by) references users(school_id, user_id);
alter table qr_scan_log drop constraint qr_scan_log_student_id_fkey,
  add constraint qr_scan_log_school_student_fkey foreign key (school_id, student_id) references students(school_id, student_id);
alter table qr_scan_log drop constraint qr_scan_log_token_id_fkey,
  add constraint qr_scan_log_school_token_fkey foreign key (school_id, token_id) references student_qr_tokens(school_id, token_id);

alter table recognition_events drop constraint recognition_events_student_id_fkey,
  add constraint recognition_events_school_student_fkey foreign key (school_id, student_id) references students(school_id, student_id);

alter table student_qr_tokens drop constraint student_qr_tokens_revoked_by_fkey,
  add constraint student_qr_tokens_school_revoked_by_fkey foreign key (school_id, revoked_by) references users(school_id, user_id);
alter table student_qr_tokens drop constraint student_qr_tokens_student_id_fkey,
  add constraint student_qr_tokens_school_student_fkey foreign key (school_id, student_id) references students(school_id, student_id);

alter table students drop constraint students_class_id_fkey,
  add constraint students_school_class_fkey foreign key (school_id, class_id) references classes(school_id, class_id);

alter table syllabus_progress drop constraint syllabus_progress_class_id_fkey,
  add constraint syllabus_progress_school_class_fkey foreign key (school_id, class_id) references classes(school_id, class_id);
alter table syllabus_progress drop constraint syllabus_progress_subject_id_fkey,
  add constraint syllabus_progress_school_subject_fkey foreign key (school_id, subject_id) references subjects(school_id, subject_id);
alter table syllabus_progress drop constraint syllabus_progress_teacher_id_fkey,
  add constraint syllabus_progress_school_teacher_fkey foreign key (school_id, teacher_id) references teachers(school_id, teacher_id);

alter table teacher_impact_metrics drop constraint teacher_impact_metrics_teacher_id_fkey,
  add constraint teacher_impact_metrics_school_teacher_fkey foreign key (school_id, teacher_id) references teachers(school_id, teacher_id);

alter table teacher_subjects drop constraint teacher_subjects_class_id_fkey,
  add constraint teacher_subjects_school_class_fkey foreign key (school_id, class_id) references classes(school_id, class_id);
alter table teacher_subjects drop constraint teacher_subjects_subject_id_fkey,
  add constraint teacher_subjects_school_subject_fkey foreign key (school_id, subject_id) references subjects(school_id, subject_id);
alter table teacher_subjects drop constraint teacher_subjects_teacher_id_fkey,
  add constraint teacher_subjects_school_teacher_fkey foreign key (school_id, teacher_id) references teachers(school_id, teacher_id);

alter table teachers drop constraint teachers_user_id_fkey,
  add constraint teachers_school_user_fkey foreign key (school_id, user_id) references users(school_id, user_id);

-- ---------------------------------------------------------------------
-- 3. impersonation_sessions: composite FK against the real tenant
--    relationship (an active-or-not MEMBERSHIP), not the generic
--    users(school_id, user_id) pattern -- more correct than this
--    migration's own general rule, because a target's real school scope
--    is the membership row impersonate/start already resolves through
--    (src/app/api/control/impersonate/start/route.ts), never the
--    target's mutable "home school" default.
-- ---------------------------------------------------------------------
alter table impersonation_sessions drop constraint impersonation_sessions_target_user_id_fkey,
  add constraint impersonation_sessions_target_membership_fkey
    foreign key (target_user_id, target_school_id) references memberships(user_id, school_id);
