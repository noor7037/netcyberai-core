-- W12-F, the parent rule for lead_replies (C230-D, deny by default): a parent session reaches nothing here, stated as a
-- restrictive policy with the name the parent-session test looks for (<table>_no_parent). Only the platform role holds
-- a grant on the table, so this changes no access; it records the rule where every other table records it.
create policy lead_replies_no_parent on lead_replies as restrictive for all
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent')
  with check (coalesce(current_setting('app.current_role', true), '') <> 'parent');
