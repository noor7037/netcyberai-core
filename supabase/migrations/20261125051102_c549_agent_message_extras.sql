-- C549: what an agent reply carries besides its words, kept with it so the conversation shows it again: links to the
-- school app's own pages and files, the support ticket it raised, how many photos the person attached (never the photos).
alter table agent_messages add column extras jsonb not null default '{}' check (jsonb_typeof(extras) = 'object' and length(extras::text) <= 4000);
