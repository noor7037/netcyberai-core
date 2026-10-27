-- S4 (C377): the stream of a child in Class 11 or 12 (Science, Commerce or Humanities). Optional: a child with no stream
-- chosen sees every subject of the stage, as before. Only Classes 11 and 12 can hold one.
-- No new table and no new function: the existing column-level update grant is widened by one column.

alter table family.children add column stream text;
alter table family.children add constraint children_stream_check check (stream is null or stream in ('science', 'commerce', 'humanities'));
alter table family.children add constraint children_stream_class_check check (stream is null or class_level >= 11);

grant update (stream) on family.children to family_app;
