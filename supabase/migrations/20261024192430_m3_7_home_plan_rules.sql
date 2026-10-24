-- M3-7 review (C337): the database keeps the home plan's own rules, not only the app.
--
-- 1. A plan is stopped, never changed: the family's role may update only when it stopped and when the parent asked the
--    teacher to follow up, never its child, day, topics or notes.
-- 2. One open plan per child, counted within the account: a plan named for another family's child is refused by the
--    child's foreign key alone, and never says whether that child has a plan open.

revoke update on family.home_plans from family_app;
grant update (stopped_at, followup_asked_at) on family.home_plans to family_app;

create unique index uq_family_home_plan_open_own on family.home_plans (account_id, child_id) where stopped_at is null;
drop index family.uq_family_home_plan_open;
