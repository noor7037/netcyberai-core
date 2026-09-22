-- =====================================================================
-- Prompt I prep, decided ahead of the build rather than retrofitted
-- after: every business-metric query Prompt I (and later, Prompt J's
-- recognition/at-risk work) writes must be able to exclude test-fixture
-- schools from real fee/revenue aggregates, recognition tallies, and
-- at-risk counts. Additive, backward-compatible: every existing school
-- row defaults to false (a real school), so nothing already live is
-- reclassified by this migration alone.
--
-- The two schools that actually exist in this project today --
-- "B2 Test School Alpha"/"B2 Test School Beta", standing fixtures
-- reused across every VERIFY pass since Prompt B's own two-school
-- isolation suite -- are tagged true below, by name, since those are
-- the only two rows live and their names are exact and known. Any
-- future throwaway VERIFY fixture (the `VERIFYG-%`/`VERIFYH-%`-prefixed
-- schools from Prompt G/H's own diagnostic routes) does not need this
-- column at all: every one of those was fully deleted after its own
-- VERIFY evidence was captured (Decision Log C54/C59), confirmed live
-- by a direct row-count of zero before each diagnostic route was
-- stripped -- there is nothing left over for this migration to find or
-- tag.
-- =====================================================================

alter table schools add column is_test_fixture boolean not null default false;

update schools set is_test_fixture = true
  where name in ('B2 Test School Alpha', 'B2 Test School Beta');
