-- AQ-1 (C361), the review of #335: the two row rules aq_1_shared added run only as triggers. No role calls them
-- (test/db/grants.test.ts), as for every rule function (am_7_followups).
revoke all on function public.exam_papers_sitting_fixed() from public, anon, authenticated, service_role;
revoke all on function public.marking_sheets_source_fixed() from public, anon, authenticated, service_role;
