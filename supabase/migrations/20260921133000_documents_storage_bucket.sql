-- Prompt F Task 3: private Storage bucket for captured documents.
-- PRD Sec6.1: "/{school_id}/documents/{student_id}/{doc_type}/{uuid}",
-- RLS-equivalent access rules, signed time-limited URLs, never public.
--
-- storage.objects already ships from Supabase with row level security
-- ENABLED and ZERO policies (confirmed live before writing this
-- migration -- unlike the public.sessions drift this project already
-- found and fixed once, Supabase's own storage schema bootstraps this
-- correctly on its own). That means anon/authenticated get no access
-- to this bucket by default, with no policy of ours required to make
-- that true. This app's staff sessions aren't Supabase Auth sessions
-- anyway (src/lib/auth/supabase.ts's own comment: this app mints and
-- owns its own session, RLS here reads Postgres session GUCs, not
-- auth.jwt()) -- so a storage.objects RLS policy keyed on auth.uid()
-- couldn't express this app's tenant boundary even if we wrote one.
-- The tenant boundary for this bucket is therefore enforced in
-- application code instead (src/lib/capture/storage.ts): every
-- upload/signed-URL call goes through the service-role client (never
-- exposed to the client, same choke-point discipline as
-- src/lib/auth/db.ts's SET ROLE) and the object path is always
-- prefixed with the REQUESTING SESSION'S OWN school_id, server-derived,
-- never client-supplied -- the same rule check_choke_point.py already
-- enforces for schoolId on every API route.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents', 'documents', false,
  8388608, -- 8 MiB -- PRD Sec6.1's own client-side compression target is <=500KB; this is generous headroom, not the enforced ceiling
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;
