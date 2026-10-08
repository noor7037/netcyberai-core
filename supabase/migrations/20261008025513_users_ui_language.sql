-- C134 (P1c-3b): the language a person chose for the app, remembered on
-- their own account so it follows them to another device (docs/19 rule 3).
-- Null means "never chosen": the app shows English. Additive and nullable:
-- nothing that exists reads or writes it, so code deployed before or after
-- this migration keeps working.
--
-- Written only by the account service for the signed-in user's own row
-- (src/lib/auth/db.ts setOwnLanguage), like the mobile number. No new
-- grant and no policy change.

alter table users add column if not exists ui_language text;

alter table users drop constraint if exists users_ui_language_known;
alter table users add constraint users_ui_language_known check (ui_language is null or ui_language in ('en', 'hi'));

comment on column users.ui_language is 'App language chosen by this person: en or hi; null = never chosen (English).';
