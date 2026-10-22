-- Subjects open to every child (P1 slice 2, Decision Log C298; C230-S).
--
-- The first pilot is 50 children of Class 5 studying EVS. Under the free-subject rule the first subject a child opens
-- becomes the free one, so a child who taps Mathematics first would lose EVS. `family.open_subjects` names subjects
-- every child may open whatever their free subject is, and opening one never uses up the free subject. Control sets it
-- (Control → Family, the founder with the authenticator, audited). It starts with EVS, the pilot's subject (C230-S),
-- so nobody has to set it by hand.
--
-- `family.free_subjects_per_child` was never read by any code (C230-S), so changing it did nothing. It is removed, so
-- Control never holds a setting that does nothing; more than one free subject per child returns with Family Plus,
-- with the table it needs.

insert into control.settings (key, value) values ('family.open_subjects', '["evs"]'::jsonb)
on conflict (key) do nothing;

delete from control.settings where key = 'family.free_subjects_per_child';
