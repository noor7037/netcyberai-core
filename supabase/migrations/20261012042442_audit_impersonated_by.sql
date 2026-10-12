-- Who really did it, while viewing as someone else (C165).
--
-- When the founder views the app as a school's person, the session is that
-- person's real membership, so every audit row written during the view
-- named the person as the actor and nothing named the founder. From now on
-- the session says who is viewing (app.impersonator_user_id, set for the
-- transaction by the same function that sets the school and the role), and
-- every audit row takes it by default. Null means nobody was viewing as
-- anyone: the actor did it themselves.
alter table audit_log add column impersonated_by uuid references users(user_id);
alter table audit_log alter column impersonated_by set default nullif(current_setting('app.impersonator_user_id', true), '')::uuid;
