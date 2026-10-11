-- C138 (P1c-4b): the first-visit tours a person has already seen, remembered
-- on their own account so a tour is shown once, on any device, and one
-- person's tours are never another's on a shared computer (docs/19 rule 8).
-- Additive: an empty list for everyone, so every tour is new to them.
--
-- Written only by the account service for the signed-in user's own row
-- (src/lib/auth/db.ts markTourSeen), like the language. No new grant and no
-- policy change.

alter table users add column if not exists tours_seen text[] not null default '{}';

alter table users drop constraint if exists users_tours_seen_small;
alter table users add constraint users_tours_seen_small check (cardinality(tours_seen) <= 100);

comment on column users.tours_seen is 'Ids of the first-visit tours this person has finished or skipped (src/lib/contracts/tours.ts).';
