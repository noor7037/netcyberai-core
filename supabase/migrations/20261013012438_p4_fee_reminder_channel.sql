-- P4 slice 7g (C188): a fee reminder says which way it went.
--
-- A family is reminded once a day on ONE channel: WhatsApp where a message would really reach a phone and the
-- gate lets it through, otherwise email. The row that records the reminder now says which. Rows written before
-- this were all email; they are left as they are (empty), and nothing is guessed backwards.
alter table fee_reminders add column channel text check (channel is null or channel in ('email', 'whatsapp'));
alter table fee_reminders add constraint fee_reminders_sent_says_how check (outcome <> 'held' or channel is null);
