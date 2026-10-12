-- P4 slice 7c (C184): templates with versions and two approvals.
--
-- A template is its exact words. Until now a row was a name and one
-- "approved" flag. Now each row is one VERSION of a template in one
-- LANGUAGE: its body, the variables it needs, how long it stays worth
-- sending, our own approval (status, by whom, when) and, separately, Meta's
-- (its id for the template and its decision). Words never change once
-- written: new words are a new version, and the old one stays.
--
-- Because one platform number serves every school, EVERY template's first
-- line names the school: the body must begin "{{school}}: ". Held here,
-- whoever writes the row.
--
-- The message log records which version and language went out, and with
-- which values, so what a parent was told can always be shown again.

alter table whatsapp_templates add column version int not null default 1 check (version >= 1);
alter table whatsapp_templates add column language text not null default 'en' check (language in ('en', 'hi'));
alter table whatsapp_templates add column body text check (body is null or char_length(body) between 12 and 1024);
alter table whatsapp_templates add column variables text[] not null default '{}';
alter table whatsapp_templates add column stale_after_minutes int check (stale_after_minutes is null or stale_after_minutes between 1 and 10080);
alter table whatsapp_templates add column approved_by uuid;
alter table whatsapp_templates add column approved_at timestamptz;
alter table whatsapp_templates add column meta_template_id text check (meta_template_id is null or char_length(meta_template_id) between 1 and 100);
alter table whatsapp_templates add column meta_status text not null default 'not_submitted' check (meta_status in ('not_submitted', 'pending', 'approved', 'rejected', 'paused'));
alter table whatsapp_templates add column meta_decided_at timestamptz;
alter table whatsapp_templates add constraint whatsapp_templates_first_line_names_school check (body is null or (body like '{{school}}: %' and 'school' = any (variables)));

drop index idx_whatsapp_templates_platform_default;
drop index idx_whatsapp_templates_school;
create unique index idx_whatsapp_templates_platform_default on whatsapp_templates (template_name, language, version) where school_id is null;
create unique index idx_whatsapp_templates_school on whatsapp_templates (school_id, template_name, language, version) where school_id is not null;

create function public.whatsapp_templates_words_fixed() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if (new.template_name, new.language, new.version) is distinct from (old.template_name, old.language, old.version) or new.school_id is distinct from old.school_id then
    raise exception 'a template version is what it is: write a new version' using errcode = 'check_violation';
  end if;
  -- A row from before versions had no words; they may be written once.
  if old.body is not null and (new.body is distinct from old.body or new.variables is distinct from old.variables or new.billing_category is distinct from old.billing_category) then
    raise exception 'the words of a template version never change: write a new version' using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke all on function public.whatsapp_templates_words_fixed() from public;
create trigger whatsapp_templates_words_fixed before update on whatsapp_templates for each row execute function public.whatsapp_templates_words_fixed();

-- The platform's own templates (school_id is null) are written and decided by NetCyberAI staff only, as the
-- platform role. It bypasses row level security anyway; the policy states the intended access, as the other
-- platform tables' policies do. No school role gains anything: it is scoped to nca_super.
create policy whatsapp_templates_platform_decide on whatsapp_templates for update to nca_super using (school_id is null) with check (school_id is null);

alter table communication_log add column template_version int;
alter table communication_log add column language text check (language is null or language in ('en', 'hi'));
alter table communication_log add column template_params jsonb check (template_params is null or jsonb_typeof(template_params) = 'object');

create or replace function public.communication_log_forward_only() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  was text := old.status::text;
  now_is text := new.status::text;
  rank constant jsonb := '{"queued": 0, "sent": 1, "delivered": 2, "read": 3}';
begin
  if (new.school_id, new.channel, new.created_at) is distinct from (old.school_id, old.channel, old.created_at)
     or new.to_phone is distinct from old.to_phone or new.template_name is distinct from old.template_name or new.dedupe_key is distinct from old.dedupe_key
     or new.template_version is distinct from old.template_version or new.language is distinct from old.language or new.template_params is distinct from old.template_params
     or (old.provider_message_id is not null and new.provider_message_id is distinct from old.provider_message_id) then
    raise exception 'what a message was never changes' using errcode = 'check_violation';
  end if;
  if now_is = was then
    return new;
  end if;
  if now_is = 'failed' and was in ('queued', 'sent') then
    return new;
  end if;
  if rank ? was and rank ? now_is and (rank ->> now_is)::int > (rank ->> was)::int then
    return new;
  end if;
  raise exception 'a message''s state only moves forward (% to % is refused)', was, now_is using errcode = 'check_violation';
end $$;
