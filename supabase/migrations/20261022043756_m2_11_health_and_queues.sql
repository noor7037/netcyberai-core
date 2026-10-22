-- Control → Apps health and usage (M2-11, Decision Log C285) and the content review queues (M2-12, C286).
--
-- family.m2_counts(): the M2 numbers Control shows, counts only (no child, no account, no text), through a definer
-- function the platform role may call, like family.control_counts() (M1-7).
--
-- content.responses.asks: how many times a cached response was served, so the review queue puts the most-asked first
-- (11 L1 "responses for frequently asked topics are queued for review"). Families add one through a definer function
-- that touches that column only; they never update a response.
--
-- control: the alert thresholds (10 §6), and the content.syllabus_extract profile for the catalog import from a PDF
-- (03 §9). It reads a board's public syllabus document, never a child's words.

create function family.m2_counts()
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'plans_built_7d', (select count(*) from family.plan_days where day > (now() at time zone 'Asia/Kolkata')::date - 7),
    'plans_done_7d', (select count(*) from family.plan_days where day > (now() at time zone 'Asia/Kolkata')::date - 7 and completed_at is not null),
    'children_plan_done_7d', (select count(distinct child_id) from family.plan_days where day > (now() at time zone 'Asia/Kolkata')::date - 7 and completed_at is not null),
    'revisits_due', (select count(*) from family.revisits where done_on is null and due_on <= (now() at time zone 'Asia/Kolkata')::date),
    'revisits_done_7d', (select count(*) from family.revisits where done_on > (now() at time zone 'Asia/Kolkata')::date - 7),
    'photo_questions_today', (select coalesce(sum(photo_questions), 0) from family.day_counts where day = (now() at time zone 'Asia/Kolkata')::date),
    'photo_questions_7d', (select coalesce(sum(photo_questions), 0) from family.day_counts where day > (now() at time zone 'Asia/Kolkata')::date - 7),
    'voice_seconds_7d', (select coalesce(sum(voice_seconds), 0) from family.day_counts where day > (now() at time zone 'Asia/Kolkata')::date - 7),
    'jars_open', (select count(*) from family.reward_jars where given_on is null),
    'jars_given_7d', (select count(*) from family.reward_jars where given_on > (now() at time zone 'Asia/Kolkata')::date - 7)
  )
$$;
revoke all on function family.m2_counts() from public;
grant execute on function family.m2_counts() to nca_super;

alter table content.responses add column asks integer not null default 0 check (asks >= 0);

create function content.count_response_ask(p_response_id uuid)
returns void
language sql security definer set search_path = '' as $$
  update content.responses set asks = asks + 1 where response_id = p_response_id and status <> 'withdrawn'
$$;
revoke all on function content.count_response_ask(uuid) from public;
grant execute on function content.count_response_ask(uuid) to family_app;

insert into control.settings (key, value) values
  ('control.alert.ai_failure_share', '0.2'::jsonb),
  ('control.alert.ai_min_requests', '10'::jsonb),
  ('control.alert.video_quota_share', '0.8'::jsonb),
  ('control.alert.queue_days', '7'::jsonb)
on conflict (key) do nothing;

insert into control.ai_profiles (profile_id, provider_id, model, carries_child_words) values
  ('content.syllabus_extract', null, null, false)
on conflict (profile_id) do nothing;
