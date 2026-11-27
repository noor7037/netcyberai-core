-- C553: the office may change the school's theme (row level security: schools_profile_by_office, principal and school
-- admin of their own school only); no other column is opened.
grant update (app_theme) on schools to app_user;
