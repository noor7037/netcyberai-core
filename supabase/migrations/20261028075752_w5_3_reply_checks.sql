-- W5-3 (C230-AS; Decision Log C390): the safety checks each reply took, written down so Control → AI → Quality Lab shows
-- them. Live English checks a reply sentence by sentence (3 to 9 checks), so the count per reply is a real cost the
-- supervisor will revisit with real numbers. One row per reply that was checked: the day, the profile that made the
-- reply (null when the caller does not name it) and the number of checks. Counts only: never a question, an answer,
-- a child or an account. Append-only, written only through control.record_reply_checks(), like the usage ledger.

create table control.ai_reply_checks (
  reply_id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  day date not null,
  reply_profile text check (reply_profile is null or reply_profile ~ '^[a-z][a-z0-9_.]{2,59}$'),
  checks integer not null check (checks between 1 and 1000)
);
create index idx_ai_reply_checks_day on control.ai_reply_checks (day, reply_profile);

alter table control.ai_reply_checks enable row level security;
alter table control.ai_reply_checks force row level security;
revoke all on control.ai_reply_checks from public, anon, authenticated, service_role, app_user, family_app, nca_super;
grant select on control.ai_reply_checks to nca_super;

create function control.record_reply_checks(p_day date, p_profile text, p_checks integer)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_checks is null or p_checks < 1 then return; end if;
  insert into control.ai_reply_checks (day, reply_profile, checks) values (p_day, p_profile, least(p_checks, 1000));
end $$;
revoke all on function control.record_reply_checks(date, text, integer) from public, anon, authenticated, service_role;
grant execute on function control.record_reply_checks(date, text, integer) to family_app, app_user, nca_super;
