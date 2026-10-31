-- W12-D: the pilot scope marker for Control → Content → Library coverage.
-- One platform setting, empty by default (no board, no class, no subject: nothing is in the pilot). The founder sets it
-- in Control; every change is audited as content.pilot_scope_changed. It marks units only and changes no behaviour.
insert into control.settings (key, value)
values ('content.pilot_scope', '{"boardId": null, "classLevels": [], "subjects": []}'::jsonb)
on conflict (key) do nothing;
