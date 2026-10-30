-- W9-C (docs/39 §3): licensed photographs for Understand's image block.
--
-- The model writes { type: 'image', query, caption }; the server searches Wikimedia Commons for that query, keeps only a
-- file whose licence is CC0, CC BY, CC BY-SA (any version) or public domain, and remembers the answer here for 30 days,
-- so the same query never searches twice in a month. One row per query; the file's address, its page on Commons (the
-- credit links to it), the author and the licence as Commons names them. Nothing about a child is stored here.

create table content.image_picks (
  query_key text primary key check (length(query_key) between 1 and 80),
  url text not null check (url ~ '^https://upload\.wikimedia\.org/' and length(url) <= 1000),
  page_url text not null check (page_url ~ '^https://commons\.wikimedia\.org/wiki/File:' and length(page_url) <= 1000),
  author text not null check (length(author) between 1 and 120),
  licence text not null check (licence ~* '^(CC0( 1\.0)?|CC BY(-SA)?( [0-9]\.[0-9])?( [A-Za-z]{2,3})?|Public domain)$'),
  licence_url text check (licence_url is null or (licence_url ~ '^https?://' and length(licence_url) <= 500)),
  fetched_at timestamptz not null default now()
);

alter table content.image_picks enable row level security;
alter table content.image_picks force row level security;
revoke all on content.image_picks from public, anon, authenticated, app_user;
-- Families read the picks and never write them directly (as content.video_picks).
create policy image_picks_family_read on content.image_picks as permissive for select to family_app
  using (true);
create policy image_picks_family_only on content.image_picks as restrictive for all to family_app
  using (true) with check (false);
grant select on content.image_picks to family_app;
-- Control may read a pick and remove one it does not want shown (nca_super bypasses row security).
grant select, delete on content.image_picks to nca_super;

-- Keeps one query's photograph, checked here as well as by the server: the only way a request writes this table.
create function content.save_image_pick(p_query text, p_url text, p_page_url text, p_author text, p_licence text, p_licence_url text)
returns void
language sql security definer set search_path = '' as $$
  insert into content.image_picks (query_key, url, page_url, author, licence, licence_url, fetched_at)
  values (p_query, p_url, p_page_url, p_author, p_licence, p_licence_url, now())
  on conflict (query_key) do update
    set url = excluded.url, page_url = excluded.page_url, author = excluded.author, licence = excluded.licence,
        licence_url = excluded.licence_url, fetched_at = excluded.fetched_at
$$;
revoke all on function content.save_image_pick(text, text, text, text, text, text) from public;
grant execute on function content.save_image_pick(text, text, text, text, text, text) to family_app, nca_super;
