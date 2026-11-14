-- C520: the ONE Aadhaar-number rule stops refusing textbook numbers. public.no_aadhaar_number(text) is redefined as the
-- twin of src/lib/privacy/aadhaar.ts (both run on test/fixtures/aadhaar-cases.ts).
--
-- What changes (C225's rule refused "100 200 300 400", "2024 2025 2026" and thousands one under the other, so real maths
-- and EVS pages were refused as Aadhaar numbers):
--   - A line break ends a number; only spaces, tabs and hyphens join groups of one number on its line.
--   - A candidate is a group of exactly twelve digits (not in a "+" phone of at most fifteen digits), or exactly three
--     groups of four in a row with no fourth group of four next to them. Other groupings are not Aadhaar's.
--   - A candidate is refused only when its first digit is 2 to 9, its last digit is its Verhoeff check digit (as every
--     Aadhaar number's is), and its three blocks of four are not a counting sequence ("2024 2025 2026").
--
-- The rule is LOOSER, not stricter: a text C225 passed is still passed, so rows already kept stay valid. A check
-- constraint is not checked again when the function it calls changes, so that is proved, not assumed: the block after
-- the function counts, for every validated check constraint that calls the rule, the rows the new rule would refuse,
-- and stops the migration naming each one if there is any. (In theory one exists: a "+" phone on one line and an
-- Aadhaar-shaped number on the next, which C225 read as one phone number.) Checks marked NOT VALID never promised
-- anything about older rows and are left out. Triggers that call the rule read new rows only.
--
-- Same signature, IMMUTABLE, pinned search path and grants as before (the grants are set again, unchanged).

create or replace function public.no_aadhaar_number(p text) returns boolean
language plpgsql immutable set search_path = public, pg_temp as $$
declare
  -- Verhoeff's tables, row by row: d (the dihedral group D5) and p (the position permutation), 0-based in a 1-based array.
  vd constant int[] := array[
    0,1,2,3,4,5,6,7,8,9, 1,2,3,4,0,6,7,8,9,5, 2,3,4,0,1,7,8,9,5,6, 3,4,0,1,2,8,9,5,6,7, 4,0,1,2,3,9,5,6,7,8,
    5,9,8,7,6,0,4,3,2,1, 6,5,9,8,7,1,0,4,3,2, 7,6,5,9,8,2,1,0,4,3, 8,7,6,5,9,3,2,1,0,4, 9,8,7,6,5,4,3,2,1,0];
  vp constant int[] := array[
    0,1,2,3,4,5,6,7,8,9, 1,5,7,6,2,8,3,0,9,4, 5,8,0,3,7,9,6,1,4,2, 8,9,1,6,0,4,3,5,2,7,
    9,4,5,3,1,2,6,8,7,0, 4,2,8,6,5,7,3,9,0,1, 2,7,9,3,8,0,6,4,1,5, 7,0,4,6,9,1,3,2,5,8];
  t text;
  m text[];
  groups text[];
  cands text[];
  cand text;
  n int;
  total int;
  i int;
  j int;
  k int;
  c int;
begin
  if p is null then
    return true;
  end if;
  -- Devanagari digits as digits; every separator on a line (tab, no-break and thin spaces, hyphen-minus, the Unicode
  -- hyphens and dashes, the minus sign) as one space. A line break stays as it is and ends a number. The same list as
  -- NUMBER_SEPARATORS in src/lib/privacy/aadhaar.ts.
  t := translate(p,
    '०१२३४५६७८९' || E'\t' || chr(160) || chr(8201) || chr(8239) || '-' || chr(8208) || chr(8209) || chr(8210) || chr(8211) || chr(8212) || chr(8722),
    '0123456789' || repeat(' ', 11));
  for m in select regexp_matches(t, '(\+?)([0-9]+( +[0-9]+)*)', 'g') loop
    groups := regexp_split_to_array(m[2], ' +');
    n := array_length(groups, 1);
    total := (select sum(length(g)) from unnest(groups) as g);
    cands := '{}';
    -- (a) a group of exactly twelve digits, unless the number is a "+" phone of at most fifteen digits.
    if not (m[1] = '+' and total <= 15) then
      cands := cands || array(select g from unnest(groups) as g where length(g) = 12);
    end if;
    -- (b) a run of exactly three groups of four.
    i := 1;
    while i <= n loop
      if length(groups[i]) = 4 then
        j := i;
        while j <= n and length(groups[j]) = 4 loop
          j := j + 1;
        end loop;
        if j - i = 3 then
          cands := cands || (groups[i] || groups[i + 1] || groups[i + 2]);
        end if;
        i := j;
      else
        i := i + 1;
      end if;
    end loop;
    foreach cand in array cands loop
      -- (1) first digit 2 to 9; (3) not a counting sequence; (2) the Verhoeff check digit.
      continue when cand !~ '^[2-9][0-9]{11}$';
      continue when substr(cand, 5, 4)::int - substr(cand, 1, 4)::int = substr(cand, 9, 4)::int - substr(cand, 5, 4)::int;
      c := 0;
      for k in 0 .. 11 loop
        c := vd[c * 10 + vp[(k % 8) * 10 + (ascii(substr(cand, 12 - k, 1)) - 48) + 1] + 1];
      end loop;
      if c = 0 then
        return false;
      end if;
    end loop;
  end loop;
  return true;
end $$;
revoke all on function public.no_aadhaar_number(text) from public, anon, authenticated, service_role;
grant execute on function public.no_aadhaar_number(text) to app_user;
grant execute on function public.no_aadhaar_number(text) to nca_super;

-- Every validated check that calls the rule: no existing row may be one the new rule refuses.
do $$
declare
  r record;
  expr text;
  refused bigint;
  found text := '';
begin
  for r in
    select c.conrelid::regclass as tbl, c.conname, pg_get_constraintdef(c.oid) as def
      from pg_constraint c
     where c.contype = 'c' and c.conrelid <> 0 and c.convalidated and pg_get_constraintdef(c.oid) like '%no_aadhaar_number%'
     order by 1, 2
  loop
    expr := substring(r.def from '^CHECK \((.*)\)$');
    if expr is null then
      raise exception 'C520: the check % on % could not be read: %', r.conname, r.tbl, r.def;
    end if;
    execute format('select count(*) from %s where not coalesce((%s), true)', r.tbl, expr) into refused;
    if refused > 0 then
      found := found || format('%s.%s (%s rows) ', r.tbl, r.conname, refused);
    end if;
  end loop;
  if found <> '' then
    raise exception 'C520: existing rows the new Aadhaar rule refuses: %. Correct them, then apply again.', found;
  end if;
end $$;
