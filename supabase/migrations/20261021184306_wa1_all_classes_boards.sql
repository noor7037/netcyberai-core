-- Wave A, step 1 (C263): the Family app is open to every class and every board.
--
-- 1. Classes: Nursery (-2), LKG (-1) and UKG (0), then Class 1 to 12, for a child and for the content library (a
--    syllabus or a library response for pre-primary comes later, in its own module; the range is opened once, here).
-- 2. Boards: a child's board is any board in content.boards, by reference (no longer CBSE only), and the parent may
--    change it. Added: CISCE (ICSE and ISC), NIOS, IB, Cambridge International, and STATE: "our state's board", read
--    together with the child's state. A state board's own syllabus is loaded later as its own board row
--    ('ST-' and the state's code, e.g. ST-UP) with its official name, from its official documents; until then a
--    child on it sees that the chapters are not in the app yet. No state board is named here from memory.

alter table family.children drop constraint children_class_level_check;
alter table family.children add constraint children_class_level_check check (class_level between -2 and 12);
alter table family.children drop constraint children_board_id_check;

insert into content.boards (board_id, name_en, name_hi) values
  ('CISCE', 'Council for the Indian School Certificate Examinations (ICSE, ISC)', null),
  ('NIOS', 'National Institute of Open Schooling', 'राष्ट्रीय मुक्त विद्यालयी शिक्षा संस्थान'),
  ('IB', 'International Baccalaureate', null),
  ('CAIE', 'Cambridge International Education', null),
  ('STATE', 'State board (the child''s state)', 'राज्य बोर्ड (बच्चे का राज्य)')
on conflict (board_id) do nothing;

alter table family.children add constraint children_board_id_fkey foreign key (board_id) references content.boards (board_id);

grant update (board_id) on family.children to family_app;

alter table content.syllabus_versions drop constraint syllabus_versions_class_level_check;
alter table content.syllabus_versions add constraint syllabus_versions_class_level_check check (class_level between -2 and 12);
alter table content.responses drop constraint responses_class_level_check;
alter table content.responses add constraint responses_class_level_check check (class_level between -2 and 12);
