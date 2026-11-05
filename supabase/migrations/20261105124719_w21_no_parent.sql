-- W21 integration (C486): the seven tables the wave made are refused to a parent's school-app login outright
-- (C230-D). A family reads a certificate's progress, a child's Holistic Progress Card and a timetable through the
-- Family app's own security definer functions, never as the school app's parent role; a promotion is the office's.

create policy certificate_request_events_no_parent on certificate_request_events as restrictive for all
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent')
  with check (coalesce(current_setting('app.current_role', true), '') <> 'parent');
create policy hpc_entries_no_parent on hpc_entries as restrictive for all
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent')
  with check (coalesce(current_setting('app.current_role', true), '') <> 'parent');
create policy hpc_cards_no_parent on hpc_cards as restrictive for all
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent')
  with check (coalesce(current_setting('app.current_role', true), '') <> 'parent');
create policy promotion_runs_no_parent on promotion_runs as restrictive for all
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent')
  with check (coalesce(current_setting('app.current_role', true), '') <> 'parent');
create policy promotion_events_no_parent on promotion_events as restrictive for all
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent')
  with check (coalesce(current_setting('app.current_role', true), '') <> 'parent');
create policy promotion_overrides_no_parent on promotion_overrides as restrictive for all
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent')
  with check (coalesce(current_setting('app.current_role', true), '') <> 'parent');
create policy timetable_changes_no_parent on timetable_changes as restrictive for all
  using (coalesce(current_setting('app.current_role', true), '') <> 'parent')
  with check (coalesce(current_setting('app.current_role', true), '') <> 'parent');
