-- C530 (founder, 18 Nov 2026): "all were verified, keep it". The 126 low-confidence Future listings that
-- 20261118140000_c530_future_low_confidence_back_to_review moved back to the queue are approved again, as the founder
-- verified them. Each carries a note saying so, which meets the review rule's note, and is audited. Only the rows that
-- migration moved are touched (found by its audit entries). A second run changes nothing.

with founder as (
  select u.user_id from public.users u
   where u.role = 'super_admin' and u.is_active
   order by (select count(*) from public.audit_log a where a.actor_user_id = u.user_id) desc, u.created_at
   limit 1
), moved as (
  select distinct a.target_id::uuid as listing_id
    from public.audit_log a
   where a.event_action = 'content.future_listing_back_to_review'
), restored as (
  update content.future_listings l
     set review_state = 'approved', review_note = 'Verified by the founder (confirmed 2026-11-18, C530).',
         reviewed_by = f.user_id, reviewed_at = now(), updated_by = f.user_id, updated_at = now()
    from founder f, moved m
   where l.listing_id = m.listing_id and l.review_state = 'pending'
  returning l.listing_id, f.user_id
)
insert into public.audit_log (school_id, actor_user_id, actor_role, event_action, target_type, target_id, before_state, after_state)
select null, r.user_id, 'super_admin'::public.user_role, 'content.future_listing_approved', 'content.future_listings', r.listing_id::text,
       jsonb_build_object('review_state', 'pending'),
       jsonb_build_object('review_state', 'approved', 'note', 'Verified by the founder (confirmed 2026-11-18, C530)')
  from restored r;
