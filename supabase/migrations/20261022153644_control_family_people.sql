-- Control → Family → People (Decision Log C230-V): the people who use the Family app, for the founder, and the parent's
-- own opt-in to hear about offers.
--
-- 1. The 'offers' consent purpose. News and offers by email reach a parent only after the parent's own tap in the parent
--    area (DPDP: a purpose of its own, off until given, withdrawable). Messages about the parent's own account or plan
--    (service, renewal) need no such consent; offers do.
alter table family.consents drop constraint consents_purpose_check;
alter table family.consents add constraint consents_purpose_check
  check (purpose in ('study_core', 'school_link', 'opportunity_matching', 'photo_input', 'english_programme', 'voice_practice', 'offers'));

-- 2. family.control_accounts(): Control's one door to the people, as family.control_counts() is to the numbers. The
--    platform role holds no right on a family table; this definer function returns, a page at a time, what Control needs
--    to serve and contact a family: the parent's email, language, sign-up and last sign-in, whether a PIN is set; each
--    child's first name, class, board, language and free subject; the latest answer per consent purpose; answers in the
--    last 7 days and the last day answered; and whether the account is on the staff-preview list. Never an answer, a
--    photo, a recording, a PIN or a session. The search is a plain substring of the email or a child's first name (no
--    pattern characters), and "offers only" keeps the parents whose latest 'offers' answer is yes. Ordered by the last
--    sign-in, then sign-up; at most 100 a page. Control reads it as the founder with the authenticator, and audits each
--    read (src/lib/control/family-people.ts).
create function family.control_accounts(p_query text, p_offers_only boolean, p_limit integer, p_offset integer)
returns jsonb
language sql stable security definer set search_path = '' as $$
  with q as (
    select nullif(lower(btrim(left(coalesce(p_query, ''), 100))), '') as q
  ),
  latest as (
    select distinct on (account_id, purpose) account_id, purpose, granted
      from family.consents
     order by account_id, purpose, created_at desc
  ),
  matched as (
    select a.account_id, a.email, a.ui_language, a.created_at, a.last_sign_in_at, a.pin_hash is not null as has_pin
      from family.accounts a, q
     where (q.q is null
            or position(q.q in lower(a.email)) > 0
            or exists (select 1 from family.children c where c.account_id = a.account_id and position(q.q in lower(c.first_name)) > 0))
       and (not coalesce(p_offers_only, false)
            or exists (select 1 from latest l where l.account_id = a.account_id and l.purpose = 'offers' and l.granted))
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
               'consents', (select coalesce(jsonb_object_agg(l.purpose, l.granted), '{}'::jsonb) from latest l where l.account_id = p.account_id),
               'answers_7d', (select count(*) from family.attempts t where t.account_id = p.account_id and t.answered_on > (now() at time zone 'Asia/Kolkata')::date - 7),
               'last_answered_on', (select max(t.answered_on) from family.attempts t where t.account_id = p.account_id),
               'preview', exists (select 1 from control.preview_accounts v where v.account_id = p.account_id)
             ) order by coalesce(p.last_sign_in_at, p.created_at) desc, p.created_at desc, p.account_id)
        from page p), '[]'::jsonb)
  )
$$;
revoke all on function family.control_accounts(text, boolean, integer, integer) from public;
grant execute on function family.control_accounts(text, boolean, integer, integer) to nca_super;
