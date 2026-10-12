-- P4 slice 7a (C182): the message log learns who a message was for, why, and which provider carried it.
--
-- Until now communication_log held a phone number and a template. To show a
-- school each message's state by family, to thread a reply, and to tell a
-- stand-in "send" from a real one, a row also says: the student it was
-- about, the guardian it went to, the consent purpose it was sent under,
-- and the provider. delivered_at / failed_at / failure_code are filled by
-- the delivery notices of slice 7b. All are empty for rows written before
-- this (the seeded rows of the test schools among them): nothing is guessed
-- backwards.
alter table communication_log add column student_id uuid;
alter table communication_log add column parent_id uuid;
alter table communication_log add column purpose text check (purpose is null or purpose in ('core_records', 'operational_communication', 'daily_pulse', 'recognition', 'weekly_brief', 'at_risk'));
alter table communication_log add column provider text check (provider is null or provider in ('stand-in', 'meta'));
alter table communication_log add column delivered_at timestamptz;
alter table communication_log add column failed_at timestamptz;
alter table communication_log add column failure_code text check (failure_code is null or char_length(failure_code) between 1 and 60);
alter table communication_log add constraint communication_log_school_student_fkey foreign key (school_id, student_id) references students(school_id, student_id);
alter table communication_log add constraint communication_log_school_parent_fkey foreign key (school_id, parent_id) references parents(school_id, parent_id);
-- The stand-in reaches no phone: what it "sent" is never billable.
alter table communication_log add constraint communication_log_stand_in_is_free check (provider is distinct from 'stand-in' or (billable = false and est_cost_paise = 0 and gst_paise = 0));
create index idx_communication_log_student on communication_log (school_id, student_id, created_at desc) where student_id is not null;
create index idx_communication_log_provider_message on communication_log (provider_message_id) where provider_message_id is not null;
