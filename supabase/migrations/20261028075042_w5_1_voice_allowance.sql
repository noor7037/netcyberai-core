-- W5-1 (C230-AS; Decision Log C388): a daily voice allowance per family, in characters. The server voice's lines
-- (family.text_to_speech) meter against it, not against the family's daily AI requests, so reading a chapter aloud
-- does not use up the tutor. The count sits beside the requests on the family's own day row (own account only, the
-- policies of family.ai_daily); the limit is Control's setting, read live.

alter table family.ai_daily add column voice_chars integer not null default 0 check (voice_chars >= 0);

insert into control.settings (key, value) values ('family.voice.daily_characters', '20000'::jsonb)
on conflict (key) do nothing;
