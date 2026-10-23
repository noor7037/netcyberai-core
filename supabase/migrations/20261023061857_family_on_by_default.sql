-- What is built reaches the Family app without steps in Control (Decision Log C230-Z, the founder's written instruction
-- of 2026-10-23). Control stays the place to switch something off or withdraw it; nothing here changes a safety check
-- (the AI's clearance for children, its safety check, a parent's consents, the checked-explanations-only list).
--
-- 1. The English course, switched on at 16:01:59 on 2026-10-22 with an end time already past (C230-W), is on again,
--    with no end.
update control.app_flags
   set ends_at = null, reason = 'On at the founder''s written instruction (2026-10-23, C230-Z)', updated_at = now()
 where app = 'family' and module = 'english_programme' and enabled and ends_at is not null and ends_at <= now();

-- 2. Released to everyone, as the founder asked: for each syllabus, its latest version loaded from the repository that
--    has chapters, and for each English track its latest version, where nothing is released to everyone yet. Recorded
--    as approved and released by the founder's account (the active super admin with the most recorded actions), with
--    one audit row each. A database with no such account (a fresh one) releases nothing.
with founder as (
  select u.user_id from public.users u
   where u.role = 'super_admin' and u.is_active
   order by (select count(*) from public.audit_log a where a.actor_user_id = u.user_id) desc, u.created_at
   limit 1
), latest as (
  select distinct on (v.board_id, v.class_level, v.subject, v.academic_year) v.version_id, v.board_id, v.class_level, v.subject, v.academic_year
    from content.syllabus_versions v
   where v.import_source = 'repository' and v.status = 'in_review'
     and exists (select 1 from content.chapters c where c.version_id = v.version_id)
   order by v.board_id, v.class_level, v.subject, v.academic_year, v.version_no desc
), released as (
  update content.syllabus_versions v
     set status = 'published', audience = 'everyone', approved_by = f.user_id, approved_at = now(), released_at = now()
    from latest l, founder f
   where v.version_id = l.version_id
     and not exists (
       select 1 from content.syllabus_versions p
        where p.board_id = l.board_id and p.class_level = l.class_level and p.subject = l.subject
          and p.academic_year = l.academic_year and p.status = 'published' and p.audience = 'everyone')
  returning v.version_id, f.user_id
)
insert into public.audit_log (school_id, actor_user_id, actor_role, event_action, target_type, target_id, before_state, after_state)
select null, r.user_id, 'super_admin'::public.user_role, 'content.syllabus.released', 'content_syllabus_version', r.version_id::text, null,
       jsonb_build_object('audience', 'everyone', 'note', 'Released at the founder''s written instruction (2026-10-23, C230-Z)')
  from released r;

with founder as (
  select u.user_id from public.users u
   where u.role = 'super_admin' and u.is_active
   order by (select count(*) from public.audit_log a where a.actor_user_id = u.user_id) desc, u.created_at
   limit 1
), latest as (
  select distinct on (v.track) v.version_id, v.track
    from content.english_versions v
   where v.import_source = 'repository' and v.status = 'in_review'
   order by v.track, v.version_no desc
), released as (
  update content.english_versions v
     set status = 'published', audience = 'everyone', approved_by = f.user_id, approved_at = now(), released_at = now()
    from latest l, founder f
   where v.version_id = l.version_id
     and not exists (select 1 from content.english_versions p where p.track = l.track and p.status = 'published' and p.audience = 'everyone')
  returning v.version_id, f.user_id
)
insert into public.audit_log (school_id, actor_user_id, actor_role, event_action, target_type, target_id, before_state, after_state)
select null, r.user_id, 'super_admin'::public.user_role, 'content.english.released', 'content_english_version', r.version_id::text, null,
       jsonb_build_object('audience', 'everyone', 'note', 'Released at the founder''s written instruction (2026-10-23, C230-Z)')
  from released r;
