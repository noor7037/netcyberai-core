-- C230-AP: the photo_input notice changed (fam-notice-3): files attached in the tutor are kept until the parent clears
-- them, so a yes given on an older notice no longer counts and the parent is asked again. The app reads consent through
-- src/lib/family/consent.ts; Control's people list reads it here, so the same rule is held here. No row is changed:
-- the ledger stays append-only and every row stays the parent's own tap.
create or replace function family.control_accounts(p_query text, p_offers_only boolean, p_limit integer, p_offset integer)
returns jsonb
language sql stable security definer set search_path = '' as $$
  with q as (
    select nullif(lower(btrim(left(coalesce(p_query, ''), 100))), '') as q
  ),
  matched as (
    select a.account_id, a.email, a.ui_language, a.created_at, a.last_sign_in_at, a.pin_hash is not null as has_pin
      from family.accounts a, q
     where (q.q is null
            or position(q.q in lower(a.email)) > 0
            or exists (select 1 from family.children c where c.account_id = a.account_id and position(q.q in lower(c.first_name)) > 0))
       and (not coalesce(p_offers_only, false)
            or coalesce((select o.granted from family.consents o
                          where o.account_id = a.account_id and o.purpose = 'offers'
                          order by o.created_at desc limit 1), false))
  ),
  page as (
    select m.*
      from matched m
     order by coalesce(m.last_sign_in_at, m.created_at) desc, m.created_at desc, m.account_id
     limit least(greatest(coalesce(p_limit, 50), 1), 100)
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select jsonb_build_object(
    'total', (select count(*) from matched),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'account_id', p.account_id,
               'email', p.email,
               'ui_language', p.ui_language,
               'created_at', p.created_at,
               'last_sign_in_at', p.last_sign_in_at,
               'has_pin', p.has_pin,
               'children', (select coalesce(jsonb_agg(jsonb_build_object('first_name', c.first_name, 'class_level', c.class_level, 'board_id', c.board_id, 'language', c.language, 'free_subject', c.free_subject) order by c.created_at), '[]'::jsonb)
                              from family.children c where c.account_id = p.account_id),
               -- C230-AP: a photo_input yes counts only on fam-notice-3 or later (src/lib/family/consent.ts PURPOSE_NOTICE_FROM).
               'consents', (select coalesce(jsonb_object_agg(l.purpose, l.granted and (l.purpose <> 'photo_input' or coalesce(substring(l.notice_version from '^fam-notice-([0-9]+)$')::int, 0) >= 3)), '{}'::jsonb)
                              from (select distinct on (k.purpose) k.purpose, k.granted, k.notice_version
                                      from family.consents k
                                     where k.account_id = p.account_id
                                     order by k.purpose, k.created_at desc) l),
               'answers_7d', (select count(*) from family.attempts t where t.account_id = p.account_id and t.answered_on > (now() at time zone 'Asia/Kolkata')::date - 7),
               'last_answered_on', (select max(t.answered_on) from family.attempts t where t.account_id = p.account_id),
               'preview', exists (select 1 from control.preview_accounts v where v.account_id = p.account_id)
             ) order by coalesce(p.last_sign_in_at, p.created_at) desc, p.created_at desc, p.account_id)
        from page p), '[]'::jsonb)
  )
$$;
revoke all on function family.control_accounts(text, boolean, integer, integer) from public, anon, authenticated, service_role;
grant execute on function family.control_accounts(text, boolean, integer, integer) to nca_super;
