-- P2 5f (C151): the Pulse draft's words, in three languages.
--
-- body_hinglish is already there; English and Hindi join it. `edited` says a
-- person changed the words, so a homework set later does not write over them.
alter table pulse_messages add column body_en text not null default '';
alter table pulse_messages add column body_hi text not null default '';
alter table pulse_messages add column edited boolean not null default false;
-- A message is ready only with words in all three languages.
alter table pulse_messages add constraint pulse_messages_ready_has_words
  check (status = 'draft' or (char_length(btrim(body_en)) > 0 and char_length(btrim(body_hi)) > 0 and char_length(btrim(body_hinglish)) > 0));
