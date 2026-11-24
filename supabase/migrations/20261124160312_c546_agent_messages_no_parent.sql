-- C546 (follow-up): the parent rules (C230-D) cover the school agent's conversation too: a parent session reaches none of it.
create policy agent_messages_no_parent on agent_messages as restrictive for all
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent');
