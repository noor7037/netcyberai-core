-- P4 slice 7h (C189): Daily Pulse is sent, and parents' answers are counted.
--
-- 1. A Pulse message records who sent it and when. "Sent" means a person
--    pressed send on words a person had marked ready: never a machine.
-- 2. A parent's answer ("understood" / "needs help") is recorded once per
--    message they wrote.
alter table pulse_messages add column sent_by uuid;
alter table pulse_messages add column sent_at timestamptz;
alter table pulse_messages add constraint pulse_messages_sent_says_who check ((status = 'sent') = (sent_at is not null) and (sent_at is null) = (sent_by is null));
create unique index pulse_response_log_one_per_message on pulse_response_log (provider_message_id) where provider_message_id is not null;
