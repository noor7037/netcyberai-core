-- C530 (supervisor audit, 18 Nov 2026; founder: yes). On 15 Nov "Approve all pending" approved 126 Future listings below
-- the 0.8 confidence line in one step. None was checked: 90 had no note and 36 had the note "1". They go back to the
-- review queue, so a family sees none of them until a person approves each one with a note saying what was checked.
-- High-confidence listings and anything approved one by one with a real note stay as they are. Each row is audited
-- with its state before. A second run changes nothing.

with founder as (
  select u.user_id from public.users u
   where u.role = 'super_admin' and u.is_active
   order by (select count(*) from public.audit_log a where a.actor_user_id = u.user_id) desc, u.created_at
   limit 1
), back as (
  update content.future_listings l
     set review_state = 'pending', review_note = null, reviewed_by = null, reviewed_at = null, updated_at = now()
    from founder f
   where l.review_state = 'approved'
     and coalesce(l.confidence, 0) < 0.8
     and coalesce(length(btrim(l.review_note)), 0) < 10
  returning l.listing_id, f.user_id
)
insert into public.audit_log (school_id, actor_user_id, actor_role, event_action, target_type, target_id, before_state, after_state)
select null, b.user_id, 'super_admin'::public.user_role, 'content.future_listing_back_to_review', 'content.future_listings', b.listing_id::text,
       jsonb_build_object('review_state', 'approved'),
       jsonb_build_object('review_state', 'pending', 'note', 'Low confidence, approved without a check by Approve all on 2026-11-15 (C530)')
  from back b;
