-- A new school starts with its board's grading scheme (Control, in the school's creation transaction).
-- The platform role saves the first version as a system default; the principal can still save a newer one.
-- Select, insert only: a saved scheme is never changed or removed (the trigger holds that for every role).
grant select, insert on grading_schemes to nca_super;
grant execute on function public.grading_scheme_problem(jsonb) to nca_super;
