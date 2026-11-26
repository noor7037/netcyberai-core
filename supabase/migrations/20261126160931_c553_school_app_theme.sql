-- C553: the school app's theme, chosen by the principal or the school admin for everyone at the school (the person's own
-- light / dark choice stays on their device). One of the three themes in src/lib/design-tokens.ts; classic is today's.
alter table schools add column app_theme text not null default 'classic' check (app_theme in ('classic', 'emerald', 'royal'));
