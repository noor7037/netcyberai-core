-- W6-E (C230-AU; Decision Log C399): one-screen school provisioning in Control.
--
-- The students list a founder pastes while provisioning a school is imported by the school's own importer
-- (src/lib/import/run-import.ts), which records the file in csv_imports so the same file is never imported twice,
-- from Control or later by the school. A Control import has no account of that school to name: the founder belongs to
-- no school, and the principal's account is made by the invite job after this transaction. imported_by is null for
-- such an import (the audit row 'school.provisioned' names the founder). The composite foreign key (school_id,
-- imported_by) → users stays, and holds for every row that names someone. Nothing else changes: no grant, no policy.

alter table csv_imports alter column imported_by drop not null;
comment on column csv_imports.imported_by is 'The school account that imported the file; null for a file imported by NetCyberAI from Control while provisioning the school (C399).';