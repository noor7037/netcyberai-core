-- Wave A, step 2a (C264): a child studies the subjects of their class, not only Mathematics and Science. The family
-- tables take a subject id in the same shape the content library already uses (lower case, underscores); the app
-- checks it against its own list of known subjects (src/lib/family/subjects.ts) and the child's class.

alter table family.children drop constraint children_free_subject_check;
alter table family.children add constraint children_free_subject_check check (free_subject is null or free_subject ~ '^[a-z][a-z_]{1,39}$');
alter table family.attempts drop constraint attempts_subject_check;
alter table family.attempts add constraint attempts_subject_check check (subject ~ '^[a-z][a-z_]{1,39}$');
alter table family.topic_progress drop constraint topic_progress_subject_check;
alter table family.topic_progress add constraint topic_progress_subject_check check (subject ~ '^[a-z][a-z_]{1,39}$');
