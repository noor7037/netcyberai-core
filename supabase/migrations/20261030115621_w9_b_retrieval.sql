-- W9-B: chapter retrieval, the teaching plan's workload, and family.resolver v8 (docs/39 §2, §3).
--
-- What and why:
-- 1. content.chapter_text(blocks jsonb): the teaching text of one language's chapter blocks (the explanation's title,
--    idea, paragraphs, example and steps; the key points; the worked example's problem, step texts and answer),
--    joined with spaces. Immutable, so a generated column can use it.
-- 2. content.chapter_contents.search_en (English configuration: the English title and the 'en' blocks) and search_hi
--    (the 'simple' configuration, which keeps Devanagari words as they are: the Hindi title and the 'hi' blocks),
--    generated and stored, each with a GIN index. The answer's server reads them through the family's own transaction
--    (src/lib/ai/teaching/retrieve.ts); the table's policies are unchanged, so a family still reads only what is
--    published for everyone or made from its own upload.
-- 3. content.units and content.topics: the same two columns from their titles (no index was there for text search).
-- 4. control.ai_profiles 'family.plan': one short planning call before each typed question's answer (the question's
--    type, depth, blocks, visuals), carries_child_words true, an answer of at most 300 tokens, prompt v1. It starts on
--    the family.resolver's own route, so it works without a Control step; Control can move it like any profile. If that
--    route could not be saved (the minors check), the row starts with no route, and the answer uses the class band's
--    default plan until Control sets one: the planner never blocks an answer.
-- 5. family.resolver and content.prepare move from prompt v7 to v8 (the planned answer); a version Control chose stays.
--
-- Rollback: drop the six generated columns and their indexes, the function, the 'family.plan' row (and its route
-- revisions), and set prompt_version back to 'v7' where it is 'v8'.
-- Plain SQL, no transaction wrapper.

-- 1. The teaching text of a chapter's blocks
create function content.chapter_text(blocks jsonb) returns text
language sql immutable parallel safe set search_path = '' as $$
  select coalesce(string_agg(f.t #>> '{}', ' '), '')
    from pg_catalog.jsonb_array_elements(case when pg_catalog.jsonb_typeof(blocks) = 'array' then blocks else '[]'::jsonb end) as b(v)
    cross join lateral (
      select pg_catalog.jsonb_path_query(b.v, '$ ? (@.type == "explanation").title')
      union all select pg_catalog.jsonb_path_query(b.v, '$ ? (@.type == "explanation").idea')
      union all select pg_catalog.jsonb_path_query(b.v, '$ ? (@.type == "explanation").paragraphs[*]')
      union all select pg_catalog.jsonb_path_query(b.v, '$ ? (@.type == "explanation").example')
      union all select pg_catalog.jsonb_path_query(b.v, '$ ? (@.type == "explanation").steps[*]')
      union all select pg_catalog.jsonb_path_query(b.v, '$ ? (@.type == "key_points").points[*]')
      union all select pg_catalog.jsonb_path_query(b.v, '$ ? (@.type == "worked_example").problem')
      union all select pg_catalog.jsonb_path_query(b.v, '$ ? (@.type == "worked_example").steps[*].text')
      union all select pg_catalog.jsonb_path_query(b.v, '$ ? (@.type == "worked_example").answer')
    ) as f(t)
   where pg_catalog.jsonb_typeof(f.t) = 'string'
$$;
revoke all on function content.chapter_text(jsonb) from public, anon, authenticated, service_role;
grant execute on function content.chapter_text(jsonb) to family_app, nca_super;

-- 2. Chapters
alter table content.chapter_contents
  add column search_en tsvector generated always as (
    setweight(to_tsvector('english'::regconfig, title_en), 'A') || setweight(to_tsvector('english'::regconfig, content.chapter_text(blocks -> 'en')), 'B')
  ) stored,
  add column search_hi tsvector generated always as (
    setweight(to_tsvector('simple'::regconfig, title_hi), 'A') || setweight(to_tsvector('simple'::regconfig, content.chapter_text(blocks -> 'hi')), 'B')
  ) stored;
create index chapter_contents_search_en on content.chapter_contents using gin (search_en);
create index chapter_contents_search_hi on content.chapter_contents using gin (search_hi);

-- 3. Units and topics, by title
alter table content.units
  add column search_en tsvector generated always as (to_tsvector('english'::regconfig, title_en)) stored,
  add column search_hi tsvector generated always as (to_tsvector('simple'::regconfig, coalesce(title_hi, ''))) stored;
create index units_search_en on content.units using gin (search_en);
create index units_search_hi on content.units using gin (search_hi);
alter table content.topics
  add column search_en tsvector generated always as (to_tsvector('english'::regconfig, title_en)) stored,
  add column search_hi tsvector generated always as (to_tsvector('simple'::regconfig, coalesce(title_hi, ''))) stored;
create index topics_search_en on content.topics using gin (search_en);
create index topics_search_hi on content.topics using gin (search_hi);

-- 4. The teaching plan's workload, on the resolver's route where that route may be saved
do $$
begin
  insert into control.ai_profiles (profile_id, provider_id, model, fallback, prompt_version, max_output_tokens, carries_child_words)
  select 'family.plan', provider_id, model, fallback, 'v1', 300, true from control.ai_profiles where profile_id = 'family.resolver'
  on conflict (profile_id) do nothing;
exception when check_violation then
  insert into control.ai_profiles (profile_id, provider_id, model, prompt_version, max_output_tokens, carries_child_words)
  values ('family.plan', null, null, 'v1', 300, true)
  on conflict (profile_id) do nothing;
end $$;
insert into control.ai_profiles (profile_id, provider_id, model, prompt_version, max_output_tokens, carries_child_words)
values ('family.plan', null, null, 'v1', 300, true)
on conflict (profile_id) do nothing;

-- 5. family.resolver and content.prepare v7 -> v8
update control.ai_profiles set prompt_version = 'v8' where profile_id in ('family.resolver', 'content.prepare') and prompt_version = 'v7';
