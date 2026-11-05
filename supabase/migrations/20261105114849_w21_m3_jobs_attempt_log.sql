-- W21-M3 (1): every try of a failed job is kept on its row: { attempt, at, kind, note } (the kind of failure the provider
-- gave, never its words). The email job's tries; the WhatsApp message keeps its own on communication_log (next migration).
alter table jobs add column attempt_log jsonb not null default '[]'::jsonb check (jsonb_typeof(attempt_log) = 'array');
